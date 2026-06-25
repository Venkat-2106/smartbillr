"""
Scheduled job that runs daily to check and update expired subscriptions.

Design principles:
  - is_active is a MANUAL SUPER ADMIN-ONLY field. The automated job NEVER
    modifies it. Super admins set is_active = false to suspend a business.
  - Expired trials: log a warning only — do NOT modify anything. The
    subscription middleware will block access by checking trial_end_at.
  - Expired paid subscriptions: set payment_status = 'suspended' so the
    middleware blocks access with status SUSPENDED.
  - Only super admin can re-activate (set is_active = true, update
    payment_status, etc.).

Run this via APScheduler, cron, or a scheduled task.
"""

import logging
from datetime import datetime, timezone
from sqlalchemy import text
from app.database import SessionLocal

logger = logging.getLogger(__name__)


def expire_subscriptions(db_session=None):
    """
    Check all businesses for expired subscriptions.
    Called daily by the scheduler.

    Args:
        db_session: Optional SQLAlchemy session for testing.
                    If None, creates a new SessionLocal().
    """
    now = datetime.now(timezone.utc)
    logger.info("Subscription expiry check starting at %s", now.isoformat())

    db = db_session or SessionLocal()
    own_session = db_session is None
    try:
        # Log expired trials — middleware handles access blocking
        expired_trials = db.execute(
            text("""
                SELECT business_id, business_name
                FROM businesses
                WHERE (is_deleted = false OR is_deleted IS NULL)
                  AND payment_status = 'pending'
                  AND trial_end_at IS NOT NULL
                  AND trial_end_at < :now
            """),
            {"now": now},
        ).fetchall()
        trial_count = len(expired_trials)
        for row in expired_trials:
            logger.info(
                "Expired trial: business_id=%s name=%s",
                row.business_id, row.business_name,
            )

        # Suspend expired paid subscriptions
        result_sub = db.execute(
            text("""
                UPDATE businesses
                SET payment_status = 'suspended'
                WHERE (is_deleted = false OR is_deleted IS NULL)
                  AND payment_status = 'paid'
                  AND subscription_end_at IS NOT NULL
                  AND subscription_end_at < :now
            """),
            {"now": now},
        )
        sub_count = result_sub.rowcount

        db.commit()

        logger.info(
            "Subscription expiry complete: %d expired trials logged, %d subscriptions suspended",
            trial_count, sub_count,
        )

    except Exception as e:
        db.rollback()
        logger.exception("Error during subscription expiry check: %s", e)
    finally:
        if own_session:
            db.close()
