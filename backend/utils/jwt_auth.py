from fastapi import APIRouter, Depends, HTTPException, status, Request
from typing import Dict
import jwt
import datetime
from backend.config import JWT_SECRET
from backend.db.redis import redis_client

router = APIRouter()

# -------------------- JWT Creation --------------------
def create_access_token(data: dict, expires_in_minutes: int = 60 * 24) -> str:
    """
    Creates a JWT access token. Requires 'user_id' and 'email'.
    """
    if "user_id" not in data or "email" not in data:
        raise ValueError("Token payload must include 'user_id' and 'email'")

    to_encode = data.copy()
    expire = datetime.datetime.utcnow() + datetime.timedelta(minutes=expires_in_minutes)
    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, JWT_SECRET, algorithm="HS256")


# -------------------- JWT Decoding --------------------
def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


# -------------------- Auth Dependency --------------------
def get_current_user(request: Request) -> Dict:
    """
    Extracts user from JWT in HttpOnly cookie and validates with Redis.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing from cookie")

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("user_id")
    email = payload.get("email")

    if not user_id or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    # Validate token in Redis
    redis_key = f"user_token:{user_id}"
    stored_token = redis_client.get(redis_key)

    if not stored_token or stored_token != token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired or token invalid")

    return {"user_id": user_id, "email": email}
