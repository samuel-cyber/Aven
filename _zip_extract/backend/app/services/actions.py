"""Pure rule-based action engine (no LLM). Returns (actions, new_status) and writes both.

Rules (Step 6 of BACKEND_GUIDE.md):
  fraud_flag                          -> fraud_escalation (urgent), status "escalated"
  customer_accepted + retry_ticket    -> retry_ticket with last_event_detail
  customer_accepted + fee_waiver      -> fee_waiver for next 3 transactions
  customer_accepted + reactivation    -> reactivation_link (mock SMS)
  customer_accepted + human_callback  -> human_callback within 24 hours
  follow_up_needed, nothing above     -> human_callback "Follow-up needed"

Status: escalated if fraud, else recovered if accepted and intent_to_return != "no",
else contacted. Never downgrades an existing "escalated" customer.
"""

from ..db import conn


def decide_actions(ex, customer: dict) -> list[tuple[str, str, int]]:
    """Return [(type, detail, urgent)] for the given extraction. Pure function."""
    acts: list[tuple[str, str, int]] = []
    if ex.fraud_flag:
        detail = f"URGENT specialist callback: {ex.fraud_detail or 'suspected fraud reported on call'}"
        acts.append(("fraud_escalation", detail, 1))
    elif ex.customer_accepted:
        if ex.resolution_offered == "retry_ticket":
            acts.append(
                (
                    "retry_ticket",
                    f"Priority retry/reversal ticket opened for: {customer.get('last_event_detail')}",
                    0,
                )
            )
        elif ex.resolution_offered == "fee_waiver":
            acts.append(("fee_waiver", "Fees waived for next 3 transactions", 0))
        elif ex.resolution_offered == "reactivation_link":
            acts.append(
                (
                    "reactivation_link",
                    f"Reactivation link sent to {customer.get('phone')} (mock SMS)",
                    0,
                )
            )
        elif ex.resolution_offered == "human_callback":
            acts.append(("human_callback", "Callback scheduled within 24 hours", 0))
    if ex.follow_up_needed and not acts:
        acts.append(("human_callback", "Follow-up needed; callback scheduled", 0))
    return acts


def decide_status(ex) -> str:
    if ex.fraud_flag:
        return "escalated"
    if ex.customer_accepted and ex.intent_to_return != "no":
        return "recovered"
    return "contacted"


def run_actions(call_id: str, customer_id: str, ex, customer: dict):
    """Write action rows + update customer status in one transaction."""
    acts = decide_actions(ex, customer)
    status = decide_status(ex)

    with conn() as c:
        for t, d, u in acts:
            c.execute(
                "INSERT INTO actions(call_id, customer_id, type, detail, urgent) VALUES (?,?,?,?,?)",
                (call_id, customer_id, t, d, u),
            )
        c.execute(
            "UPDATE customers SET status=? WHERE id=? AND status!='escalated'",
            (status, customer_id),
        )
    return acts, status
