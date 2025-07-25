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

    try:
        logger.info(f"[{datetime.datetime.now()}] /analyze_resume request received for user: {user_email}")
        logger.debug(f"Payload: {payload.dict()}")

        s3_key = request.query_params.get("s3_key")

        if s3_key:
            pdf_bytes = s3_client.get_resume_by_key(s3_key)
        else:
            try:
        # ✅ Local fallback path for testing with a hardcoded PDF
                with open("/Users/buddapallavi/Library/Mobile Documents/com~apple~Preview/Documents/Resume_.pdf", "rb") as f:
                    pdf_bytes = f.read()
            except FileNotFoundError:
                raise HTTPException(status_code=404, detail="Local resume file not found for testing.")

        
        if not pdf_bytes:
            raise HTTPException(status_code=404, detail="Resume PDF not found in storage")

        resume_text = extract_text_from_pdf_bytes(pdf_bytes)
        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from stored resume.")

        db_conn = get_db_connection()
        cursor = db_conn.cursor()
        

        # Get latest log_id for the user session
        cursor.execute("""
            SELECT log_id FROM LoginTrace
            WHERE user_id = %s AND login_status IN ('SUCCESS', 'SIGNUP_SUCCESS','SUCCESS VIA GOOGLE')
            ORDER BY login_time DESC
            LIMIT 1
        """, (user_id,))
        log_data = cursor.fetchone()
        log_id_for_interview = log_data[0] if log_data else None

        if not log_id_for_interview:
            raise HTTPException(status_code=400, detail="No valid login session found for user")

        # --- Deduplication check: reuse interview_id if created within last 5 minutes ---
        cursor.execute("""
            SELECT interview_id FROM Interview
            WHERE user_id = %s AND target_role = %s
              AND created_at >= (NOW() - INTERVAL 5 MINUTE)
            ORDER BY created_at DESC
            LIMIT 1
        """, (user_id, payload.targetRole))
        existing_interview = cursor.fetchone()

        if existing_interview:
            interview_id_for_session = existing_interview[0]
            logger.info(f"Using existing interview_id {interview_id_for_session} for user {user_id} and role {payload.targetRole}")
        else:
            # Insert new Interview row
            cursor.execute("""
                INSERT INTO Interview (
                    user_id, current_designation, target_role, target_company,
                    years_of_experience, interview_type, session_interval,
                    log_id, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id,
                payload.currentDesignation,
                payload.targetRole,
                payload.targetCompany,
                payload.yearsOfExperience,
                payload.interviewType,
                payload.sessionInterval,
                log_id_for_interview,
                datetime.datetime.utcnow()
            ))
            db_conn.commit()
            interview_id_for_session = cursor.lastrowid
            logger.info(f"Inserted new interview_id {interview_id_for_session} for user {user_id} and role {payload.targetRole}")

        # Generate prompt & call Gemini LLM
        genai.configure(api_key=GEMINI_API_KEY)
        prompt = llm1_prompt(
            resume_text=resume_text,
            target_role=payload.targetRole,
            target_company=payload.targetCompany,
            years_of_experience=str(payload.yearsOfExperience),
            current_designation=payload.currentDesignation,
            session_interval=str(payload.sessionInterval) if payload.sessionInterval else "N/A",
            interview_type=payload.interviewType
        )
        model = genai.GenerativeModel(model_name=MODEL_ID)
        llm_response = model.generate_content(prompt)
        llm_response_text = llm_response.text

        extracted_fields_json_str, questionnaire_json_str = process_and_extract_json_data(llm_response_text)
        extracted_fields = json.loads(extracted_fields_json_str)
        questionnaire_prompt = json.loads(questionnaire_json_str)

        # Update Resume table with extracted fields
        skills_str = json.dumps(extracted_fields.get("skills")) if extracted_fields.get("skills") else None
        certifications_str = json.dumps(extracted_fields.get("certifications")) if extracted_fields.get("certifications") else None
        projects_str = json.dumps(extracted_fields.get("projects")) if extracted_fields.get("projects") else None
        previous_companies_str = json.dumps(extracted_fields.get("previous_companies")) if extracted_fields.get("previous_companies") else None

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
        
        cursor.execute("""
            UPDATE Interview SET
                prompt_example_questions = %s
            WHERE interview_id=%s
        """, (
            json.dumps(questionnaire_prompt),
            interview_id_for_session
        ))
        db_conn.commit()
        
        # Fetch full_name from Resume table
        cursor.execute("SELECT full_name FROM Resume WHERE user_id = %s", (user_id,))
        resume_row = cursor.fetchone()
        full_name = resume_row[0] if resume_row else None


        # Return interview_id to frontend
        return JSONResponse(content={
    "interview_id": interview_id_for_session,
    "Questionnaire_prompt": questionnaire_prompt,
    "resume_summary": {
        "skills": extracted_fields.get("skills"),
        "certifications": extracted_fields.get("certifications"),
        "projects": extracted_fields.get("projects"),
        "previous_companies": extracted_fields.get("previous_companies"),
        "graduation_college": extracted_fields.get("education_degree"),
        "current_role": extracted_fields.get("current_role", payload.currentDesignation),
        "current_company": extracted_fields.get("current_company"),
        "current_location": extracted_fields.get("current_location"),
    },
    "input_metadata": {
        "target_role": payload.targetRole,
        "target_company": payload.targetCompany,
        "years_of_experience": payload.yearsOfExperience,
        "interview_type": payload.interviewType,
        "session_interval": payload.sessionInterval
    },
    "user_details": {
        "full_name": full_name,
    }
})



    except ResourceExhausted as e:
        logger.error(f"Gemini API quota exceeded: {e}", exc_info=True)
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
