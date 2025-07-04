import logging
import traceback
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Dict, Any

from backend.db.mysql import get_db_connection
from backend.utils.prompts import generate_metrics_prompt
from backend.utils.functions import extract_metrics_from_json
from backend.utils.jwt_auth import get_current_user

import google.generativeai as genai  # Your LLM client
from backend.config import MODEL_ID  # Make sure your model_id is configured in config.py

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/{session_id}")
async def generate_metrics(
    session_id: str, 
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    user_id_from_token = current_user.get("user_id")
    db_conn = None
    cursor = None
    write_cursor = None

    try:
        db_conn = get_db_connection()
        cursor = db_conn.cursor(dictionary=True)

        # Verify transcription exists and belongs to user
        cursor.execute(
            """
            SELECT m.transcription
            FROM Meeting m
            JOIN InterviewSession ifs ON m.session_id = ifs.session_id
            JOIN Interview i ON ifs.interview_id = i.interview_id
            JOIN LoginTrace lt ON i.log_id = lt.log_id
            WHERE m.session_id = %s AND lt.user_id = %s
            """,
            (session_id, user_id_from_token)
        )
        result = cursor.fetchone()

        if not result or not result.get('transcription'):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription not found for this session ID or not authorized."
            )

        transcript_text = result['transcription']
        logger.info(f"Fetched transcription for metrics generation for session {session_id}.")

        prompt = generate_metrics_prompt(transcript_text)

        model = genai.GenerativeModel(model_name=MODEL_ID)
        response = model.generate_content(prompt)
        raw_metrics_output = response.text
        logger.info(f"LLM response for metrics received for session {session_id}.")

        metrics = extract_metrics_from_json(raw_metrics_output)

        sql_query = """
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

        write_cursor = db_conn.cursor()
        write_cursor.execute(sql_query, (
            session_id,
            metrics.get('technical_rating'),
            metrics.get('communication_rating'),
            metrics.get('problem_solving_rating'),
            metrics.get('overall_rating'),
            metrics.get('remarks'),
            metrics.get('suspicious_flag', False)
        ))
        db_conn.commit()

        logger.info(f"Successfully saved metrics for session_id: {session_id}")
        return JSONResponse(content={"metrics": metrics})

    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Error generating metrics for session {session_id}: {e}\n{traceback.format_exc()}")
        if db_conn:
            db_conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while generating metrics."
        )
    finally:
        if cursor:
            cursor.close()
        if write_cursor:
            write_cursor.close()
        if db_conn and db_conn.is_connected():
            db_conn.close()
