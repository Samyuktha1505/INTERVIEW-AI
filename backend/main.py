from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import os
import tempfile
import logging
import datetime
import json
import mysql.connector
# from s3_client import s3_client # Your existing S3 client

# Import all your custom functions and prompts
from prompts import llm1_prompt, generate_metrics_prompt
from functions import extract_text_from_pdf, process_and_extract_json_data, extract_metrics_from_json

load_dotenv()

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Settings Management (Using your complete version) ---
class Settings(BaseSettings):
    google_api_key: str
    db_host: str
    db_user: str
    db_password: str
    db_name: str
    db_port: str
    # Your required AWS keys
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str
    AWS_BUCKET_NAME: str

    class Config:
        env_file = ".env"

settings = Settings()

# --- Gemini Client Initialization ---
genai.configure(api_key=settings.google_api_key)
model_id = "gemini-1.5-flash"

# --- FastAPI Application Setup ---
app = FastAPI(title="Interview AI API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Connection Helper ---
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


# --- Pydantic Models for API Payloads ---
class TranscriptionPayload(BaseModel):
    session_id: str
    transcription_text: str

class SessionIdList(BaseModel):
    session_ids: List[str] = Field(..., min_length=1)


# ====================================================================
# --- API ENDPOINTS ---
# ====================================================================

# --- Endpoint 1: Analyze Resume (Using your detailed logic) ---
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
    try:
        print(f"[{datetime.datetime.now()}] Received request for user: {user_email}")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            content = await resume.read()
            if len(content) > 5 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="File size exceeds 5MB.")
            tmp_file.write(content)
            tmp_file_path = tmp_file.name
        
        # Your S3 logic can be re-enabled here if needed
        
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
        return JSONResponse(content=full_analysis_data)
        
    except Exception as e:
        logging.error(f"Error in /analyze_resume/: {e}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'db_conn' in locals() and db_conn and db_conn.is_connected():
            db_conn.close()
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)

# --- Endpoint 2: Get Analysis ---
@app.get("/v1/analysis/{session_id}")
async def get_analysis(session_id: str):
    db_conn = None
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
        if db_conn and db_conn.is_connected():
            db_conn.close()

# --- Endpoint 3: Save Transcription ---
@app.post("/v1/transcripts/")
async def save_transcript(payload: TranscriptionPayload):
    db_conn = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        sql_query = """
            INSERT INTO Meeting (session_id, transcription, transcription_flag)
            VALUES (%s, %s, 1)
            ON DUPLICATE KEY UPDATE
                transcription = VALUES(transcription),
                transcription_flag = 1;
        """
        cursor.execute(sql_query, (payload.session_id, payload.transcription_text))
        db_conn.commit()
        return {"status": "success", "message": "Transcription stored successfully."}
    except Exception as e:
        logging.error(f"Error saving transcript: {e}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        raise HTTPException(status_code=500, detail="Database error during transcription save.")
    finally:
        if db_conn and db_conn.is_connected():
            db_conn.close()

# --- Endpoint 4: Check for Completed Transcriptions ---
@app.post("/v1/sessions/check-completion")
async def check_session_completion(payload: SessionIdList):
    if not payload.session_ids:
        return {"completed_ids": []}
    db_conn = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        format_strings = ','.join(['%s'] * len(payload.session_ids))
        sql_query = f"SELECT DISTINCT session_id FROM Meeting WHERE session_id IN ({format_strings})"
        cursor.execute(sql_query, tuple(payload.session_ids))
        results = cursor.fetchall()
        completed_ids = [row[0] for row in results]
        return {"completed_ids": completed_ids}
    except Exception as e:
        logging.error(f"Error checking session completion: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to check session completion status.")
    finally:
        if db_conn and db_conn.is_connected():
            db_conn.close()

# --- Endpoint 5: Generate and Save Metrics ---
@app.post("/v1/metrics/{session_id}")
async def generate_and_save_metrics(session_id: str):
    db_conn = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)
        cursor.execute("SELECT transcription FROM Meeting WHERE session_id = %s", (session_id,))
        result = cursor.fetchone()

        if not result or not result.get('transcription'):
            raise HTTPException(status_code=404, detail="Transcription not found for this session.")
        
        transcript_text = result['transcription']
        
        prompt = generate_metrics_prompt(transcript_text)
        model = genai.GenerativeModel(model_id)
        response = model.generate_content(prompt)
        
        metrics = extract_metrics_from_json(response.text)
        if not metrics:
            raise HTTPException(status_code=500, detail="Failed to extract metrics from LLM response.")

        sql_query = """
            INSERT INTO Metrics (session_id, technical_score, communication_score, suspicious_flag, insights)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                technical_score = VALUES(technical_score),
                communication_score = VALUES(communication_score),
                suspicious_flag = VALUES(suspicious_flag),
                insights = VALUES(insights);
        """
        # Create a new cursor for the write operation
        write_cursor = db_conn.cursor()
        write_cursor.execute(sql_query, (
            session_id, metrics.get('technical_score'), metrics.get('communication_score'),
            metrics.get('suspicious_flag'), metrics.get('insights')
        ))
        db_conn.commit()
        write_cursor.close()

        return JSONResponse(content={"metrics": metrics})
    except Exception as e:
        logging.error(f"Error generating metrics for session {session_id}: {e}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        raise HTTPException(status_code=500, detail="An internal error occurred while generating metrics.")
    finally:
        if db_conn and db_conn.is_connected():
            db_conn.close()

# --- Uvicorn Server Runner ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)