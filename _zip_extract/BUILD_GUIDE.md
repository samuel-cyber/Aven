# Aven: What We're Building and How

Companion to `AVEN_README.md`. The README explains the *why* and the pitch; this file explains **each component, how to build it, and how to know it's done**.

> ⚠️ BimpeAI specifics (outbound call API, webhook payload) are **assumptions** until you've read docs.bimpe.ai. Everything else is designed so it works without BimpeAI, so you can build and test the whole backend before the voice part is ready.

---

## 0. The system in one picture

```
[1] Voice Agent (BimpeAI) ──call ends──▶ [3] Webhook (FastAPI)
        ▲                                    │
        │ start call                         ├──▶ [4] Extraction (Claude → JSON)
[2] trigger_call.py                          ├──▶ [5] Actions engine
                                             └──▶ [6] SQLite
                                                      │
                                         [7] Insights ─▶ [8] Dashboard (Streamlit)
                                         [9] Seed data feeds 6, 7, 8
```

## 1. Components at a glance

| # | Component | What it does | Files | Owner | Est. time |
|---|---|---|---|---|---|
| 1 | Voice agent | Talks to the customer on the phone | `agent/system_prompt.md` + BimpeAI dashboard | A | 30 min |
| 2 | Call trigger | Starts an outbound call with customer context | `scripts/trigger_call.py` | A | 20 min |
| 3 | Webhook receiver | Gets the transcript when a call ends | `app/main.py` | A | 30 min |
| 4 | Extraction | Turns transcript into structured JSON | `app/extract.py`, `app/schemas.py` | A | 30 min |
| 5 | Actions engine | Does the fix (ticket, waiver, link, escalation) | `app/actions.py` | A | 30 min |
| 6 | Database | Stores customers, calls, actions | `app/db.py` | A | 20 min |
| 7 | Insights | Aggregates ₦ at risk, reasons, recovery rate | `app/main.py` (`/insights`) | B | 20 min |
| 8 | Dashboard | Live view for the demo | `dashboard/app.py` | B | 60 min |
| 9 | Seed data | Makes the dashboard look real | `data/*.json`, `scripts/seed.py` | B | 30 min |
| 10 | Demo harness | Rehearsal script, backup video | n/a | Both | 30 min |

If you're solo on the build, do them in the order in **section 3**.

## 2. Build order and checkpoints

Build the backend **first, without voice**. Then plug the voice agent in.

1. **Checkpoint 1: Backend works with a fake call.** `curl` a sample transcript to the webhook. The DB gets a call row, an action row, and the customer status changes.
2. **Checkpoint 2: Dashboard shows data.** Seeded data plus the fake call appear live.
3. **Checkpoint 3: Real call end to end.** A real phone call triggers the webhook and the dashboard updates.
4. **Checkpoint 4: Demo-ready.** Judge-name customer record created, dry run done, backup video recorded.

Don't start polish until checkpoint 3 passes.

---

## 3. Component details

### 3.1 Database (`app/db.py`)

SQLite, three tables, no ORM.

```python
import os, sqlite3

DB_PATH = os.getenv("DB_PATH", "aven.db")

def conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c

SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, name TEXT, phone TEXT, preferred_language TEXT DEFAULT 'en',
  last_active_date TEXT, dormant_balance_ngn REAL DEFAULT 0, est_monthly_value_ngn REAL DEFAULT 0,
  last_event_type TEXT, last_event_detail TEXT, last_event_date TEXT,
  status TEXT DEFAULT 'dormant'
);
CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY, customer_id TEXT, transcript TEXT, duration_sec INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  churn_reason TEXT, reason_detail TEXT, sentiment TEXT, intent_to_return TEXT,
  fraud_flag INTEGER DEFAULT 0, fraud_detail TEXT,
  resolution_offered TEXT, customer_accepted INTEGER DEFAULT 0, follow_up_needed INTEGER DEFAULT 0,
  summary TEXT, recommended_product_fix TEXT
);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, call_id TEXT, customer_id TEXT,
  type TEXT, detail TEXT, urgent INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

def init():
    with conn() as c:
        c.executescript(SCHEMA)
```

**Done when:** `python -c "from app import db; db.init()"` creates `aven.db`.

### 3.2 Schemas (`app/schemas.py`)

Validates both the incoming webhook and Claude's output.

```python
from typing import Literal, Optional, Union
from pydantic import BaseModel

class WebhookPayload(BaseModel):
    call_id: str
    customer_id: str
    transcript: Union[str, list]      # adapt to BimpeAI's real shape
    duration_sec: int = 0

class Extraction(BaseModel):
    churn_reason: Literal["failed_transaction","fees","trust_security","bad_support","competitor","no_need","other"]
    reason_detail: str
    sentiment: Literal["positive","neutral","negative"]
    intent_to_return: Literal["yes","maybe","no"]
    fraud_flag: bool = False
    fraud_detail: Optional[str] = None
    resolution_offered: Literal["retry_ticket","fee_waiver","reactivation_link","human_callback","none"]
    customer_accepted: bool
    follow_up_needed: bool
    summary: str
    recommended_product_fix: str
```

### 3.3 Extraction (`app/extract.py`)

One Claude call turns a messy transcript into the schema above. Strict JSON, validate, retry once, then fall back to a "needs human review" record so the pipeline never crashes during the demo.

```python
import os, json, anthropic
from .schemas import Extraction

client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY
MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")

SYSTEM = """You analyse customer-care call transcripts for a Nigerian fintech.
Return ONLY a JSON object, no prose and no markdown fences, with exactly these keys:
churn_reason (failed_transaction|fees|trust_security|bad_support|competitor|no_need|other),
reason_detail (one sentence), sentiment (positive|neutral|negative),
intent_to_return (yes|maybe|no), fraud_flag (bool), fraud_detail (string or null),
resolution_offered (retry_ticket|fee_waiver|reactivation_link|human_callback|none),
customer_accepted (bool), follow_up_needed (bool),
summary (2-3 sentences for a human reviewer),
recommended_product_fix (one sentence for the product team).
Set fraud_flag true if the customer reports someone took money, scam calls, or unauthorised access.
Base everything only on the transcript."""

FALLBACK = dict(churn_reason="other", reason_detail="Extraction failed; review transcript.",
    sentiment="neutral", intent_to_return="maybe", fraud_flag=False, fraud_detail=None,
    resolution_offered="human_callback", customer_accepted=False, follow_up_needed=True,
    summary="Automatic analysis failed. Please review the transcript manually.",
    recommended_product_fix="n/a")

def _clean(t: str) -> str:
    t = t.strip()
    if t.startswith("```"):
        t = t.split("```")[1].removeprefix("json").strip()
    return t

def extract(transcript, customer: dict) -> Extraction:
    if isinstance(transcript, list):
        transcript = "\n".join(f"{m.get('role','?')}: {m.get('text','')}" for m in transcript)
    user = f"Customer context: {json.dumps(customer)}\n\nTranscript:\n{transcript}"
    for _ in range(2):
        try:
            msg = client.messages.create(model=MODEL, max_tokens=800, system=SYSTEM,
                                         messages=[{"role": "user", "content": user}])
            return Extraction.model_validate_json(_clean(msg.content[0].text))
        except Exception as e:
            print("extract retry:", e)
    return Extraction(**FALLBACK)
```

**Done when:** feeding it the sample transcript in section 4 returns a valid `Extraction`.

### 3.4 Actions engine (`app/actions.py`)

Rule-based, deliberately simple, and it's what makes the demo "fix on the call". Each action is a DB record (mock the real systems; say so in the pitch).

```python
from .db import conn

def run_actions(call_id: str, customer_id: str, ex, customer: dict):
    acts = []
    if ex.fraud_flag:
        acts.append(("fraud_escalation", f"URGENT specialist callback: {ex.fraud_detail}", 1))
    elif ex.customer_accepted:
        if ex.resolution_offered == "retry_ticket":
            acts.append(("retry_ticket", f"Priority retry/reversal ticket opened for: {customer.get('last_event_detail')}", 0))
        elif ex.resolution_offered == "fee_waiver":
            acts.append(("fee_waiver", "Fees waived for next 3 transactions", 0))
        elif ex.resolution_offered == "reactivation_link":
            acts.append(("reactivation_link", f"Reactivation link sent to {customer.get('phone')} (mock SMS)", 0))
        elif ex.resolution_offered == "human_callback":
            acts.append(("human_callback", "Callback scheduled within 24 hours", 0))
    if ex.follow_up_needed and not ex.fraud_flag and not acts:
        acts.append(("human_callback", "Follow-up needed; callback scheduled", 0))

    if ex.fraud_flag:
        status = "escalated"
    elif ex.customer_accepted and ex.intent_to_return != "no":
        status = "recovered"
    else:
        status = "contacted"

    with conn() as c:
        for t, d, u in acts:
            c.execute("INSERT INTO actions(call_id,customer_id,type,detail,urgent) VALUES (?,?,?,?,?)",
                      (call_id, customer_id, t, d, u))
        c.execute("UPDATE customers SET status=? WHERE id=?", (status, customer_id))
    return acts, status
```

### 3.5 Webhook receiver (`app/main.py`)

Respond fast, process in the background so the voice platform doesn't time out.

```python
import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, BackgroundTasks, Header, HTTPException
from .schemas import WebhookPayload
from . import db
from .extract import extract
from .actions import run_actions

app = FastAPI(title="Aven")
db.init()

def process(p: WebhookPayload):
    with db.conn() as c:
        row = c.execute("SELECT * FROM customers WHERE id=?", (p.customer_id,)).fetchone()
    customer = dict(row) if row else {}
    ex = extract(p.transcript, customer)
    transcript_text = p.transcript if isinstance(p.transcript, str) else str(p.transcript)
    with db.conn() as c:
        c.execute("""INSERT OR REPLACE INTO calls(id,customer_id,transcript,duration_sec,churn_reason,reason_detail,
            sentiment,intent_to_return,fraud_flag,fraud_detail,resolution_offered,customer_accepted,
            follow_up_needed,summary,recommended_product_fix) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (p.call_id, p.customer_id, transcript_text, p.duration_sec, ex.churn_reason, ex.reason_detail,
             ex.sentiment, ex.intent_to_return, int(ex.fraud_flag), ex.fraud_detail, ex.resolution_offered,
             int(ex.customer_accepted), int(ex.follow_up_needed), ex.summary, ex.recommended_product_fix))
    run_actions(p.call_id, p.customer_id, ex, customer)

@app.post("/webhooks/bimpeai")
def webhook(p: WebhookPayload, bg: BackgroundTasks, x_webhook_secret: str = Header(default="")):
    if os.getenv("WEBHOOK_SECRET") and x_webhook_secret != os.getenv("WEBHOOK_SECRET"):
        raise HTTPException(401, "bad secret")
    bg.add_task(process, p)
    return {"ok": True}

@app.get("/insights")
def insights():
    with db.conn() as c:
        by_reason = [dict(r) for r in c.execute("""
            SELECT ca.churn_reason AS reason, COUNT(*) AS calls,
                   COALESCE(SUM(cu.dormant_balance_ngn),0) AS ngn_at_risk
            FROM calls ca JOIN customers cu ON cu.id=ca.customer_id
            GROUP BY ca.churn_reason ORDER BY ngn_at_risk DESC""")]
        kpi = dict(c.execute("""
            SELECT COUNT(*) AS contacted,
              SUM(CASE WHEN status='recovered' THEN 1 ELSE 0 END) AS recovered,
              SUM(CASE WHEN status='escalated' THEN 1 ELSE 0 END) AS escalated,
              COALESCE(SUM(CASE WHEN status='recovered' THEN dormant_balance_ngn END),0) AS ngn_recovered,
              COALESCE(SUM(dormant_balance_ngn),0) AS ngn_dormant_total
            FROM customers WHERE status!='dormant'""").fetchone())
    return {"by_reason": by_reason, "kpi": kpi}
```

Add `/customers`, `/calls` if you want the dashboard to go through the API. Reading SQLite directly is fine for a hackathon.

**Done when:** the curl test in section 4 returns `{"ok": true}` and the DB shows the call.

### 3.6 Call trigger (`scripts/trigger_call.py`)

Starts an outbound call for a customer and passes their context to the agent.

> ⚠️ **Assumption.** Replace the URL, auth and body with whatever docs.bimpe.ai specifies. Keep the idea: pass `customer_id` as metadata so the webhook can link the call back, and pass variables for the prompt.

```python
import os, sys, httpx, sqlite3
from dotenv import load_dotenv
load_dotenv()

def start(customer_id: str):
    c = sqlite3.connect(os.getenv("DB_PATH", "aven.db")); c.row_factory = sqlite3.Row
    cu = dict(c.execute("SELECT * FROM customers WHERE id=?", (customer_id,)).fetchone())
    payload = {
        "agent_id": os.getenv("BIMPE_AGENT_ID"),
        "to": cu["phone"],
        "metadata": {"customer_id": customer_id},
        "variables": {
            "company_name": "Demo Bank",
            "customer_name": cu["name"].split()[0],
            "last_active_date": cu["last_active_date"],
            "last_event_detail": cu["last_event_detail"],
            "last_event_date": cu["last_event_date"],
        },
    }
    r = httpx.post("https://<BIMPEAI_OUTBOUND_ENDPOINT>",   # TODO from docs
                   headers={"Authorization": f"Bearer {os.getenv('BIMPE_API_KEY')}"},
                   json=payload, timeout=30)
    print(r.status_code, r.text)

if __name__ == "__main__":
    start(sys.argv[1])
```

**Fallback:** if the API isn't available, start the call from the BimpeAI dashboard (test call) and type the context into the agent's variables by hand. The webhook side is unchanged.

### 3.7 Voice agent (BimpeAI dashboard)

Not code. Configure and test.

1. Create the agent from a **clone** of the closest Agent Library template (collections or outbound follow-up).
2. Paste the prompt from the README's Voice Agent Personality and Important Conversation Behaviors sections into the system prompt. Use `{{variables}}` as the platform supports.
3. Choose a **YarnGPT** voice with a warm, calm tone.
4. Set the **post-call webhook** to `https://<ngrok>/webhooks/bimpeai` (and the secret header if supported).
5. Test-call your own phone **three times** with different personas: cooperative, angry, and one who says "someone called me and took my money".

**Done when:** all three calls complete, the agent never asks for PIN/OTP, and the webhook receives a transcript.

### 3.8 Seed data (`scripts/seed.py`, `data/*.json`)

- 15-20 customers across the event types:

| last_event_type | Example detail |
|---|---|
| failed_transfer | ₦25,000 transfer to GTBank failed, debited but not reversed |
| fee_charge | ₦1,075 charged on a ₦20,000 transfer |
| card_declined | Card declined 3 times at POS in Ikeja |
| kyc_block | Account restricted pending BVN update |

- 15 past calls with extracted fields filled in, spread across reasons. Skew toward `failed_transaction` (the "top fix" story) and include 1-2 `fraud_flag` calls.
- One **demo customer** with the judge's name and number, created at the venue after you meet them.
- Dates relative to now, so "dormant for 30+ days" is true.

Script: `db.init()`, then insert customers and calls from JSON. It must be re-runnable (`DELETE` first), so you can reset the demo.

### 3.9 Dashboard (`dashboard/app.py`)

Streamlit, reading SQLite directly, auto-refreshing every 3 seconds.

```python
import os, sqlite3, pandas as pd, streamlit as st

DB = os.getenv("DB_PATH", "aven.db")
st.set_page_config(page_title="Aven", layout="wide")
st.title("Aven: dormant customer recovery")

def q(sql):
    with sqlite3.connect(DB) as c:
        return pd.read_sql_query(sql, c)

@st.fragment(run_every=3)
def live():
    kpi = q("""SELECT COUNT(*) contacted,
        SUM(status='recovered') recovered, SUM(status='escalated') escalated,
        COALESCE(SUM(CASE WHEN status='recovered' THEN dormant_balance_ngn END),0) ngn_recovered
        FROM customers WHERE status!='dormant'""").iloc[0]
    total = q("SELECT COALESCE(SUM(dormant_balance_ngn),0) v FROM customers").iloc[0]["v"]
    a, b, c, d, e = st.columns(5)
    a.metric("Customers called", int(kpi.contacted))
    b.metric("Recovered", int(kpi.recovered or 0))
    c.metric("Urgent escalations", int(kpi.escalated or 0))
    d.metric("₦ dormant total", f"₦{total:,.0f}")
    e.metric("₦ recovered", f"₦{kpi.ngn_recovered:,.0f}")

    left, right = st.columns(2)
    reasons = q("""SELECT ca.churn_reason reason, COUNT(*) calls,
        SUM(cu.dormant_balance_ngn) ngn_at_risk FROM calls ca
        JOIN customers cu ON cu.id=ca.customer_id GROUP BY reason ORDER BY ngn_at_risk DESC""")
    with left:
        st.subheader("₦ at risk by churn reason")
        if not reasons.empty:
            st.bar_chart(reasons.set_index("reason")["ngn_at_risk"])
            top = reasons.iloc[0]
            fix = q(f"SELECT recommended_product_fix f FROM calls WHERE churn_reason='{top.reason}' "
                    "ORDER BY created_at DESC LIMIT 1")
            st.info(f"**Top fix to ship:** {top.reason.replace('_',' ')} (₦{top.ngn_at_risk:,.0f} at risk). "
                    f"{fix.iloc[0].f if not fix.empty else ''}")
    with right:
        st.subheader("Live call feed")
        feed = q("""SELECT cu.name, ca.sentiment, ca.churn_reason, ca.summary, ca.created_at
                    FROM calls ca JOIN customers cu ON cu.id=ca.customer_id
                    ORDER BY ca.created_at DESC LIMIT 6""")
        for _, r in feed.iterrows():
            st.markdown(f"**{r['name']}**: {r.churn_reason.replace('_',' ')} · {r.sentiment}  \n{r.summary}")

    st.subheader("Actions taken")
    st.dataframe(q("""SELECT a.created_at, cu.name, a.type, a.detail,
        CASE a.urgent WHEN 1 THEN 'URGENT' ELSE '' END flag
        FROM actions a JOIN customers cu ON cu.id=a.customer_id ORDER BY a.created_at DESC LIMIT 10"""),
        use_container_width=True, hide_index=True)

live()
```

Run: `streamlit run dashboard/app.py`. Set a wide browser window, zoom to about 110%, and use dark mode for the projector.

**Done when:** a curl'd fake call appears in the feed and the numbers change within 3 seconds.

---

## 4. Testing without a real call

Sample payload (`data/sample_webhook.json`):

```json
{
  "call_id": "test-001",
  "customer_id": "cust_001",
  "duration_sec": 118,
  "transcript": "agent: Hello Tunde, this is Ada, an AI assistant from Demo Bank. This call may be recorded. Is now a good time?\ncustomer: Yeah, go ahead.\nagent: I noticed your ₦25,000 transfer on 12 September failed. Is that what stopped you using the app?\ncustomer: Yes, they debited me and the money never reached my guy. I've not seen the refund since.\nagent: I'm really sorry about that. I can open a priority reversal ticket right now. Would that help?\ncustomer: Please do. If it's sorted I'll come back.\nagent: Done. You'll get an update within 24 hours. Thanks, Tunde."
}
```

```bash
curl -X POST http://localhost:8000/webhooks/bimpeai \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
  -d @data/sample_webhook.json
```

Expected result: call row with `failed_transaction`, `retry_ticket`, `customer_accepted=1`, an action "Priority retry/reversal ticket opened...", and customer `cust_001` marked `recovered`.

Also test these transcripts: (a) angry customer who refuses (→ `contacted`, callback), (b) "someone called me and took my money" (→ `fraud_flag`, `escalated`, urgent action).

## 5. Demo-day setup

- **Two laptops/tabs:** dashboard on the projector, terminal with the FastAPI logs on your own screen.
- **Phone:** the judge's phone for the live call. Have a second backup phone ready.
- **Network:** phone hotspot as backup; start ngrok early and update the webhook URL in BimpeAI.
- **Reset script:** `python scripts/seed.py` restores a clean state in seconds.
- **Backup video:** record one successful full run (call, dashboard update).
- **Demo customer:** create the judge's record with a plausible failed-transfer event just before they go up (name + number only).

## 6. Team split and timeline

| Time | Builder A (voice + backend) | Builder B (dashboard + demo) |
|---|---|---|
| Tonight | BimpeAI account, test calls, confirm API | Join group, find teammate, draft seed data |
| 2:00-4:00 PM | DB, schemas, webhook, extraction | Seed script, dashboard skeleton |
| 5:40-6:20 PM | Actions, wire real call → webhook | KPI + reasons chart, feed |
| 6:20-7:00 PM | Fix issues from real calls, fraud path | "Top fix" panel, polish, demo script |
| 7:00-7:30 PM | Dry run on real phone | Dry run, backup video |
| 7:30-7:40 PM | Freeze everything | Rehearse pitch |

Solo? Follow the same order and skip anything after checkpoint 3 that isn't needed for the demo.

## 7. Who builds what

- **Freebuff builds the backend** from `BACKEND_GUIDE.md` — that file is the step-by-step spec with a verify command per step. Point it there, not at this design doc.
- **Claude Code tests and reviews** once the backend exists: run `pytest -q`, start the server, curl fake webhook payloads, check the extraction → action pipeline and that `/insights` moves.
- The voice experience must stay on BimpeAI per the rules; nothing else may touch BimpeAI's API.

Keep these files in the repo root so the tooling always has the full spec:
`AVEN_README.md` (product), `BUILD_GUIDE.md` (design), `BACKEND_GUIDE.md` (build spec).

## 8. Cut list (drop in this order if time runs short)

1. Pidgin/multilingual handling
2. Reactivation link and fee-waiver variants (keep retry ticket + fraud escalation)
3. "Top fix to ship" panel
4. Live auto-refresh (refresh manually)

**Never cut:** the live call, the webhook → extraction → action pipeline, the ₦-at-risk chart, and the backup video.
