from fastapi import Response
from backend.db.redis import redis_client
from fastapi import APIRouter, HTTPException, status, Request, Form, UploadFile, File

router = APIRouter()

@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(response: Response, request: Request):
    token = request.cookies.get("access_token")
    if token:
        # Optional: delete token from Redis
        try:
            from backend.utils.jwt_auth import decode_access_token
            payload = decode_access_token(token)
            user_id = payload.get("user_id")
            redis_client.delete(f"user_token:{user_id}")
        except Exception:
            pass  # Don't block logout if token is invalid

    response.delete_cookie(
        key="access_token",
        path="/",
        secure=False,  # Change to True if using HTTPS
        httponly=True,
        samesite="Lax"
    )
    return {"message": "Logged out successfully."}
