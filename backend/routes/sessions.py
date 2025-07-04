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

from typing import List
from pydantic import BaseModel

class InterviewIdList(BaseModel):
    interview_ids: List[int]

@router.post("/check-completion")
async def check_interview_completion(
    payload: InterviewIdList,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    interview_ids = payload.interview_ids
    user_id_from_token = current_user.get("user_id")

    if not interview_ids:
        raise HTTPException(status_code=400, detail="No interview IDs provided.")

    db_conn = None
    cursor = None

    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)

        # Step 1: Verify these interviews belong to the current user
        placeholders = ','.join(['%s'] * len(interview_ids))
        query_verify = f"""
            SELECT interview_id FROM Interview
            WHERE interview_id IN ({placeholders}) AND user_id = %s
        """
        cursor.execute(query_verify, tuple(interview_ids) + (user_id_from_token,))
        valid_interviews = [row['interview_id'] for row in cursor.fetchall()]
        if not valid_interviews:
            raise HTTPException(status_code=403, detail="No valid interviews found for this user.")

        # Step 2: Fetch sessions for these interviews
        placeholders = ','.join(['%s'] * len(valid_interviews))
        query_sessions = f"""
            SELECT session_id, interview_id FROM InterviewSession
            WHERE interview_id IN ({placeholders})
        """
        cursor.execute(query_sessions, tuple(valid_interviews))
        sessions = cursor.fetchall()  # list of dicts with session_id and interview_id

        if not sessions:
            # No sessions found for these interviews
            return JSONResponse(content={"sessions": []})

        session_ids = [s['session_id'] for s in sessions]

        # Step 3: Fetch meeting completion status for these session_ids
        placeholders = ','.join(['%s'] * len(session_ids))
        query_meeting = f"""
            SELECT session_id, transcription_flag, transcription FROM Meeting
            WHERE session_id IN ({placeholders})
        """
        cursor.execute(query_meeting, tuple(session_ids))
        meeting_data = cursor.fetchall()

        meeting_map = {m['session_id']: m for m in meeting_data}

        # Step 4: Prepare response per interview_id
        # Group sessions by interview_id and mark if any session is completed
        from collections import defaultdict
        interview_sessions = defaultdict(list)
        for s in sessions:
            interview_sessions[s['interview_id']].append(s['session_id'])

        response_data = []
        for interview_id in valid_interviews:
            sessions_for_interview = interview_sessions.get(interview_id, [])
            # Check if any session has transcription_flag true
            is_completed = any(
                meeting_map.get(sess_id, {}).get('transcription_flag') for sess_id in sessions_for_interview
            )
            # Optionally, you can include transcripts or more details per session
            response_data.append({
                "interview_id": interview_id,
                "is_completed": bool(is_completed),
                "session_ids": sessions_for_interview,
            })

        return JSONResponse(content={"interviews": response_data})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking interview completion: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Internal error checking interview completion.")
    finally:
        if cursor:
            cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()

            
@router.get("/analysis/{interview_id}")
async def get_analysis(interview_id: str, current_user: Dict[str, Any] = Depends(get_current_user)):
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

        query = """
            SELECT i.prompt_example_questions
            FROM Interview i
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE i.interview_id = %s AND lt.user_id = %s
            LIMIT 1
        """

        cursor.execute(query, (interview_id, user_id))
        analysis_row = cursor.fetchone()

        if not analysis_row or not analysis_row.get("prompt_example_questions"):
            raise HTTPException(status_code=404, detail="Analysis data not found or access denied.")

        questionnaire_prompt = json.loads(analysis_row["prompt_example_questions"])
        
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
                i.status,
                i.prompt_example_questions
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
