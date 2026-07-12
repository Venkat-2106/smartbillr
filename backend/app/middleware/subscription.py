import json
import logging
import os
import re
from datetime import datetime, timezone

from cachetools import TTLCache
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.database import SessionLocal

# ── Redis client (lazy, same pattern as auth.py / ratelimit.py) ──────────────

_redis_sub = None  # redis.Redis | None


def _get_redis_sub():
    global _redis_sub
    if _redis_sub is not None:
        return _redis_sub
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return None
    try:
        import redis as _redis_mod

        _redis_sub = _redis_mod.from_url(redis_url, decode_responses=True)
    except Exception:
        logging.warning(
            "Redis unavailable for subscription cache — falling back to local cache only"
        )
    return _redis_sub


# ── L1 in-process caches ────────────────────────────────────────────────────

_subscription_cache: TTLCache | None = TTLCache(maxsize=10000, ttl=60)
_user_business_cache: TTLCache = TTLCache(maxsize=10000, ttl=60)
_sub_biz_index: dict[str, set[str]] = {}  # business_id → set of cached user_ids


# ── Cache helpers ───────────────────────────────────────────────────────────

KEY_BIZ = "sub_biz:{user_id}"
KEY_SUB = "sub_cache:{user_id}"



def _cache_sub_get(user_id: str) -> dict | None:
    """
    Check L1 first, then L2.
    Returns None if not cached, otherwise a dict:
      {"_valid": True,  "subscription_type": "..."}  → subscription OK
      {"_valid": False, "error_code": "...", ...}    → subscription blocked
    """
    if _subscription_cache is not None:
        v = _subscription_cache.get(KEY_SUB.format(user_id=user_id))
        if v is not None:
            return v
    try:
        r = _get_redis_sub()
        if r is not None:
            raw = r.get(KEY_SUB.format(user_id=user_id))
            if raw is not None:
                val = json.loads(raw)
                if _subscription_cache is not None:
                    _subscription_cache[KEY_SUB.format(user_id=user_id)] = val
                return val
    except Exception:
        pass
    return None


def _cache_sub_set(user_id: str, value: dict | None, subscription_type: str = "trial", business_id: str | None = None):
    """
    Cache the subscription check result.
      value=None          → valid subscription; cache {"_valid": True, "subscription_type": ...}
      value=dict (error)  → blocked;           cache the error dict with _valid=False
    """
    store = {"_valid": True, "subscription_type": subscription_type} if value is None else {**value, "_valid": False}
    if _subscription_cache is not None:
        _subscription_cache[KEY_SUB.format(user_id=user_id)] = store
    if business_id:
        _user_business_cache[user_id] = business_id
        _sub_biz_index.setdefault(business_id, set()).add(user_id)
    try:
        r = _get_redis_sub()
        if r is not None:
            r.setex(
                KEY_SUB.format(user_id=user_id), 60, json.dumps(store)
            )
            if business_id:
                r.setex(KEY_BIZ.format(user_id=user_id), 60, business_id)
    except Exception:
        pass


# ── Public API ──────────────────────────────────────────────────────────────


def clear_subscription_user_cache(user_id: str):
    biz = _user_business_cache.pop(user_id, None)
    if biz and biz in _sub_biz_index:
        _sub_biz_index[biz].discard(user_id)
        if not _sub_biz_index[biz]:
            del _sub_biz_index[biz]
    if _subscription_cache is not None:
        _subscription_cache.pop(KEY_SUB.format(user_id=user_id), None)
    try:
        r = _get_redis_sub()
        if r is not None:
            r.delete(
                KEY_BIZ.format(user_id=user_id),
                KEY_SUB.format(user_id=user_id),
            )
    except Exception:
        pass


def clear_subscription_business_cache(business_id: str):
    """
    Invalidate subscription cache entries for ALL users belonging to a business.

    Uses _sub_biz_index for O(1) lookup instead of scanning _user_business_cache.
    Stale index entries (from TTL expiry) are silently skipped.
    """
    user_ids = _sub_biz_index.pop(business_id, set())
    for uid in user_ids:
        _user_business_cache.pop(uid, None)
        if _subscription_cache is not None:
            _subscription_cache.pop(KEY_SUB.format(user_id=uid), None)

    try:
        r = _get_redis_sub()
        if r is not None:
            for key in r.scan_iter("sub_biz:*"):
                raw = r.get(key)
                if raw and raw == business_id:
                    uid = key.split(":", 1)[1]
                    r.delete(
                        KEY_BIZ.format(user_id=uid),
                        KEY_SUB.format(user_id=uid),
                    )
    except Exception:
        pass


EXCLUDED_PATHS = [
    re.compile(r"^/v1/business/?$"),  # POST registration (no auth)
    re.compile(r"^/v1/businesses/me/subscription/?$"),  # subscription status check
    re.compile(r"^/v1/businesses/([a-f0-9-]+)/subscription/?$"),  # super admin
    re.compile(r"^/v1/superadmin/"),  # platform super admin routes (no tenant)
    re.compile(r"^/superadmin/"),  # legacy, kept for backward compat
    re.compile(r"^/v1/admin/"),  # all admin endpoints
    re.compile(r"^/v1/auth/"),
    re.compile(r"^/v1/profiles/check-email"),
    re.compile(r"^/?$"),
    re.compile(r"^/health/?$"),
    re.compile(r"^/test-auth"),
    # Billing — expired/trial businesses must be able to view plans and pay
    re.compile(r"^/v1/billing/plans/?$"),
    re.compile(r"^/v1/billing/checkout/?$"),
    re.compile(r"^/v1/billing/checkout/[^/]+/status/?$"),
    re.compile(r"^/v1/billing/webhooks/"),  # defensive — webhooks send no Bearer token
]


def _is_excluded(path: str) -> bool:
    for pattern in EXCLUDED_PATHS:
        if pattern.match(path):
            return True
    return False


def _check_subscription_for_user(user_id: str, db=None) -> tuple[dict | None, str]:
    """
    Fetch subscription status for a user in one query.
    Returns (None, subscription_type) if valid, (error_dict, subscription_type) if invalid.
    Caches result by user_id for 60 seconds (L1 TTLCache + L2 Redis).

    Args:
        user_id: The auth user ID (JWT sub claim).
        db: Optional shared SQLAlchemy session.  When provided (FastAPI
            dependency mode) the caller owns the session lifecycle.
            When omitted a private SessionLocal is created (legacy /
            middleware backward-compat).
    """
    cached = _cache_sub_get(user_id)
    if cached is not None:
        sub_type = cached.get("subscription_type", "trial") if cached.get("_valid") else cached.get("subscription_type", "trial")
        return (None if cached.get("_valid") else cached, sub_type)

    own_session = db is None
    if own_session:
        from app.database import SessionLocal as _SL
        db = _SL()
    try:
        # Step 1 — Set app.current_user_id so profiles' self_lookup_policy
        # allows reading the user's own row, then fetch the business_id.
        db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})

        profile_row = db.execute(
            text("""
                SELECT business_id
                FROM profiles
                WHERE id = :user_id
                  AND is_active = true
                LIMIT 1
            """),
            {"user_id": user_id},
        ).fetchone()

        if not profile_row:
            result = {
                "error_code": "INACTIVE",
                "status": "not_found",
                "message": "User or business not found",
            }
            _cache_sub_set(user_id, result)
            return result, "trial"

        business_id = str(profile_row.business_id)

        # Step 2 — Now that we have the business_id, set the GUC so
        # businesses' tenant_access_policy allows the subscription query.
        db.execute(
            text("SET LOCAL app.current_business_id = :bid"),
            {"bid": business_id},
        )

        row = db.execute(
            text("""
                SELECT
                    business_id,
                    payment_status,
                    subscription_type,
                    subscription_end_at,
                    trial_end_at,
                    is_active
                FROM businesses
                WHERE business_id = CAST(:bid AS uuid)
                  AND (is_deleted = false OR is_deleted IS NULL)
                LIMIT 1
            """),
            {"bid": business_id},
        ).fetchone()

        if not row:
            result = {
                "error_code": "INACTIVE",
                "status": "not_found",
                "message": "User or business not found",
            }
            _cache_sub_set(user_id, result)
            return result, "trial"

        subscription_type = row.subscription_type or "trial"
        now = datetime.now(timezone.utc)
        result = None

        if not row.is_active:
            result = {
                "error_code": "SUSPENDED",
                "status": "suspended",
                "message": "Business account is suspended",
            }

        trial_end = row.trial_end_at
        sub_end = row.subscription_end_at

        if result is None and row.payment_status == "pending":
            if trial_end and now > trial_end:
                result = {
                    "error_code": "TRIAL_EXPIRED",
                    "status": "trial_expired",
                    "message": "Trial period has expired. Please complete payment to continue.",
                    "payment_status": row.payment_status,
                    "subscription_type": subscription_type,
                    "trial_end_at": trial_end.isoformat() if trial_end else None,
                    "subscription_end_at": sub_end.isoformat() if sub_end else None,
                }

        if result is None and row.payment_status in ("paid", "suspended"):
            expired = now > sub_end if sub_end else False
            if expired or row.payment_status == "suspended":
                result = {
                    "error_code": "SUBSCRIPTION_EXPIRED",
                    "status": "subscription_expired",
                    "message": "Subscription has expired. Please renew to continue.",
                    "payment_status": row.payment_status,
                    "subscription_type": subscription_type,
                    "trial_end_at": trial_end.isoformat() if trial_end else None,
                    "subscription_end_at": sub_end.isoformat() if sub_end else None,
                }

        if result is None and row.payment_status not in ("pending", "paid", "suspended"):
            logging.warning(
                "Unknown payment_status '%s' for business %s — treating as suspended",
                row.payment_status, row.business_id
            )
            result = {
                "error_code": "INVALID_STATE",
                "status": "invalid",
                "message": "Account subscription status is invalid. Please contact support.",
            }

        _cache_sub_set(user_id, result, subscription_type, business_id=business_id)
        return result, subscription_type

    except Exception as e:
        logging.warning("Subscription check failed, allowing request through: %s", e)
        return None, "trial"
    finally:
        if own_session:
            db.close()


async def _check_subscription_for_user_async(user_id: str, db) -> tuple[dict | None, str]:
    """
    Async variant of _check_subscription_for_user for use by FastAPI
    async dependencies (verify_subscription).

    Accepts an AsyncSession. Uses the same caching logic.
    """
    cached = _cache_sub_get(user_id)
    if cached is not None:
        sub_type = cached.get("subscription_type", "trial") if cached.get("_valid") else cached.get("subscription_type", "trial")
        return (None if cached.get("_valid") else cached, sub_type)

    try:
        from sqlalchemy import text

        await db.execute(text("SET LOCAL app.current_user_id = :uid"), {"uid": user_id})

        result = await db.execute(
            text("""
                SELECT business_id
                FROM profiles
                WHERE id = :user_id
                  AND is_active = true
                LIMIT 1
            """),
            {"user_id": user_id},
        )
        profile_row = result.fetchone()

        if not profile_row:
            err = {
                "error_code": "INACTIVE",
                "status": "not_found",
                "message": "User or business not found",
            }
            _cache_sub_set(user_id, err)
            return err, "trial"

        business_id = str(profile_row.business_id)

        await db.execute(
            text("SET LOCAL app.current_business_id = :bid"),
            {"bid": business_id},
        )

        row_result = await db.execute(
            text("""
                SELECT
                    business_id,
                    payment_status,
                    subscription_type,
                    subscription_end_at,
                    trial_end_at,
                    is_active
                FROM businesses
                WHERE business_id = CAST(:bid AS uuid)
                  AND (is_deleted = false OR is_deleted IS NULL)
                LIMIT 1
            """),
            {"bid": business_id},
        )
        row = row_result.fetchone()

        if not row:
            err = {
                "error_code": "INACTIVE",
                "status": "not_found",
                "message": "User or business not found",
            }
            _cache_sub_set(user_id, err)
            return err, "trial"

        subscription_type = row.subscription_type or "trial"
        now = datetime.now(timezone.utc)
        result_error = None

        if not row.is_active:
            result_error = {
                "error_code": "SUSPENDED",
                "status": "suspended",
                "message": "Business account is suspended",
            }

        trial_end = row.trial_end_at
        sub_end = row.subscription_end_at

        if result_error is None and row.payment_status == "pending":
            if trial_end and now > trial_end:
                result_error = {
                    "error_code": "TRIAL_EXPIRED",
                    "status": "trial_expired",
                    "message": "Trial period has expired. Please complete payment to continue.",
                    "payment_status": row.payment_status,
                    "subscription_type": subscription_type,
                    "trial_end_at": trial_end.isoformat() if trial_end else None,
                    "subscription_end_at": sub_end.isoformat() if sub_end else None,
                }

        if result_error is None and row.payment_status in ("paid", "suspended"):
            expired = now > sub_end if sub_end else False
            if expired or row.payment_status == "suspended":
                result_error = {
                    "error_code": "SUBSCRIPTION_EXPIRED",
                    "status": "subscription_expired",
                    "message": "Subscription has expired. Please renew to continue.",
                    "payment_status": row.payment_status,
                    "subscription_type": subscription_type,
                    "trial_end_at": trial_end.isoformat() if trial_end else None,
                    "subscription_end_at": sub_end.isoformat() if sub_end else None,
                }

        if result_error is None and row.payment_status not in ("pending", "paid", "suspended"):
            logging.warning(
                "Unknown payment_status '%s' for business %s — treating as suspended",
                row.payment_status, row.business_id
            )
            result_error = {
                "error_code": "INVALID_STATE",
                "status": "invalid",
                "message": "Account subscription status is invalid. Please contact support.",
            }

        _cache_sub_set(user_id, result_error, subscription_type, business_id=business_id)
        return result_error, subscription_type

    except Exception as e:
        logging.warning("Async subscription check failed, allowing request through: %s", e)
        return None, "trial"


class SubscriptionMiddleware:
    """
    ASGI middleware that validates tenant subscription status on every
    authenticated API request. Excluded paths are defined in EXCLUDED_PATHS.
    Returns 402 Payment Required when subscription is invalid.

    Subscriptions are cached in-process (TTLCache, L1) and optionally in
    Redis (L2) when REDIS_URL is configured, so that cache invalidation
    from any instance propagates to all instances within ~60s.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        path = request.url.path

        if _is_excluded(path):
            await self.app(scope, receive, send)
            return

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            await self.app(scope, receive, send)
            return

        token = auth_header.removeprefix("Bearer ")

        try:
            from app.middleware.auth import decode_token_payload
            payload = decode_token_payload(token)
            request.state.verified_jwt_payload = payload
            user_id = payload.get("sub")
        except HTTPException:
            await self.app(scope, receive, send)
            return
        except Exception:
            logging.warning("SubscriptionMiddleware: failed to decode token", exc_info=True)
            await self.app(scope, receive, send)
            return

        if not user_id:
            await self.app(scope, receive, send)
            return

        error, subscription_type = _check_subscription_for_user(user_id)
        request.state.subscription_type = subscription_type
        if error is not None:
            response = JSONResponse(
                status_code=402,
                content={
                    "success": False,
                    "error": "subscription_required",
                    "message": error["message"],
                    "subscription": error,
                },
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
