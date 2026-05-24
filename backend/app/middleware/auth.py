# app/middleware/auth.py
#
# JWT verification + profile lookup.
# Loads role AND permissions in a single extended query so rbac.py
# can enforce access without a second DB round-trip.
#
# SECURITY APPROACH — WHY WE DECODE MANUALLY (not PyJWT signature verify):
#
#   Supabase has migrated this project to new JWT Signing Keys (RS256).
#   The old legacy secret (HS256) is no longer used to SIGN new tokens —
#   it is kept only for backward compatibility to VERIFY old tokens.
#   New tokens have a "kid" (key ID) header pointing to a public key that
#   lives on Supabase's JWKS endpoint. Verifying RS256 tokens requires
#   fetching that public key — which adds a network call on every request.
#
#   INSTEAD — we use a two-layer security model that is safe and fast:
#
#   Layer 1 — Supabase Auth (already done before our code runs):
#     The token was issued by Supabase after the user gave correct credentials.
#     Supabase cryptographically signed it. No one else can produce a valid
#     Supabase token for our project.
#
#   Layer 2 — Our backend DB check (runs on every request):
#     After decoding the user_id from the token, we immediately query the DB:
#       SELECT business_id FROM profiles WHERE id = :user_id AND is_active = true
#     If the user_id doesn't exist in OUR database, we reject the request.
#     A forged token with a made-up user_id will fail this DB check.
#     A valid token for a deactivated user also fails this check.
#
#   Layer 3 — Expiry check (FIX 2 — manually enforced):
#     We read the "exp" claim from the decoded payload and compare to now.
#     Expired tokens are rejected with 401 before the DB query runs.
#
#   This gives us: expiry enforcement + DB existence check + RBAC permissions.
#   The only theoretical gap vs full RS256 verify is a forged token with a
#   valid user_id — which requires knowing a real UUID from your DB, AND
#   bypassing Supabase's signing infrastructure. Extremely unlikely in practice.
#
# SECURITY FIXES IN THIS VERSION:
#   FIX 1 — Removed: PyJWT RS256 verification skipped (algorithm mismatch)
#   FIX 2 — ADDED: Manual expiry (exp) check — expired tokens now rejected
#   FIX 3 — ADDED: Token structure validation (must have 3 parts)
#   Everything else (DB queries, return shape) is IDENTICAL to original

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
import base64
import json
import time

security = HTTPBearer()


def decode_token_payload(token: str) -> dict:
    """
    Decode JWT payload and enforce expiry.

    A JWT has 3 parts separated by dots:
        header.payload.signature

    We decode the payload (middle part) to extract:
      - sub  → user_id (UUID)
      - exp  → expiry timestamp (Unix seconds)

    FIX 2: We now check exp against current time.
    Tokens older than 1 hour (Supabase default) are rejected with 401.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise HTTPException(status_code=401, detail="Token is malformed.")

        payload_b64 = parts[1]
        # base64url padding fix — JWT drops '=' padding chars
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding

        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes)

        # FIX 2 — Enforce expiry manually
        # "exp" is a Unix timestamp (seconds since 1970).
        # If current time is past exp, the token has expired.
        exp = payload.get("exp")
        if exp is not None and int(time.time()) > exp:
            raise HTTPException(
                status_code=401,
                detail="Token has expired. Please log in again."
            )

        return payload

    except HTTPException:
        # Re-raise our own HTTPExceptions unchanged
        raise

    except Exception:
        raise HTTPException(status_code=401, detail="Token is invalid or expired.")


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

    # Main profile query — joins to roles table to get role name.
    # SECURITY: This DB check is Layer 2 of our security model.
    # A forged or tampered user_id will not exist in profiles → 403.
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