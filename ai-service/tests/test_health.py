from fastapi.testclient import TestClient

from main import app


def test_health_returns_ok() -> None:
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["face_engine"] in {"ready", "unavailable", "cold"}


def test_face_endpoints_require_auth() -> None:
    client = TestClient(app)
    res = client.post("/face/match", files={"file": ("selfie.jpg", b"xx", "image/jpeg")})
    assert res.status_code == 401


def test_rag_requires_auth() -> None:
    client = TestClient(app)
    res = client.post("/rag/query", json={"question": "Do I need a TRN?"})
    assert res.status_code == 401
