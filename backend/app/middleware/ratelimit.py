from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.exceptions import HTTPException as StarletteHTTPException
from cachetools import TTLCache
import time
import logging
import os

from app.middleware.auth import decode_token_payload

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
    # Render's reverse proxy sets X-Real-IP to the real client address and
    # overwrites any value a client may have sent in that header, so this is
    # trustworthy.  Using X-Real-IP instead of X-Forwarded-For avoids the
    # leftmost-value spoofing problem (a client can inject arbitrary values
    # into X-Forwarded-For, and Render's proxy appends rather than replaces).
    # FIXED use Render-proxy-trusted X-Real-IP instead of spoofable X-Forwarded-For
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    if request.client:
        return request.client.host
    return "unknown"


def _jwt_user_id(request: Request) -> str | None:
    """
    Extracts 'sub' from the JWT payload.

    First tries the pre-decoded payload already stored on request.state
    (set by SubscriptionMiddleware or verify_token dependency that ran on a
    previous request in the same ASGI worker — rare but possible).

    Falls back to signature-verified decode via decode_token_payload().
    Unlike the old pyjwt.decode(…, verify_signature=False) which allowed an
    attacker to forge arbitrary user_ids and bypass per-user rate limits (or
    DoS a specific user by consuming their quota), this path validates the
    JWT signature against Supabase JWKS keys (RS256/ES256) or the shared
    HS256 secret.

    On any verification failure the user_id is treated as unknown, so the
    caller falls back to IP-based rate limiting for that request.
    """
    payload = getattr(request.state, "verified_jwt_payload", None)
    if payload:
        return payload.get("sub")

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    try:
        # FIXED signature-verified decode instead of unsafe pyjwt.decode(…, verify_signature=False)
        payload = decode_token_payload(auth[len("Bearer "):])
        return payload.get("sub")
    except StarletteHTTPException:
        return None
    except Exception:
        logging.exception("Unexpected error in _jwt_user_id rate-limit lookup")
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

        if path in ("/", "/health"):
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
