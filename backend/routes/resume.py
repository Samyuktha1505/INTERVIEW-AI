from fastapi import APIRouter, Depends, HTTPException, Body, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import logging
import datetime
import uuid
import json
import fitz  # PyMuPDF

from backend.utils.jwt_auth import get_current_user
from backend.utils.prompts import llm1_prompt
from backend.utils.functions import extract_text_from_pdf_bytes, process_and_extract_json_data
from backend.config import MODEL_ID, GEMINI_API_KEY
from backend.utils.s3_client import s3_client
from backend.db.mysql import get_db_connection
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted

router = APIRouter()

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class ResumeAnalysisRequest(BaseModel):
    targetRole: str
    targetCompany: str
    yearsOfExperience: int
    currentDesignation: str
    interviewType: str
    sessionInterval: int | None = None


@router.get("/resume/{user_id}")
async def get_resume(user_id: str, current_user: dict = Depends(get_current_user)):
    if str(current_user.get("user_id")) != user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's resume")
    try:
        pdf_bytes = s3_client.get_resume_from_s3(user_id)
        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="Resume not found for user")

        # Extract text from PDF bytes using utility function
        resume_text = extract_text_from_pdf_bytes(pdf_bytes)

        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Failed to extract text from resume PDF")

        return JSONResponse(content={"resume_text": resume_text})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching or processing resume for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while fetching resume")


@router.post("/analyze_resume")
async def analyze_resume(
    request: Request,
    payload: ResumeAnalysisRequest = Body(...),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")
    user_email = current_user.get("email")

    db_conn = None
    cursor = None
    session_id = str(uuid.uuid4())

    try:
        logger.info(f"[{datetime.datetime.now()}] /analyze_resume request received for user: {user_email}")
        logger.debug(f"Payload: {payload.dict()}")

        s3_key = request.query_params.get("s3_key")

        # Get PDF bytes from S3 (by key or user_id)
        pdf_bytes = s3_client.get_resume_by_key(s3_key) if s3_key else s3_client.get_resume_from_s3(user_id)
        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="Resume PDF not found in storage")

        # Extract resume text from PDF bytes
        resume_text = extract_text_from_pdf_bytes(pdf_bytes)
        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from stored resume.")

        # DB connection and cursor
        db_conn = get_db_connection()
        cursor = db_conn.cursor()

        # Get user's latest login log_id for interview association
        cursor.execute("""
            SELECT log_id FROM LoginTrace
            WHERE user_id = %s AND login_status IN ('SUCCESS', 'SIGNUP_SUCCESS')
            ORDER BY login_time DESC
            LIMIT 1
        """, (user_id,))
        log_data = cursor.fetchone()
        log_id_for_interview = log_data[0] if log_data else None

        # Insert interview metadata
        interview_data = {
            "target_role": payload.targetRole,
            "target_company": payload.targetCompany,
            "years_of_experience": payload.yearsOfExperience,
            "current_designation": payload.currentDesignation,
            "interview_type": payload.interviewType,
            "session_interval": payload.sessionInterval,
            "log_id": log_id_for_interview,
            "created_at": datetime.datetime.utcnow()
        }

        cursor.execute("""
            INSERT INTO Interview (
                current_designation, target_role, target_company, years_of_experience,
                interview_type, session_interval, log_id, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, tuple(interview_data.values()))
        db_conn.commit()
        interview_id_for_session = cursor.lastrowid

        # Configure Gemini API
        genai.configure(api_key=GEMINI_API_KEY)

        # Prepare prompt
        prompt = llm1_prompt(
            resume_text=resume_text,
            target_role=payload.targetRole,
            target_company=payload.targetCompany,
            years_of_experience=str(payload.yearsOfExperience),
            current_designation=payload.currentDesignation,
            session_interval=str(payload.sessionInterval) if payload.sessionInterval else "N/A",
            interview_type=payload.interviewType
        )

        # Call Gemini API
        model = genai.GenerativeModel(model_name=MODEL_ID)
        llm_response = model.generate_content(prompt)
        llm_response_text = llm_response.text

        # Extract JSON parts from LLM response
        extracted_fields_json_str, questionnaire_json_str = process_and_extract_json_data(llm_response_text)
        extracted_fields = json.loads(extracted_fields_json_str)
        questionnaire_prompt = json.loads(questionnaire_json_str)

        # Prepare JSON strings for DB storage for array fields
        skills_str = json.dumps(extracted_fields.get("skills")) if extracted_fields.get("skills") else None
        certifications_str = json.dumps(extracted_fields.get("certifications")) if extracted_fields.get("certifications") else None
        projects_str = json.dumps(extracted_fields.get("projects")) if extracted_fields.get("projects") else None
        previous_companies_str = json.dumps(extracted_fields.get("previous_companies")) if extracted_fields.get("previous_companies") else None

        # Update Resume table with extracted info
        cursor.execute("""
            UPDATE Resume SET
                skills = %s,
                certifications = %s,
                projects = %s,
                previous_companies = %s,
                graduation_college = %s,
                current_role = %s,
                current_company = %s,
                current_location = %s
            WHERE user_id = %s
        """, (
            skills_str,
            certifications_str,
            projects_str,
            previous_companies_str,
            extracted_fields.get("education_degree"),
            extracted_fields.get("current_role", payload.currentDesignation),
            extracted_fields.get("current_company"),
            extracted_fields.get("current_location"),
            user_id
        ))
        db_conn.commit()

        # Fetch resume_id for current user for session insert
        cursor.execute("""
            SELECT resume_id FROM Resume
            WHERE user_id = %s
            ORDER BY resume_id DESC
            LIMIT 1
        """, (user_id,))
        resume_id_for_session_data = cursor.fetchone()
        if not resume_id_for_session_data:
            raise HTTPException(status_code=500, detail="Failed to retrieve resume_id after saving resume data.")
        resume_id_for_session = resume_id_for_session_data[0]

        # Insert InterviewSession record
        cursor.execute("""
            INSERT INTO InterviewSession (session_id, resume_id, interview_id, prompt_example_questions, session_created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                resume_id = VALUES(resume_id),
                interview_id = VALUES(interview_id),
                prompt_example_questions = VALUES(prompt_example_questions);
        """, (
            session_id,
            resume_id_for_session,
            interview_id_for_session,
            json.dumps(questionnaire_prompt),
            datetime.datetime.utcnow()
        ))

        # Insert Meeting record with transcription_flag False
        cursor.execute("""
            INSERT INTO Meeting (session_id, transcription_flag)
            VALUES (%s, %s)
        """, (session_id, False))

        db_conn.commit()

        return JSONResponse(content={"session_id": session_id, "Questionnaire_prompt": questionnaire_prompt})

    except ResourceExhausted as e:
        logger.error(f"Gemini API quota exceeded in /analyze_resume/: {e}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        return JSONResponse(status_code=429, content={
            "detail": "Resume analysis is temporarily unavailable due to API usage limits. Please try again later."
        })
    except HTTPException as e:
        logger.error(f"HTTPException in /analyze_resume/: {e.detail}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        raise e
    except Exception as e:
        logger.error(f"Unhandled error in /analyze_resume/: {e}", exc_info=True)
        if db_conn:
            db_conn.rollback()
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")
    finally:
        if cursor:
            cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()
