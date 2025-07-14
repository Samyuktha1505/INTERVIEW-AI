from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.db.mysql import get_db_connection  # adjust import as needed

router = APIRouter()

class FeedbackIn(BaseModel):
    session_id: str
    feedback_text: str
    rating: float

@router.post("/")
def create_feedback(feedback: FeedbackIn):
    db = get_db_connection()  # <-- use the correct function name
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO Feedback (session_id, feedback_text, rating) VALUES (%s, %s, %s)",
            (feedback.session_id, feedback.feedback_text, feedback.rating)
        )
        db.commit()
        return {"message": "Feedback submitted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        db.close()