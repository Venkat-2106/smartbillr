# app/middleware/auth.py
#
# JWT verification + profile lookup.
#
# SECURITY:
#   FIX 2 — Token expiry (exp) is manually checked before any DB query.
#   Expired tokens are rejected immediately with 401.
#   See full security model explanation in verify_token() below.
#
# SECURITY FIX 3 (2026-06-19):
#   RS256 JWT signature is now verified via Supabase JWKS endpoint.
#   Previously the token payload was base64-decoded without verifying the
#   signature, which allowed token forgery by anyone who knew a valid user_id.
#
    #   The verification uses PyJWT with the cryptography backend:
    #     1. On first request, fetch JWKS from {SUPABASE_URL}/auth/v1/.well-known/jwks.json
#     2. Cache the public keys in-memory for 1 hour
#     3. Decode + verify every token using the matching key
#
#   This adds ~1 network call on the first request (JWKS fetch), then zero
#   overhead for subsequent requests (cached keys + local verification).
#
# PERFORMANCE:
#   FIX — Merged 2 separate DB queries into 1 single query.
#
#   BEFORE (2 queries per request):
#     Query 1 → SELECT business_id, role FROM profiles JOIN roles
#     Query 2 → SELECT perm.code FROM profiles JOIN role_permissions JOIN permissions
#
#   AFTER (1 query per request):
#     Single query fetches business_id + role + ALL permission codes together
#     using STRING_AGG to collapse multiple permission rows into one result row.
#
#   WHY this is safe:
#     STRING_AGG joins all permission codes with ',' as separator.
#     We split on ',' in Python to get back a set.
#     If the user has no permissions, STRING_AGG returns NULL → empty set.
#
#   IMPACT:
#     Every API call now makes 1 DB round trip instead of 2 for auth.
#     Dashboard load (5-6 parallel calls) saves 5-6 DB round trips.
#     Over the course of a session this is a significant speedup.
#
#   FIX — In-memory permissions cache (TTL = 10s).
#     After the first request, subsequent requests from the same user within
#     the TTL window skip the DB query entirely.
#     Permissions change rarely (only when admin edits roles), so a 60s lag
#     is acceptable and eliminates the auth DB query from ~99% of requests.

from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
import jwt
from jwt import PyJWKClient
import os
import time
import base64
import logging

security = HTTPBearer()

# ── In-memory permissions cache ─────────────────────────────────────────
# Key:   user_id (str)
# Value: {"data": {...}, "expires_at": float(epoch)}
# TTL:   10 seconds
# Purge strategy: lazy — expired entries are skipped on lookup and overwritten
#                 on next fetch. No background sweep needed.
# Size limit: 1000 entries — beyond that, oldest entries are evicted.
#
# MULTI-INSTANCE LIMITATION:
#   The cache is in-process memory only. In a multi-instance Render deployment,
#   Instance A has no awareness of cache entries on Instance B. When an admin
#   changes a user's role or deactivates them via Instance A, only Instance A's
#   cache is invalidated. Instance B continues serving stale data until TTL
#   expiry (10s). A shared Redis cache would solve this properly, but for the
#   current scale the 10s window is acceptable.
_permissions_cache: dict[str, dict] = {}
_PERM_CACHE_TTL = 10
_PERM_CACHE_MAX = 1000

# ── JWKS client ─────────────────────────────────────────────────────────
# Uses PyJWT's built-in PyJWKClient which handles key fetching, caching,
# and automatic key selection based on the token's kid header.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    """Lazily initialise and return the PyJWKClient singleton."""
    global _jwks_client

    if _jwks_client is not None:
        return _jwks_client

    supabase_url = os.getenv("SUPABASE_URL")
    if not supabase_url:
        raise HTTPException(status_code=500, detail="SUPABASE_URL not configured")

    try:
        _jwks_client = PyJWKClient(
            f"{supabase_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=300,
        )
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to initialise JWKS client")

    return _jwks_client


def _get_cached_user(user_id: str) -> dict | None:
    entry = _permissions_cache.get(user_id)
    if entry and entry["expires_at"] > time.time():
        return entry["data"]
    return None


def _set_cached_user(user_id: str, data: dict) -> None:
    if len(_permissions_cache) >= _PERM_CACHE_MAX:
        oldest = min(_permissions_cache.keys(),
                     key=lambda k: _permissions_cache[k]["expires_at"])
        del _permissions_cache[oldest]
    _permissions_cache[user_id] = {
        "data": data,
        "expires_at": time.time() + _PERM_CACHE_TTL,
    }


def clear_user_cache(user_id: str) -> None:
    """
    Invalidate the in-memory permissions cache entry for this user.

    Call this from admin mutation endpoints (e.g. staff.py) whenever
    a user's role or is_active status is changed, so the update takes
    effect immediately on the current instance without waiting for TTL.

    NOTE: In a multi-instance deployment this only invalidates the cache
    on the instance running this code. Other instances still serve stale
    data for up to _PERM_CACHE_TTL seconds.
    """
    _permissions_cache.pop(user_id, None)


def decode_token_payload(token: str) -> dict:
    """
    Decode and VERIFY the JWT using Supabase JWKS keys.

    Supports:
      - RS256 (RSA) via JWKS
      - ES256 (ECDSA) via JWKS
      - HS256 fallback using SUPABASE_JWT_SECRET

    Raises 401 if:
      - Token is malformed
      - Signature is invalid (forged/altered token)
      - Token is expired
      - No matching JWK key found
    """
    try:
        unverified_header = jwt.get_unverified_header(token)

        # ── Asymmetric verification (RS256 / ES256) via JWKS ──────────────
        if unverified_header.get("kid"):
            jwks_client = _get_jwks_client()
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            algorithm = unverified_header.get("alg", "RS256")

            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=[algorithm],
                options={
                    "verify_exp": True,
                    "verify_aud": False,
                    "verify_iss": False,
                    "require": ["exp", "sub"],
                },
            )
            return payload

        # ── Symmetric fallback (HS256) using SUPABASE_JWT_SECRET ──────────
        jwt_secret_b64 = os.getenv("SUPABASE_JWT_SECRET")
        if jwt_secret_b64:
            jwt_secret = base64.b64decode(jwt_secret_b64)
            payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                options={
                    "verify_exp": True,
                    "verify_aud": False,
                    "verify_iss": False,
                    "require": ["exp", "sub"],
                },
            )
            return payload

        raise HTTPException(
            status_code=401,
            detail="Token has no kid header and SUPABASE_JWT_SECRET is not configured."
        )

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired. Please log in again."
        )
    except jwt.InvalidTokenError as e:
        logging.warning("JWT invalid token error: %s", e)
        raise HTTPException(
            status_code=401,
            detail="Token is invalid or expired."
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("JWT verification failed with unexpected error")
        raise HTTPException(status_code=401, detail=f"Token verification failed: {e}")


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> dict:
    """
    FastAPI dependency — runs on every protected endpoint.

    PERFORMANCE: Single DB query fetches business_id + role + all permissions
    together. STRING_AGG collapses multiple permission rows into one CSV string
    which we split in Python. Saves 1 DB round trip per API call vs before.

    Returns:
    {
        user_id:     str,
        business_id: str,
        role:        str,        ← role name from roles table
        permissions: set[str],   ← full permission codes for this user
    }
    """
    token   = credentials.credentials
    payload = decode_token_payload(token)

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user found")

    # ── Check in-memory cache first — eliminates DB query for ~99% of requests ──
    cached = _get_cached_user(user_id)
    if cached is not None:
        # Still need to set the audit session variable for cached requests
        db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})
        db.execute(text("SET LOCAL app.current_business_id = :bid"), {"bid": cached["business_id"]})
        return cached

    # ── Cache miss — single DB query fetches profile + role + all permissions ──
    #
    # HOW IT WORKS:
    #   LEFT JOIN roles        → gets the role name (admin/manager/staff)
    #   LEFT JOIN role_permissions + permissions → gets all permission codes
    #   STRING_AGG             → collapses N permission rows into one CSV string
    #                            e.g. "sales.view,sales.create,dashboard.view"
    #   GROUP BY               → required because STRING_AGG is an aggregate fn
    #
    # WHY LEFT JOINs (not INNER JOINs):
    #   If a user has no role_id or no permissions yet, INNER JOIN would return
    #   zero rows and we'd incorrectly get a 403. LEFT JOIN always returns the
    #   profile row — permissions just come back as NULL (→ empty set).
    #
    result = db.execute(
        text("""
            SELECT
                p.business_id,
                r.name                                      AS role,
                STRING_AGG(perm.code, ',')                  AS permissions_csv
            FROM profiles p
            LEFT JOIN roles r
                ON r.id = p.role_id
            LEFT JOIN role_permissions rp
                ON rp.role_id = p.role_id
            LEFT JOIN permissions perm
                ON perm.id = rp.permission_id
            WHERE p.id        = :user_id
              AND p.is_active = true
            GROUP BY p.business_id, r.name
            LIMIT 1
        """),
        {"user_id": user_id}
    ).fetchone()

    if result is None:
        raise HTTPException(status_code=403, detail="User not found or inactive")

    # Split the CSV string back into a set of permission codes.
    # If permissions_csv is NULL (user has no permissions), use empty set.
    permissions_csv = result.permissions_csv or ""
    permissions = set(permissions_csv.split(",")) if permissions_csv else set()

    # Set the audit session variable so DB triggers (fn_audit_log) know who
    # performed the action. This applies to all subsequent statements in the
    # same DB session until the connection is returned to the pool.
    db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})
    db.execute(text("SET LOCAL app.current_business_id = :bid"), {"bid": str(result.business_id)})

    user_data = {
        "user_id":     user_id,
        "business_id": str(result.business_id),
        "role":        result.role or "staff",
        "permissions": permissions,
    }

    # Cache for 10s so subsequent requests skip the DB query.
    _set_cached_user(user_id, user_data)

    return user_data
