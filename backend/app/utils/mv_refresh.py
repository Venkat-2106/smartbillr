import logging
import os

from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import OperationalError, DBAPIError
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

    Runs on a dedicated autocommit connection — REFRESH MATERIALIZED VIEW
    CONCURRENTLY cannot execute inside an open transaction block.
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
        from app.database import engine
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_SUMMARY}"))
            conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_TREND}"))
        _last_refresh = time()
    except (OperationalError, DBAPIError) as e:
        logging.warning(
            "Materialized view refresh failed (%s): %s", type(e).__name__, e
        )


async def refresh_dashboard_mvs_async(db: AsyncSession, force: bool = False) -> None:
    """Async version of refresh_dashboard_mvs for use with AsyncSession.

    Runs on a dedicated autocommit connection — REFRESH MATERIALIZED VIEW
    CONCURRENTLY cannot execute inside an open transaction block.
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
        from app.database import async_engine
        async with async_engine.connect() as conn:
            conn = conn.execution_options(isolation_level="AUTOCOMMIT")
            await conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_SUMMARY}"))
            await conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_TREND}"))
        _last_refresh = time()
    except (OperationalError, DBAPIError) as e:
        logging.warning(
            "Materialized view refresh failed (%s): %s", type(e).__name__, e
        )


def refresh_dashboard_mvs_background() -> None:
    """Refresh dashboard materialized views in a background thread.

    Opens a dedicated autocommit connection so the refresh is never inside
    an implicit transaction block (REFRESH MATERIALIZED VIEW CONCURRENTLY
    requires this).  Uses the same 5-minute stale check as the sync variant.
    """
    from app.database import engine          # avoid circular import at module level

    global _last_refresh

    now = time()
    if os.getenv("REDIS_URL"):
        if not _try_acquire_refresh_lock():
            return
    else:
        if (now - _last_refresh) < _STALE_AFTER_SECONDS:
            return

    conn = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_SUMMARY}"))
        conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_TREND}"))
        _last_refresh = now
    except (OperationalError, DBAPIError) as e:
        logging.warning("MV background refresh failed (%s): %s", type(e).__name__, e)
    finally:
        conn.close()
