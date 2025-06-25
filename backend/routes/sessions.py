from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Dict, Any
import logging
import traceback

from backend.db.mysql import get_db_connection
from backend.schemas import SessionIdList  # Your Pydantic model for payload validation
from backend.utils.jwt_auth import get_current_user   # Your auth dependency for user info

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/v1/sessions/check-completion")
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
