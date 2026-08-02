"""
Tests for self-service tenant onboarding and subscription management.
"""

import os
import uuid
from datetime import datetime, timezone, timedelta

os.environ.setdefault("SUPABASE_JWT_SECRET", "dGVzdC1zZWNyZXQ=")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text as sa_text, text

from app.main import app
from app.middleware.auth import verify_token, verify_super_admin
from app.services.subscription_expiry import expire_subscriptions
from tests.conftest import generate_token


ADMIN_USER_ID = "00000000-0000-4000-a000-000000000001"
ACTIVE_USER_ID = "cf3a5b2c-0a30-4c9e-81ff-4588acf89377"
ACTIVE_TOKEN = generate_token(ACTIVE_USER_ID, "active@example.com")


@pytest.fixture(autouse=True)
def _mock_jwks(mock_jwks):
    yield


def _override_verify_token_admin():
    return {
        "user_id": ADMIN_USER_ID,
        "business_id": "550e8400-e29b-41d4-a716-446655440000",
        "role": "admin",
        "permissions": {"subscription.manage", "dashboard.view", "settings.manage"},
    }


def _override_verify_token_user():
    return {
        "user_id": ACTIVE_USER_ID,
        "business_id": "550e8400-e29b-41d4-a716-446655440000",
        "role": "admin",
        "permissions": {"dashboard.view", "settings.manage"},
    }


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_supabase(monkeypatch):
    """Stub the Supabase Auth Admin API helpers (no network calls)."""
    import app.routers.subscription as sub_mod

    async def fake_create(email: str, password: str, full_name: str) -> dict:
        return {"id": "new-auth-user-id-12345"}

    async def fake_delete(auth_user_id: str, email: str | None = None):
        return None

    monkeypatch.setattr(sub_mod, "_create_supabase_auth_user", fake_create)
    monkeypatch.setattr(sub_mod, "_delete_supabase_auth_user", fake_delete)


def _override_super_admin():
    return {"user_id": ADMIN_USER_ID, "is_super_admin": True}


def _deny_super_admin():
    from fastapi import HTTPException
    raise HTTPException(status_code=403, detail="Access denied. Super admin privileges required.")


@pytest.fixture
def mock_auth_admin(seed_data):
    app.dependency_overrides[verify_token] = _override_verify_token_admin
    app.dependency_overrides[verify_super_admin] = _override_super_admin
    yield
    app.dependency_overrides.pop(verify_token, None)
    app.dependency_overrides.pop(verify_super_admin, None)


@pytest.fixture
def mock_auth_user(seed_data):
    app.dependency_overrides[verify_token] = _override_verify_token_user
    app.dependency_overrides[verify_super_admin] = _deny_super_admin
    yield
    app.dependency_overrides.pop(verify_token, None)
    app.dependency_overrides.pop(verify_super_admin, None)


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestBusinessRegistration:
    def test_register_business_success(self, client, db, seed_data, mock_supabase):
        payload = {
            "business_name": "New Test Corp",
            "owner_name": "John Owner",
            "owner_email": "owner@newcorp.com",
            "owner_password": "StrongPass1",
            "business_phone": "+1234567890",
        }

        resp = client.post("/v1/business", json=payload)
        assert resp.status_code == 201, resp.json()
        data = resp.json()
        assert data["business_name"] == "New Test Corp"
        assert data["owner_email"] == "owner@newcorp.com"
        assert data["subscription_type"] == "trial"
        assert "trial_end_at" in data

        row = db.execute(
            sa_text("SELECT * FROM businesses WHERE business_name = 'New Test Corp'")
        ).fetchone()
        assert row is not None
        assert row.payment_status == "pending"
        assert row.subscription_type == "trial"
        assert row.is_active

        profile = db.execute(
            sa_text("SELECT * FROM profiles WHERE email = 'owner@newcorp.com'")
        ).fetchone()
        assert profile is not None
        assert profile.role == "admin"

    def test_register_duplicate_business_name(self, client, db, seed_data, mock_supabase):
        payload = {
            "business_name": "Test Business",
            "owner_name": "Jane Owner",
            "owner_email": "jane@example.com",
            "owner_password": "StrongPass1",
        }
        resp = client.post("/v1/business", json=payload)
        assert resp.status_code == 400
        assert "already exists" in resp.json()["message"].lower()

    def test_register_duplicate_gstin(self, client, db, seed_data, mock_supabase):
        # Insert a business with a known GSTIN
        bid = str(uuid.uuid4())
        db.execute(
            sa_text("""
                INSERT INTO businesses (business_id, business_name, payment_status, subscription_type,
                    trial_start_at, trial_end_at, is_active)
                VALUES (:bid, 'GST Business', 'pending', 'trial',
                    :trial_start, :trial_end, 1)
            """),
            {
                "bid": bid,
                "trial_start": datetime(2026, 6, 1, 0, 0, 0),
                "trial_end": datetime(2026, 7, 1, 0, 0, 0),
            },
        )
        # Now set the GSTIN directly so we can test the duplicate check
        db.execute(
            sa_text("UPDATE businesses SET gstin = '22AAAAA0000A1Z5' WHERE business_id = :bid"),
            {"bid": bid},
        )
        db.commit()

        payload = {
            "business_name": "GST Business 2",
            "owner_name": "Jane Owner",
            "owner_email": "jane@example.com",
            "owner_password": "StrongPass1",
            "gstin": "22AAAAA0000A1Z5",
        }
        resp = client.post("/v1/business", json=payload)
        assert resp.status_code == 400
        assert "gstin" in resp.json()["message"].lower() or "registered" in resp.json()["message"].lower()

    def test_register_duplicate_email(self, client, db, seed_data):
        payload = {
            "business_name": "Another Corp",
            "owner_name": "Jane Owner",
            "owner_email": "active@example.com",
            "owner_password": "StrongPass1",
        }
        resp = client.post("/v1/business", json=payload)
        assert resp.status_code == 400
        assert "already registered" in resp.json()["message"].lower()

    def test_register_weak_password(self, client):
        payload = {
            "business_name": "Weak Corp",
            "owner_name": "Weak Owner",
            "owner_email": "weak@corp.com",
            "owner_password": "short",
        }
        resp = client.post("/v1/business", json=payload)
        assert resp.status_code == 422

    def test_register_no_auth_required(self, client, mock_supabase):
        payload = {
            "business_name": "No Auth Corp",
            "owner_name": "No Auth Owner",
            "owner_email": "noauth@corp.com",
            "owner_password": "StrongPass1",
        }
        resp = client.post("/v1/business", json=payload)
        assert resp.status_code == 201, resp.json()


class TestSubscriptionStatus:
    def test_get_subscription_active_trial(self, client, mock_auth_user, seed_data):
        resp = client.get(
            "/v1/businesses/me/subscription",
            headers={"Authorization": f"Bearer {ACTIVE_TOKEN}"},
        )
        assert resp.status_code == 200, resp.json()
        body = resp.json()
        assert body["payment_status"] == "pending"
        assert body["subscription_type"] == "trial"
        assert body["is_expired"] is False
        assert body["days_remaining"] is not None

    def test_get_subscription_no_auth(self, client):
        resp = client.get("/v1/businesses/me/subscription")
        assert resp.status_code == 401


class TestSuperAdminSubscription:
    def test_activate_paid_subscription(self, client, db, mock_auth_admin, seed_data):
        bid = "550e8400-e29b-41d4-a716-446655440000"
        now = datetime.now(timezone.utc)
        end = now + timedelta(days=30)

        resp = client.patch(
            f"/v1/admin/businesses/{bid}/subscription",
            json={
                "payment_status": "paid",
                "subscription_type": "pro",
                "subscription_start_at": now.isoformat(),
                "subscription_end_at": end.isoformat(),
                "is_active": True,
            },
            headers={"Authorization": f"Bearer {ACTIVE_TOKEN}"},
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["message"] == "Subscription updated successfully"

    def test_permission_denied(self, client, mock_auth_user, seed_data):
        bid = "550e8400-e29b-41d4-a716-446655440000"
        resp = client.patch(
            f"/v1/admin/businesses/{bid}/subscription",
            json={"payment_status": "paid"},
            headers={"Authorization": f"Bearer {ACTIVE_TOKEN}"},
        )
        assert resp.status_code == 403

    def test_suspend_business(self, client, db, mock_auth_admin, seed_data):
        bid = "550e8400-e29b-41d4-a716-446655440000"
        resp = client.patch(
            f"/v1/admin/businesses/{bid}/subscription",
            json={"is_active": False},
            headers={"Authorization": f"Bearer {ACTIVE_TOKEN}"},
        )
        assert resp.status_code == 200, resp.json()


class TestSubscriptionMiddleware:
    def test_active_trial_allows_access(self, client, mock_auth_user, seed_data):
        resp = client.get(
            "/v1/businesses/me/subscription",
            headers={"Authorization": f"Bearer {ACTIVE_TOKEN}"},
        )
        assert resp.status_code == 200


class TestExpiryJob:
    def test_expire_trials_logged_only(self, db, seed_data):
        bid = "550e8400-e29b-41d4-a716-446655440000"
        past = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

        db.execute(
            sa_text("""
                UPDATE businesses
                SET trial_end_at = :past,
                    payment_status = 'pending',
                    is_active = 1
                WHERE business_id = :bid
            """),
            {"past": past, "bid": bid},
        )
        db.commit()

        expire_subscriptions(db_session=db)

        row = db.execute(
            sa_text("SELECT is_active, payment_status FROM businesses WHERE business_id = :bid"),
            {"bid": bid},
        ).fetchone()
        # Expired trials are NOT modified by the expiry job
        assert row.is_active
        assert row.payment_status == "pending"

    def test_expire_paid_subscriptions(self, db, seed_data):
        bid = "550e8400-e29b-41d4-a716-446655440000"
        past = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

        db.execute(
            sa_text("""
                UPDATE businesses
                SET subscription_end_at = :past,
                    payment_status = 'paid',
                    is_active = 1
                WHERE business_id = :bid
            """),
            {"past": past, "bid": bid},
        )
        db.commit()

        # Run 1: starts the 3-day grace period — status unchanged
        expire_subscriptions(db_session=db)

        row = db.execute(
            sa_text("SELECT is_active, payment_status, grace_period_end_at FROM businesses WHERE business_id = :bid"),
            {"bid": bid},
        ).fetchone()
        assert row.is_active
        assert row.payment_status == "paid"
        assert row.grace_period_end_at is not None

        # Force the grace period to expire, then Run 2 suspends the subscription
        db.execute(
            sa_text("""
                UPDATE businesses
                SET grace_period_end_at = :past
                WHERE business_id = :bid
            """),
            {"past": past, "bid": bid},
        )
        db.commit()

        expire_subscriptions(db_session=db)

        row = db.execute(
            sa_text("SELECT is_active, payment_status FROM businesses WHERE business_id = :bid"),
            {"bid": bid},
        ).fetchone()
        assert row.is_active
        assert row.payment_status == "suspended"
