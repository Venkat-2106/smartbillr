import logging
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def activate_subscription(db: AsyncSession, provider_object: dict, provider: str):
    """
    Activate a subscription after a successful payment webhook.

    Re-derives business_id and plan from YOUR OWN subscription_payments row
    (matched by provider_order_id), never trusts amount/plan from the webhook
    payload as source of truth for what to activate.
    """
    if provider == "razorpay":
        order_id = provider_object.get("order_id")
        provider_payment_id = provider_object.get("id", "")
    else:
        order_id = provider_object.get("id")
        provider_payment_id = provider_object.get("payment_intent", "")

    if not order_id:
        logger.error("Webhook missing order_id for provider=%s", provider)
        return

    result = await db.execute(
        text("SELECT * FROM subscription_payments WHERE provider = :p AND provider_order_id = :oid"),
        {"p": provider, "oid": order_id},
    )
    payment_row = result.fetchone()

    if not payment_row:
        logger.error("Webhook for unknown order_id=%s provider=%s", order_id, provider)
        return

    if payment_row.status == "paid":
        logger.info("Duplicate webhook for payment_id=%s, already paid", payment_row.payment_id)
        return

    result = await db.execute(
        text("SELECT * FROM plans WHERE plan_id = :pid"),
        {"pid": str(payment_row.plan_id)},
    )
    plan = result.fetchone()

    if not plan:
        logger.error("Plan not found for plan_id=%s", payment_row.plan_id)
        return

    # Server-side amount check — defense against tampered client-side session data
    if provider == "razorpay":
        paid_amount = provider_object.get("amount", 0) / 100
    else:
        paid_amount = provider_object.get("amount_total", 0) / 100

    if abs(float(paid_amount) - float(payment_row.amount)) > 0.01:
        logger.critical(
            "Amount mismatch on payment_id=%s: expected %s got %s",
            payment_row.payment_id, payment_row.amount, paid_amount,
        )
        await db.execute(
            text("""
                UPDATE subscription_payments
                SET status = 'failed', failure_reason = 'amount_mismatch', updated_by_webhook_at = now()
                WHERE payment_id = :pid
            """),
            {"pid": str(payment_row.payment_id)},
        )
        await db.commit()
        return  # do NOT activate — flag for manual review

    now = datetime.now(timezone.utc)
    billing_cycle = plan.billing_cycle
    if billing_cycle == "yearly":
        period_end = now + relativedelta(years=1)
    elif billing_cycle == "one_time":
        period_end = now + timedelta(days=9999)
    else:
        period_end = now + timedelta(days=30)

    await db.execute(
        text("""
            UPDATE businesses SET
                payment_status = 'paid',
                subscription_type = :plan_code,
                current_plan_id = :plan_id,
                payment_provider = :provider,
                subscription_start_at = :now,
                subscription_end_at = :period_end,
                grace_period_end_at = NULL
            WHERE business_id = :bid
        """),
        {
            "plan_code": plan.plan_code,
            "plan_id": str(plan.plan_id),
            "provider": provider,
            "now": now,
            "period_end": period_end,
            "bid": str(payment_row.business_id),
        },
    )

    await db.execute(
        text("""
            UPDATE subscription_payments SET
                status = 'paid',
                paid_at = :now,
                provider_payment_id = :ppid,
                updated_by_webhook_at = :now
            WHERE payment_id = :pid
        """),
        {"now": now, "ppid": provider_payment_id, "pid": str(payment_row.payment_id)},
    )

    await db.commit()

    # Invalidate caches so the user's NEXT request sees the new plan immediately
    try:
        from app.middleware.auth import clear_business_users_cache
        clear_business_users_cache(str(payment_row.business_id))
    except Exception:
        logger.warning("Failed to invalidate auth cache for business %s", payment_row.business_id)

    try:
        from app.middleware.subscription import clear_subscription_business_cache
        clear_subscription_business_cache(str(payment_row.business_id))
    except Exception:
        logger.warning("Failed to invalidate subscription cache for business %s", payment_row.business_id)

    logger.info(
        "Subscription activated: business=%s plan=%s provider=%s",
        payment_row.business_id, plan.plan_code, provider,
    )


async def handle_payment_failure(db: AsyncSession, provider_object: dict, provider: str):
    """Handle a failed payment — record the failure, don't touch businesses table."""
    if provider == "razorpay":
        order_id = provider_object.get("order_id")
        failure_reason = provider_object.get("error_description", "Payment failed")
    else:
        order_id = provider_object.get("id")
        failure_reason = provider_object.get("failure_message", "Payment failed")

    if not order_id:
        return

    await db.execute(
        text("""
            UPDATE subscription_payments
            SET status = 'failed', failure_reason = :reason, updated_by_webhook_at = now()
            WHERE provider = :p AND provider_order_id = :oid
        """),
        {"p": provider, "oid": order_id, "reason": failure_reason},
    )
    await db.commit()
    logger.info("Payment failure recorded: provider=%s order_id=%s", provider, order_id)
