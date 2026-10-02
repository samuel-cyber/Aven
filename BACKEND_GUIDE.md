# Aven — Backend Build Guide (for Freebuff)

This is the **build-this-now** file. `AVEN_README.md` explains the product; `BUILD_GUIDE.md`
explains the design. This file is the exact spec to hand to **Freebuff** so it writes the entire
backend, and the exact commands to prove each piece works.

**Scope: backend only.** No frontend, no dashboard, no voice code. Everything must be testable
with `curl` before a single real phone call exists.

**Rule for Freebuff:** build bottom-up, run the test at the end of each step, do not move on until
it passes. Never invent BimpeAI API fields — the BimpeAI call is isolated in one file behind a stub.

---

## 1. What gets built

```
aven/
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app, all routes, webhook orchestration
│   ├── config.py          # env vars in one place
│   ├── db.py              # sqlite connection + schema
│   ├── schemas.py         # pydantic: webhook payload, extraction, API responses
│   ├── services/
│   │   ├── extraction.py  # transcript -> structured JSON (LLM + fallback)
│   │   ├── actions.py     # structured JSON -> concrete recovery action
│   │   ├── context.py     # load customer context for the call
│   │   └── bimpeai.py     # outbound call client (STUB, documented TODO)
│   └── routes/
│       ├── customers.py
│       ├── calls.py
│       ├── webhooks.py
│       ├── insights.py
│       └── actions.py
├── data/
│   ├── seed_customers.json
│   ├── seed_calls.json
│   └── sample_webhook.json
├── scripts/
│   ├── seed.py
│   └── trigger_call.py
├── tests/
│   └── test_pipeline.py
├── requirements.txt
├── .env.example
└── aven.db                # gitignored, created at runtime
```

### Stack (fixed — do not substitute)

| Piece | Choice |
|---|---|
| Language | Python 3.11+ |
| API | FastAPI + Uvicorn |
| Validation | Pydantic v2 |
| DB | SQLite via stdlib `sqlite3`, no ORM |
| HTTP client | httpx |
| LLM | Anthropic SDK (`anthropic`), model from env |
| Tests | pytest + FastAPI TestClient |

`requirements.txt`:
```
fastapi
uvicorn[standard]
pydantic>=2
python-dotenv
httpx
anthropic
pytest
```

---

## 2. Rules Freebuff must follow

1. **Run it after every step.** Each section below ends with a command and an expected output.
   If it doesn't match, fix it before continuing.
2. **No ORM.** `sqlite3` with `row_factory = sqlite3.Row` only.
3. **No invented BimpeAI fields.** `services/bimpeai.py` is a stub with clearly marked TODOs.
   Nothing else in the codebase may reference BimpeAI specifics.
4. **Never crash on bad input.** Extraction failures return a "needs human review" record. The
   webhook always returns `200` fast; heavy work goes to a background task.
5. **All money is `float` NGN, all timestamps are ISO-8601 strings.** No timezone libraries.
6. **No auth, no users, no roles.** Out of scope for the demo.
7. **Every list/detail endpoint must work on an empty database** (return `[]` / `404`, never a 500).

---

## 3. Step 1 — Database (`app/db.py`)

Three tables, plus an `idempotency` guard so a retried webhook doesn't double-process a call.

```sql
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
```

`db.py` must expose: `conn()`, `init()`, `dict_row(row)`, and `reset()` (drops + recreates — used
only by the seed script).

**Verify:**
```bash
python -c "from app import db; db.init(); print(db.conn().execute('SELECT name FROM sqlite_master WHERE type=\"table\"').fetchall())"
```
→ prints the three table names, creates `aven.db`.

## 4. Step 2 — Config + schemas (`app/config.py`, `app/schemas.py`)

`config.py` reads `.env` once and exposes typed constants (`DB_PATH`, `LLM_API_KEY`, `LLM_MODEL`,
`WEBHOOK_SECRET`, `BIMPEAI_API_KEY`, `BIMPEAI_AGENT_ID`). Nothing else in the code may call
`os.getenv` directly.

`schemas.py` must define:

- `WebhookPayload` — `call_id`, `customer_id`, `transcript: str | list`, `duration_sec: int = 0`.
- `Extraction` — the LLM output contract:

```python
class Extraction(BaseModel):
    issue: Literal["failed_transfer","unexpected_fee","poor_ux","card_problem",
                   "kyc_block","fraud_report","no_need","other"]
    churn_reason: Literal["failed_transaction","fees","trust_security","bad_support",
                          "competitor","no_need","other"]
    reason_detail: str
    sentiment: Literal["positive","neutral","negative"]
    intent: Literal["willing_to_return","unsure","not_returning"]
    intent_to_return: Literal["yes","maybe","no"]
    urgency: Literal["low","medium","high"]
    recovery_possible: bool
    fraud_flag: bool = False
    fraud_detail: str | None = None
    recommended_action: Literal["retry_ticket","fee_waiver","reactivation_link",
                                "human_callback","fraud_escalation","none"]
    resolution_offered: Literal["retry_ticket","fee_waiver","reactivation_link",
                                "human_callback","none"]
    customer_accepted: bool
    follow_up_needed: bool
    summary: str
    recommended_product_fix: str
```

Also: `CustomerOut`, `CallOut`, `ActionOut`, `InsightOut`.

`FALLBACK` is a module-level `Extraction` used when extraction fails twice.

**Verify:** `python -c "from app.schemas import Extraction, FALLBACK; print(FALLBACK.issue)"` → `other`.

## 5. Step 3 — Extraction (`app/services/extraction.py`)

- Input: raw transcript (`str` or list of `{role, text}`) + the customer dict.
- Flatten a list transcript into `speaker: text` lines.
- One LLM call, system prompt demanding **raw JSON only, no markdown fences**, listing every key
  and its allowed values. Include two few-shot examples in the system prompt: one clean
  `failed_transfer` call, one `fraud_report` call.
- Parse → validate → on failure retry **once** → on second failure return `FALLBACK` and set
  `extraction_source="fallback"`.
- Strip ``` fences defensively.
- No API key configured → return `FALLBACK` immediately (this is how the whole pipeline gets tested
  offline).

**Verify:** feed the transcript from `data/sample_webhook.json` through it and print the result —
must be a valid `Extraction` with `issue="failed_transfer"`, `intent_to_return="yes"`,
`customer_accepted=True`.

## 6. Step 4 — Action engine (`app/services/actions.py`)

Pure rules, no LLM. Returns `(list_of_actions, new_customer_status)` and writes both to the DB.

```
fraud_flag                          -> fraud_escalation (urgent), customer status "escalated"
customer_accepted + retry_ticket    -> retry_ticket "Priority retry/reversal ticket opened for: <last_event_detail>"
customer_accepted + fee_waiver      -> fee_waiver "Fees waived for next 3 transactions"
customer_accepted + reactivation    -> reactivation_link "Reactivation link sent to <phone> (mock SMS)"
customer_accepted + human_callback  -> human_callback "Callback scheduled within 24 hours"
follow_up_needed, nothing above     -> human_callback "Follow-up needed; callback scheduled"
```

Status: `escalated` if fraud, else `recovered` if accepted and `intent_to_return != "no"`,
else `contacted`. Never downgrade an existing `escalated` customer.

Write the actions first, then the customer status, in one transaction.

**Verify:** unit-call `run_actions` with a fabricated `Extraction` for each branch; assert the
expected action rows and status.

## 7. Step 5 — Webhook + routes (`app/routes/*`, `app/main.py`)

`POST /webhooks/bimpeai`
- Optional shared-secret header check (`X-Webhook-Secret` vs `WEBHOOK_SECRET`; skip if unset).
- Validate with `WebhookPayload`; reject unknown customers with `404`.
- **Idempotent:** if `calls.id` already exists, return `{"ok": true, "duplicate": true}` without
  reprocessing.
- Push work to a `BackgroundTask` and return `{"ok": true}` in under a second.
- Background pipeline: load customer → insert call row → `extract()` → update call row →
  `run_actions()`.

Other endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | `{"status":"ok","db":"ok"}` |
| GET | `/customers` | list, filterable by `status`, paginated `limit`/`offset` |
| GET | `/customers/{id}` | customer + their calls + actions |
| GET | `/calls` | list, filterable by `customer_id`, `churn_reason`, `fraud_flag` |
| GET | `/calls/{id}` | full call incl. transcript, extraction fields, actions |
| GET | `/actions` | list, filterable by `customer_id`, `type`, `urgent` |
| POST | `/actions/{id}/resolve` | mark an action `done` |
| GET | `/insights` | see below |

`/insights` returns:
```json
{
  "kpi": {"contacted":0,"recovered":0,"escalated":0,"recovery_rate":0.0,
          "ngn_at_risk":0,"ngn_recovered":0,"open_actions":0,"open_escalations":0},
  "by_reason": [{"reason":"failed_transaction","calls":0,"ngn_at_risk":0,"recovered":0}],
  "by_issue":  [{"issue":"failed_transfer","calls":0}],
  "top_product_fixes": [{"fix":"...","calls":0}]
}
```
`recovery_rate` = recovered / contacted, `0.0` when contacted is 0.

CORS: allow all origins (the frontend will be built separately).

**Verify:** `uvicorn app.main:app --reload`, then `curl localhost:8000/health`.

## 8. Step 6 — Seed data + trigger script

`data/seed_customers.json` — **18** fictional Nigerian customers. Mix of `last_event_type`
(`failed_transfer` ×6, `fee_charge` ×4, `card_declined` ×4, `kyc_block` ×4). Realistic `phone`
(`+2348...`), `dormant_balance_ngn` between ₦5,000 and ₦400,000, `last_active_date` 20–90 days ago.
One demo customer with placeholder name/phone marked `"is_demo": true`.

`data/seed_calls.json` — **15** past calls with every extraction field already filled, spread
across reasons, skewed toward `failed_transaction`. Include 2 `fraud_flag` calls. Dates relative
to today.

`scripts/seed.py` — calls `db.reset()`, then loads both JSON files. **Re-runnable** (this is the
demo reset button). Prints a one-line summary.

`scripts/trigger_call.py <customer_id>` — loads the customer, builds the context payload, calls
`services/bimpeai.start_call()`, prints the result.

**Verify:** `python scripts/seed.py` then `curl localhost:8000/insights` → non-zero KPIs.

## 9. Step 7 — BimpeAI stub (`app/services/bimpeai.py`)

This is the **only** file that knows BimpeAI exists. Freebuff writes it with:

- `start_call(customer_id: str, context: dict) -> dict`
- Auth from `config.BIMPEAI_API_KEY`, agent id from `config.BIMPEAI_AGENT_ID`
- `OUTBOUND_URL = None` with a TODO pointing at `docs.bimpe.ai`
- When `OUTBOUND_URL` is unset: log the payload that *would* have been sent and return
  `{"status": "stubbed", "payload": {...}}`
- Never crash on a missing key
- A docstring listing exactly what must be confirmed from the docs: outbound endpoint + auth
  scheme, metadata/variable support, webhook payload shape, retry semantics

When the real docs land, **only this file changes** — plus the `WebhookPayload` field names if the
real callback differs.

## 10. Step 8 — Tests (`tests/test_pipeline.py`)

pytest, using a temp DB path. Required cases:

1. `/health` returns ok.
2. Empty DB: `/customers`, `/calls`, `/actions`, `/insights` all return 200 with empty/zero values.
3. Happy path — POST the sample webhook → poll or call the pipeline synchronously → assert: call row
   has `issue="failed_transfer"`, `intent_to_return="yes"`, `customer_accepted=1`; one `retry_ticket`
   action exists; customer status is `recovered`.
4. Fraud path — transcript "someone called me and took my money" (LLM stubbed to `FALLBACK`/fixture)
   → `fraud_flag=1`, customer `escalated`, one `urgent` `fraud_escalation` action.
5. Angry customer who refuses → status `contacted`, no action, `follow_up_needed=0` path is fine.
6. Duplicate webhook with the same `call_id` → `{"duplicate": true}`, no second call row, no second
   action row.
7. Unknown `customer_id` → 404.
8. Extraction failure → `extraction_source="fallback"`, `follow_up_needed=1`, pipeline still
   completes and the customer is still updated.

LLM is monkeypatched in tests — **the test suite must pass with no API key and no network.**

**Verify:** `pytest -q` → all green.

---

## 11. Runbook

```bash
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # fill in what you have
python scripts/seed.py
uvicorn app.main:app --reload
pytest -q
```

`.env.example`:
```env
DB_PATH=aven.db
WEBHOOK_SECRET=dev-secret
LLM_API_KEY=
LLM_MODEL=
BIMPEAI_API_KEY=
BIMPEAI_AGENT_ID=
BIMPEAI_PHONE_NUMBER=
```

## 12. Definition of done

The backend is done when, on a machine with **no API keys and no BimpeAI access**:

```bash
python scripts/seed.py && uvicorn app.main:app &
curl -s localhost:8000/health
curl -s -X POST localhost:8000/webhooks/bimpeai \
  -H "Content-Type: application/json" -d @data/sample_webhook.json
curl -s localhost:8000/insights
pytest -q
```

...produces a `{"ok": true}`, an updated `/insights` payload reflecting the new call, and a green
test suite. When that holds, the backend is finished and the only remaining unknown is the real
BimpeAI webhook shape.

---

## 13. Guardrails recap (put these in the Freebuff prompt verbatim)

- Backend only — no dashboard, no frontend, no voice, no auth.
- Build in the step order above; run each step's verify command before continuing.
- `sqlite3` + FastAPI + Pydantic v2. No ORM, no Alembic, no Docker, no Postgres.
- All BimpeAI uncertainty lives in `app/services/bimpeai.py` and comments marked TODO.
- Tests must pass offline with no API key.
- Nothing may 500 on empty data.
- Keep every file small and readable; no clever abstractions.
