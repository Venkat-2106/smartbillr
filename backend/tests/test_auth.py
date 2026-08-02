"""Authentication integration tests.

Tests the /test-auth endpoint (development only) which exercises
the verify_token dependency chain (HTTPBearer → decode_token_payload
→ profile lookup → permissions cache → response).

Token generation uses an RS256 test key pair and the `mock_jwks` fixture
stubs the JWKS endpoint so the real decode_token_payload function runs
end-to-end without a network call.
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(autouse=True)
def _mock_jwks(mock_jwks):
    yield


@pytest.mark.usefixtures("seed_data")
class TestValidToken:
    """Happy-path: valid JWT for an active user → 200."""

    def test_valid_token_returns_200(self, client: TestClient, seed_data):
        from tests.conftest import generate_token

        token = generate_token(sub=str(seed_data["active_user_id"]))

        resp = client.get("/test-auth", headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 200
        body = resp.json()
        assert body["message"] == "Auth is working!"
        assert body["user_id"] == str(seed_data["active_user_id"])
        assert body["business_id"] == str(seed_data["business_id"])


class TestExpiredToken:
    """Token with exp in the past → 401."""

    def test_expired_token_returns_401(self, client: TestClient, seed_data):
        from tests.conftest import generate_token

        token = generate_token(
            sub=str(seed_data["active_user_id"]), expired=True
        )

        resp = client.get("/test-auth", headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 401
        body = resp.json()
        assert "expired" in body.get("message", "").lower()


class TestMalformedToken:
    """Unparseable token string → 401."""

    def test_malformed_token_returns_401(self, client: TestClient):
        resp = client.get(
            "/test-auth",
            headers={"Authorization": "Bearer this-is-not-a-valid-jwt"},
        )

        assert resp.status_code == 401
        body = resp.json()
        assert "invalid" in body.get("message", "").lower()


class TestMissingToken:
    """No Authorization header → 401 (raised by HTTPBearer)."""

    def test_missing_token_rejected(self, client: TestClient):
        resp = client.get("/test-auth")

        assert resp.status_code == 401
        body = resp.json()
        assert body.get("message") is not None


class TestInactiveUser:
    """Valid JWT but the user's is_active flag is false → 403."""

    def test_inactive_user_returns_403(self, client: TestClient, seed_data):
        from tests.conftest import generate_token

        token = generate_token(sub=str(seed_data["inactive_user_id"]))

        resp = client.get("/test-auth", headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 403
        body = resp.json()
        assert "inactive" in body.get("message", "").lower()


class TestPermissionDenied:
    """Valid, active user who lacks a specific permission code → 403."""

    def test_missing_permission_returns_403(self, client, db, seed_data):
        from app.middleware.auth import verify_token

        bid = str(seed_data["business_id"])
        uid = str(seed_data["active_user_id"])

        async def _restricted_user():
            return {
                "user_id": uid,
                "business_id": bid,
                "role": "staff",
                "permissions": {"sales.delete"},  # notably NOT payments.manage
            }

        app.dependency_overrides[verify_token] = _restricted_user
        try:
            # POST /v1/payments/ requires payments.manage
            resp = client.post(
                "/v1/payments/",
                json={"sale_id": str(uuid.uuid4()), "payment_amount": 100, "payment_method": "cash"},
            )
        finally:
            app.dependency_overrides.pop(verify_token, None)

        assert resp.status_code == 403
        body = resp.json()
        assert "Access denied" in body.get("message", "")
