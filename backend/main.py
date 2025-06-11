from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from pydantic_settings import BaseSettings
import os
import tempfile
import logging
import datetime
import json
import mysql.connector

# Import your custom functions and prompts
from prompts import llm1_prompt
from functions import extract_text_from_pdf, process_and_extract_json_data

# --- Settings Management ---
class Settings(BaseSettings):
    google_api_key: str
    db_host: str
    db_user: str
    db_password: str
    db_name: str
    db_port: str

    class Config:
        env_file = ".env"

settings = Settings()

# --- Gemini Client Initialization ---
genai.configure(api_key=settings.google_api_key)
model_id = "gemini-1.5-flash"

# --- Logging Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- FastAPI Application Setup ---
app = FastAPI(title="Interview AI API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # IMPORTANT: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Connection Helper ---
def get_db_connection():
    try:
        conn = mysql.connector.connect(
            host=settings.db_host,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
            port=settings.db_port
        )
        return conn
    except mysql.connector.Error as e:
        logging.error(f"Database connection failed: {e}")
        raise HTTPException(status_code=500, detail="Database connection error.")

# --- Endpoint 1: Analyze Resume and SAVE to DB ---
@app.post("/v1/analyze_resume/")
async def analyze_resume(
    resume: UploadFile = File(...),
    session_id: str = Form(...), # MODIFIED: Expects a string UUID
    targetRole: str = Form(...),
    targetCompany: str = Form(...),
    yearsOfExperience: str = Form(...),
    currentDesignation: str = Form(...),
    interviewType: str = Form(...),
    sessionInterval: str = Form(None)
):
    if not resume.content_type == "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed.")
        
    tmp_file_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
            tmp_file.write(await resume.read())
            tmp_file_path = tmp_file.name
            
        resume_text = extract_text_from_pdf(tmp_file_path)
        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF.")

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
        cursor.close()
        db_conn.close()
        logging.info(f"Successfully saved analysis for session_id: {session_id}")
        
        return JSONResponse(content=full_analysis_data)

    except Exception as e:
        logging.error(f"Error in /analyze_resume/: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_file_path and os.path.exists(tmp_file_path):
            os.remove(tmp_file_path)

# --- Endpoint 2: GET Analysis from DB ---
@app.get("/v1/analysis/{session_id}")
async def get_analysis(session_id: str): # MODIFIED: Expects a string UUID
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        sql_query = "SELECT prompt_example_questions FROM InterviewSession WHERE session_id = %s"
        cursor.execute(sql_query, (session_id,))
        result = cursor.fetchone()
        cursor.close()
        db_conn.close()

        if result and result[0]:
            analysis_data = json.loads(result[0])
            return JSONResponse(content=analysis_data)
        else:
            raise HTTPException(status_code=404, detail="Analysis not found.")
            
    except Exception as e:
        logging.error(f"Error in /analysis/{session_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# --- Uvicorn Server Runner ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)