"""
Unit tests for activate_subscription_charge (recurring charge webhook).

Covers the change-plan race: switching plans cancels the OLD subscription,
whose webhook flips businesses.auto_renew to false; the NEW subscription's
first charge must still reactivate the business. Also verifies the genuine
anomalous case (a charge on a subscription Razorpay told us was cancelled)
is still blocked.
"""

import asyncio
import uuid
from datetime import datetime

from sqlalchemy import text as sa_text

from app.services.billing.activation import activate_subscription_charge
from tests.conftest import AsyncCompatSession, TestingSessionLocal

BID = "550e8400-e29b-41d4-a716-446655440000"


def _insert_plan(db, plan_code="pro", billing_cycle="monthly"):
    db.execute(
        sa_text("""
            INSERT INTO plans (plan_id, plan_code, display_name, billing_cycle, price_inr, price_usd,
                               razorpay_plan_id, feature_limits, is_active, sort_order, created_at)
            VALUES (:pid, :code, 'Pro', :cycle, 999.00, 19.00, 'plan_test', '{}', 1, 3, :created_at)
        """),
        {
            "pid": str(uuid.uuid4()),
            "code": plan_code,
            "cycle": billing_cycle,
            "created_at": datetime.utcnow(),
        },
    )
    db.commit()


def _insert_subscription_row(db, plan_id, sub_id, sub_status="created"):
    db.execute(
        sa_text("""
            INSERT INTO subscription_payments (
                business_id, plan_id, provider,
                razorpay_subscription_id, subscription_status,
                amount, currency, status
            )
            VALUES (:bid, :pid, 'razorpay', :sid, :sub_status, 19.00, 'USD', 'created')
        """),
        {"bid": BID, "pid": str(plan_id), "sid": sub_id, "sub_status": sub_status},
    )
    db.commit()


def _set_business_auto_renew(db, value):
    db.execute(
        sa_text("UPDATE businesses SET auto_renew = :v WHERE business_id = :bid"),
        {"v": value, "bid": BID},
    )
    db.commit()


def _get_business(db):
    return db.execute(
        sa_text("SELECT subscription_type, payment_status, auto_renew FROM businesses WHERE business_id = :bid"),
        {"bid": BID},
    ).fetchone()


def _get_paid_row(db, sub_id):
    return db.execute(
        sa_text("SELECT * FROM subscription_payments WHERE razorpay_subscription_id = :sid AND status = 'paid'"),
        {"sid": sub_id},
    ).fetchone()


def _run_charge(plan_id, sub_id, sub_status):
    async def _inner():
        session = AsyncCompatSession(TestingSessionLocal())
        try:
            await activate_subscription_charge(
                session,
                {"id": sub_id, "status": sub_status},
                {"amount": 1900, "currency": "USD", "id": "pay_test_1"},
                "razorpay",
            )
        finally:
            await session.close()

    asyncio.run(_inner())


class TestActivateSubscriptionCharge:
    def test_new_sub_charge_reactivates_despite_old_cancellation(self, client, db, seed_data):
        """Change-plan race: auto_renew=false (old sub's cancel webhook) must
        not block a legitimate charge on a DIFFERENT, newer subscription."""
        _insert_plan(db)
        _set_business_auto_renew(db, 0)

        plan = db.execute(sa_text("SELECT plan_id FROM plans WHERE plan_code = 'pro'")).fetchone()
        new_sub_id = "sub_new_legit"
        _insert_subscription_row(db, plan.plan_id, new_sub_id, sub_status="created")

        _run_charge(plan.plan_id, new_sub_id, "active")

        biz = _get_business(db)
        assert biz.subscription_type == "pro"
        assert biz.payment_status == "paid"
        assert bool(biz.auto_renew) is True

        paid = _get_paid_row(db, new_sub_id)
        assert paid is not None
        assert float(paid.amount) == 19.00
        assert paid.currency == "USD"

    def test_charge_on_cancelled_subscription_still_blocked(self, client, db, seed_data):
        """Real anomalous case: a charge arriving for a subscription Razorpay
        told us was cancelled must still be recorded WITHOUT reactivating."""
        _insert_plan(db)
        _set_business_auto_renew(db, 0)
        db.execute(
            sa_text("UPDATE businesses SET subscription_type = 'basic' WHERE business_id = :bid"),
            {"bid": BID},
        )
        db.commit()

        plan = db.execute(sa_text("SELECT plan_id FROM plans WHERE plan_code = 'pro'")).fetchone()
        cancelled_sub_id = "sub_cancelled"
        _insert_subscription_row(db, plan.plan_id, cancelled_sub_id, sub_status="cancelled")

        _run_charge(plan.plan_id, cancelled_sub_id, "active")

        biz = _get_business(db)
        assert biz.subscription_type == "basic"
        assert bool(biz.auto_renew) is False

        paid = _get_paid_row(db, cancelled_sub_id)
        assert paid is not None
