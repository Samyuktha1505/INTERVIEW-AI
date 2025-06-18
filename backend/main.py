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

otp_storage = {}

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
    allow_origins=["http://localhost:3000", "http://localhost:8080", "http://127.0.0.1:3000", "http://127.0.0.1:8080"], # Added common frontend dev ports
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
async def signup(payload: SignupPayload):
    email = payload.email
    mobile = payload.mobile
    password = payload.password
    country_code = payload.countryCode

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
        db_conn.commit()

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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, 
                              detail='Email doesn\'t exist, please signup to continue.')

        otp = generate_otp()
        expires_at = datetime.datetime.now() + datetime.timedelta(minutes=15)
        
        # Store OTP in memory
        otp_storage[email] = {
            'otp': otp,
            'expires_at': expires_at
        }
        
        logging.info(f"Generated OTP for {email} and stored in memory: {otp}")

        msg = MIMEText(f"Your OTP for password reset is: {otp}\nThis OTP will expire in 15 minutes.")
        msg['Subject'] = 'Password Reset OTP'
        msg['From'] = settings.email_user
        msg['To'] = email

        transporter = get_email_transporter()
        transporter.send_message(msg)
        transporter.quit()
        logging.info(f"OTP email sent to {email}")

        return JSONResponse(content={"success": True, "message": "OTP sent successfully"})

    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error in forgot password for {email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                          detail="Internal server error.")
    finally:
        if cursor: cursor.close()
        if db_conn and db_conn.is_connected(): db_conn.close()

@app.post('/api/verify-otp')
async def verify_otp(payload: VerifyOtpPayload):
    email = payload.email
    otp = payload.otp

    try:
        # Retrieve OTP from memory storage
        stored_data = otp_storage.get(email)
        
        if not stored_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail='OTP expired or not found.')

        if datetime.datetime.now() > stored_data['expires_at']:
            # Remove expired OTP from memory
            del otp_storage[email]
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail='OTP expired.')

        if stored_data['otp'] != otp:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail='Invalid OTP.')

        # OTP is valid, mark it as verified by adding a flag
        otp_storage[email]['verified'] = True
        
        return JSONResponse(content={"success": True, "message": "OTP verified successfully"})

    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error verifying OTP for {email}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                          detail="Internal server error.")
@app.post('/api/reset-password')
async def reset_password(payload: ResetPasswordPayload):
    email = payload.email
    otp = payload.otp
    new_password = payload.newPassword

    db_conn = None
    cursor = None
    try:
        # Check OTP from memory storage first
        stored_data = otp_storage.get(email)
        
        if not stored_data:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail='OTP expired or not found.')
        
        if not stored_data.get('verified'):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail='OTP not verified.')

        if datetime.datetime.now() > stored_data['expires_at']:
            # Remove expired OTP from memory
            del otp_storage[email]
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail='OTP expired.')

        if stored_data['otp'] != otp:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, 
                              detail='Invalid OTP.')

        # If we get here, OTP is valid and verified
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)

        hashed_password = pwd_context.hash(new_password)
        
        # Update user's password in HASH table
        update_hash_sql = 'UPDATE HASH SET hash_password = %s WHERE email = %s'
        cursor.execute(update_hash_sql, (hashed_password, email))
        
        db_conn.commit()

        # Remove the OTP from memory after successful password reset
        del otp_storage[email]

        logging.info(f"Password reset for {email}")
        return JSONResponse(content={"success": True, "message": "Password updated successfully"})

    except HTTPException as e:
        if db_conn: db_conn.rollback()
        raise e
    except Exception as e:
        logging.error(f"Error resetting password for {email}: {e}", exc_info=True)
        if db_conn: db_conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
                          detail="Internal server error.")
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
    
    db_conn = None
    tmp_file_path = None
    cursor = None
    try:
        print(f"[{datetime.datetime.now()}] Received request for user: {user_email}")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            content = await resume.read()
            if len(content) > 5 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="File size exceeds 5MB.")
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        resume_text = extract_text_from_pdf(tmp_file_path)
        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF.")
        
        prompt = llm1_prompt(
            resume_text=resume_text, target_role=targetRole, target_company=targetCompany,
            years_of_experience=yearsOfExperience, current_designation=currentDesignation,
            session_interval=sessionInterval or "N/A", interview_type=interviewType
        )
        
        model = genai.GenerativeModel(model_id)
        response = model.generate_content(prompt)
        
        extracted_fields_str, questionnaire_str = process_and_extract_json_data(response.text)
        
        full_analysis_data = {
            "Extracted_fields": json.loads(extracted_fields_str),
            "Questionnaire_prompt": json.loads(questionnaire_str)
        }
        
        data_to_store_in_db = json.loads(questionnaire_str) # Parse to ensure it's a valid JSON object/array
                                                          # Then, dump it back to string for DB storage
        
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        
        sql_query = """
            INSERT INTO InterviewSession (session_id, prompt_example_questions, session_created_at)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE 
                prompt_example_questions = VALUES(prompt_example_questions);
        """
        cursor.execute(sql_query, (session_id, json.dumps(full_analysis_data), datetime.datetime.utcnow()))
        db_conn.commit()
        
        cursor.execute("SELECT session_id FROM InterviewSession WHERE session_id = %s", (session_id,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=500, detail="Failed to save and verify interview session.")
        
        logging.info(f"VERIFICATION SUCCESS: Successfully saved for session_id: {session_id}")
        return JSONResponse(content={
            "Questionnaire_prompt": json.loads(questionnaire_str)
        })
        
    except Exception as e:
        logging.error(f"Error in /analyze_resume/: {e}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()
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
            return JSONResponse(content=json.loads(result['prompt_example_questions']))
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