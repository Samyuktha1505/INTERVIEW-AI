import datetime
import json
import logging
import os
import re
import smtplib
import tempfile
import traceback
import uuid
import random
from email.mime.text import MIMEText
from urllib.parse import urlparse # <-- ADDED THIS IMPORT

import fitz  # PyMuPDF
import google.generativeai as genai
import mysql.connector
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, status # <-- ADDED status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from passlib.context import CryptContext
from google.oauth2 import id_token
from google.auth.transport import requests
from typing import List, Optional, Dict, Any

# Import all your custom functions and prompts (assuming these are correct)
from prompts import llm1_prompt, generate_metrics_prompt
from functions import extract_text_from_pdf, process_and_extract_json_data, extract_metrics_from_json
# This line is changed to import the instance directly:
from s3_client import s3_client as s3_client_instance 

load_dotenv()

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Settings Management ---
class Settings(BaseSettings):
    gemini_api_key: str 

    db_host: str
    db_user: str
    db_password: str
    db_name: str
    db_port: str = "3306"
    
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str
    aws_bucket_name: str
    
    google_client_id: str 
    
    email_user: str
    email_pass: str

    jwt_secret: str 

    model_config = SettingsConfigDict(env_file=".env", extra="ignore") # Use model_config for Pydantic v2

settings = Settings()

# --- Gemini Client Initialization ---
genai.configure(api_key=settings.gemini_api_key) 
model_id = "gemini-2.0-flash" 

# --- FastAPI Application Setup ---
app = FastAPI(title="Interview AI API", version="1.0")

# --- CORS Configuration ---
# Ensure this matches your frontend's actual URL, e.g., http://localhost:3000 or http://localhost:5173
# For development, allowing all origins is common but tighten it for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ "http://localhost:8080"], # Added common frontend dev ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Password Hashing Context ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Email Transporter ---
def get_email_transporter():
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(settings.email_user, settings.email_pass)
        return server
    except Exception as e:
        logging.error(f"Failed to connect to email server: {e}")
        # Use HTTPException with status.HTTP_503_SERVICE_UNAVAILABLE for clearer error
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email service unavailable. Check EMAIL_USER/EMAIL_PASS in .env")

# The s3_client_instance is now imported directly from s3_client.py

# --- Database Connection Helper ---
def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host=settings.db_host, 
            user=settings.db_user, 
            password=settings.db_password,
            database=settings.db_name, 
            port=int(settings.db_port)
        )
        return conn
    except mysql.connector.Error as e:
        logging.error(f"Database connection failed: {e}")
        # Use HTTPException with status.HTTP_500_INTERNAL_SERVER_ERROR for clearer error
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database connection error. Check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT in .env")

# --- Pydantic Models for API Payloads ---
class TranscriptionPayload(BaseModel):
    session_id: str
    transcription_text: str

class SessionIdList(BaseModel):
    session_ids: List[str] = Field(..., min_length=1)

class LoginPayload(BaseModel):
    email: str
    password: str

class SignupPayload(BaseModel):
    email: str
    mobile: str
    password: str
    countryCode: str

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


# ====================================================================
# --- API ENDPOINTS (from server.js) ---
# ====================================================================

@app.post("/api/login")
async def login(payload: LoginPayload, request: Request):
    email = payload.email
    password = payload.password
    ip_address = request.client.host if request.client else "unknown" 
    # Consider using a geo-IP library for more accurate location based on IP
    location = "Kurnool, India" # Hardcoded for now

    db_conn = None
    cursor = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT u.user_id, h.hash_password
            FROM User u JOIN HASH h ON u.email = h.email
            WHERE u.email = %s
        """, (email,))
        result = cursor.fetchone()

        user_id = result['user_id'] if result else None
        hash_password = result['hash_password'] if result else None

        is_valid = False
        if hash_password:
            is_valid = pwd_context.verify(password, hash_password)

        # Log login attempt regardless of success
        sql_trace = """
            INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location)
            VALUES (%s, %s, %s, %s, %s)
        """
        # Ensure user_id is not None for logging, use a placeholder if not found
        trace_user_id = user_id if user_id is not None else -1 
        cursor.execute(sql_trace, (trace_user_id, datetime.datetime.utcnow(), ip_address,
                                   "SUCCESS" if is_valid else "FAILED", location))
        db_conn.commit()

        if not is_valid:
            # More specific error for frontend to distinguish
            if not result:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or invalid credentials.")
            else:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

        return JSONResponse(content={"success": True, "message": "Login successful", "user_id": user_id})

    except HTTPException as e:
        if db_conn: db_conn.rollback() 
        raise e
    except Exception as e:
        logging.error(f"Login error: {e}", exc_info=True)
        if db_conn: db_conn.rollback() 
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Server error: {e}")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


@app.post("/api/signup")
async def signup(payload: SignupPayload, request: Request): # ADDED: request: Request
    email = payload.email
    mobile = payload.mobile
    password = payload.password
    country_code = payload.countryCode
    ip_address = request.client.host if request.client else "unknown" # ADDED: Get IP address
    location = "Kurnool, India" # Hardcoded for now (or use a geo-IP for signup as well)


    db_conn = None
    cursor = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()

        hashed_password = pwd_context.hash(password)

        # Check if email already exists
        cursor.execute("SELECT user_id FROM User WHERE email = %s", (email,))
        if cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

        cursor.execute("""
            INSERT INTO User (email, phone, country_code, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (email, mobile, country_code, datetime.datetime.utcnow(), datetime.datetime.utcnow()))
        user_id = cursor.lastrowid 

        cursor.execute("""
            INSERT INTO HASH (user_id, email, hash_password)
            VALUES (%s, %s, %s)
        """, (user_id, email, hashed_password))
        
        # ADDED: Log signup attempt in LoginTrace
        sql_trace = """
            INSERT INTO LoginTrace (user_id, login_time, ip_address, login_status, location)
            VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(sql_trace, (user_id, datetime.datetime.utcnow(), ip_address,
                                   "SIGNUP_SUCCESS", location)) # Use "SIGNUP_SUCCESS" status

        db_conn.commit() # Commit all changes (User, HASH, LoginTrace)

        return JSONResponse(content={"success": True, "message": "Signup successful", "user_id": user_id})

    except HTTPException as e:
        if db_conn: db_conn.rollback()
        raise e
    except Exception as e:
        logging.error(f"Signup error: {e}", exc_info=True)
        if db_conn: db_conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {e}")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


@app.post("/api/basic-info")
async def basic_info(
    email: str = Form(...),
    first_name: str = Form(...),
    last_name: str = Form(...),
    gender: str = Form(...),
    date_of_birth: str = Form(...), # Consider using Pydantic's Date type if validation needed
    college_name: str = Form(...),
    years_of_experience: Optional[str] = Form(None), # Keep as str as frontend sends it this way
    resume: Optional[UploadFile] = File(None) 
):
    db_conn = None
    cursor = None
    try:
        resume_url = None
        # --- Fetch user_id at the beginning since it's used for S3 path and DB update ---
        temp_db_conn = None
        temp_cursor = None
        user_id_for_s3 = None
        try:
            temp_db_conn = get_db_connection()
            temp_cursor = temp_db_conn.cursor(dictionary=True)
            temp_cursor.execute("SELECT user_id, resume_url FROM User WHERE email = %s", (email,))
            user_data = temp_cursor.fetchone()
            
            if not user_data or not user_data.get('user_id'):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found. Cannot update basic info.")
            
            user_id_for_s3 = str(user_data['user_id']) # Convert to string for S3 path
            existing_resume_url = user_data.get('resume_url') # Get existing resume URL if any

        finally:
            if temp_cursor: temp_cursor.close()
            if temp_db_conn and temp_db_conn.is_connected(): temp_db_conn.close()

        if resume:
            allowed_mimetypes = [
                "application/pdf",
                "application/msword", # .doc
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" # .docx
            ]
            if resume.content_type not in allowed_mimetypes:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type for resume. Only PDF, DOC, DOCX are allowed.")
            
            file_content = await resume.read()
            if len(file_content) > 5 * 1024 * 1024: # 5 MB limit
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File size exceeds 5MB.")

            upload_response = s3_client_instance.upload_resume(user_id_for_s3, file_content, resume.content_type)
            resume_url = upload_response['url']
        else:
            # If no new resume is uploaded, retain the existing one from the database
            resume_url = existing_resume_url

        db_conn = get_db_connection()
        cursor = db_conn.cursor()

        cursor.execute("""
            UPDATE User SET
                first_name = %s, last_name = %s, gender = %s, date_of_birth = %s,
                college_name = %s, years_of_experience = %s, resume_url = %s, updated_at = %s
            WHERE email = %s
        """, (
            first_name, last_name, gender, date_of_birth,
            college_name, years_of_experience, resume_url, datetime.datetime.utcnow(), email
        ))
        db_conn.commit()

        if cursor.rowcount == 0:
            # This can happen if user exists but no fields changed, or email was wrong
            logging.warning(f"Basic info update for {email}: No rows affected. User not found or no changes.")
            # Depending on desired behavior, this might still be considered a success if no error occurred
            # For now, it will return success with existing resumeUrl if no new resume was uploaded
            pass 

        return JSONResponse(content={"success": True, "message": "Profile updated", "resumeUrl": resume_url})

    except HTTPException as e:
        if db_conn: db_conn.rollback()
        raise e
    except Exception as e:
        logging.error(f"Basic info update error for email {email}: {e}", exc_info=True)
        if db_conn: db_conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {e}")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


@app.get("/api/resume/{user_email}")
async def get_resume(user_email: str):
    db_conn = None
    cursor = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)
        cursor.execute("SELECT resume_url FROM User WHERE email = %s", (user_email,))
        result = cursor.fetchone()

        if not result or not result.get('resume_url'):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found for this user.")

        resume_url = result['resume_url']
        
        # --- FIX 2: Correctly extract S3 key and use s3_client_instance.bucket ---
        # The URL format from your s3_client.py's upload_resume is:
        # f"https://{self.bucket}.s3.amazonaws.com/{s3_key}"
        # We need to parse this to get the s3_key
        parsed_url = urlparse(resume_url)
        # Ensure the path starts after the bucket name, remove leading slash if present
        s3_key = parsed_url.path.lstrip('/') 
        
        # Generate a presigned URL using the imported s3_client_instance's underlying boto3 client
        signed_url = s3_client_instance.s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': s3_client_instance.bucket, 'Key': s3_key}, # Use s3_client_instance.bucket for bucket name
            ExpiresIn=3600 # URL valid for 1 hour (adjust as needed)
        )
        return JSONResponse(content={"url": signed_url})

    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error fetching resume from S3 for user {user_email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal server error: {e}")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


@app.post('/api/google-auth-login')
async def google_auth_login(payload: GoogleAuthPayload):
    token = payload.token
    db_conn = None
    cursor = None
    try:
        # Verify the Google ID token
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), settings.google_client_id)
        email = idinfo['email']

        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)
        cursor.execute('SELECT user_id, email FROM User WHERE email = %s', (email,))
        user = cursor.fetchone()

        if user:
            # User exists, return their info
            return JSONResponse(content={
                "success": True,
                "user_id": user['user_id'],
                "email": user['email'],
                "message": "Google login successful. User found."
            })
        else:
            # User does not exist, you might want to auto-create them or return a specific message
            # For now, it raises 404 as in the original code, but you could adjust.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found. Please sign up or ensure Google account is linked.")

    except HTTPException as e:
        raise e
    except ValueError as e:
        logging.error(f"Google Auth Token Verification Error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token.")
    except Exception as e:
        logging.error(f"Google Auth Login Error: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error during Google authentication.")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


# Helper to generate OTP (remains the same)
def generate_otp():
    return str(random.randint(100000, 999999))
otp_storage = {}
@app.post('/api/forgot-password')
async def forgot_password(payload: ForgotPasswordPayload):
    email = payload.email
    db_conn = None
    cursor = None
    
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        cursor.execute('SELECT user_id FROM User WHERE email = %s', (email,))
        user_exists = cursor.fetchone()
        
        if not user_exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Email does not exist.')
      
        otp = generate_otp()
        expires_at = datetime.datetime.now() + datetime.timedelta(minutes=15)
        otp_storage[email] = {'otp': otp, 'expires_at': expires_at}

        # Send OTP via email (your existing code)
        msg = MIMEText(f"Your OTP for password reset is: {otp}\nThis OTP will expire in 15 minutes.")
        msg['Subject'] = 'Password Reset OTP'
        msg['From'] = settings.email_user
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


@app.post('/api/verify-otp')
async def verify_otp(payload: VerifyOtpPayload):
    email = payload.email
    otp = payload.otp

    try:
        stored_data = otp_storage.get(email)
        if not stored_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='OTP expired or not found.')

        if datetime.datetime.now() > stored_data['expires_at']:
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


@app.post('/api/reset-password')
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
        if datetime.datetime.now() > stored_data['expires_at']:
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



@app.post("/v1/analyze_resume/")
async def analyze_resume(
    resume: UploadFile = File(...),
    user_email: str = Form(...),
    session_id: str = Form(...),
    targetRole: str = Form(...),
    targetCompany: str = Form(...),
    yearsOfExperience: str = Form(...),
    currentDesignation: str = Form(...),
    interviewType: str = Form(...),
    sessionInterval: str = Form(None)
):
    if not resume or not resume.content_type == "application/pdf":
        raise HTTPException(status_code=400, detail="A PDF file is required.")

    db_conn = None # Initialize db_conn for outer try-finally
    tmp_file_path = None
    try:
        logging.info(f"[{datetime.datetime.now()}] Received /analyze_resume/ request for user: {user_email}")

        # 1. Save uploaded resume to a temporary file and extract text
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            content = await resume.read()
            if len(content) > 5 * 1024 * 1024: # 5 MB limit
                raise HTTPException(status_code=413, detail="File size exceeds 5MB.")
            tmp_file.write(content)
            tmp_file_path = tmp_file.name

        resume_text = extract_text_from_pdf(tmp_file_path)
        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

        # --- Get user_id for database operations ---
        user_id_for_db = None
        # Using temp_db_conn and temp_cursor for this initial user_id fetch
        # to ensure the main transaction db_conn and cursor are clean.
        temp_db_conn = None
        temp_cursor = None
        try:
            temp_db_conn = get_db_connection()
            temp_cursor = temp_db_conn.cursor(dictionary=True)
            temp_cursor.execute("SELECT user_id FROM User WHERE email = %s", (user_email,))
            user_data = temp_cursor.fetchone()

            if not user_data or not user_data.get('user_id'):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found for resume processing.")

            user_id_for_db = user_data['user_id']
        finally:
            if temp_cursor: temp_cursor.close()
            if temp_db_conn and temp_db_conn.is_connected(): temp_db_conn.close()

        # --- Get main DB connection for subsequent operations ---
        db_conn = get_db_connection()
        cursor = db_conn.cursor()

        # --- Fetch the latest log_id for the user (for Interview table) ---
        log_id_for_interview = None # Renamed variable for clarity
        try:
            cursor.execute("""
                SELECT log_id FROM LoginTrace
                WHERE user_id = %s AND login_status = 'SUCCESS'
                ORDER BY login_time DESC
                LIMIT 1
            """, (user_id_for_db,))
            log_data = cursor.fetchone() # This line correctly consumes the single row result
            if log_data:
                log_id_for_interview = log_data[0]
            else:
                logging.warning(f"No successful log_id found for user_id: {user_id_for_db}. Interview record will be stored without log_id.")
        except Exception as e:
            logging.error(f"Error fetching log_id for user {user_id_for_db}: {e}", exc_info=True)
            # Decide if you want to raise an HTTPException here or proceed with log_id_for_interview = None
            # For now, we'll proceed with None if an error occurs.


        # --- Store Interview Setup Data into 'Interview' table (NOW WITH log_id) ---
        Interview_data_to_store = {
            "target_role": targetRole, # Use form data directly
            "target_company": targetCompany, # Use form data directly
            "years_of_experience": yearsOfExperience, # Use form data directly
            "current_designation": currentDesignation, # Use form data directly
            "interview_type": interviewType, # Use form data directly
            "session_interval": sessionInterval, # Use form data directly
            "log_id": log_id_for_interview, # ADDED: log_id for Interview table
            "created_at": datetime.datetime.utcnow()
        }

        insert_interview_sql = """
            INSERT INTO Interview (
                 current_designation, target_role, target_company, years_of_experience,
                 interview_type, session_interval, log_id, created_at
            ) VALUES ( %s, %s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(insert_interview_sql, (
            Interview_data_to_store["current_designation"],
            Interview_data_to_store["target_role"],
            Interview_data_to_store["target_company"],
            Interview_data_to_store["years_of_experience"],
            Interview_data_to_store["interview_type"],
            Interview_data_to_store["session_interval"],
            Interview_data_to_store["log_id"], # ADDED: log_id
            Interview_data_to_store["created_at"]
        ))
        db_conn.commit()
        # Retrieve the auto-generated interview_id
        interview_id_for_session = cursor.lastrowid
        logging.info(f"New Interview record created with interview_id: {interview_id_for_session} for user_id: {user_id_for_db} and log_id: {log_id_for_interview}")


        # --- 2. Call LLM to extract structured fields and generate questionnaire ---
        # The llm1_prompt is designed to return both, so one LLM call is sufficient here.
        # This reduces latency and token usage compared to two separate LLM calls.
        prompt = llm1_prompt(
            resume_text=resume_text, target_role=targetRole, target_company=targetCompany,
            years_of_experience=yearsOfExperience, current_designation=currentDesignation,
            session_interval=sessionInterval or "N/A", interview_type=interviewType
        )

        model = genai.GenerativeModel(model_id)
        llm_response = model.generate_content(prompt)
        llm_response_text = llm_response.text

        process_and_extract_json_data_result = process_and_extract_json_data(llm_response_text)
        if len(process_and_extract_json_data_result) != 2:
            raise ValueError("process_and_extract_json_data did not return two JSON strings.")

        extracted_fields_json_str, questionnaire_json_str = process_and_extract_json_data_result

        extracted_fields = json.loads(extracted_fields_json_str)
        questionnaire_prompt = json.loads(questionnaire_json_str)

        # --- 3. Store Extracted Fields into 'Resume' table ---
        # Map LLM extracted fields and frontend fields to Resume table columns
        # Prioritize LLM's extraction where available, fallback to frontend form data or None
        resume_data_to_store = {
            "user_id": user_id_for_db,
            "email_address":  user_email, # LLM's email or form email
            "mobile_number": extracted_fields.get("mobile_number"), # LLM's mobile_number
            "graduation_college": extracted_fields.get("graduation_college"), # LLM's graduation_college
            "skills": extracted_fields.get("skills"),
            "certifications": extracted_fields.get("certifications"),
            "projects": extracted_fields.get("projects"),
            "previous_companies": extracted_fields.get("previous_companies"),
            "education_degree": extracted_fields.get("education_degree"), # LLM provides 'education_degree'
            "current_role": extracted_fields.get("current_role", currentDesignation), # LLM's current_role or form data
            "work_experience": extracted_fields.get("work_experience", yearsOfExperience), # LLM's or form data
            "current_company" : extracted_fields.get("current_company"),
            "current_location" : extracted_fields.get("current_location")
        }

        insert_resume_sql = """
            INSERT INTO Resume (
                user_id, email_address, mobile_number, graduation_college, education_degree, certifications, skills,
                projects, current_company, previous_companies, current_location,
                current_role, work_experience
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                email_address = VALUES(email_address),
                mobile_number = VALUES(mobile_number),
                graduation_college = VALUES(graduation_college),
                education_degree = VALUES(education_degree),
                certifications = VALUES(certifications),
                skills = VALUES(skills),
                projects = VALUES(projects),
                current_company = VALUES(current_company),
                previous_companies = VALUES(previous_companies),
                current_location = VALUES(current_location),
                current_role = VALUES(current_role),
                work_experience = VALUES(work_experience);
        """
        cursor.execute(insert_resume_sql, (
            resume_data_to_store["user_id"],
            resume_data_to_store["email_address"],
            resume_data_to_store["mobile_number"],
            resume_data_to_store["graduation_college"],
            resume_data_to_store["education_degree"],
            resume_data_to_store["certifications"],
            resume_data_to_store["skills"],
            resume_data_to_store["projects"],
            resume_data_to_store["current_company"],
            resume_data_to_store["previous_companies"],
            resume_data_to_store["current_location"],
            resume_data_to_store["current_role"],
            resume_data_to_store["work_experience"]
        ))
        db_conn.commit()
        logging.info(f"Structured resume data stored/updated in Resume table for user_id: {user_id_for_db}")


        # --- Retrieve resume_id after insert/update ---
        # FIX: Added ORDER BY and LIMIT 1 to ensure only one row is fetched
        # and the cursor is fully consumed.
        cursor.execute("""
            SELECT resume_id FROM Resume
            WHERE user_id = %s
            ORDER BY resume_id DESC -- Assuming higher resume_id implies more recent
            LIMIT 1
        """, (user_id_for_db,))
        resume_id_for_session_data = cursor.fetchone() # Fetch the result into a variable

        if not resume_id_for_session_data:
            raise HTTPException(status_code=500, detail="Failed to retrieve resume_id after saving resume data. No resume found for user.")
        resume_id_for_session = resume_id_for_session_data[0] # Extract the actual ID from the fetched data


        # --- 4. Store questionnaire_prompt into 'InterviewSession' table ---
        sql_query = """
            INSERT INTO InterviewSession (session_id, resume_id, interview_id, prompt_example_questions, session_created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                resume_id = VALUES(resume_id),
                interview_id = VALUES(interview_id),
                prompt_example_questions = VALUES(prompt_example_questions);
        """
        # Store questionnaire_prompt directly as a JSON string in the DB.
        cursor.execute(sql_query, (
            session_id,
            resume_id_for_session,
            interview_id_for_session,
            json.dumps(questionnaire_prompt),
            datetime.datetime.utcnow()
        ))
        db_conn.commit()

        # Verification step
        cursor.execute("SELECT session_id FROM InterviewSession WHERE session_id = %s", (session_id,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=500, detail="Failed to save and verify interview session.")

        logging.info(f"VERIFICATION SUCCESS: Successfully saved interview session analysis for session_id: {session_id}")
        return JSONResponse(content={
            "Questionnaire_prompt": questionnaire_prompt # Return just the questionnaire to the frontend
        })

    except HTTPException as e:
        logging.error(f"HTTPException in /analyze_resume/: {e.detail}", exc_info=True)
        if db_conn: db_conn.rollback()
        raise e
    except Exception as e:
        logging.error(f"Unhandled error in /analyze_resume/: {e}", exc_info=True)
        if db_conn: db_conn.rollback()
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)
            
            
@app.get("/v1/analysis/{session_id}")
async def get_analysis(session_id: str):
    db_conn = None
    cursor = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)
        cursor.execute("SELECT prompt_example_questions FROM InterviewSession WHERE session_id = %s", (session_id,))
        result = cursor.fetchone()
        if result and result.get('prompt_example_questions'):
            # Load the questionnaire data from the DB column
            questionnaire_data = json.loads(result['prompt_example_questions'])

            # *** FIX IS HERE: Wrap the questionnaire_data in a dictionary with the expected key ***
            return JSONResponse(content={"Questionnaire_prompt": questionnaire_data})
        else:
            raise HTTPException(status_code=404, detail="Analysis not found.")
    finally:
        if cursor:
            cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()

@app.post("/v1/transcripts/")


@app.post("/v1/transcripts/")
async def save_transcription(payload: TranscriptionPayload):
    session_id = payload.session_id
    transcription_text = payload.transcription_text
    db_conn = None
    cursor = None

    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()

        # Check if session exists (good practice for data integrity)
        cursor.execute("SELECT session_id FROM InterviewSession WHERE session_id = %s", (session_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Interview session with ID {session_id} not found.")

        sql_query = """
            INSERT INTO Meeting (session_id, transcription, transcription_flag)
            VALUES (%s, %s, TRUE)
            ON DUPLICATE KEY UPDATE
                transcription = CONCAT(IFNULL(transcription, ''), %s),
                transcription_flag = TRUE;
        """
        # The CONCAT part should re-append the new transcription_text if an entry already exists.
        # This assumes incremental transcription. If full replacement is desired, remove CONCAT.
        cursor.execute(sql_query, (session_id, transcription_text, transcription_text))
        db_conn.commit()
        logging.info(f"Transcription saved/updated for session_id: {session_id}")
        return JSONResponse(content={"message": "Transcription saved successfully."})

    except HTTPException as e:
        if db_conn: db_conn.rollback()
        raise e
    except Exception as e:
        logging.error(f"Error saving transcription for session {session_id}: {e}\n{traceback.format_exc()}")
        if db_conn: db_conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while saving transcription.")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


@app.post("/v1/sessions/check-completion")
async def check_session_completion(payload: SessionIdList):
    session_ids = payload.session_ids
    db_conn = None
    cursor = None
    try:
        if not session_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No session IDs provided.")

        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)
        
        # Using parameterized query for IN clause to prevent SQL injection
        format_strings = ','.join(['%s'] * len(session_ids))
        cursor.execute(f"""
            SELECT m.session_id, m.transcription_flag, m.transcription
            FROM Meeting m
            WHERE m.session_id IN ({format_strings})
        """, tuple(session_ids))
        
        results = cursor.fetchall()
        
        completed_sessions = {}
        for row in results:
            completed_sessions[row['session_id']] = {
                "transcription_flag": bool(row['transcription_flag']),
                "transcription": row['transcription'] # This could be very large, consider if needed here
            }
        
        response_data = []
        for session_id in session_ids:
            # Provide default if session_id was not found in DB
            session_info = completed_sessions.get(session_id, {"transcription_flag": False, "transcription": None})
            response_data.append({
                "session_id": session_id,
                "is_completed": session_info["transcription_flag"],
                "transcription": session_info["transcription"] # Be cautious sending large text here
            })

        return JSONResponse(content={"sessions": response_data})

    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error checking session completion: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while checking session completion.")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()


@app.post("/v1/metrics/{session_id}") # Changed to POST to follow REST best practices for generating new resources/data
async def generate_metrics(session_id: str): # session_id is now a path parameter
    db_conn = None
    cursor = None
    write_cursor = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT transcription FROM Meeting WHERE session_id = %s",
            (session_id,)
        )
        result = cursor.fetchone()

        if not result or not result.get('transcription'):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found for this session ID.")

        transcript_text = result['transcription']
        logging.info(f"Fetched transcription for metrics generation for session {session_id}.")

        prompt = generate_metrics_prompt(transcript_text)
        model = genai.GenerativeModel(model_id)
        response = await model.generate_content_async(prompt)
        raw_metrics_output = response.text
        logging.info(f"LLM response for metrics received for session {session_id}.")

        metrics = extract_metrics_from_json(raw_metrics_output)
        
        sql_query = """
            INSERT INTO Metrics (session_id, technical_rating, communication_rating, problem_solving_rating, overall_rating, remarks, suspicious_flag)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                technical_rating = VALUES(technical_rating),
                communication_rating = VALUES(communication_rating),
                problem_solving_rating = VALUES(problem_solving_rating),
                overall_rating = VALUES(overall_rating),
                remarks = VALUES(remarks),
                suspicious_flag = VALUES(suspicious_flag);
        """
        
        write_cursor = db_conn.cursor()
        write_cursor.execute(sql_query, (
            session_id,
            metrics.get('technical_rating'),
            metrics.get('communication_rating'),
            metrics.get('problem_solving_rating'),
            metrics.get('overall_rating'),
            metrics.get('remarks'),
            metrics.get('suspicious_flag', False) # Default to False if not present
        ))
        db_conn.commit()

        logging.info(f"Successfully saved metrics for session_id: {session_id}")
        return JSONResponse(content={"metrics": metrics})
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logging.error(f"Error generating metrics for session {session_id}: {e}\n{traceback.format_exc()}")
        if db_conn:
            db_conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while generating metrics.")
    finally:
        if cursor:
            cursor.close()
        if write_cursor:
            write_cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()

# --- Uvicorn Server Runner ---
if __name__ == "__main__":
    import uvicorn
    # It's generally better to explicitly define host for Docker/deployment if not using 0.0.0.0
    # For local, 127.0.0.1 (localhost) is fine, but 0.0.0.0 allows access from other devices on network.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="debug") # Added log_level for verbosity