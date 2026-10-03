"""SQLite access layer. stdlib sqlite3 only — no ORM."""

import sqlite3

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_language TEXT DEFAULT 'en',
  last_active_date TEXT,
  dormant_balance_ngn REAL DEFAULT 0,
  est_monthly_value_ngn REAL DEFAULT 0,
  last_event_type TEXT,          -- failed_transfer | fee_charge | card_declined | kyc_block
  last_event_detail TEXT,
  last_event_date TEXT,
  status TEXT DEFAULT 'dormant'  -- dormant | contacted | recovered | escalated | follow_up
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  status TEXT DEFAULT 'completed',      -- queued | in_progress | completed | failed
  transcript TEXT,
  duration_sec INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  churn_reason TEXT,
  reason_detail TEXT,
  issue TEXT,
  sentiment TEXT,                       -- positive | neutral | negative
  intent_to_return TEXT,                -- yes | maybe | no
  urgency TEXT,                         -- low | medium | high
  recovery_possible INTEGER DEFAULT 0,
  fraud_flag INTEGER DEFAULT 0,
  fraud_detail TEXT,
  resolution_offered TEXT,
  customer_accepted INTEGER DEFAULT 0,
  follow_up_needed INTEGER DEFAULT 0,
  summary TEXT,
  recommended_product_fix TEXT,
  extraction_source TEXT                -- llm | fallback
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT,
  customer_id TEXT REFERENCES customers(id),
  type TEXT,                            -- retry_ticket | fee_waiver | reactivation_link | human_callback | fraud_escalation
  detail TEXT,
  status TEXT DEFAULT 'open',           -- open | done
  urgent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_calls_customer ON calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_actions_customer ON actions(customer_id);
"""


def conn() -> sqlite3.Connection:
    c = sqlite3.connect(config.DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    return c


def init() -> None:
    with conn() as c:
        c.executescript(SCHEMA)


def dict_row(row: sqlite3.Row) -> dict:
    return dict(row) if row is not None else {}


def reset() -> None:
    """Drop and recreate all tables. Used only by the seed script."""
    with conn() as c:
        c.executescript(
            """
            DROP TABLE IF EXISTS actions;
            DROP TABLE IF EXISTS calls;
            DROP TABLE IF EXISTS customers;
            """
        )
    init()
