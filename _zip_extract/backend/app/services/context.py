"""Customer context loading for calls and extraction."""

from ..db import conn, dict_row


def load_customer(customer_id: str) -> dict | None:
    with conn() as c:
        row = c.execute("SELECT * FROM customers WHERE id=?", (customer_id,)).fetchone()
    return dict_row(row) if row else None


def build_call_context(customer: dict) -> dict:
    """Compact context handed to the voice agent / LLM before a call."""
    return {
        "company_name": "Demo Bank",
        "customer_name": (customer.get("name") or "").split()[0] if customer.get("name") else "",
        "full_name": customer.get("name"),
        "phone": customer.get("phone"),
        "preferred_language": customer.get("preferred_language", "en"),
        "last_active_date": customer.get("last_active_date"),
        "last_event_type": customer.get("last_event_type"),
        "last_event_detail": customer.get("last_event_detail"),
        "last_event_date": customer.get("last_event_date"),
        "dormant_balance_ngn": customer.get("dormant_balance_ngn", 0),
    }
