from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
import base64
import json

security = HTTPBearer()

def decode_token_payload(token: str) -> dict:
    # JWT has 3 parts: header.payload.signature
    # We only need the middle part (payload)
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid token format")

        # Base64 decode the payload part
        payload_b64 = parts[1]
        # Add padding if needed
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding

        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        return json.loads(payload_bytes)

    except Exception:
        raise HTTPException(status_code=401, detail="Token is invalid or expired")


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials

    # Decode token manually
    payload = decode_token_payload(token)

    # Extract user_id
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token: no user found")

    # Find business_id from profiles table
    result = db.execute(
        text("SELECT business_id FROM profiles WHERE id = :user_id AND is_active = true"),
        {"user_id": user_id}
    ).fetchone()

    if result is None:
        raise HTTPException(status_code=403, detail="User not found or inactive")

    return {
        "user_id": user_id,
        "business_id": str(result.business_id)
    }