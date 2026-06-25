"""
Tests for self-service tenant onboarding and subscription management.
"""

import os
import uuid
import base64
import time
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

os.environ.setdefault("SUPABASE_JWT_SECRET", "dGVzdC1zZWNyZXQ=")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text as sa_text, text

from app.main import app
from app.middleware.auth import verify_token
from app.services.subscription_expiry import expire_subscriptions


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_token(sub: str, email: str = "test@example.com") -> str:
    import jwt as pyjwt
    now = time.time()
    payload = {
        "sub": sub,
        "email": email,
        "iat": int(now - 60),
        "exp": int(now + 3600),
    }
    secret = base64.b64decode(os.environ["SUPABASE_JWT_SECRET"])
    return pyjwt.encode(payload, secret, algorithm="HS256")


ADMIN_USER_ID = "00000000-0000-4000-a000-000000000001"
ACTIVE_USER_ID = "cf3a5b2c-0a30-4c9e-81ff-4588acf89377"
ACTIVE_TOKEN = _generate_token(ACTIVE_USER_ID, "active@example.com")


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
    """Mock Supabase Auth Admin API - must return sync responses for sync httpx."""
    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.json.return_value = {"id": "new-auth-user-id-12345"}
    mock_resp.text = ""

    import httpx
    monkeypatch.setattr(httpx, "post", lambda url, *a, **kw: mock_resp)
    monkeypatch.setattr(httpx, "delete", lambda url, *a, **kw: mock_resp)


@pytest.fixture
def mock_auth_admin(seed_data):
    app.dependency_overrides[verify_token] = _override_verify_token_admin
    yield
    app.dependency_overrides.pop(verify_token, None)


@pytest.fixture
def mock_auth_user(seed_data):
    app.dependency_overrides[verify_token] = _override_verify_token_user
    yield
    app.dependency_overrides.pop(verify_token, None)


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
        data = resp.json()["data"]
        assert data["payment_status"] == "pending"
        assert data["subscription_type"] == "trial"
        assert data["is_expired"] is False
        assert data["days_remaining"] is not None

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
                "subscription_type": "monthly",
                "subscription_start_at": now.isoformat(),
                "subscription_end_at": end.isoformat(),
                "is_active": True,
            },
            headers={"Authorization": f"Bearer {ACTIVE_TOKEN}"},
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["data"]["message"] == "Subscription updated successfully"

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

        expire_subscriptions(db_session=db)

        row = db.execute(
            sa_text("SELECT is_active, payment_status FROM businesses WHERE business_id = :bid"),
            {"bid": bid},
        ).fetchone()
        # Expired paid subs get payment_status = 'suspended', is_active unchanged
        assert row.is_active
        assert row.payment_status == "suspended"
