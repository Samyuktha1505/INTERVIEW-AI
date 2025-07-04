import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from backend.db.mysql import get_db_connection

router = APIRouter(tags=["Transcriptions"])

class TranscriptPayload(BaseModel):
    interview_id: int
    transcription_text: str

@router.post("/transcripts", status_code=status.HTTP_201_CREATED)
def save_transcript(data: TranscriptPayload):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Generate a new UUID for session_id
        new_session_id = str(uuid.uuid4())

        now = datetime.utcnow()

        # Insert into InterviewSession
        cursor.execute(
            """
            INSERT INTO InterviewSession 
            (session_id, interview_id, resume_id, session_created_at, session_start_date)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (new_session_id, data.interview_id, data.resume_id, now, now)
        )

        # Insert into Meeting with the transcription text
        cursor.execute(
            "INSERT INTO Meeting (session_id, transcription, transcription_flag) VALUES (%s, %s, %s)",
            (new_session_id, data.transcription_text, 1)  # Set transcription_flag=1 since transcription exists
        )

        conn.commit()
        return {"message": "Transcript and session saved successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()
