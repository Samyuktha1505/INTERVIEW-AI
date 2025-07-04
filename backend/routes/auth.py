from fastapi import APIRouter, HTTPException, status, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
import datetime
from passlib.context import CryptContext
import random
import logging
import smtplib
from backend.db.mysql import get_db_connection
from backend.db.redis import redis_client
from backend.utils.jwt_auth import create_access_token, get_current_user
from backend.utils.email_validator import is_real_email
from backend.config import EMAIL_PASS,EMAIL_USER,GOOGLE_CLIENT_ID
from datetime import timedelta
from email.mime.text import MIMEText
from fastapi import File, UploadFile, Form, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from backend.utils.s3_client import s3_client
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from datetime import datetime
  

def get_email_transporter():
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(EMAIL_USER, EMAIL_PASS)
        return server
    except Exception as e:
        logging.error(f"Failed to connect to email server: {e}")
        # Use HTTPException with status.HTTP_503_SERVICE_UNAVAILABLE for clearer error
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email service unavailable. Check EMAIL_USER/EMAIL_PASS in .env")

class GoogleAuthPayload(BaseModel):
    token: str

class ForgotPasswordPayload(BaseModel):
    email: str

class VerifyOtpPayload(BaseModel):
    email: str
    otp: str

class ResetPasswordPayload(BaseModel):
    email: str
    otp: str
    newPassword: str

class MetricsPayload(BaseModel):
    session_id: str
router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_EXPIRE_MINUTES = 300
LOCATION_DEFAULT = "Kurnool, India"

# --- Pydantic Payloads ---
class SignupPayload(BaseModel):
    email: EmailStr
    password: str
    mobile: Optional[str] = ""
    countryCode: Optional[str] = ""

class LoginPayload(BaseModel):
    email: EmailStr
    password: str


# --- Utility functions ---
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def store_token_in_redis(user_id: str, token: str, expires_in_seconds: int):
    redis_client.setex(f"user_token:{user_id}", expires_in_seconds, token)

def get_user_by_email(email: str):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT u.user_id, u.email, h.hash_password
        FROM User u LEFT JOIN HASH h ON u.user_id = h.user_id
        WHERE u.email = %s LIMIT 1
    """, (email,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    return user

def create_user(email: str, mobile: str = "", countryCode: str = "") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO User (email, phone, country_code, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (email, mobile, countryCode, datetime.utcnow(), datetime.utcnow())
    )
    conn.commit()
    user_id = cursor.lastrowid
    cursor.close()
    conn.close()
    return user_id

def create_user_hash(user_id: int, email: str, hashed_password: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO HASH (user_id, email, hash_password)
        VALUES (%s, %s, %s)
        """,
        (user_id, email, hashed_password)
    )
    conn.commit()
    cursor.close()
    conn.close()
    return True

def log_login_trace(user_id: int, ip_address: str, status_str: str, location: str = LOCATION_DEFAULT):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (user_id, datetime.utcnow(), ip_address, status_str, location)
    )
    conn.commit()
    cursor.close()
    conn.close()

def set_token_cookie(response: JSONResponse, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="Lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        expires=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

# --- Routes ---

@router.post("/signup")
async def signup(payload: SignupPayload, request: Request):
    ip = request.client.host or "unknown"
    if get_user_by_email(payload.email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    hashed_pw = hash_password(payload.password)
    user_id = create_user(payload.email, payload.mobile, payload.countryCode)
    create_user_hash(user_id, payload.email, hashed_pw)
    log_login_trace(user_id, ip, "SIGNUP_SUCCESS")

    token = create_access_token({
        "user_id": str(user_id),
        "email": payload.email,
        "sub": str(user_id)
    }, ACCESS_TOKEN_EXPIRE_MINUTES)

    store_token_in_redis(str(user_id), token, ACCESS_TOKEN_EXPIRE_MINUTES * 60)

    response = JSONResponse(content={
        "user_id": user_id,
        "email": payload.email,
        "isProfileComplete": False
    })
    set_token_cookie(response, token)
    return response


@router.post("/login")
async def login(payload: LoginPayload, request: Request):
   
    ip         = request.client.host or "unknown"
    redis_key  = f"login_attempts:{ip}"
    attempts   = int(redis_client.get(redis_key) or 0)

    if attempts >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later."
        )

    user = get_user_by_email(payload.email)
    if not user or user["hash_password"] is None:
        redis_client.incr(redis_key); redis_client.expire(redis_key, 300)
        raise HTTPException(status_code=401, detail="Invalid email or password")

   
    hashed_pw = user["hash_password"]
    if isinstance(hashed_pw, (bytes, bytearray)):
        hashed_pw = hashed_pw.decode()

    
    hashed_pw = hashed_pw.strip()

    if not verify_password(payload.password, hashed_pw):
        redis_client.incr(redis_key); redis_client.expire(redis_key, 300)
        log_login_trace(user["user_id"], ip, "FAILED")
        raise HTTPException(status_code=401, detail="Invalid email or password")

    
    redis_client.delete(redis_key)
    log_login_trace(user["user_id"], ip, "SUCCESS")

    token = create_access_token(
        {"sub": str(user["user_id"]),
         "email": user["email"],
         "user_id": user["user_id"]},
        ACCESS_TOKEN_EXPIRE_MINUTES
    )
    store_token_in_redis(str(user["user_id"]), token, ACCESS_TOKEN_EXPIRE_MINUTES * 60)

    resp = JSONResponse({
        "user_id": user["user_id"],
        "email":   user["email"],
        "isProfileComplete": False
    })
    set_token_cookie(resp, token)
    return resp

@router.post("/google-auth-login")
async def google_auth_login(request: Request):
    data = await request.json()
    token = data.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token missing")

    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), audience=GOOGLE_CLIENT_ID)
        email = idinfo.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Invalid Google token")

        user = get_user_by_email(email)
        if user:
            user_id = user["user_id"]

            # ✅ Check if hash exists
            if not user["hash_password"]:
                # Optional default hash: user can still login via forgot-password
                default_hash = hash_password("GoogleDefault@123")
                create_user_hash(user_id, email, default_hash)

        else:
            # User doesn't exist — create
            user_id = create_user(email=email)
            log_login_trace(user_id, request.client.host, "GOOGLE_SIGNUP")

            # ✅ Also create default hash for new Google signup
            default_hash = hash_password("GoogleDefault@123")
            create_user_hash(user_id, email, default_hash)

        access_token = create_access_token(
            {
                "sub": str(user_id),
                "email": email,
                "user_id": user_id
            },
            ACCESS_TOKEN_EXPIRE_MINUTES
        )

        store_token_in_redis(str(user_id), access_token, ACCESS_TOKEN_EXPIRE_MINUTES * 60)

        response = JSONResponse(content={
            "user_id": user_id,
            "email": email,
            "token": access_token,
            "isProfileComplete": False
        })
        set_token_cookie(response, access_token)
        return response

    except ValueError as e:
        print("Google token verification error:", e)
        raise HTTPException(status_code=401, detail="Invalid Google token")


@router.post("/basic-info")
async def save_basic_info(
    firstName: str = Form(...),
    lastName: str = Form(...),
    mobile: str = Form(...),
    gender: str = Form(...),
    dateOfBirth: str = Form(...),
    collegeName: str = Form(...),
    yearsOfExperience: int = Form(...),
    countryCode: str = Form(...),
    resumeFile: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    conn = None
    cursor = None

    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Validate resume file type
        allowed_mimes = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ]
        if resumeFile.content_type not in allowed_mimes:
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only PDF, DOC, and DOCX are allowed."
            )

        file_bytes = await resumeFile.read()

        # Upload resume to S3
        upload_result = s3_client.upload_resume(
            user_id=str(user_id),
            file_bytes=file_bytes,
            content_type=resumeFile.content_type
        )
        s3_key = upload_result["s3_key"]
        s3_url = upload_result["url"]

        # Update user record in DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE User SET
                first_name = %s,
                last_name = %s,
                phone = %s,
                gender = %s,
                date_of_birth = %s,
                college_name = %s,
                years_of_experience = %s,
                country_code = %s,
                resume_url = %s,
                updated_at = NOW()
            WHERE user_id = %s
            """,
            (
                firstName,
                lastName,
                mobile,
                gender,
                dateOfBirth,
                collegeName,
                yearsOfExperience,
                countryCode,
                s3_url,
                user_id
            )
        )
        
        cursor.execute("""
            SELECT log_id FROM LoginTrace
            WHERE user_id = %s AND login_status = 'SUCCESS'
            ORDER BY login_time DESC
            LIMIT 1
        """, (user_id,))
        log_result = cursor.fetchone()
        log_id = log_result[0] if log_result else None
        
        # --- New insertion into Resume table ---
        
        fullname = f"{firstName} {lastName}"
        cursor.execute(
    """
    INSERT INTO Resume (user_id, full_name, mobile_number, work_experience,Graduation_college)
    VALUES (%s, %s, %s, %s,%s)
    """,
    (user_id, fullname, mobile, yearsOfExperience,collegeName)
)


        
        cursor.execute("""
            SELECT resume_id FROM Resume
            WHERE user_id = %s
            ORDER BY resume_id DESC
            LIMIT 1
        """, (user_id,))
        resume_id_for_session_data = cursor.fetchone()

        if not resume_id_for_session_data:
            raise HTTPException(status_code=500, detail="Failed to retrieve resume_id after saving resume data.")

        # Insert into resume_mapping table
        cursor.execute(
            """
                INSERT INTO ResumePath (user_id, login_id, resume_id, resume_path)
                VALUES (%s, %s, %s, %s)
            """,
            (user_id, log_id, resume_id_for_session_data[0],s3_url)
        )

        conn.commit()
        
        

        return JSONResponse(content={"message": "Profile updated successfully.", "resume_url": s3_url})

    except HTTPException:
        raise  # Rethrow known HTTP errors
    except Exception as e:
        logging.error(f"Error in /basic-info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error.")
    finally:
        if cursor: cursor.close()
        if conn and conn.is_connected(): conn.close()



@router.get("/me", tags=["Authentication"])
async def get_me(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT email, first_name, last_name, phone, gender, date_of_birth,
                   college_name, years_of_experience, resume_url
            FROM User
            WHERE user_id = %s
            """,
            (user_id,)
        )
        user = cursor.fetchone()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        is_profile_complete = all([
            user.get("first_name"),
            user.get("last_name"),
            user.get("phone"),
            user.get("gender"),
            user.get("date_of_birth"),
            user.get("college_name"),
            user.get("years_of_experience") is not None
        ])

        return {
            "user": {
                "id": user_id,
                "email": current_user.get("email"),
                "firstName": user.get("first_name"),
                "lastName": user.get("last_name"),
                "mobile": user.get("phone"),
                "gender": user.get("gender"),
                "dateOfBirth": user.get("date_of_birth"),
                "collegeName": user.get("college_name"),
                "yearsOfExperience": user.get("years_of_experience"),
                "isProfileComplete": is_profile_complete,
                "resumeUrl": user.get("resume_url")
            }
        }
    finally:
        cursor.close()
        conn.close()

def generate_otp():
    return str(random.randint(100000, 999999))
otp_storage = {}
@router.post('/forgot-password')
async def forgot_password(payload: ForgotPasswordPayload):
    email = payload.email
    db_conn = None
    cursor = None
    
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        cursor.execute("""
    SELECT u.user_id
    FROM User u
    JOIN HASH h ON u.user_id = h.user_id
    WHERE u.email = %s
""", (email,))
        user_exists = cursor.fetchone()
        
        if not user_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Email does not exist.')
      
        otp = generate_otp()
        expires_at = datetime.now() + timedelta(minutes=15)
        otp_storage[email] = {'otp': otp, 'expires_at': expires_at}

        # Send OTP via email (your existing code)
        msg = MIMEText(f"Your OTP for password reset is: {otp}\nThis OTP will expire in 15 minutes.")
        msg['Subject'] = 'Password Reset OTP'
        msg['From'] = EMAIL_USER
        msg['To'] = email

        transporter = get_email_transporter()
        transporter.send_message(msg)
        transporter.quit()

        return JSONResponse(content={"success": True, "message": "OTP sent successfully"})

    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error in forgot password for {email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error.")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


@router.post('/verify-otp')
async def verify_otp(payload: VerifyOtpPayload):
    email = payload.email
    otp = payload.otp

    try:
        stored_data = otp_storage.get(email)
        if not stored_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OTP expired or not found.')

        if datetime.now() > stored_data['expires_at']:
            del otp_storage[email]
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OTP expired.')

        if stored_data['otp'] != otp:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid OTP.')

        # Mark as verified
        otp_storage[email]['verified'] = True
        return JSONResponse(content={"success": True, "message": "OTP verified successfully"})

    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error verifying OTP for {email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error.")


@router.post('/reset-password')
async def reset_password(payload: ResetPasswordPayload):
    email = payload.email
    otp = payload.otp
    new_password = payload.newPassword

    db_conn = None
    cursor = None
    try:
        stored_data = otp_storage.get(email)
        if not stored_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OTP expired or not found.')
        if not stored_data.get('verified'):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OTP not verified.')
        if datetime.now() > stored_data['expires_at']:
            del otp_storage[email]
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OTP expired.')
        if stored_data['otp'] != otp:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid OTP.')

        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        hashed_password = pwd_context.hash(new_password)
        cursor.execute('UPDATE HASH SET hash_password = %s WHERE email = %s', (hashed_password, email))
        db_conn.commit()
        del otp_storage[email]
        return JSONResponse(content={"success": True, "message": "Password updated successfully"})

    except HTTPException as e:
        if db_conn: db_conn.rollback()
        raise e
    except Exception as e:
        logging.error(f"Error resetting password for {email}: {e}", exc_info=True)
        if db_conn: db_conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error.")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()
        

@router.get("/user-profile", tags=["Authentication"])
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT first_name, last_name, phone, gender, date_of_birth,
                   college_name, years_of_experience, resume_url, country_code
            FROM User
            WHERE user_id = %s
            """,
            (user_id,)
        )
        user = cursor.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "success": True,
            "user": {
                "first_name": user.get("first_name"),
                "last_name": user.get("last_name"),
                "mobile": user.get("phone"),
                "gender": user.get("gender"),
                "date_of_birth": user.get("date_of_birth"),
                "college_name": user.get("college_name"),
                "years_of_experience": user.get("years_of_experience"),
                "resume_url": user.get("resume_url"),
                "country_code": user.get("country_code"),
                "email": current_user.get("email"),
                "user_id": user_id
            }
        }

    finally:
        cursor.close()
        conn.close()