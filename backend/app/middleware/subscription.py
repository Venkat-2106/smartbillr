import json
import logging
import os
from datetime import datetime, timedelta, timezone

from cachetools import TTLCache
from sqlalchemy import text
from app.services.subscription_expiry import GRACE_PERIOD_DAYS

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


async def _check_subscription_for_user_async(user_id: str, db) -> tuple[dict | None, str]:
    """
    Async variant of _check_subscription_for_user for use by FastAPI
    async dependencies (verify_subscription).

    The sync helper (_check_subscription_for_user) was removed during the
    async migration (2026-07) — the SubscriptionMiddleware that called it
    was confirmed dead (not in main.py's middleware stack).  This async
    variant is the only remaining entry point; called from
    dependencies/subscription.py::verify_subscription.

    Accepts an AsyncSession. Uses the same caching logic.

    NOTE: SQLAlchemy's text() only recognizes its own ":name" bind-parameter
    syntax and compiles that to whatever the driver needs automatically.
    Writing "$1" literally is not a real bind param, and passing a bare
    positional list to execute() doesn't match what it expects (a dict, or
    list-of-dicts for executemany) — it raises "List argument must consist
    only of dictionaries". Always use :name + a dict.

    Separately, SET LOCAL cannot take a bind parameter at all (named or
    positional) — Postgres rejects it with "syntax error at or near $1"
    because SET isn't evaluated through the normal bind machinery. Use
    set_config(name, value, is_local) instead, which is an ordinary function
    call and does accept real bind parameters.
    """
    cached = _cache_sub_get(user_id)
    if cached is not None:
        sub_type = cached.get("subscription_type", "trial") if cached.get("_valid") else cached.get("subscription_type", "trial")
        return (None if cached.get("_valid") else cached, sub_type)

    try:
        from sqlalchemy import text

        await db.execute(text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": user_id})

        result = await db.execute(
            text("""
                SELECT business_id
                FROM profiles
                WHERE id = :uid
                  AND is_active = true
                LIMIT 1
            """),
            {"uid": user_id},
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
            text("SELECT set_config('app.current_business_id', :bid, true)"),
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
                    is_active,
                    grace_period_end_at
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

        # FIXED: NULL subscription_type now defaults to "suspended" (zero limits)
        # instead of "trial" (which silently granted trial-tier access).
        subscription_type = row.subscription_type or "suspended"
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

        grace_end = row.grace_period_end_at
        if result_error is None and row.payment_status in ("paid", "suspended"):
            expired = now > sub_end if sub_end else False
            if expired or row.payment_status == "suspended":
                # Compute effective grace boundary:
                #   - If cron already stored grace_period_end_at, use it
                #   - If cron hasn't run yet (NULL) but sub just expired,
                #     compute inline so user isn't blocked before first cron
                #   - Suspended w/ no stored grace_end → always block
                if grace_end is not None:
                    effective_grace_end = grace_end
                elif expired and row.payment_status == "paid" and sub_end is not None:
                    effective_grace_end = sub_end + timedelta(days=GRACE_PERIOD_DAYS)
                else:
                    effective_grace_end = None

                if effective_grace_end is not None and now <= effective_grace_end:
                    pass
                else:
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

    # FIXED fail closed instead of granting trial access on error
    except Exception:
        logging.exception("Subscription check failed — blocking request")
        err = {
            "error_code": "SUBSCRIPTION_CHECK_FAILED",
            "status": "check_failed",
            "message": "Unable to verify subscription status. Please try again or contact support.",
        }
        _cache_sub_set(user_id, err)
        return err, "trial"