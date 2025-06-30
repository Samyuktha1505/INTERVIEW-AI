# backend/routes/transcriptions.py

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List
from backend.db.mysql import get_db_connection

router = APIRouter(tags=["Transcriptions"])

class TranscriptPayload(BaseModel):
    session_id: str
    transcript: List[str]

@router.post("/transcripts", status_code=status.HTTP_201_CREATED)
def save_transcript(data: TranscriptPayload):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        for segment in data.transcript:
            cursor.execute(
                "INSERT INTO transcripts (session_id, content) VALUES (%s, %s)",
                (data.session_id, segment)
            )
        conn.commit()
        return {"message": "Transcript saved successfully"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()
