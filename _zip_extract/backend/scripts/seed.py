"""Seed the demo database. Re-runnable — this is the demo reset button."""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _date(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def seed() -> None:
    db.reset()

    customers = json.loads((DATA_DIR / "seed_customers.json").read_text(encoding="utf-8"))
    calls = json.loads((DATA_DIR / "seed_calls.json").read_text(encoding="utf-8"))

    with db.conn() as c:
        for cu in customers:
            c.execute(
                """
                INSERT INTO customers(
                  id, name, phone, preferred_language, last_active_date,
                  dormant_balance_ngn, est_monthly_value_ngn,
                  last_event_type, last_event_detail, last_event_date, status
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    cu["id"], cu["name"], cu["phone"],
                    cu.get("preferred_language", "en"),
                    _date(cu["days_inactive"]),
                    cu.get("dormant_balance_ngn", 0.0),
                    cu.get("est_monthly_value_ngn", 0.0),
                    cu.get("last_event_type"),
                    cu.get("last_event_detail"),
                    _date(cu["last_event_days_ago"]) if cu.get("last_event_days_ago") else None,
                    cu.get("status", "dormant"),
                ),
            )

        for ca in calls:
            c.execute(
                """
                INSERT INTO calls(
                  id, customer_id, status, transcript, duration_sec, created_at,
                  churn_reason, reason_detail, issue, sentiment, intent_to_return,
                  urgency, recovery_possible, fraud_flag, fraud_detail,
                  resolution_offered, customer_accepted, follow_up_needed,
                  summary, recommended_product_fix, extraction_source
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    ca["id"], ca["customer_id"], ca.get("status", "completed"),
                    ca.get("transcript"),
                    ca.get("duration_sec", 0),
                    (datetime.now(timezone.utc) - timedelta(days=ca["days_ago"])).isoformat(),
                    ca["churn_reason"], ca["reason_detail"], ca["issue"],
                    ca["sentiment"], ca["intent_to_return"], ca["urgency"],
                    ca.get("recovery_possible", 0), ca.get("fraud_flag", 0),
                    ca.get("fraud_detail"), ca.get("resolution_offered"),
                    ca.get("customer_accepted", 0), ca.get("follow_up_needed", 0),
                    ca["summary"], ca.get("recommended_product_fix"),
                    ca.get("extraction_source", "seed"),
                ),
            )

    print(
        f"Seeded {len(customers)} customers and {len(calls)} calls into {db.config.DB_PATH}"
    )


if __name__ == "__main__":
    seed()
