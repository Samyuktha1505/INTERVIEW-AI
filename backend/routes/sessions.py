from fastapi import APIRouter, Depends, HTTPException, status,Query
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional
import logging
import traceback
import json
import decimal
import datetime
import os
from pydantic import BaseModel
from uuid import uuid4

from backend.db.mysql import get_db_connection
from backend.schemas import SessionIdList  # Your Pydantic model for payload validation
from backend.utils.jwt_auth import get_current_user   # Your auth dependency for user info
from backend.utils.s3_client import s3_client
from backend.utils.prompts import generate_summary_prompt
import google.generativeai as genai

router = APIRouter()
logger = logging.getLogger(__name__)

def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, decimal.Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    else:
        return obj

from typing import List
from pydantic import BaseModel

class SessionIdList(BaseModel):
    session_ids: List[str]


@router.post("/check-completion")
async def check_session_completion(
    payload: SessionIdList,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    session_ids = payload.session_ids
    user_id_from_token = current_user.get("user_id")

    if not session_ids:
        raise HTTPException(status_code=400, detail="No session IDs provided.")

    db_conn = None
    cursor = None

    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)

        # Step 1: Verify these sessions belong to the current user by joining InterviewSession and Interview and LoginTrace
        placeholders = ','.join(['%s'] * len(session_ids))
        query_verify = f"""
            SELECT s.session_id
            FROM InterviewSession s
            JOIN Interview i ON s.interview_id = i.interview_id
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE s.session_id IN ({placeholders}) AND lt.user_id = %s
        """
        cursor.execute(query_verify, tuple(session_ids) + (user_id_from_token,))
        valid_sessions = [row['session_id'] for row in cursor.fetchall()]
        if not valid_sessions:
            raise HTTPException(status_code=403, detail="No valid sessions found for this user.")

        # Step 2: Fetch meeting completion status for these session_ids
        placeholders = ','.join(['%s'] * len(valid_sessions))
        query_meeting = f"""
            SELECT session_id, transcription_flag, transcription FROM Meeting
            WHERE session_id IN ({placeholders})
        """
        cursor.execute(query_meeting, tuple(valid_sessions))
        meeting_data = cursor.fetchall()

        # Map session_id -> meeting info
        meeting_map = {m['session_id']: m for m in meeting_data}

        # Step 3: Prepare response per session_id
        response_data = []
        for session_id in valid_sessions:
            meeting = meeting_map.get(session_id, {})
            is_completed = bool(meeting.get('transcription_flag'))
            response_data.append({
                "session_id": session_id,
                "is_completed": is_completed,
                "transcription": meeting.get('transcription'),
            })

        return JSONResponse(content={"sessions": response_data})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking session completion: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Internal error checking session completion.")
    finally:
        if cursor:
            cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()

            
@router.get("/analysis/{interview_id}")
async def get_analysis_by_interview(interview_id: str, current_user: dict = Depends(get_current_user)):
    """
    Fetch analysis data for the given interview ID if the current user owns the interview.
    """
    conn = None
    cursor = None

    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Verify interview ownership and get prompt_example_questions by interview_id
        cursor.execute("""
            SELECT i.prompt_example_questions
            FROM Interview i
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE i.interview_id = %s AND lt.user_id = %s
            LIMIT 1
        """, (interview_id, user_id))

        row = cursor.fetchone()
        if not row or not row.get("prompt_example_questions"):
            raise HTTPException(status_code=404, detail="Analysis data not found or access denied.")

        questionnaire_prompt = json.loads(row["prompt_example_questions"])

        return JSONResponse(content={"Questionnaire_prompt": questionnaire_prompt})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis for interview {interview_id}: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis data.")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@router.get("/")
async def get_scheduled_interviews(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = None
    cursor = None
    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT 
                i.interview_id,
                i.target_role,
                i.target_company,
                i.interview_type,
                i.years_of_experience,
                i.current_designation,
                i.created_at,
                i.status,
                latest_s.session_id,
                m.transcription_flag,
                m.transcription
            FROM Interview i
            LEFT JOIN (
                SELECT interview_id, MAX(session_id) AS session_id
                FROM InterviewSession
                GROUP BY interview_id
            ) AS latest_s ON i.interview_id = latest_s.interview_id
            LEFT JOIN Meeting m ON latest_s.session_id = m.session_id
            WHERE i.user_id = %s
              AND i.status = 'scheduled'
            ORDER BY i.created_at DESC
        """

        cursor.execute(query, (user_id,))
        rows = cursor.fetchall()

        interviews = []
        for row in rows:
            interviews.append({
                "userId": user_id,
                "id": row["interview_id"],
                "targetRole": row["target_role"],
                "targetCompany": row["target_company"],
                "interviewType": row["interview_type"],
                "yearsOfExperience": row["years_of_experience"],
                "currentDesignation": row["current_designation"],
                "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                "status": row["status"],
                "session_id": row["session_id"],  # Can be None
                "hasCompletedInterview": bool(row["transcription_flag"]) if row["transcription_flag"] is not None else False,
                "transcript": row["transcription"] if row["transcription"] else None
            })

        return JSONResponse(content={"interviews": convert_decimal(interviews)})

    except Exception as e:
        logger.error(f"Error fetching scheduled interviews: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to fetch scheduled interviews")

    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()


@router.delete("/interview/{interview_id}")
async def delete_interview(interview_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = None
    cursor = None
    try:
        user_id = int(current_user.get("user_id"))
        interview_id = int(interview_id)
        conn = get_db_connection()
        cursor = conn.cursor()

        logger.info(f"Attempting to mark interview {interview_id} as deleted for user {user_id}")

        cursor.execute("""
            UPDATE Interview i
            SET i.status = 'deleted'
            WHERE i.interview_id = %s
              AND EXISTS (
                  SELECT 1 FROM LoginTrace lt
                  WHERE lt.log_id = i.log_id
                    AND lt.user_id = %s
              )
        """, (interview_id, user_id))
        conn.commit()

        logger.info(f"Rows affected by update: {cursor.rowcount}")

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Interview not found or not authorized to delete.")

        return JSONResponse(content={"detail": "Interview marked as deleted successfully."})
    except Exception as e:
        logger.error(f"Error deleting interview: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete interview")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@router.delete("/{session_id}")
async def delete_session(session_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = None
    cursor = None
    try:
        user_id = current_user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor()

        # Find the interview_id for this session and user
        cursor.execute("""
            SELECT i.interview_id
            FROM Interview i
            JOIN InterviewSession s ON i.interview_id = s.interview_id
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE s.session_id = %s AND lt.user_id = %s
        """, (session_id, user_id))
        result = cursor.fetchone()
        if not result:
            raise HTTPException(status_code=404, detail="Session not found or not authorized to delete.")

        interview_id = result[0]

        # Update the status to 'deleted'
        cursor.execute("""
            UPDATE Interview
            SET status = 'deleted'
            WHERE interview_id = %s
        """, (interview_id,))
        conn.commit()

        return JSONResponse(content={"detail": "Session marked as deleted."})
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete session")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

def get_gemini_model():
    """Initializes and returns the Gemini Pro model."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel('gemini-pro')

class SummarizePayload(BaseModel):
    transcript: str

@router.post("/{session_id}/summarize", status_code=status.HTTP_200_OK)
async def summarize_and_save_transcript(
    session_id: str,
    payload: SummarizePayload,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    conn = None
    cursor = None
    try:
        user_id = current_user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Verify user has access to the session
        cursor.execute("""
            SELECT i.interview_id FROM Interview i
            JOIN InterviewSession ifs ON i.interview_id = ifs.interview_id
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE ifs.session_id = %s AND lt.user_id = %s
        """, (session_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="User not authorized for this session.")

        # 2. Get transcript from payload and set a placeholder if empty
        transcript_text = payload.transcript
        if not transcript_text or not transcript_text.strip():
            logger.info(f"Session {session_id} ended with no transcript. Saving placeholder.")
            transcript_text = "The user ended the session before any conversation was recorded."

        # 3. Save the raw transcript directly to the Meeting table
        cursor.execute(
            "UPDATE Meeting SET transcription = %s, transcription_flag = 1 WHERE session_id = %s",
            (transcript_text, session_id)
        )
        if cursor.rowcount == 0:
            logger.warning(f"No existing row in Meeting for session_id {session_id}. This should not happen.")
        
        conn.commit()

        return JSONResponse(content={"detail": "Transcript saved successfully.", "transcript": transcript_text})

    except Exception as e:
        logger.error(f"Error during transcript save for session {session_id}: {e}\n{traceback.format_exc()}")
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor: cursor.close()
        if conn and conn.is_connected(): conn.close()

class StartSessionPayload(BaseModel):
    interview_id: int

@router.post("/start", status_code=status.HTTP_201_CREATED)
async def start_interview_session(
    payload: StartSessionPayload,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create a new InterviewSession row (and placeholder Meeting row) for the provided interview_id.
    Returns the generated session_id so the frontend can track the session without changing the URL."""
    conn = None
    cursor = None

    try:
        interview_id = int(payload.interview_id)
        user_id = current_user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Verify that the interview belongs to the current user
        cursor.execute(
            """
            SELECT 1
            FROM Interview i
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE i.interview_id = %s AND lt.user_id = %s
            """,
            (interview_id, user_id),
        )
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail="Interview not found or not authorized.")

        # 2. Fetch the latest resume_id for this user (optional)
        cursor.execute(
            "SELECT resume_id FROM Resume WHERE user_id = %s ORDER BY resume_id DESC LIMIT 1",
            (user_id,),
        )
        resume_row = cursor.fetchone()
        resume_id = resume_row["resume_id"] if resume_row and "resume_id" in resume_row else None

        # 3. Generate a UUID for the session and insert into InterviewSession
        new_session_id = str(uuid4())
        now = datetime.datetime.utcnow()

        cursor.execute(
            """
            INSERT INTO InterviewSession (session_id, interview_id, resume_id, session_created_at, session_start_date)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (new_session_id, interview_id, resume_id, now, now),
        )

        # 4. Insert a placeholder row into Meeting so that summaries can be appended later
        cursor.execute(
            """
            INSERT INTO Meeting (session_id, transcription_flag)
            VALUES (%s, 0)
            """,
            (new_session_id,),
        )

        conn.commit()
        return JSONResponse(content={"session_id": new_session_id})

    except HTTPException:
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error starting interview session: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to create interview session.")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@router.get("/latest/{interview_id}")
async def get_latest_session_for_interview(interview_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns the session_id with the latest session_start_date for the given interview_id, if the user owns the interview.
    """
    conn = None
    cursor = None
    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Verify interview ownership
        cursor.execute(
            """
            SELECT i.interview_id
            FROM Interview i
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE i.interview_id = %s AND lt.user_id = %s
            LIMIT 1
            """,
            (interview_id, user_id)
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Interview not found or not authorized.")

        # Get the latest session_id by session_start_date
        cursor.execute(
            """
            SELECT session_id
            FROM InterviewSession
            WHERE interview_id = %s
            ORDER BY session_start_date DESC
            LIMIT 1
            """,
            (interview_id,)
        )
        row = cursor.fetchone()
        if not row or not row.get("session_id"):
            raise HTTPException(status_code=404, detail="No sessions found for this interview.")

        return JSONResponse(content={"session_id": row["session_id"]})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching latest session for interview {interview_id}: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to fetch latest session.")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()
