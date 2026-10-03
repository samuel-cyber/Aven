"""BimpeAI post-call webhook + background pipeline orchestration.

The pipeline itself (store call -> extract -> run actions) is exposed as
``run_pipeline`` so both this webhook and the voice orchestrator
(``services/voice.py``) share exactly one implementation.
"""

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

from .. import config, db
from ..schemas import WebhookPayload
from ..services import bimpeai, extraction
from ..services.actions import run_actions
from ..services.context import load_customer

router = APIRouter()


def _resolve_transcript(p: WebhookPayload) -> str:
    """Pick the transcript from a plain payload or native BimpeAI CallDetail."""
    if p.transcript is not None:
        if isinstance(p.transcript, str):
            return p.transcript
        return extraction._flatten(p.transcript)
    if p.conversation_logs:
        return bimpeai.conversation_to_transcript(p.conversation_logs)
    return ""


def run_pipeline(
    call_id: str,
    customer_id: str,
    transcript: str,
    duration_sec: int = 0,
    *,
    status: str = "completed",
):
    """Store a call, extract structured insight, then run the action engine.

    Never raises: extraction failures become a "needs human review" record so a
    demo never breaks. Returns ``(extraction, source)``.
    """
    customer = load_customer(customer_id) or {}

    try:
        ex = extraction.extract(transcript, customer)
    except Exception as e:  # noqa: BLE001
        print(f"[pipeline] extraction failed for call {call_id}: {e}")
        ex = extraction.FALLBACK
    source = "fallback" if ex is extraction.FALLBACK else "llm"

    with db.conn() as c:
        c.execute(
            """
            INSERT OR REPLACE INTO calls(
              id, customer_id, status, transcript, duration_sec,
              churn_reason, reason_detail, issue, sentiment, intent_to_return,
              urgency, recovery_possible, fraud_flag, fraud_detail,
              resolution_offered, customer_accepted, follow_up_needed,
              summary, recommended_product_fix, extraction_source
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                call_id,
                customer_id,
                status,
                transcript,
                duration_sec,
                ex.churn_reason,
                ex.reason_detail,
                ex.issue,
                ex.sentiment,
                ex.intent_to_return,
                ex.urgency,
                int(ex.recovery_possible),
                int(ex.fraud_flag),
                ex.fraud_detail,
                ex.resolution_offered,
                int(ex.customer_accepted),
                int(ex.follow_up_needed),
                ex.summary,
                ex.recommended_product_fix,
                source,
            ),
        )

    run_actions(call_id, customer_id, ex, customer)
    return ex, source


def process_call_payload(p: WebhookPayload) -> None:
    """Background task entrypoint for the webhook. Never raises."""
    try:
        transcript = _resolve_transcript(p)
        duration = p.duration_sec or p.duration_seconds or 0
        run_pipeline(p.call_id, p.customer_id, transcript, duration)
    except Exception as e:  # noqa: BLE001 - webhook processing must never crash the app
        print(f"[webhook] processing failed for call {p.call_id}: {e}")


@router.post("/webhooks/bimpeai")
def bimpeai_webhook(
    p: WebhookPayload,
    bg: BackgroundTasks,
    x_webhook_secret: str = Header(default=""),
):
    if config.WEBHOOK_SECRET and x_webhook_secret != config.WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="bad secret")

    with db.conn() as c:
        row = c.execute("SELECT id FROM customers WHERE id = ?", (p.customer_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="customer not found")

    with db.conn() as c:
        existing = c.execute("SELECT id FROM calls WHERE id = ?", (p.call_id,)).fetchone()
    if existing is not None:
        return {"ok": True, "duplicate": True}

    bg.add_task(process_call_payload, p)
    return {"ok": True}
