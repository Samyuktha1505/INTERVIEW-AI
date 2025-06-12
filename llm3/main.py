from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
from pydantic import BaseModel, Field
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import os
import logging
import traceback
import json
import mysql.connector

from prompts import generate_metrics_prompt
from functions import extract_metrics_from_json

# Load environment variables
load_dotenv()

# --- Settings Management ---
class Settings(BaseSettings):
    gemini_api_key: str
    db_host: str
    db_user: str
    db_password: str
    db_name: str
    db_port: str

    class Config:
        env_file = ".env"

settings = Settings()

# --- Configure Gemini + FastAPI ---
genai.configure(api_key=settings.gemini_api_key)
model_id = "gemini-2.0-flash"
app = FastAPI(title="Interview Metrics API", version="1.0")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# CORS
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

# --- Session Check Model ---
class SessionIdList(BaseModel):
    session_ids: List[str] = Field(..., min_length=1)

# --- Endpoint to Check Which Sessions Are Completed ---
@app.post("/v1/sessions/check-completion")
async def check_session_completion(payload: SessionIdList):
    if not payload.session_ids:
        return {"completed_ids": []}

    db_conn = None
    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        format_strings = ','.join(['%s'] * len(payload.session_ids))
        query = f"SELECT DISTINCT session_id FROM Metrics WHERE session_id IN ({format_strings})"
        cursor.execute(query, tuple(payload.session_ids))
        results = cursor.fetchall()
        completed_ids = [row[0] for row in results]
        return {"completed_ids": completed_ids}
    except Exception as e:
        logging.error(f"Error checking session completion: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to check session completion status.")
    finally:
        if db_conn and db_conn.is_connected():
            cursor.close()
            db_conn.close()

# --- Endpoint to Generate and Save Metrics ---
@app.post("/v1/metrics/{session_id}")
async def generate_and_save_metrics(session_id: str):
    db_conn = None
    try:
        logging.info(f"Fetching transcription for session_id: {session_id}")
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)
        cursor.execute("SELECT transcription FROM Meeting WHERE session_id = %s", (session_id,))
        result = cursor.fetchone()

        if not result or not result.get('transcription'):
            raise HTTPException(status_code=404, detail="Transcription not found for this session.")

        transcript_text = result['transcription']
        logging.info(f"Transcription fetched, length: {len(transcript_text)}")

        # Generate prompt and LLM output
        prompt = generate_metrics_prompt(transcript_text)
        model = genai.GenerativeModel(model_id)
        response = model.generate_content(prompt)

        # Parse and validate the output
        metrics = extract_metrics_from_json(response.text)
        if not metrics:
            raise HTTPException(status_code=500, detail="Failed to extract metrics from LLM response.")

        logging.info(f"Metrics generated: {metrics}")

        # Save to MySQL (with suspicious_flag)
        sql = """
            INSERT INTO Metrics (
                session_id, technical_rating, communication_rating,
                problem_solving_rating, overall_rating, remarks, suspicious_flag
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                technical_rating = VALUES(technical_rating),
                communication_rating = VALUES(communication_rating),
                problem_solving_rating = VALUES(problem_solving_rating),
                overall_rating = VALUES(overall_rating),
                remarks = VALUES(remarks),
                suspicious_flag = VALUES(suspicious_flag);
        """
        cursor.execute(sql, (
            session_id,
            metrics.get('technical_rating'),
            metrics.get('communication_rating'),
            metrics.get('problem_solving_rating'),
            metrics.get('overall_rating'),
            metrics.get('remarks'),
            metrics.get('suspicious_flag', False)
        ))
        db_conn.commit()

        logging.info(f"Successfully saved metrics for session_id: {session_id}")
        return JSONResponse(content={"metrics": metrics})

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logging.error(f"Error generating metrics for session {session_id}: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="An internal error occurred while generating metrics.")
    finally:
        if db_conn and db_conn.is_connected():
            cursor.close()
            db_conn.close()

# --- Run the app ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
