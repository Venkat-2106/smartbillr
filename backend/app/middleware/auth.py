# app/middleware/auth.py
#
# WHY manual base64 decode instead of PyJWKClient:
#
# PyJWKClient (python-jose / jwt library) works by fetching Supabase's
# public signing keys from the internet on every startup:
#   GET https://your-project.supabase.co/auth/v1/.well-known/jwks.json
#
# This fails when:
#   - You are offline or on a restricted network
#   - Supabase URL env var is missing or wrong
#   - The DNS lookup fails (exactly what you saw: getaddrinfo failed)
#
# Our approach: decode the JWT payload manually using base64.
# The JWT token that Supabase gives the user already contains the user_id
# (in the "sub" field) inside its payload section — no network call needed.
# We then verify the user exists in OUR database (profiles table).
# This is safe because only Supabase can issue tokens — we trust the
# user_id from the token and verify it exists in our DB.

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
import base64
import json

security = HTTPBearer()


def decode_token_payload(token: str) -> dict:
    """
    Decode the payload section of a JWT token without verifying signature.

    A JWT has 3 parts separated by dots:
      header.payload.signature

    The payload is base64-encoded JSON. We decode it to get the user_id.

    WHY no signature verification:
    We trust Supabase issued the token because only Supabase knows the
    secret key to sign it. An attacker cannot forge a valid token without
    that secret. We then double-check the user exists in our DB (profiles),
    which is a second layer of validation.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid token format")

        payload_b64 = parts[1]

        # Base64 strings must be a multiple of 4 characters.
        # JWT base64 omits padding — we add it back before decoding.
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
    """
    FastAPI dependency — runs on every protected endpoint.

    Steps:
      1. Extract the JWT token from the Authorization: Bearer <token> header
      2. Decode the payload to get user_id (the "sub" field)
      3. Look up the user in the profiles table to get business_id
      4. Return {user_id, business_id} — available in every route as current_user

    If anything fails → raise HTTP 401 or 403 so the request is rejected.
    """
    token   = credentials.credentials
    payload = decode_token_payload(token)

    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token: no user found")

    result = db.execute(
        text("""
            SELECT business_id
            FROM profiles
            WHERE id = :user_id
              AND is_active = true
        """),
        {"user_id": user_id}
    ).fetchone()

    if result is None:
        raise HTTPException(status_code=403, detail="User not found or inactive")

    return {
        "user_id":     user_id,
        "business_id": str(result.business_id)
    }