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

from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
import jwt
from jwt import PyJWKClient
import os
from cachetools import TTLCache
import base64
import logging
from datetime import datetime, timezone

security = HTTPBearer()

# ── In-memory permissions cache (TTLCache) ─────────────────────────────
# Uses cachetools.TTLCache — O(1) get/set, automatic TTL expiry,
# and LRU eviction when maxsize (1000) is exceeded.
#
# MULTI-INSTANCE LIMITATION:
#   The cache is in-process memory only. In a multi-instance Render deployment,
#   Instance A has no awareness of cache entries on Instance B. When an admin
#   changes a user's role or deactivates them via Instance A, only Instance A's
#   cache is invalidated. Instance B continues serving stale data until TTL
#   expiry (10s). A shared Redis cache would solve this properly, but for the
#   current scale the 10s window is acceptable.
#
# REDIS BACKED CACHE (optional):
#   Set REDIS_URL env var to enable a shared Redis cache instead of TTLCache.
#   This eliminates the multi-instance stale cache window entirely.
#   Falls back to TTLCache if REDIS_URL is not set.
_permissions_cache: TTLCache | None = TTLCache(maxsize=1000, ttl=10)
_redis = None

def _get_redis():
    global _redis
    if _redis is not None:
        return _redis
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
    try:
        import redis as _redis_module
        _redis = _redis_module.from_url(redis_url, decode_responses=True)
        return _redis
    except Exception:
        logging.warning("Failed to connect to Redis, falling back to in-memory cache")
        return None


# ── Cache helpers ──────────────────────────────────────────────────────

def _cache_get(key: str) -> dict | None:
    r = _get_redis()
    if r:
        import json
        try:
            data = r.get(f"perm:{key}")
            return json.loads(data) if data else None
        except Exception:
            pass
    if _permissions_cache is not None:
        return _permissions_cache.get(key)
    return None


def _cache_set(key: str, value: dict, ttl: int = 10):
    r = _get_redis()
    if r:
        import json
        try:
            r.setex(f"perm:{key}", ttl, json.dumps(value, default=str))
            return
        except Exception:
            pass
    if _permissions_cache is not None:
        _permissions_cache[key] = value


def _cache_pop(key: str):
    r = _get_redis()
    if r:
        try:
            r.delete(f"perm:{key}")
        except Exception:
            pass
    if _permissions_cache is not None:
        _permissions_cache.pop(key, None)

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


def clear_user_cache(user_id: str) -> None:
    """
    Invalidate the permissions cache entry for this user.

    Call this from admin mutation endpoints (e.g. staff.py) and logout
    endpoint whenever a user's role, is_active status, or last_logout_at
    is changed.

    Uses Redis if available, otherwise in-memory cache.
    In a multi-instance deployment with Redis, this clears the cache
    across all instances immediately.
    """
    _cache_pop(user_id)


def clear_business_users_cache(business_id: str) -> None:
    """
    Invalidate cache entries for all users belonging to a business.

    Called when a business is suspended or reactivated so cached
    entries don't bypass the suspension check for up to 10s.
    """
    r = _get_redis()
    if r:
        try:
            keys = r.keys(f"perm:*")
            import json
            for key in keys:
                data = r.get(key)
                if data:
                    entry = json.loads(data)
                    if entry.get("business_id") == business_id:
                        r.delete(key)
            return
        except Exception:
            pass
    if _permissions_cache is not None:
        keys = list(_permissions_cache.keys())
        for key in keys:
            entry = _permissions_cache.get(key)
            if entry and entry.get("business_id") == business_id:
                _permissions_cache.pop(key, None)


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
                leeway=10,
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
                leeway=10,
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
    request: Request,
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
    payload = getattr(request.state, "verified_jwt_payload", None)
    if payload is None:
        payload = decode_token_payload(token)

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user found")

    token_iat = payload.get("iat")

    # ── Check cache first — eliminates DB query for ~99% of requests ──
    cached_val = _cache_get(user_id)
    if cached_val is not None:
        # SECURITY: Check if token was issued before last logout.
        # cached_val includes last_logout_at as epoch timestamp.
        # This is safe because logout clears the cache entry for this user_id.
        # On a multi-instance deployment without Redis, there is a small window
        # (up to TTL seconds) where other instances still serve stale cache.
        last_logout = cached_val.get("last_logout_at")
        if last_logout and token_iat and token_iat < last_logout:
            raise HTTPException(
                status_code=401,
                detail="Session expired. Please log in again."
            )
        # SECURITY: Reject if the business was suspended since caching.
        if not cached_val.get("business_is_active", True):
            raise HTTPException(
                status_code=403,
                detail="Your business account has been suspended. Contact support.",
            )
        db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})
        db.execute(text("SET LOCAL app.current_business_id = :bid"), {"bid": cached_val["business_id"]})
        return {**cached_val, "token_iat": token_iat}

    # ── Cache miss — single DB query fetches profile + role + permissions + last_logout_at ──
    # Must set app.current_user_id BEFORE the profiles query so the
    # self_lookup_policy (which checks id = app.current_user_id()) allows
    # the user to read their own row.  The business_id GUC is unknown until
    # after this query returns, so it cannot be set yet — we defer the
    # businesses JOIN to a separate check below once both GUCs are set.
    db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})
    result = db.execute(
        text("""
            SELECT
                p.business_id,
                r.name                                      AS role,
                STRING_AGG(perm.code, ',')                  AS permissions_csv,
                p.last_logout_at
            FROM profiles p
            LEFT JOIN roles r
                ON r.id = p.role_id
            LEFT JOIN role_permissions rp
                ON rp.role_id = p.role_id
            LEFT JOIN permissions perm
                ON perm.id = rp.permission_id
            WHERE p.id        = :user_id
              AND p.is_active = true
            GROUP BY p.business_id, r.name, p.last_logout_at
            LIMIT 1
        """),
        {"user_id": user_id}
    ).fetchone()

    if result is None:
        raise HTTPException(status_code=403, detail="User not found or inactive")

    # ── Now that we know the business_id, set the GUC and check suspension ──
    db.execute(text("SET LOCAL app.current_business_id = :bid"), {"bid": str(result.business_id)})

    business_active = db.execute(
        text("SELECT is_active FROM businesses WHERE business_id = CAST(:bid AS uuid) LIMIT 1"),
        {"bid": str(result.business_id)}
    ).scalar()

    if not business_active:
        raise HTTPException(
            status_code=403,
            detail="Your business account has been suspended. Contact support.",
        )

    # ── Token revocation check ────────────────────────────────────────────
    # If the user has logged out since this token was issued, reject it.
    if result.last_logout_at and token_iat:
        last_logout_ts = int(result.last_logout_at.timestamp())
        if token_iat < last_logout_ts:
            raise HTTPException(
                status_code=401,
                detail="Session expired. Please log in again."
            )

    permissions_csv = result.permissions_csv or ""
    permissions = set(permissions_csv.split(",")) if permissions_csv else set()

    last_logout_epoch = int(result.last_logout_at.timestamp()) if result.last_logout_at else None

    user_data = {
        "user_id":          user_id,
        "business_id":      str(result.business_id),
        "role":             result.role or "staff",
        "permissions":      permissions,
        "last_logout_at":   last_logout_epoch,
        "business_is_active": True,
        "token_iat":        token_iat,
    }

    # Cache for 10s so subsequent requests skip the DB query.
    _cache_set(user_id, user_data)

    return user_data


def verify_super_admin_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    """
    FastAPI dependency for super admin authentication with revocation support.

    Unlike verify_token(), this does NOT query the profiles table — it only:
      1. Decodes + verifies the JWT signature via Supabase JWKS
      2. Checks the user_id exists in super_admins
      3. Rejects tokens issued before last_logout_at (revoked sessions)

    Super admins have no business_id, no role, and no permissions.
    This dependency never passes require_permission() / require_any_permission()
    checks that are meant for tenant roles.

    Returns:
        { "user_id": str, "is_super_admin": true }
    """
    token = credentials.credentials
    payload = getattr(request.state, "verified_jwt_payload", None)
    if payload is None:
        payload = decode_token_payload(token)

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: no user found")

    token_iat = payload.get("iat")

    # Must set app.current_user_id BEFORE the super_admins query so the
    # self_lookup_policy (which checks user_id = app.current_user_id())
    # allows the super admin to read their own row.
    db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})

    row = db.execute(
        text("SELECT last_logout_at FROM super_admins WHERE user_id = :uid LIMIT 1"),
        {"uid": user_id},
    ).fetchone()
    if not row:
        raise HTTPException(
            status_code=403,
            detail="Access denied. Super admin privileges required.",
        )

    if row.last_logout_at and token_iat:
        last_logout_ts = int(row.last_logout_at.timestamp())
        if token_iat < last_logout_ts:
            raise HTTPException(
                status_code=401,
                detail="Session expired. Please log in again.",
            )

    # Mark this session as a verified super admin so super_admin_access_policy
    # (on businesses, and any future cross-tenant admin tables) grants access.
    # Only reachable after the super_admins row lookup above succeeded, so a
    # regular tenant user has no path to setting this GUC themselves.
    db.execute(text("SET LOCAL app.is_super_admin = 'true'"))

    return {"user_id": user_id, "is_super_admin": True}


def verify_super_admin(
    current_user: dict = Depends(verify_super_admin_token),
) -> dict:
    """
    FastAPI dependency — checks that the authenticated user is a super admin.

    Super admins are platform-level administrators stored in the super_admins
    table. They have no business_id — they manage the entire platform.

    Pass-through of the verify_super_admin_token result.

    Usage:
        @router.get("/v1/superadmin/businesses")
        def list_businesses(
            current_user: dict = Depends(verify_super_admin),
            ...
        ):
    """
    return current_user
