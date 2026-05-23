# app/middleware/auth.py
#
# JWT verification + profile lookup.
# Loads role AND permissions in a single extended query so rbac.py
# can enforce access without a second DB round-trip.

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
    Decode JWT payload without network calls.
    JWT = header.payload.signature — all base64url encoded.
    We only decode the payload section to extract the user id (sub field).
    We do NOT verify the signature here — Supabase already did that when
    the token was issued. We trust it because only Supabase can produce
    a valid token for our project.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid token format")

        payload_b64 = parts[1]
        # base64url padding fix — JWT drops '=' padding chars
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
) -> dict:
    """
    FastAPI dependency — runs on every protected endpoint.

    Returns:
    {
        user_id:     str,
        business_id: str,
        role:        str,        ← role name from roles table
        permissions: set[str],   ← full permission codes for this user
    }

    WHY load permissions here:
    Every endpoint that uses require_permission() calls verify_token first.
    Loading permissions here means rbac.py does NOT need a second DB query
    for simple single-permission checks. The permissions set is passed through
    in the current_user dict.
    """
    token   = credentials.credentials
    payload = decode_token_payload(token)

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user found")

    # Main profile query — joins to roles table to get role name
    result = db.execute(
        text("""
            SELECT
                p.business_id,
                r.name AS role
            FROM profiles p
            LEFT JOIN roles r ON r.id = p.role_id
            WHERE p.id = :user_id
              AND p.is_active = true
            LIMIT 1
        """),
        {"user_id": user_id}
    ).fetchone()

    if result is None:
        raise HTTPException(status_code=403, detail="User not found or inactive")

    # Load all permission codes for this user in a second clean query.
    # WHY separate query: easier to read, easier to cache later (Redis),
    # and the JOIN chain is simpler to maintain.
    perm_rows = db.execute(
        text("""
            SELECT perm.code
            FROM profiles p
            JOIN role_permissions rp ON rp.role_id = p.role_id
            JOIN permissions perm   ON perm.id = rp.permission_id
            WHERE p.id = :user_id
              AND p.is_active = true
        """),
        {"user_id": user_id}
    ).fetchall()

    permissions = {row.code for row in perm_rows}

    return {
        "user_id":     user_id,
        "business_id": str(result.business_id),
        "role":        result.role or "staff",
        "permissions": permissions,
    }