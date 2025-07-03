from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Dict, Any
import logging
import traceback
import json
import decimal
import datetime

from backend.db.mysql import get_db_connection
from backend.schemas import SessionIdList  # Your Pydantic model for payload validation
from backend.utils.jwt_auth import get_current_user   # Your auth dependency for user info
from backend.utils.s3_client import s3_client

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
                "transcription": row['transcription']
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

    except HTTPException:
        raise
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

        questionnaire_prompt = json.loads(analysis_row["prompt_example_questions"])
        
        return JSONResponse(content={"Questionnaire_prompt": questionnaire_prompt})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching analysis for session {session_id}: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis data.")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.is_connected():
            conn.close()

@router.get("/")
async def get_sessions(current_user: Dict[str, Any] = Depends(get_current_user)):
    conn = None
    cursor = None
    try:
        user_id = current_user.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # Subquery to get latest session per interview
        query = """
            SELECT 
                i.interview_id, 
                latest_ifs.session_id, 
                m.transcription_flag, 
                m.transcription, 
                i.target_role,
                i.target_company, 
                i.interview_type, 
                i.years_of_experience, 
                i.current_designation, 
                i.created_at, 
                i.status
            FROM Interview i
            JOIN (
                SELECT ifs.interview_id, MAX(ifs.session_id) AS session_id
                FROM InterviewSession ifs
                GROUP BY ifs.interview_id
            ) AS latest_ifs ON i.interview_id = latest_ifs.interview_id
            JOIN Meeting m ON latest_ifs.session_id = m.session_id
            WHERE i.user_id = %s
            ORDER BY i.created_at DESC
        """

        cursor.execute(query, (user_id,))
        rows = cursor.fetchall()

        sessions = []
        for row in rows:
            created_at_iso = row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"])
            sessions.append({
                "id": row["session_id"],
                "interview_id": row["interview_id"],
                "userId": str(user_id),
                "targetRole": row["target_role"],
                "targetCompany": row["target_company"],
                "interviewType": row["interview_type"],
                "yearsOfExperience": row["years_of_experience"],
                "currentDesignation": row["current_designation"],
                "createdAt": created_at_iso,
                "hasCompletedInterview": bool(row["transcription_flag"]),
                "transcript": row["transcription"],
                "metrics": None,
                "status": row["status"]
            })

        return JSONResponse(content={"sessions": convert_decimal(sessions)})

    except Exception as e:
        logger.error(f"Error retrieving sessions: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to fetch sessions")

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
