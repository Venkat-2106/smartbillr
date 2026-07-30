"""
Scheduled job that runs daily to check and update expired subscriptions.

Design principles:
  - is_active is a MANUAL SUPER ADMIN-ONLY field. The automated job NEVER
    modifies it. Super admins set is_active = false to suspend a business.
  - Expired trials: log a warning only — do NOT modify anything. The
    subscription middleware will block access by checking trial_end_at.
  - Expired paid subscriptions: grant a 3-day grace period via
    grace_period_end_at before suspending access. During the grace period
    the middleware still allows access with a warning flag.
  - Only super admin can re-activate (set is_active = true, update
    payment_status, etc.).

Run this via APScheduler, cron, or a scheduled task.
"""

import logging
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from app.database import SessionLocal

logger = logging.getLogger(__name__)

# Shared grace period length — imported by middleware/subscription.py for inline
# computation between expiry and the next cron run.  Both files must agree.
GRACE_PERIOD_DAYS = 3


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
        acquired = db.execute(
            text("SELECT pg_try_advisory_xact_lock(12345)")
        ).scalar()

        if not acquired:
            logger.info("Subscription expiry: another instance is running, skipping.")
            return

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

        # Phase 1 — First expiry: set grace_period_end_at, keep payment_status = 'paid'
        result_grace = db.execute(
            text("""
                UPDATE businesses
                SET grace_period_end_at = :grace_end
                WHERE (is_deleted = false OR is_deleted IS NULL)
                  AND payment_status = 'paid'
                  AND subscription_end_at IS NOT NULL
                  AND subscription_end_at < :now
                  AND grace_period_end_at IS NULL
            """),
            {"now": now, "grace_end": now + timedelta(days=GRACE_PERIOD_DAYS)},
        )
        grace_count = result_grace.rowcount

        # Phase 2 — Grace period expired: suspend access
        result_suspend = db.execute(
            text("""
                UPDATE businesses
                SET payment_status = 'suspended'
                WHERE (is_deleted = false OR is_deleted IS NULL)
                  AND payment_status = 'paid'
                  AND grace_period_end_at IS NOT NULL
                  AND grace_period_end_at < :now
            """),
            {"now": now},
        )
        suspend_count = result_suspend.rowcount

        db.commit()

        logger.info(
            "Subscription expiry complete: %d expired trials logged, "
            "%d grace periods started, %d subscriptions suspended",
            trial_count, grace_count, suspend_count,
        )

    except Exception as e:
        db.rollback()
        logger.exception("Error during subscription expiry check: %s", e)
    finally:
        if own_session:
            db.close()
