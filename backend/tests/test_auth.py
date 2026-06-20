"""Authentication integration tests.

Tests the /test-auth endpoint (development only) which exercises
the verify_token dependency chain (HTTPBearer → decode_token_payload
→ profile lookup → permissions cache → response).

Token generation uses SUPABASE_JWT_SECRET (HS256) with a test secret
set in conftest.py.  No mocks are used for token validation — the
real decode_token_payload function runs end-to-end.
"""

import pytest
from fastapi.testclient import TestClient


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
        assert "expired" in body.get("detail", "").lower()


class TestMalformedToken:
    """Unparseable token string → 401."""

    def test_malformed_token_returns_401(self, client: TestClient):
        resp = client.get(
            "/test-auth",
            headers={"Authorization": "Bearer this-is-not-a-valid-jwt"},
        )

        assert resp.status_code == 401
        body = resp.json()
        assert "invalid" in body.get("detail", "").lower()


class TestMissingToken:
    """No Authorization header → 401 (raised by HTTPBearer)."""

    def test_missing_token_returns_401(self, client: TestClient):
        resp = client.get("/test-auth")

        assert resp.status_code == 401
        body = resp.json()
        assert body.get("detail") is not None


class TestInactiveUser:
    """Valid JWT but the user's is_active flag is false → 403."""

    def test_inactive_user_returns_403(self, client: TestClient, seed_data):
        from tests.conftest import generate_token

        token = generate_token(sub=str(seed_data["inactive_user_id"]))

        resp = client.get("/test-auth", headers={"Authorization": f"Bearer {token}"})

        assert resp.status_code == 403
        body = resp.json()
        assert "inactive" in body.get("detail", "").lower()
