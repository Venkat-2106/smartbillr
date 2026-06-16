from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    res = client.get("/")
    assert res.status_code == 200
    body = res.json()
    assert "SmartBillr API" in body["message"]


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["app"] == "SmartBillr API"
    assert body["version"] == "1.0.0"


def test_404():
    res = client.get("/nonexistent")
    assert res.status_code == 404
