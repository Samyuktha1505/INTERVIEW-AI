from fastapi import APIRouter, HTTPException, status, Request, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from typing import Optional
import datetime
from passlib.context import CryptContext

from backend.db.mysql import get_db_connection
from backend.db.redis import redis_client
from backend.utils.jwt_auth import create_access_token, get_current_user

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ACCESS_TOKEN_EXPIRE_MINUTES = 30
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

class BasicInfo(BaseModel):
    firstName: str
    lastName: str
    mobile: Optional[str] = None
    gender: Optional[str] = None
    dateOfBirth: Optional[str] = None
    collegeName: Optional[str] = None
    yearsOfExperience: Optional[int] = 0

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
        (email, mobile, countryCode, datetime.datetime.utcnow(), datetime.datetime.utcnow())
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
        (user_id, datetime.datetime.utcnow(), ip_address, status_str, location)
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
    ip = request.client.host or "unknown"
    redis_key = f"login_attempts:{ip}"
    attempts = int(redis_client.get(redis_key) or 0)

    if attempts >= 5:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts. Try again later.")

    user = get_user_by_email(payload.email)

    if not user or not verify_password(payload.password, user["hash_password"]):
        redis_client.incr(redis_key)
        redis_client.expire(redis_key, 300)  # lockout window 5 min
        log_login_trace(user["user_id"] if user else -1, ip, "FAILED")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    redis_client.delete(redis_key)
    log_login_trace(user["user_id"], ip, "SUCCESS")

    token = create_access_token({
        "sub": str(user["user_id"]),
        "email": user["email"],
        "user_id": user["user_id"]
    }, ACCESS_TOKEN_EXPIRE_MINUTES)

    store_token_in_redis(str(user["user_id"]), token, ACCESS_TOKEN_EXPIRE_MINUTES * 60)

    response = JSONResponse(content={
        "user_id": user["user_id"],
        "email": user["email"],
        "isProfileComplete": False
    })
    set_token_cookie(response, token)
    return response


@router.post("/google-auth-login")
async def google_auth_login(request: Request):
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests

    data = await request.json()
    token = data.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token missing")

    try:
        idinfo = id_token.verify_oauth2_token(token, grequests.Request())
        email = idinfo.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Invalid Google token")

        user = get_user_by_email(email)
        if user:
            user_id = user["user_id"]
        else:
            user_id = create_user(email=email)
            log_login_trace(user_id, request.client.host, "GOOGLE_SIGNUP")

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

    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")


@router.post("/basic-info")
async def save_basic_info(payload: BasicInfo, current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    try:
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
                updated_at = NOW()
            WHERE user_id = %s
            """,
            (
                payload.firstName,
                payload.lastName,
                payload.mobile,
                payload.gender,
                payload.dateOfBirth,
                payload.collegeName,
                payload.yearsOfExperience,
                user_id
            )
        )
        conn.commit()

        # No need to check profile completeness here, but can be done elsewhere
        return {"message": "Profile updated successfully."}

    except Exception as e:
        print(f"Error saving basic info: {e}")
        raise HTTPException(status_code=500, detail="Internal server error.")
    finally:
        cursor.close()
        conn.close()


@router.get("/me", tags=["Authentication"])
async def get_me(current_user: dict = Depends(get_current_user)):
    user_id = current_user.get("user_id")
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT email, first_name, last_name, phone, gender, date_of_birth,
                   college_name, years_of_experience
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
                "isProfileComplete": is_profile_complete
            }
        }
    finally:
        cursor.close()
        conn.close()
