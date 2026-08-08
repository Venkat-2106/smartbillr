"""
Checkout flow tests: INR/USD recurring subscription routing.
"""

import uuid

import pytest
from sqlalchemy import text as sa_text

from app.main import app
from app.middleware.auth import verify_token
from app.services.billing import razorpay_client


def _override_verify_token_user():
    return {
        "user_id": "cf3a5b2c-0a30-4c9e-81ff-4588acf89377",
        "business_id": "550e8400-e29b-41d4-a716-446655440000",
        "role": "admin",
        "permissions": {"settings.manage"},
    }


@pytest.fixture
def mock_auth_user(seed_data):
    app.dependency_overrides[verify_token] = _override_verify_token_user
    yield
    app.dependency_overrides.pop(verify_token, None)


def _insert_plan(db, plan_code="pro", billing_cycle="monthly", razorpay_plan_id="plan_test_pro",
                 razorpay_plan_id_usd="plan_test_pro_usd"):
    from datetime import datetime
    db.execute(
        sa_text("""
            INSERT INTO plans (plan_id, plan_code, display_name, billing_cycle, price_inr, price_usd,
                               razorpay_plan_id, razorpay_plan_id_usd, feature_limits, is_active, sort_order, created_at)
            VALUES (:pid, :code, 'Pro', :cycle, 999.00, 19.00, :rzp, :rzp_usd, '{}', 1, 3, :created_at)
        """),
        {
            "pid": str(uuid.uuid4()),
            "code": plan_code,
            "cycle": billing_cycle,
            "rzp": razorpay_plan_id,
            "rzp_usd": razorpay_plan_id_usd,
            "created_at": datetime.utcnow(),
        },
    )
    db.commit()


def _set_country(db, code):
    db.execute(
        sa_text("UPDATE businesses SET business_country_code = :code WHERE business_id = :bid"),
        {"code": code, "bid": "550e8400-e29b-41d4-a716-446655440000"},
    )
    db.commit()


def _capture_create_subscription(monkeypatch, calls):
    def fake_create_subscription(plan_id, total_count, notes):
        calls["plan_id"] = plan_id
        calls["total_count"] = total_count
        calls["notes"] = notes
        return {"id": f"sub_test_{plan_id}", "plan_id": plan_id}

    monkeypatch.setattr(razorpay_client, "create_subscription", fake_create_subscription)
    return calls


class TestRecurringCheckoutCurrencyGuard:
    def test_non_india_recurring_checkout_uses_usd_plan(self, client, db, seed_data, mock_auth_user, monkeypatch):
        _insert_plan(db, razorpay_plan_id="plan_INR_Pro", razorpay_plan_id_usd="plan_USD_Pro")
        _set_country(db, "US")

        calls = _capture_create_subscription(monkeypatch, {})

        resp = client.post("/v1/billing/checkout", json={"plan_code": "pro"})
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["provider"] == "razorpay"
        assert body["mode"] == "subscription"
        assert body["razorpay_subscription_id"] == "sub_test_plan_USD_Pro"
        assert calls["plan_id"] == "plan_USD_Pro"
        assert calls["total_count"] == 1200

        row = db.execute(
            sa_text("""
                SELECT * FROM subscription_payments
                WHERE razorpay_subscription_id = 'sub_test_plan_USD_Pro'
            """)
        ).fetchone()
        assert row is not None
        assert row.status == "created"
        assert float(row.amount) == 19.00
        assert row.currency == "USD"

    def test_blank_country_recurring_checkout_uses_usd_plan(self, client, db, seed_data, mock_auth_user, monkeypatch):
        _insert_plan(db, razorpay_plan_id_usd="plan_USD_Pro")
        _set_country(db, None)

        calls = _capture_create_subscription(monkeypatch, {})

        resp = client.post("/v1/billing/checkout", json={"plan_code": "pro"})
        assert resp.status_code == 200, resp.json()
        assert calls["plan_id"] == "plan_USD_Pro"

    def test_usd_plan_id_missing_returns_500(self, client, db, seed_data, mock_auth_user):
        _insert_plan(db, razorpay_plan_id_usd=None)
        _set_country(db, "US")

        resp = client.post("/v1/billing/checkout", json={"plan_code": "pro"})
        assert resp.status_code == 500, resp.json()
        assert "USD" in resp.json()["message"]

    def test_inr_plan_id_missing_returns_500(self, client, db, seed_data, mock_auth_user):
        _insert_plan(db, razorpay_plan_id=None)
        _set_country(db, "IN")

        resp = client.post("/v1/billing/checkout", json={"plan_code": "pro"})
        assert resp.status_code == 500, resp.json()
        assert "INR" in resp.json()["message"]

    def test_india_recurring_checkout_creates_subscription(self, client, db, seed_data, mock_auth_user, monkeypatch):
        _insert_plan(db, razorpay_plan_id="plan_INR_Pro", razorpay_plan_id_usd="plan_USD_Pro")
        _set_country(db, "IN")

        calls = _capture_create_subscription(monkeypatch, {})

        resp = client.post("/v1/billing/checkout", json={"plan_code": "pro"})
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["provider"] == "razorpay"
        assert body["mode"] == "subscription"
        assert body["razorpay_subscription_id"] == "sub_test_plan_INR_Pro"
        assert calls["plan_id"] == "plan_INR_Pro"
        assert calls["total_count"] == 1200

        row = db.execute(
            sa_text("""
                SELECT * FROM subscription_payments
                WHERE razorpay_subscription_id = 'sub_test_plan_INR_Pro'
            """)
        ).fetchone()
        assert row is not None
        assert row.status == "created"
        assert float(row.amount) == 999.00
        assert row.currency == "INR"


class TestRecurringChangePlanCurrency:
    def test_change_plan_non_india_uses_usd_plan(self, client, db, seed_data, mock_auth_user, monkeypatch):
        _insert_plan(db, razorpay_plan_id="plan_INR_Pro", razorpay_plan_id_usd="plan_USD_Pro")
        _set_country(db, "US")

        calls = _capture_create_subscription(monkeypatch, {})

        resp = client.post("/v1/billing/change-plan", json={"plan_code": "pro"})
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["provider"] == "razorpay"
        assert body["mode"] == "subscription"
        assert body["razorpay_subscription_id"] == "sub_test_plan_USD_Pro"
        assert calls["plan_id"] == "plan_USD_Pro"
        assert calls["total_count"] == 1200

        row = db.execute(
            sa_text("""
                SELECT * FROM subscription_payments
                WHERE razorpay_subscription_id = 'sub_test_plan_USD_Pro'
            """)
        ).fetchone()
        assert row is not None
        assert float(row.amount) == 19.00
        assert row.currency == "USD"

    def test_change_plan_india_uses_inr_plan(self, client, db, seed_data, mock_auth_user, monkeypatch):
        _insert_plan(db, razorpay_plan_id="plan_INR_Pro", razorpay_plan_id_usd="plan_USD_Pro")
        _set_country(db, "IN")

        calls = _capture_create_subscription(monkeypatch, {})

        resp = client.post("/v1/billing/change-plan", json={"plan_code": "pro"})
        assert resp.status_code == 200, resp.json()
        assert calls["plan_id"] == "plan_INR_Pro"

        row = db.execute(
            sa_text("""
                SELECT * FROM subscription_payments
                WHERE razorpay_subscription_id = 'sub_test_plan_INR_Pro'
            """)
        ).fetchone()
        assert float(row.amount) == 999.00
        assert row.currency == "INR"

    def test_change_plan_usd_plan_id_missing_returns_500(self, client, db, seed_data, mock_auth_user):
        _insert_plan(db, razorpay_plan_id_usd=None)
        _set_country(db, "US")

        resp = client.post("/v1/billing/change-plan", json={"plan_code": "pro"})
        assert resp.status_code == 500, resp.json()
        assert "USD" in resp.json()["message"]
