from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from cachetools import TTLCache
import time
import jwt as pyjwt
import logging
import os

_redis_rate = None


def _get_redis_rate():
    global _redis_rate
    if _redis_rate is not None:
        return _redis_rate
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
    try:
        import redis
        _redis_rate = redis.from_url(redis_url, decode_responses=True)
        return _redis_rate
    except Exception:
        return None

# Paths treated as auth endpoints — stricter IP-based rate limit.
# Exact paths (matched via ==) and prefix paths (matched via startswith) are separate
# to avoid /v1/business accidentally matching /v1/businesses/*.
AUTH_EXACT_PATHS = ["/v1/business"]
AUTH_PREFIX_PATHS = ["/auth/", "/profiles/check-email"]
ADMIN_PREFIX_PATHS = ["/v1/admin/"]

# Skip rate limiting entirely for these paths.
SKIP_PATHS = ["/", "/health"]

AUTH_LIMIT = 5
AUTH_WINDOW = 60
ADMIN_LIMIT = 20
ADMIN_WINDOW = 60
API_LIMIT = 100
API_WINDOW = 60

_ip_auth_cache = TTLCache(maxsize=10000, ttl=AUTH_WINDOW)
_user_admin_cache = TTLCache(maxsize=10000, ttl=ADMIN_WINDOW)
_user_api_cache = TTLCache(maxsize=10000, ttl=API_WINDOW)
_ip_api_cache = TTLCache(maxsize=10000, ttl=API_WINDOW)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _jwt_user_id(request: Request) -> str | None:
    """
    Extracts 'sub' from the JWT WITHOUT verifying the signature.

    This is intentional: this value is only used to pick a per-user
    rate-limit bucket key, never for authorization. Real auth happens
    later via verify_token() (app/middleware/auth.py), which fully
    verifies the signature via JWKS.

    Tradeoff: a forged token with an arbitrary 'sub' could exhaust
    another user's rate-limit quota (denial-of-service against rate
    limiting only — not against their account or data, since the
    forged token is rejected downstream by verify_token). Accepted
    as low-risk since the alternative (verifying every token here too)
    would double signature-verification cost on every request.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):]
    try:
        payload = pyjwt.decode(token, options={"verify_signature": False})
        return payload.get("sub")
    except pyjwt.InvalidTokenError:
        return None


def _check(cache: TTLCache, key: str, limit: int, window: int) -> tuple[bool, int]:
    r = _get_redis_rate()
    if r:
        try:
            pipe = r.pipeline()
            rkey = f"rl:{key}"
            pipe.incr(rkey)
            pipe.expire(rkey, window)
            count, _ = pipe.execute()
            if count > limit:
                ttl = r.ttl(rkey)
                return True, max(1, ttl)
            return False, 0
        except Exception:
            pass

    now = time.time()
    cutoff = now - window

    timestamps = cache.get(key)
    if timestamps is not None:
        timestamps = [t for t in timestamps if t > cutoff]
        if len(timestamps) >= limit:
            retry = int(timestamps[0] + window - now)
            return True, max(1, retry)
        timestamps.append(now)
        cache[key] = timestamps
    else:
        cache[key] = [now]

    return False, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if any(path.startswith(s) for s in SKIP_PATHS):
            return await call_next(request)

        is_auth = (
            any(path == p for p in AUTH_EXACT_PATHS) or
            any(path.startswith(p) for p in AUTH_PREFIX_PATHS)
        )
        is_admin = any(path.startswith(p) for p in ADMIN_PREFIX_PATHS)

        if is_auth:
            ip = _client_ip(request)
            limited, retry_after = _check(_ip_auth_cache, ip, AUTH_LIMIT, AUTH_WINDOW)
        elif is_admin:
            uid = _jwt_user_id(request)
            if uid:
                limited, retry_after = _check(_user_admin_cache, uid, ADMIN_LIMIT, ADMIN_WINDOW)
            else:
                ip = _client_ip(request)
                limited, retry_after = _check(_ip_api_cache, ip, ADMIN_LIMIT, ADMIN_WINDOW)
        else:
            uid = _jwt_user_id(request)
            if uid:
                limited, retry_after = _check(_user_api_cache, uid, API_LIMIT, API_WINDOW)
            else:
                ip = _client_ip(request)
                limited, retry_after = _check(_ip_api_cache, ip, API_LIMIT, API_WINDOW)

        if limited:
            return Response(
                content='{"success": false, "error": "Rate limit exceeded. Please slow down."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)
