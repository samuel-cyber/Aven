"""Transcript -> structured Extraction. One LLM call, validate, retry once, then FALLBACK.

This is the only service that talks to the LLM. With no LLM_API_KEY configured it
returns FALLBACK immediately, which is how the whole pipeline gets tested offline.
"""

import json
import os

from .. import config
from ..schemas import Extraction, FALLBACK

try:
    import anthropic

    _HAS_ANTHROPIC = True
except ImportError:  # pragma: no cover - anthropic is in requirements, be safe anyway
    anthropic = None
    _HAS_ANTHROPIC = False

SYSTEM = """You analyse customer-care call transcripts for a Nigerian fintech.
Return ONLY a JSON object, no prose and no markdown fences, with exactly these keys:
issue (failed_transfer|unexpected_fee|poor_ux|card_problem|kyc_block|fraud_report|no_need|other),
churn_reason (failed_transaction|fees|trust_security|bad_support|competitor|no_need|other),
reason_detail (one sentence),
sentiment (positive|neutral|negative),
intent (willing_to_return|unsure|not_returning),
intent_to_return (yes|maybe|no),
urgency (low|medium|high),
recovery_possible (bool),
fraud_flag (bool),
fraud_detail (string or null),
recommended_action (retry_ticket|fee_waiver|reactivation_link|human_callback|fraud_escalation|none),
resolution_offered (retry_ticket|fee_waiver|reactivation_link|human_callback|none),
customer_accepted (bool),
follow_up_needed (bool),
summary (2-3 sentences for a human reviewer),
recommended_product_fix (one sentence for the product team).

Example 1 — failed transfer the customer wants fixed:
{"issue": "failed_transfer", "churn_reason": "failed_transaction",
 "reason_detail": "A 25000 NGN transfer failed twice and the debit was never reversed.",
 "sentiment": "negative", "intent": "willing_to_return", "intent_to_return": "yes",
 "urgency": "medium", "recovery_possible": true, "fraud_flag": false, "fraud_detail": null,
 "recommended_action": "retry_ticket", "resolution_offered": "retry_ticket",
 "customer_accepted": true, "follow_up_needed": false,
 "summary": "Customer left after a failed transfer that debited them without a reversal.",
 "recommended_product_fix": "Auto-reverse failed-transfer debits within 24 hours."}

Example 2 — customer reports unauthorised activity:
{"issue": "fraud_report", "churn_reason": "trust_security",
 "reason_detail": "Customer reports an unauthorised debit after a scam call.",
 "sentiment": "negative", "intent": "unsure", "intent_to_return": "maybe",
 "urgency": "high", "recovery_possible": true, "fraud_flag": true,
 "fraud_detail": "Unauthorised 40000 NGN debit after sharing a code with a scam caller.",
 "recommended_action": "fraud_escalation", "resolution_offered": "human_callback",
 "customer_accepted": true, "follow_up_needed": true,
 "summary": "Customer lost money to what looks like social-engineering fraud and froze the account.",
 "recommended_product_fix": "Add in-app fraud alerts and a one-tap account freeze."}

Set fraud_flag true if the customer reports someone took money, scam calls, or
unauthorised access. Never ask about or collect PINs, OTPs or passwords; base
everything only on the transcript."""

FENCE_STARTS = ("```json", "```JSON", "```")


def _log(message: str) -> None:
    """Print a diagnostic without ever raising (Windows consoles are cp1252)."""
    try:
        print(message)
    except Exception:  # noqa: BLE001 - logging must never break the pipeline
        try:
            print(message.encode("ascii", "replace").decode("ascii"))
        except Exception:  # noqa: BLE001
            pass


def _clean(text: str) -> str:
    t = text.strip()
    for start in FENCE_STARTS:
        if t.startswith(start):
            t = t[len(start):]
            break
    if t.endswith("```"):
        t = t[: -len("```")]
    return t.strip()


def _flatten(transcript) -> str:
    """Flatten a transcript into ``speaker: text`` lines.

    Handles both our internal ``{role, text}`` shape and BimpeAI's native
    ``conversation_logs`` entries (``{role, message}``), mapping the roles
    "assistant"/"user" to "agent"/"customer" for readability.
    """
    if isinstance(transcript, str):
        return transcript
    role_map = {"assistant": "agent", "user": "customer"}
    lines: list[str] = []
    for m in transcript:
        if not isinstance(m, dict):
            continue
        role = role_map.get(m.get("role", "?"), m.get("role", "?"))
        text = m.get("text")
        if text is None:
            text = m.get("message", "")
        lines.append(f"{role}: {text}")
    return "\n".join(lines)


def extract(transcript, customer: dict) -> Extraction:
    """Extract a structured result. Never raises: falls back after one retry."""
    text = _flatten(transcript)
    if not config.LLM_API_KEY or not _HAS_ANTHROPIC:
        return FALLBACK
    user = f"Customer context: {json.dumps(customer)}\n\nTranscript:\n{text}"
    # Pin the endpoint explicitly: a stray global ANTHROPIC_BASE_URL would
    # otherwise silently redirect extraction to an unrelated relay/proxy.
    headers = {}
    if config.LLM_WORKSPACE_ID:
        headers["anthropic-workspace-id"] = config.LLM_WORKSPACE_ID
    try:
        client = anthropic.Anthropic(
            api_key=config.LLM_API_KEY,
            base_url=config.LLM_BASE_URL or "https://api.anthropic.com",
            default_headers=headers or None,
        )
    except Exception:
        return FALLBACK
    for _ in range(2):
        try:
            msg = client.messages.create(
                model=config.LLM_MODEL,
                max_tokens=800,
                system=SYSTEM,
                messages=[{"role": "user", "content": user}],
            )
            return Extraction.model_validate_json(_clean(msg.content[0].text))
        except Exception as e:  # noqa: BLE001 - any failure -> retry once -> fallback
            _log(f"extract retry: {type(e).__name__}: {e}")
    return FALLBACK
