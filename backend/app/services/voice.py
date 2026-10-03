"""Voice orchestration: trigger a BimpeAI call, then pull the transcript back.

BimpeAI does not POST a webhook body by default — the Console API exposes call
logs, including the transcript (``conversation_logs``). This service closes the
loop without a public URL:

    start_voice_call()   POST /agents/{id}/calls  -> call_id
    sync_voice_call()    poll GET /agents/{id}/calls/{call_id} until "ended"
                         -> flatten conversation_logs -> run the shared pipeline

If you *do* configure a post-call webhook in BimpeAI, point it at
``POST /webhooks/bimpeai`` and send ``call_id``/``customer_id`` (native
``conversation_logs`` are accepted too). Both paths call the same pipeline.
"""

from __future__ import annotations

from . import bimpeai
from .context import build_call_context, load_customer
from ..db import conn
from ..routes.webhooks import run_pipeline


def start_voice_call(
    customer_id: str,
    *,
    is_test_call: bool | None = None,
    destination: str | None = None,
) -> dict:
    """Start an outbound BimpeAI call for a customer.

    ``destination`` overrides the dialled number (e.g. your own phone) so you
    can test the agent without changing the customer record.

    Returns a JSON-safe dict describing the call. Never raises for a missing
    API key: the result status is ``"stubbed"`` in that case.
    """
    customer = load_customer(customer_id)
    if customer is None:
        return {"ok": False, "error": "customer not found", "customer_id": customer_id}

    context = build_call_context(customer)
    result = bimpeai.start_call(
        customer_id, context, is_test_call=is_test_call, destination=destination
    )

    return {
        "ok": result.get("status") in {"initiated", "stubbed"},
        "customer_id": customer_id,
        "call_id": result.get("call_id"),
        "status": result.get("status"),
        "detail": result.get("detail"),
        "is_test_call": result.get("is_test_call"),
        "destination": result.get("payload", {}).get("destination"),
        "poll_url": (
            f"/voice/customers/{customer_id}/calls/{result['call_id']}/sync"
            if result.get("call_id")
            else None
        ),
    }


def _call_already_processed(call_id: str) -> bool:
    with conn() as c:
        row = c.execute(
            "SELECT extraction_source FROM calls WHERE id = ?", (call_id,)
        ).fetchone()
    return row is not None and row["extraction_source"] is not None


def sync_voice_call(customer_id: str, call_id: str, *, wait: bool = True) -> dict:
    """Fetch a call's transcript and run the recovery pipeline on it.

    ``wait=True`` polls until the call ends (bounded by BIMPEAI_WAIT_TIMEOUT).
    ``wait=False`` fetches once — useful on a webhook or a polling frontend.
    Idempotent: a call already processed is not extracted/actioned twice.
    """
    customer = load_customer(customer_id)
    if customer is None:
        return {"ok": False, "error": "customer not found", "customer_id": customer_id}

    if _call_already_processed(call_id):
        return {"ok": True, "customer_id": customer_id, "call_id": call_id, "already_processed": True}

    detail = bimpeai.wait_for_call(call_id) if wait else bimpeai.get_call(call_id)
    status = detail.get("status")
    transcript = bimpeai.transcript_from_call(detail)

    if not transcript:
        return {
            "ok": False,
            "customer_id": customer_id,
            "call_id": call_id,
            "status": status,
            "processed": False,
            "error": "no transcript yet",
        }

    duration = detail.get("duration_seconds") or 0
    run_pipeline(call_id, customer_id, transcript, duration, status="completed")

    return {
        "ok": True,
        "customer_id": customer_id,
        "call_id": call_id,
        "status": status,
        "processed": True,
        "duration_sec": duration,
        "transcript_messages": len(detail.get("conversation_logs") or []),
    }


def voice_context(customer_id: str) -> dict | None:
    """The exact variable payload a BimpeAI agent needs before calling."""
    customer = load_customer(customer_id)
    if customer is None:
        return None
    return build_call_context(customer)


def voice_status() -> dict:
    """Small health view for the voice layer (no secrets exposed)."""
    from .. import config

    return {
        "configured": bimpeai.is_configured(),
        "base_url": config.BIMPEAI_BASE_URL,
        "api_path": config.BIMPEAI_API_PATH,
        "agent_id": (config.BIMPEAI_AGENT_ID[:6] + "...") if config.BIMPEAI_AGENT_ID else None,
        "is_test_call": config.BIMPEAI_IS_TEST_CALL,
        "has_phone_number": bool(config.BIMPEAI_PHONE_NUMBER),
    }
