"""Offline pipeline tests. No API key, no network: the LLM is monkeypatched.

Covers the 8 required cases from Step 8 of BACKEND_GUIDE.md.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config, db  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas import Extraction, FALLBACK  # noqa: E402
from app.services import extraction as extraction_svc  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point the whole app at a fresh temp DB for every test."""
    db_path = tmp_path / "test_aven.db"
    monkeypatch.setattr(config, "DB_PATH", str(db_path))
    db.reset()
    yield str(db_path)


@pytest.fixture
def no_llm(monkeypatch):
    """Force extraction down the deterministic path (fixture or FALLBACK)."""
    monkeypatch.setattr(extraction_svc, "extract", lambda t, c: _fake_extract(t))


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

FRAUD = {
    **HAPPY,
    "issue": "fraud_report", "churn_reason": "trust_security",
    "reason_detail": "Customer reports an unauthorised debit after a scam call.",
    "intent": "unsure", "intent_to_return": "maybe", "urgency": "high",
    "fraud_flag": True, "fraud_detail": "Unauthorised 40000 NGN debit after a scam call.",
    "recommended_action": "fraud_escalation", "resolution_offered": "human_callback",
    "customer_accepted": True, "follow_up_needed": True,
    "summary": "Customer lost money to fraud. Escalated urgently.",
}

ANGRY_REFUSAL = {
    **HAPPY,
    "sentiment": "negative", "intent": "not_returning", "intent_to_return": "no",
    "recovery_possible": False, "resolution_offered": "human_callback",
    "customer_accepted": False, "follow_up_needed": False,
    "summary": "Customer is angry, refuses any resolution and ends the call.",
}


def _fake_extract(transcript):
    """Deterministic stand-in for the LLM, keyed off transcript content."""
    if isinstance(transcript, list):
        transcript = "\n".join(f"{m.get('role')}: {m.get('text', '')}" for m in transcript)
    text = transcript.lower()
    if "took my money" in text or "unauthorised" in text or "unauthorized" in text:
        return Extraction(**FRAUD)
    if "forget it" in text or "remove my number" in text:
        return Extraction(**ANGRY_REFUSAL)
    return Extraction(**HAPPY)


def _seed_customer(customer_id="CUS-TEST", status="dormant", **overrides):
    db.reset()
    with db.conn() as c:
        row = {
            "id": customer_id, "name": "Test Customer", "phone": "+2348000000000",
            "preferred_language": "en", "last_active_date": "2026-09-01",
            "dormant_balance_ngn": 25000.0, "est_monthly_value_ngn": 3500.0,
            "last_event_type": "failed_transfer",
            "last_event_detail": "25000 NGN transfer failed twice",
            "last_event_date": "2026-09-02", "status": status,
        }
        row.update(overrides)
        cols = ", ".join(row)
        marks = ", ".join("?" for _ in row)
        c.execute(f"INSERT INTO customers({cols}) VALUES ({marks})", tuple(row.values()))
    return customer_id


def _post_webhook(call_id="CALL-T1", customer_id="CUS-TEST", transcript=None):
    payload = {
        "call_id": call_id,
        "customer_id": customer_id,
        "duration_sec": 100,
        "transcript": transcript
        or "customer: The transfer failed twice and I stopped using the app. "
        "agent: I can open a priority reversal ticket. customer: Yes please.",
    }
    return client.post("/webhooks/bimpeai", json=payload)


# --- 1. health ---------------------------------------------------------------


def test_health_ok(temp_db):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "db": "ok"}


# --- 2. empty DB returns 200 with empty/zero values ---------------------------


def test_empty_db_endpoints(temp_db):
    assert client.get("/customers").json() == []
    assert client.get("/calls").json() == []
    assert client.get("/actions").json() == []
    r = client.get("/insights")
    assert r.status_code == 200
    body = r.json()
    assert body["kpi"]["contacted"] == 0
    assert body["kpi"]["recovery_rate"] == 0.0
    assert body["by_reason"] == []
    assert body["by_issue"] == []


# --- 3. happy path ------------------------------------------------------------


def test_happy_path_pipeline(temp_db, no_llm):
    _seed_customer()
    r = _post_webhook("CALL-H1")
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    call = client.get("/calls/CALL-H1").json()
    assert call["issue"] == "failed_transfer"
    assert call["intent_to_return"] == "yes"
    assert call["customer_accepted"] == 1
    assert call["extraction_source"] == "llm"  # pipeline ran through extraction

    actions = client.get("/actions?customer_id=CUS-TEST").json()
    assert len(actions) == 1
    assert actions[0]["type"] == "retry_ticket"

    cust = client.get("/customers/CUS-TEST").json()
    assert cust["status"] == "recovered"

    insights = client.get("/insights").json()
    assert insights["kpi"]["contacted"] == 1
    assert insights["kpi"]["recovered"] == 1
    assert insights["kpi"]["recovery_rate"] == 1.0


# --- 4. fraud path ------------------------------------------------------------


def test_fraud_path(temp_db, no_llm):
    _seed_customer()
    r = _post_webhook("CALL-F1", transcript="customer: Someone called me and took my money.")
    assert r.status_code == 200

    call = client.get("/calls/CALL-F1").json()
    assert call["fraud_flag"] == 1
    assert call["urgency"] == "high"

    actions = client.get("/actions?customer_id=CUS-TEST&urgent=true").json()
    assert len(actions) == 1
    assert actions[0]["type"] == "fraud_escalation"
    assert actions[0]["urgent"] == 1

    cust = client.get("/customers/CUS-TEST").json()
    assert cust["status"] == "escalated"


# --- 5. angry customer who refuses --------------------------------------------


def test_angry_refusal(temp_db, no_llm):
    _seed_customer()
    r = _post_webhook(
        "CALL-A1",
        transcript="customer: Forget it. Remove my number. I am done with this bank.",
    )
    assert r.status_code == 200

    cust = client.get("/customers/CUS-TEST").json()
    assert cust["status"] == "contacted"

    actions = client.get("/actions?customer_id=CUS-TEST").json()
    assert actions == []  # refused + no follow-up -> no action


# --- 6. duplicate webhook is idempotent ----------------------------------------


def test_duplicate_webhook(temp_db, no_llm):
    _seed_customer()
    first = _post_webhook("CALL-D1")
    assert first.json() == {"ok": True}

    dup = _post_webhook("CALL-D1")
    assert dup.json() == {"ok": True, "duplicate": True}

    assert len(client.get("/calls").json()) == 1
    assert len(client.get("/actions").json()) == 1


# --- 7. unknown customer -> 404 ------------------------------------------------


def test_unknown_customer_404(temp_db, no_llm):
    r = _post_webhook("CALL-X1", customer_id="CUS-NOPE")
    assert r.status_code == 404


# --- 8. extraction failure -> fallback, pipeline still completes ----------------


def test_extraction_fallback(temp_db, monkeypatch):
    _seed_customer()

    calls = {"n": 0}

    def _boom(transcript, customer):
        calls["n"] += 1
        raise RuntimeError("LLM down")

    monkeypatch.setattr(extraction_svc, "extract", _boom)

    r = _post_webhook("CALL-B1")
    assert r.status_code == 200

    call = client.get("/calls/CALL-B1").json()
    assert call["extraction_source"] == "fallback"
    assert call["follow_up_needed"] == 1
    assert call["churn_reason"] == "other"

    # Pipeline still completes: customer gets a callback action and is contacted.
    actions = client.get("/actions?customer_id=CUS-TEST").json()
    assert len(actions) == 1
    assert actions[0]["type"] == "human_callback"
    cust = client.get("/customers/CUS-TEST").json()
    assert cust["status"] == "contacted"


# --- extras: filters, resolve, list-transcript shape ----------------------------


def test_filters_and_resolve(temp_db, no_llm):
    _seed_customer()
    _post_webhook("CALL-R1")

    assert len(client.get("/calls?churn_reason=failed_transaction").json()) == 1
    assert client.get("/calls?churn_reason=fees").json() == []
    assert len(client.get("/actions?type=retry_ticket").json()) == 1
    assert client.get("/calls/CALL-R1").json()["transcript"]  # detail has transcript
    assert "transcript" not in client.get("/calls").json()[0]  # list omits it

    action_id = client.get("/actions").json()[0]["id"]
    assert client.post(f"/actions/{action_id}/resolve").json()["status"] == "done"
    assert client.get("/actions").json()[0]["status"] == "done"


def test_webhook_rejects_bad_secret(temp_db, monkeypatch):
    _seed_customer()
    monkeypatch.setattr(config, "WEBHOOK_SECRET", "s3cret")
    r = client.post(
        "/webhooks/bimpeai",
        json={"call_id": "CALL-S1", "customer_id": "CUS-TEST", "transcript": "hi"},
        headers={"X-Webhook-Secret": "wrong"},
    )
    assert r.status_code == 401
