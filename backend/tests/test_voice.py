"""Offline tests for the BimpeAI voice layer. No API key, no network.

BimpeAI HTTP is monkeypatched at ``bimpeai._request`` / the public helpers, so
the call -> transcript -> pipeline loop is exercised end to end deterministically.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, db  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas import Extraction  # noqa: E402
from app.services import bimpeai, extraction as extraction_svc, voice  # noqa: E402

client = TestClient(app)

HAPPY = {
    "issue": "failed_transfer", "churn_reason": "failed_transaction",
    "reason_detail": "A 25000 NGN transfer failed twice and was never reversed.",
    "sentiment": "negative", "intent": "willing_to_return", "intent_to_return": "yes",
    "urgency": "medium", "recovery_possible": True, "fraud_flag": False,
    "fraud_detail": None, "recommended_action": "retry_ticket",
    "resolution_offered": "retry_ticket", "customer_accepted": True,
    "follow_up_needed": False,
    "summary": "Customer left after a failed transfer. Accepted a reversal ticket.",
    "recommended_product_fix": "Auto-reverse failed-transfer debits within 24 hours.",
}

BIMPE_CALL_DETAIL = {
    "id": "call_abc123",
    "status": "ended",
    "destination": "+2348000000000",
    "direction": "outbound",
    "is_test_call": True,
    "duration_seconds": 96,
    "end_reason": "completed",
    "started_at": "now",
    "answered_at": "now",
    "conversation_logs": [
        {"id": "m1", "role": "assistant", "message": "Hi, this is Aven from Demo Bank.", "message_type": "text", "created_at": "now"},
        {"id": "m2", "role": "user", "message": "The transfer failed twice and I stopped using the app.", "message_type": "text", "created_at": "now"},
        {"id": "m3", "role": "assistant", "message": "I can raise a priority reversal ticket. Would that help?", "message_type": "text", "created_at": "now"},
        {"id": "m4", "role": "user", "message": "Yes please.", "message_type": "text", "created_at": "now"},
    ],
}


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test_aven.db"
    monkeypatch.setattr(config, "DB_PATH", str(db_path))
    db.reset()
    yield str(db_path)


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(config, "BIMPEAI_API_KEY", "sk_test")
    monkeypatch.setattr(config, "BIMPEAI_AGENT_ID", "agent_1")


@pytest.fixture
def no_llm(monkeypatch):
    monkeypatch.setattr(extraction_svc, "extract", lambda t, c: Extraction(**HAPPY))


def _seed_customer(customer_id="CUS-V1", **overrides):
    with db.conn() as c:
        row = {
            "id": customer_id, "name": "Tunde Bakare", "phone": "+2348000000000",
            "preferred_language": "en", "last_active_date": "2026-09-01",
            "dormant_balance_ngn": 25400.0, "est_monthly_value_ngn": 3800.0,
            "last_event_type": "failed_transfer",
            "last_event_detail": "25000 NGN transfer failed twice",
            "last_event_date": "2026-09-02", "status": "dormant",
        }
        row.update(overrides)
        cols = ", ".join(row)
        marks = ", ".join("?" for _ in row)
        c.execute(f"INSERT INTO customers({cols}) VALUES ({marks})", tuple(row.values()))
    return customer_id


# --- config / status ----------------------------------------------------------


def test_voice_status_not_configured(temp_db):
    r = client.get("/voice/status")
    assert r.status_code == 200
    assert r.json()["configured"] is False


def test_voice_status_configured(temp_db, configured):
    body = client.get("/voice/status").json()
    assert body["configured"] is True
    assert body["base_url"] == "https://api.bimpe.ai"
    assert body["api_path"] == "/api/v1/console"
    assert body["agent_id"] == "agent_..."


# --- context ------------------------------------------------------------------


def test_voice_context(temp_db):
    _seed_customer()
    ctx = client.get("/voice/customers/CUS-V1/context").json()
    assert ctx["customer_name"] == "Tunde"
    assert ctx["phone"] == "+2348000000000"
    assert ctx["last_event_type"] == "failed_transfer"
    assert ctx["company_name"] == "Demo Bank"


def test_voice_context_unknown_404(temp_db):
    assert client.get("/voice/customers/NOPE/context").status_code == 404


# --- stub behaviour (no API key) ---------------------------------------------


def test_start_call_stubbed_without_key(temp_db):
    _seed_customer()
    r = client.post("/voice/customers/CUS-V1/call")
    assert r.status_code == 200
    assert r.json()["status"] == "stubbed"


def test_bimpeai_start_call_builds_correct_body(temp_db, configured, monkeypatch):
    captured = {}

    def fake_request(method, path, *, json_body=None, params=None):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = json_body
        return {"status": "initiated", "call_id": "call_1", "detail": "dialing"}

    monkeypatch.setattr(bimpeai, "_request", fake_request)
    out = bimpeai.start_call("CUS-V1", {"phone": "+2348000000000"}, is_test_call=True)

    assert captured["method"] == "POST"
    assert captured["path"] == "/agents/agent_1/calls"
    assert captured["json"] == {"destination": "+2348000000000", "is_test_call": True}
    assert out["status"] == "initiated"
    assert out["call_id"] == "call_1"


# --- transcript flattening ----------------------------------------------------


def test_conversation_to_transcript_maps_roles():
    text = bimpeai.conversation_to_transcript(BIMPE_CALL_DETAIL["conversation_logs"])
    assert text.splitlines()[0] == "agent: Hi, this is Aven from Demo Bank."
    assert text.splitlines()[1] == "customer: The transfer failed twice and I stopped using the app."
    assert bimpeai.conversation_to_transcript(None) == ""


# --- full voice loop ----------------------------------------------------------


def test_start_and_sync_call_runs_pipeline(temp_db, configured, no_llm, monkeypatch):
    _seed_customer()

    monkeypatch.setattr(
        bimpeai, "start_call",
        lambda cid, ctx, is_test_call=None, destination=None: {
            "status": "initiated", "call_id": "call_abc123",
            "detail": "dialing", "is_test_call": True,
        },
    )
    monkeypatch.setattr(bimpeai, "wait_for_call", lambda call_id, **kw: dict(BIMPE_CALL_DETAIL))

    started = client.post("/voice/customers/CUS-V1/call").json()
    assert started["ok"] is True
    assert started["call_id"] == "call_abc123"

    synced = client.post("/voice/customers/CUS-V1/calls/call_abc123/sync").json()
    assert synced["ok"] is True
    assert synced["processed"] is True

    call = client.get("/calls/call_abc123").json()
    assert call["issue"] == "failed_transfer"
    assert call["customer_accepted"] == 1
    assert call["duration_sec"] == 96

    actions = client.get("/actions?customer_id=CUS-V1").json()
    assert [a["type"] for a in actions] == ["retry_ticket"]
    assert client.get("/customers/CUS-V1").json()["status"] == "recovered"


def test_sync_is_idempotent(temp_db, configured, no_llm, monkeypatch):
    _seed_customer()
    monkeypatch.setattr(bimpeai, "wait_for_call", lambda call_id, **kw: dict(BIMPE_CALL_DETAIL))
    first = voice.sync_voice_call("CUS-V1", "call_abc123")
    assert first["processed"] is True
    second = voice.sync_voice_call("CUS-V1", "call_abc123")
    assert second.get("already_processed") is True
    assert len(client.get("/actions").json()) == 1


def test_sync_without_transcript_reports_not_processed(temp_db, configured, no_llm, monkeypatch):
    _seed_customer()
    empty = {**BIMPE_CALL_DETAIL, "conversation_logs": []}
    monkeypatch.setattr(bimpeai, "get_call", lambda call_id, **kw: empty)
    monkeypatch.setattr(bimpeai, "wait_for_call", lambda call_id, **kw: empty)
    out = voice.sync_voice_call("CUS-V1", "call_empty", wait=False)
    assert out["ok"] is False
    assert out["processed"] is False


def test_sync_via_body(temp_db, configured, no_llm, monkeypatch):
    _seed_customer()
    monkeypatch.setattr(bimpeai, "wait_for_call", lambda call_id, **kw: dict(BIMPE_CALL_DETAIL))
    r = client.post("/voice/sync", json={"customer_id": "CUS-V1", "call_id": "call_abc123", "wait": True})
    assert r.status_code == 200
    assert r.json()["processed"] is True


# --- native BimpeAI webhook shape --------------------------------------------


def test_webhook_accepts_native_conversation_logs(temp_db, no_llm):
    _seed_customer()
    payload = {
        "call_id": "call_native_1",
        "customer_id": "CUS-V1",
        "status": "ended",
        "duration_seconds": 96,
        "conversation_logs": BIMPE_CALL_DETAIL["conversation_logs"],
    }
    r = client.post("/webhooks/bimpeai", json=payload)
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    call = client.get("/calls/call_native_1").json()
    assert call["issue"] == "failed_transfer"
    assert call["duration_sec"] == 96
    assert "customer: The transfer failed twice" in call["transcript"]
