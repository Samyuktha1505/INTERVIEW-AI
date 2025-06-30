from fastapi import APIRouter, Depends, HTTPException, status, Path
from fastapi.responses import JSONResponse
from typing import Dict, Any
import logging
import traceback
import json

from backend.db.mysql import get_db_connection
from backend.schemas import SessionIdList  # Your Pydantic model for payload validation
from backend.utils.jwt_auth import get_current_user   # Your auth dependency for user info

router = APIRouter()
logger = logging.getLogger(__name__)

from pydantic import BaseModel
from typing import Optional
import uuid
import datetime

class CreateSessionPayload(BaseModel):
    currentDesignation: str
    targetRole: str
    targetCompany: str
    interviewType: str
    yearsOfExperience: int
    sessionInterval: Optional[int] = None

@router.post("/create")
async def create_interview_session(
    payload: CreateSessionPayload,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = None
    cursor = None
    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")

        db = get_db_connection()
        cursor = db.cursor()

        # Insert into Interview table
        insert_interview = """
            INSERT INTO Interview (target_role, target_company, interview_type, years_of_experience, current_designation, created_at, log_id)
            VALUES (%s, %s, %s, %s, %s, %s,
                (SELECT log_id FROM LoginTrace WHERE user_id = %s ORDER BY timestamp DESC LIMIT 1)
            )
        """
        now = datetime.datetime.utcnow()
        cursor.execute(insert_interview, (
            payload.targetRole,
            payload.targetCompany,
            payload.interviewType,
            payload.yearsOfExperience,
            payload.currentDesignation,
            now,
            user_id
        ))

        interview_id = cursor.lastrowid

        # Generate UUID for session
        session_id = str(uuid.uuid4())

        # Insert into InterviewSession table
        insert_session = """
            INSERT INTO InterviewSession (session_id, interview_id, session_interval)
            VALUES (%s, %s, %s)
        """
        cursor.execute(insert_session, (
            session_id,
            interview_id,
            payload.sessionInterval or 30
        ))

        # Insert into Meeting table
        insert_meeting = """
            INSERT INTO Meeting (session_id, transcription_flag)
            VALUES (%s, %s)
        """
        cursor.execute(insert_meeting, (session_id, False))

        db.commit()

        return {
            "id": session_id,
            "userId": str(user_id),
            "targetRole": payload.targetRole,
            "targetCompany": payload.targetCompany,
            "interviewType": payload.interviewType,
            "yearsOfExperience": payload.yearsOfExperience,
            "currentDesignation": payload.currentDesignation,
            "sessionInterval": payload.sessionInterval,
            "createdAt": now.isoformat(),
            "hasCompletedInterview": False,
            "transcript": None,
            "metrics": None
        }

    except Exception as e:
        if db:
            db.rollback()
        logger.error(f"Error creating interview session: {e}")
        raise HTTPException(status_code=500, detail="Failed to create interview session.")
    finally:
        if cursor:
            cursor.close()
        if db and db.is_connected():
            db.close()

@router.post("/check-completion")
async def check_session_completion(
    payload: SessionIdList, 
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    session_ids = payload.session_ids
    user_id_from_token = current_user.get("user_id")  # Get user_id from token
    db_conn = None
    cursor = None
    try:
        if not session_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No session IDs provided.")

        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)

        # Prepare placeholders for parameterized IN query
        format_strings = ','.join(['%s'] * len(session_ids))
        
        query = f"""
            SELECT m.session_id, m.transcription_flag, m.transcription
            FROM Meeting m
            JOIN InterviewSession ifs ON m.session_id = ifs.session_id
            JOIN Interview i ON ifs.interview_id = i.interview_id
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE m.session_id IN ({format_strings}) AND lt.user_id = %s
        """

        cursor.execute(query, tuple(session_ids + [user_id_from_token]))
        results = cursor.fetchall()

        completed_sessions = {}
        for row in results:
            completed_sessions[row['session_id']] = {
                "transcription_flag": bool(row['transcription_flag']),
                "transcription": row['transcription']  # Potentially large, send carefully
            }

        response_data = []
        for session_id in session_ids:
            session_info = completed_sessions.get(session_id, {"transcription_flag": False, "transcription": None})
            response_data.append({
                "session_id": session_id,
                "is_completed": session_info["transcription_flag"],
                "transcription": session_info["transcription"]
            })

        return JSONResponse(content={"sessions": response_data})

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error checking session completion: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while checking session completion.")
    finally:
        if cursor:
            cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()
            
@router.get("/analysis/{session_id}")
async def get_analysis(session_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Fetch analysis data for the given session ID if the current user owns the session.
    """
    conn = None
    cursor = None
    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="User not authenticated")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        query = """
            SELECT ifs.prompt_example_questions
            FROM InterviewSession ifs
            JOIN Interview i ON ifs.interview_id = i.interview_id
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE ifs.session_id = %s AND lt.user_id = %s
            LIMIT 1
        """

        cursor.execute(query, (session_id, user_id))
        analysis_row = cursor.fetchone()

        if not analysis_row or not analysis_row.get("prompt_example_questions"):
            raise HTTPException(status_code=404, detail="Analysis data not found or access denied.")

        # The data is stored as a JSON string, so we need to parse it.
        questionnaire_prompt = json.loads(analysis_row["prompt_example_questions"])
        
        return JSONResponse(content={"Questionnaire_prompt": questionnaire_prompt})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis data.")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@router.get("/")
async def get_sessions(current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        user_id = current_user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT i.interview_id, ifs.session_id, m.transcription_flag, m.transcription, i.target_role,
                   i.target_company, i.interview_type, i.years_of_experience, i.current_designation, 
                   i.created_at
            FROM Interview i
            JOIN InterviewSession ifs ON i.interview_id = ifs.interview_id
            JOIN Meeting m ON ifs.session_id = m.session_id
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE lt.user_id = %s
            ORDER BY i.created_at DESC
        """, (user_id,))

        rows = cursor.fetchall()
        sessions = []
        for row in rows:
            sessions.append({
                "id": row["session_id"],
                "userId": str(user_id),
                "targetRole": row["target_role"],
                "targetCompany": row["target_company"],
                "interviewType": row["interview_type"],
                "yearsOfExperience": row["years_of_experience"],
                "currentDesignation": row["current_designation"],
                "createdAt": row["created_at"].isoformat(),
                "hasCompletedInterview": bool(row["transcription_flag"]),
                "transcript": row["transcription"],
                "metrics": None
            })

        return JSONResponse(content={"sessions": sessions})

    except Exception as e:
        logger.error(f"Error retrieving sessions: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sessions")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@router.delete("/interview/{interview_id}")
async def delete_interview(interview_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        user_id = current_user.get("user_id")
        conn = get_db_connection()
        cursor = conn.cursor()

        # Only delete if the interview belongs to the user
        cursor.execute("""
            DELETE i FROM Interview i
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE i.interview_id = %s AND lt.user_id = %s
        """, (interview_id, user_id))
        conn.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Interview not found or not authorized to delete.")

        return {"detail": "Interview deleted successfully."}
    except Exception as e:
        logger.error(f"Error deleting interview: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete interview")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()
