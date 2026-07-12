import logging
import os

from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from time import time

MV_SUMMARY = "mv_dashboard_summary"
MV_TREND = "mv_sales_trend_monthly"

_last_refresh: float = 0.0
_STALE_AFTER_SECONDS = 300  # 5 minutes


def _try_acquire_refresh_lock() -> bool:
    """Redis SETNX distributed lock — prevents multiple workers from refreshing
    simultaneously.  Falls back to allowing the refresh when Redis is unavailable
    (single-worker dev environment)."""
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return True
    try:
        import redis
        r = redis.from_url(redis_url, decode_responses=True)
        return bool(r.set("mv_refresh_lock", "1", nx=True, ex=300))
    except Exception:
        return True


def refresh_dashboard_mvs(db: Session, force: bool = False) -> None:
    """Refresh dashboard materialized views if stale.

    Uses the caller's db session so it stays inside the same transaction.
    Kept for manual/admin trigger endpoints (pass force=True).
    """
    global _last_refresh

    now = time()
    if not force:
        if os.getenv("REDIS_URL"):
            if not _try_acquire_refresh_lock():
                return
        else:
            if (now - _last_refresh) < _STALE_AFTER_SECONDS:
                return

    try:
        db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_SUMMARY}"))
        db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_TREND}"))
        db.commit()
        _last_refresh = time()
    except OperationalError as e:
        logging.warning(
            "Materialized view refresh failed (dashboard will serve stale data): %s", e
        )
        db.rollback()


def refresh_dashboard_mvs_background() -> None:
    """Refresh dashboard materialized views in a background thread.

    Opens its own SessionLocal() so the refresh never blocks the user's
    request or borrows their connection.  Uses the same 5-minute stale
    check as the synchronous variant.
    """
    from app.database import SessionLocal          # avoid circular import at module level

    global _last_refresh

    now = time()
    if os.getenv("REDIS_URL"):
        if not _try_acquire_refresh_lock():
            return
    else:
        if (now - _last_refresh) < _STALE_AFTER_SECONDS:
            return

    db = SessionLocal()
    try:
        db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_SUMMARY}"))
        db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_TREND}"))
        db.commit()
        _last_refresh = now
    except OperationalError as e:
        logging.warning("MV background refresh failed: %s", e)
        db.rollback()
    finally:
        db.close()
