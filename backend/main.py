from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from google import genai
from google.genai.types import Tool, GenerateContentConfig, GoogleSearch
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
import os
import tempfile
import logging
import datetime
import json
import mysql.connector
from s3_client import s3_client  # Import your S3 client                                        

# Import your custom functions and prompts
from prompts import llm1_prompt
from functions import extract_text_from_pdf, process_and_extract_json_data

load_dotenv()

# --- Logging Configuration ---
logging.basicConfig(
    filename="api_errors.log",
    level=logging.ERROR,
    format='%(asctime)s - %(levelname)s - %(message)s')

# --- Settings Management (unchanged) ---
class Settings(BaseSettings):
    environment: str = os.getenv("ENVIRONMENT", "development")
    #GEMINI_API_KEY: str
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str
    AWS_BUCKET_NAME: str
    google_api_key: str
    db_host: str
    db_user: str
    db_password: str
    db_name: str
    db_port: str
    class Config: env_file = ".env"

settings = Settings()

# --- Gemini Client Initialization ---
if not settings.google_api_key:
    raise ValueError("GEMINI_API_KEY is not set in environment variables or .env file.")

client = genai.Client(api_key=settings.google_api_key)
model_id = "gemini-1.5-flash"
google_search_tool = Tool(google_search=GoogleSearch())

# --- FastAPI Application Setup ---
app = FastAPI(title="Resume Analyzer API", version="1.0")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Connection Helper (unchanged) ---
def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host=settings.db_host, user=settings.db_user, password=settings.db_password,
            database=settings.db_name, port=settings.db_port
        )
        return conn
    except mysql.connector.Error as e:
        logging.error(f"Database connection failed: {e}")
        raise HTTPException(status_code=500, detail="Database connection error.")

# --- Endpoint 1: Analyze Resume and SAVE to DB ---
@app.post("/v1/analyze_resume/")
async def analyze_resume(
    resume: UploadFile = File(None),
    user_email: str = Form(...),
    session_id: str = Form(...),
    targetRole: str = Form(...),
    targetCompany: str = Form(...),
    yearsOfExperience: str = Form(...),
    currentDesignation: str = Form(...),
    interviewType: str = Form(...),
    sessionInterval: str = Form(None)
):
    if not resume.content_type == "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
    
    db_conn = None
    tmp_file_path = None
    try:

        print(f"[{datetime.datetime.now()}] Received request for user: {user_email}")
        print(f"File received: {resume.filename}, Content-Type: {resume.content_type}")
        if resume:
            print(f"Processing direct upload: {resume.filename}")
            if resume.content_type != "application/pdf":
                raise HTTPException(status_code=400, detail="Only PDF files are allowed")
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            content = await resume.read()
            if len(content) > 5 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="File size exceeds 5MB. Max 5MB allowed.")
            tmp_file.write(await resume.read())
            tmp_file_path = tmp_file.name
        print(f"[{datetime.datetime.now()}] PDF saved temporarily at: {tmp_file_path}")
       
        # Upload to S3
        try:
            with open(tmp_file_path, 'rb') as f:
                upload_result = s3_client.upload_resume(
                    user_id=user_email,
                    file_bytes=f.read()
                )
            print(f"[{datetime.datetime.now()}] Resume uploaded to S3: {upload_result['url']}")
        except Exception as upload_error:
            logging.error(f"S3 upload failed: {str(upload_error)}")
            raise HTTPException(status_code=500, detail="Failed to store resume in S3")
        
        # resume_text = extract_text_from_pdf(tmp_file_path)
        # if not resume_text.strip():
        #     raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

        # Get the most recent resume from S3 (which we just uploaded)
        try:
            resume_text = extract_text_from_pdf(s3_client.get_resume_from_s3(user_email))
            if not resume_text.strip():
                raise HTTPException(status_code=400, detail="Could not extract text from the PDF.")
            print(f"[{datetime.datetime.now()}] Extracted {len(resume_text)} characters from resume")
        except HTTPException as e:
            if e.status_code == 404:
                raise HTTPException(status_code=400, detail="No resume found. Please upload one.")
            raise e
        
        # --- THIS BLOCK WAS MISSING - IT IS NOW RESTORED ---
        prompt = llm1_prompt(
            resume_text=resume_text,
            target_role=targetRole,
            target_company=targetCompany,
            years_of_experience=yearsOfExperience,
            current_designation=currentDesignation,
            session_interval=sessionInterval or "N/A",
            interview_type=interviewType
        )
        
        model = genai.GenerativeModel(model_id)
        response = model.generate_content(prompt)
        full_response_text = response.text
        
        extracted_fields_str, questionnaire_str = process_and_extract_json_data(full_response_text)
        
        full_analysis_data = {
            "Extracted_fields": json.loads(extracted_fields_str),
            "Questionnaire_prompt": json.loads(questionnaire_str)
        }
        # --- END OF RESTORED BLOCK ---

        # --- Database Logic ---
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        
        logging.info(f"Attempting to save analysis for session_id: {session_id}")
        sql_query = """
            INSERT INTO InterviewSession (session_id, prompt_example_questions, session_created_at)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE 
                prompt_example_questions = VALUES(prompt_example_questions);
        """
        cursor.execute(sql_query, (session_id, json.dumps(full_analysis_data), datetime.datetime.utcnow()))
        
        db_conn.commit()
        logging.info(f"Commit command sent for session_id: {session_id}")
        
        logging.info(f"Verifying write for session_id: {session_id}")
        cursor.execute("SELECT session_id FROM InterviewSession WHERE session_id = %s", (session_id,))
        verification_result = cursor.fetchone()
        
        if verification_result is None:
            logging.error(f"VERIFICATION FAILED: Data for session_id {session_id} was not found after commit.")
            raise HTTPException(status_code=500, detail="Failed to save and verify interview session.")
        
        logging.info(f"VERIFICATION SUCCESS: Successfully saved and verified for session_id: {session_id}")
        
        cursor.close()
        
        return JSONResponse(content=full_analysis_data)

    except Exception as e:
        logging.error(f"Error in /analyze_resume/: {e}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if db_conn and db_conn.is_connected():
            db_conn.close()
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)

# --- Endpoint 2: GET Analysis from DB (unchanged) ---
@app.get("/v1/analysis/{session_id}")
async def get_analysis(session_id: str):
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)
        sql_query = "SELECT prompt_example_questions FROM InterviewSession WHERE session_id = %s"
        cursor.execute(sql_query, (session_id,))
        result = cursor.fetchone()
        cursor.close()
        db_conn.close()

        if result and result.get('prompt_example_questions'):
            analysis_data = json.loads(result['prompt_example_questions'])
            return JSONResponse(content=analysis_data)
        else:
            raise HTTPException(status_code=404, detail="Analysis not found.")
            
    except Exception as e:
        logging.error(f"Error in /analysis/{session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# --- Uvicorn Server Runner (unchanged) ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)