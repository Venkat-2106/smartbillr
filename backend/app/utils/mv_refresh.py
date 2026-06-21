from sqlalchemy import text
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from time import time

MV_SUMMARY = "mv_dashboard_summary"
MV_TREND = "mv_sales_trend_monthly"

_last_refresh: float = 0.0
_STALE_AFTER_SECONDS = 300  # 5 minutes


def refresh_dashboard_mvs(db: Session, force: bool = False) -> None:
    """Refresh dashboard materialized views if stale.

    Uses CONCURRENTLY so reads are never blocked.
    Skips refresh if views were refreshed less than 5 minutes ago
    (unless *force* is True).

    Failed refreshes (e.g. non-PostgreSQL backend) are silently ignored.
    """
    global _last_refresh

    now = time()
    if not force and (now - _last_refresh) < _STALE_AFTER_SECONDS:
        return

    try:
        db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_SUMMARY}"))
        db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {MV_TREND}"))
        db.commit()
        _last_refresh = time()
    except OperationalError:
        db.rollback()
