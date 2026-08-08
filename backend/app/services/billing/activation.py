import logging
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _compute_period_end(current_end_at, billing_cycle: str, now: datetime):
    """
    Anchor the new subscription period on the LATER of (now, current_end_at)
    and return the period end. Shared by one-time activation and recurring
    subscription charges so renewal math stays consistent.
    """
    if isinstance(current_end_at, str):
        # Defensive: tolerate string timestamps (e.g. some drivers/raw SQL).
        current_end_at = datetime.fromisoformat(current_end_at)
    if current_end_at is not None:
        # current_end_at is stored naive (DB column is naive UTC per project
        # convention); make it tz-aware for comparison.
        current_end_at_aware = current_end_at.replace(tzinfo=timezone.utc)
        anchor = current_end_at_aware if current_end_at_aware > now else now
    else:
        anchor = now

    if billing_cycle == "yearly":
        # FIXED leap-year-safe date calculation using relativedelta instead of timedelta(days=365)
        return anchor + relativedelta(years=1)
    if billing_cycle == "one_time":
        return anchor + timedelta(days=9999)
    return anchor + timedelta(days=30)


async def activate_subscription(db: AsyncSession, provider_object: dict, provider: str):
    """
    Activate a subscription after a successful payment webhook.

    Re-derives business_id and plan from YOUR OWN subscription_payments row
    (matched by provider_order_id), never trusts amount/plan from the webhook
    payload as source of truth for what to activate.
    """
    order_id = provider_object.get("order_id")
    provider_payment_id = provider_object.get("id", "")

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

    # Fetch the business's current subscription_end_at so we can anchor
    # renewals/upgrades to extend from the existing expiry rather than from now.
    result = await db.execute(
        text("SELECT subscription_end_at FROM businesses WHERE business_id = :bid"),
        {"bid": str(payment_row.business_id)},
    )
    business_row = result.fetchone()
    current_end_at = business_row.subscription_end_at if business_row else None

    # Server-side amount check — defense against tampered client-side session data
    paid_amount = provider_object.get("amount", 0) / 100

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

    period_end = _compute_period_end(current_end_at, billing_cycle, now)

    await db.execute(
        text("""
            UPDATE businesses SET
                payment_status = 'paid',
                subscription_type = :plan_code,
                current_plan_id = :plan_id,
                payment_provider = :provider,
                subscription_start_at = :now,
                subscription_end_at = :period_end,
                last_renewed_at = :now,
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


async def activate_subscription_charge(
    db: AsyncSession, subscription_entity: dict, payment_entity: dict | None, provider: str
):
    """
    Activate a subscription renewal after a recurring charge webhook
    (subscription.charged). The row created at checkout is keyed by
    razorpay_subscription_id (NOT provider_order_id), so matching is done
    on that. Inserts a NEW subscription_payments row for this charge so
    there's one row per billing cycle (audit trail); the original checkout
    row is left untouched.
    """
    sub_id = subscription_entity.get("id")
    if not sub_id:
        logger.error("Webhook missing subscription id for provider=%s", provider)
        return

    result = await db.execute(
        text("""
            SELECT * FROM subscription_payments
            WHERE provider = :p AND razorpay_subscription_id = :sid
            ORDER BY created_at DESC
            LIMIT 1
        """),
        {"p": provider, "sid": sub_id},
    )
    original_row = result.fetchone()

    if not original_row:
        logger.error(
            "Webhook for unknown razorpay_subscription_id=%s provider=%s",
            sub_id, provider,
        )
        return

    result = await db.execute(
        text("SELECT * FROM plans WHERE plan_id = :pid"),
        {"pid": str(original_row.plan_id)},
    )
    plan = result.fetchone()

    if not plan:
        logger.error("Plan not found for plan_id=%s", original_row.plan_id)
        return

    result = await db.execute(
        text("SELECT subscription_end_at FROM businesses WHERE business_id = :bid"),
        {"bid": str(original_row.business_id)},
    )
    business_row = result.fetchone()
    current_end_at = business_row.subscription_end_at if business_row else None

    now = datetime.now(timezone.utc)
    period_end = _compute_period_end(current_end_at, plan.billing_cycle, now)

    if payment_entity:
        paid_amount = payment_entity.get("amount", 0) / 100
        currency = payment_entity.get("currency")
        provider_payment_id = payment_entity.get("id")
    else:
        paid_amount = float(original_row.amount)
        currency = original_row.currency
        provider_payment_id = None

    await db.execute(
        text("""
            INSERT INTO subscription_payments (
                business_id, plan_id, provider,
                razorpay_subscription_id, subscription_status,
                provider_payment_id,
                amount, currency, status, paid_at
            )
            VALUES (:bid, :plan_id, :provider, :sid, :sub_status, :ppid,
                    :amount, :currency, 'paid', :paid_at)
        """),
        {
            "bid": str(original_row.business_id),
            "plan_id": str(original_row.plan_id),
            "provider": provider,
            "sid": sub_id,
            "sub_status": subscription_entity.get("status"),
            "ppid": provider_payment_id,
            "amount": paid_amount,
            "currency": currency,
            "paid_at": now,
        },
    )

    # FIX (2026-08-08): the anomalous-charge guard previously checked
    # businesses.auto_renew — a single flag shared across the whole
    # business, not scoped to this subscription. Switching plans cancels
    # the OLD subscription first (which sets auto_renew=false via its own
    # webhook), then creates a NEW one — so the NEW subscription's first
    # legitimate charge was being misread as "anomalous" and silently
    # skipped, because it raced against the OLD subscription's
    # cancellation webhook. Check THIS subscription's own last known
    # status instead: it is only 'cancelled'/'halted' if Razorpay told us
    # specifically that sub_id (the one being charged right now) was
    # cancelled — which correctly excludes the case where a DIFFERENT,
    # older subscription was cancelled as part of switching plans.
    if original_row.subscription_status in ("cancelled", "halted"):
        logger.warning(
            "Anomalous renewal charge for cancelled subscription: business=%s sub=%s "
            "(subscription_status=%s) — recording payment without reactivating; "
            "investigate whether the Razorpay cancel-sync failed",
            original_row.business_id, sub_id, original_row.subscription_status,
        )
        await db.commit()
        return

    await db.execute(
        text("""
            UPDATE businesses SET
                payment_status = 'paid',
                subscription_type = :plan_code,
                current_plan_id = :plan_id,
                payment_provider = :provider,
                subscription_end_at = :period_end,
                last_renewed_at = :now,
                grace_period_end_at = NULL,
                auto_renew = true
            WHERE business_id = :bid
        """),
        {
            "plan_code": plan.plan_code,
            "plan_id": str(plan.plan_id),
            "provider": provider,
            "period_end": period_end,
            "now": now,
            "bid": str(original_row.business_id),
        },
    )

    await db.commit()

    try:
        from app.middleware.auth import clear_business_users_cache
        clear_business_users_cache(str(original_row.business_id))
    except Exception:
        logger.warning("Failed to invalidate auth cache for business %s", original_row.business_id)

    try:
        from app.middleware.subscription import clear_subscription_business_cache
        clear_subscription_business_cache(str(original_row.business_id))
    except Exception:
        logger.warning("Failed to invalidate subscription cache for business %s", original_row.business_id)

    logger.info(
        "Subscription charge recorded: business=%s plan=%s sub=%s",
        original_row.business_id, plan.plan_code, sub_id,
    )


async def handle_subscription_status_event(
    db: AsyncSession, subscription_entity: dict, new_status: str
):
    """
    Record a subscription-level status change (subscription.cancelled /
    subscription.halted). Updates the matching subscription_payments rows'
    subscription_status label and, for cancelled/halted, disables
    auto_renew. Deliberately does NOT touch payment_status or
    grace_period_end_at — suspension after the paid period ends is
    exclusively subscription_expiry.py's daily cron's job.
    """
    sub_id = subscription_entity.get("id")
    if not sub_id:
        logger.error("Webhook missing subscription id for status event")
        return

    result = await db.execute(
        text("""
            UPDATE subscription_payments
            SET subscription_status = :new_status
            WHERE provider = 'razorpay' AND razorpay_subscription_id = :sid
            RETURNING business_id
        """),
        {"new_status": new_status, "sid": sub_id},
    )
    updated = result.fetchall()
    await db.commit()

    if not updated:
        logger.warning(
            "No subscription_payments row matched razorpay_subscription_id=%s", sub_id
        )
        return

    if new_status in ("cancelled", "halted"):
        business_id = updated[0][0]
        # The commit above ended the transaction, discarding any
        # transaction-scoped GUC the webhook set. Re-assert the super-admin
        # GUC so this cross-tenant UPDATE on businesses matches rows
        # (businesses has FORCE ROW LEVEL SECURITY keyed on business_id).
        await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
        await db.execute(
            text("UPDATE businesses SET auto_renew = false WHERE business_id = :bid"),
            {"bid": str(business_id)},
        )
        await db.commit()

        try:
            from app.middleware.subscription import clear_subscription_business_cache
            clear_subscription_business_cache(str(business_id))
        except Exception:
            logger.warning(
                "Failed to invalidate subscription cache for business %s", business_id
            )

    logger.info(
        "Subscription status updated: sub=%s new_status=%s rows=%d",
        sub_id, new_status, len(updated),
    )


async def handle_payment_failure(db: AsyncSession, provider_object: dict, provider: str):
    """Handle a failed payment — record the failure, don't touch businesses table."""
    order_id = provider_object.get("order_id")
    failure_reason = provider_object.get("error_description", "Payment failed")

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


async def handle_refund(db: AsyncSession, refund_entity: dict, provider: str):
    """
    Handle a refund (payment.refunded / refund.processed).

    Product rule (confirmed 2026-08-03): a refund reverses the money, so the
    business loses access IMMEDIATELY. Mark the matched subscription_payments
    row 'refunded' and suspend the business (no grace period, no auto-renew).
    """
    provider_payment_id = refund_entity.get("payment_id")
    if not provider_payment_id:
        logger.error("Refund webhook missing payment_id for provider=%s", provider)
        return

    result = await db.execute(
        text("""
            UPDATE subscription_payments
            SET status = 'refunded',
                failure_reason = COALESCE(failure_reason, 'refunded'),
                updated_by_webhook_at = now()
            WHERE provider = :p AND provider_payment_id = :ppid
            RETURNING business_id, payment_id
        """),
        {"p": provider, "ppid": provider_payment_id},
    )
    rows = result.fetchall()
    await db.commit()

    if not rows:
        logger.warning(
            "Refund webhook for unknown provider_payment_id=%s provider=%s",
            provider_payment_id, provider,
        )
        return

    business_id = rows[0][0]

    # The commit above ended the transaction — re-assert the super-admin GUC
    # (businesses has FORCE ROW LEVEL SECURITY keyed on business_id).
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))
    await db.execute(
        text("""
            UPDATE businesses
            SET payment_status = 'suspended',
                auto_renew = false,
                grace_period_end_at = NULL
            WHERE business_id = :bid
        """),
        {"bid": str(business_id)},
    )
    await db.commit()

    try:
        from app.middleware.subscription import clear_subscription_business_cache
        clear_subscription_business_cache(str(business_id))
    except Exception:
        logger.warning("Failed to invalidate subscription cache for business %s", business_id)

    logger.warning(
        "Subscription refunded and business suspended: business=%s payment=%s provider=%s",
        business_id, provider_payment_id, provider,
    )
