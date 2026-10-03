# Aven — Setup, BimpeAI Configuration & Hosting

This guide takes you from a fresh clone to a working voice-first demo: Aven
**calls a customer with BimpeAI**, the agent **talks** to them, the transcript
comes back, the backend **extracts structured insight**, the **action engine**
runs, and the **dashboard** updates live.

If you only want to see it work offline first, jump to
[§6 Quick local demo (no BimpeAI needed)](#6-quick-local-demo-no-bimpeai-needed).

---

## 1. What you need

| Thing | Why | Link |
|---|---|---|
| Python 3.11+ | backend + dashboard | python.org |
| A BimpeAI account | voice agent + telephony | https://bimpe.ai |
| (optional) an Anthropic API key | real LLM extraction | console.anthropic.com |
| (optional) ngrok | public webhook URL | ngrok.com |

Hackathon credits: claim them in BimpeAI with the code `LAGOSHACKNIGHT`.

---

## 2. Install the backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env      # Windows  (macOS/Linux: cp .env.example .env)
```

Run the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

- Health: http://localhost:8000/health
- Interactive API docs: http://localhost:8000/docs

Seed the demo database (17 customers, 14 historical calls):

```bash
python -m scripts.seed
```

---

## 3. Configure BimpeAI end-to-end (call → AI talking → transcript)

This is the full loop. Do these steps **in the BimpeAI console**
(https://bimpe.ai → Console).

### 3.1 Create the voice agent
1. Console → **Agents** → **Create agent**.
2. Name it **Aven**.
3. Open the agent and set the **Instructions / System Prompt** to the contents
   of [`agent/system_prompt.md`](agent/system_prompt.md:1) (everything below the
   divider). Replace `{{customer_name}}`, `{{bank_name}}`,
   `{{last_event_detail}}` with the ones your plan supports, or leave the
   generic wording.

### 3.2 Attach a voice (YarnGPT) and the channel
1. In the agent, choose the **voice** — pick a YarnGPT Nigerian English voice
   (warm, natural). Test it with the console's **preview** button.
2. Enable the **Voice / Telephony** channel for the agent.

### 3.3 Get a phone number and link it
1. Console → **Phone Numbers** → **Request / Buy number**.
2. Link it to the **Aven** agent.
3. Copy the number into `BIMPEAI_PHONE_NUMBER` and the agent's id into
   `BIMPEAI_AGENT_ID`.

### 3.4 Get an API key
1. Console → **API Keys** → create a key (starts with `sk_`).
2. Copy it into `BIMPEAI_API_KEY`.

The backend talks to the confirmed Console REST API at
`https://api.bimpe.ai/api/v1/console` with `Authorization: Bearer sk_...`.
All of that lives in exactly one file:
[`backend/app/services/bimpeai.py`](backend/app/services/bimpeai.py:1).

### 3.5 (Optional) Let the agent fetch live context mid-call
Aven personalises the call using customer context. Expose your backend to
BimpeAI (see [§5 Hosting](#5-hosting)) and add a **Custom API tool** in the
agent that calls:

```
GET {YOUR_PUBLIC_API}/voice/customers/{{customer_id}}/context
```

The response is the exact variables the agent can use. If you can't add a
tool, you can still pass the customer name/detail as agent variables at call
time.

### 3.6 Test call vs live call
`BIMPEAI_IS_TEST_CALL=true` sends BimpeAI's **test telephony** call — it works
without a live channel and is safe for building. Set it to `false` in `.env`
once a real number is linked and you want a real phone to ring.

---

## 4. Environment variables (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DB_PATH` | `aven.db` | SQLite file. Relative paths resolve to the CWD you run uvicorn from. |
| `WEBHOOK_SECRET` | `dev-secret` | Sent as `x-webhook-secret` when BimpeAI posts a webhook. Empty = no check. |
| `LLM_API_KEY` | *(empty)* | Anthropic key. **Empty → rule-based fallback extraction** (demo still works). |
| `LLM_MODEL` | `claude-sonnet-4-20250514` | Model used for extraction. |
| `LLM_BASE_URL` | `https://api.anthropic.com` | Endpoint to call. Pinned explicitly so a stray global `ANTHROPIC_BASE_URL` (e.g. a relay set on your machine) can't hijack requests. |
| `LLM_WORKSPACE_ID` | *(empty)* | Only for **unscoped** keys. Anthropic then requires an `anthropic-workspace-id` header; set this to your workspace id. |
| `BIMPEAI_API_KEY` | *(empty)* | BimpeAI `sk_...` key. **Empty → calls are stubbed** (dev safe). |
| `BIMPEAI_AGENT_ID` | *(empty)* | The Aven agent id. |
| `BIMPEAI_PHONE_NUMBER` | *(empty)* | Linked caller id (informational). |
| `BIMPEAI_BASE_URL` | `https://api.bimpe.ai` | API host. |
| `BIMPEAI_API_PATH` | `/api/v1/console` | Path prefix. |
| `BIMPEAI_IS_TEST_CALL` | `true` | `true` = test telephony, `false` = live. |
| `BIMPEAI_TEST_DESTINATION` | `test` | Destination sent for test calls. |
| `BIMPEAI_WAIT_TIMEOUT` | `240` | Seconds to poll for a call to end. |
| `BIMPEAI_POLL_INTERVAL` | `5` | Seconds between polls. |
| `API_BASE_URL` | `http://localhost:8000` | Where the dashboard finds the API. |

**Zero-key demo:** with `LLM_API_KEY` and `BIMPEAI_API_KEY` both empty, the whole
pipeline still runs — extraction falls back to rules and calls are stubbed.
Nothing crashes.

> **LLM key gotcha.** Anthropic keys created in the Console can be **unscoped**
> (no workspace). Those keys authenticate but every request fails with
> `400 ... must include the anthropic-workspace-id header`. Fix it one of two ways:
> create a **workspace-scoped** key, or set `LLM_WORKSPACE_ID=<workspace id>`.
> A `401 invalid token` instead means the key/endpoint is wrong — check that you
> are not being routed through a global `ANTHROPIC_BASE_URL` relay (Aven pins the
> endpoint itself, so this should not happen once `LLM_BASE_URL` is set).

---

## 5. Hosting

The backend is a standard FastAPI app, so any Python host works. The only
state is SQLite (`aven.db`) — mount a persistent disk/volume so data survives
restarts.

### Render (easiest)
1. New → **Web Service** → connect the repo.
2. Root directory: `backend`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add env vars from §4. Add a **Disk** mounted at `/data` and set
   `DB_PATH=/data/aven.db`.

### Railway
1. New project → deploy from repo → set root to `backend`.
2. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
3. Add a volume for the DB and set `DB_PATH=/data/aven.db`.

### Fly.io
```bash
cd backend
fly launch --no-deploy
fly volumes create aven_data --size 1
# set [mounts] source="aven_data" destination="/data" in fly.toml
fly secrets set BIMPEAI_API_KEY=sk_... BIMPEAI_AGENT_ID=... LLM_API_KEY=... DB_PATH=/data/aven.db
fly deploy
```

### Public webhook with ngrok (local dev)
If you want BimpeAI to push call events to your laptop:

```bash
ngrok http 8000
# copy the https URL, e.g. https://ab12.ngrok.app
```

Then register the webhook URL in BimpeAI (if your plan exposes webhooks):

```
https://ab12.ngrok.app/webhooks/bimpeai
```

> **Important:** BimpeAI's public Console API does **not** document a webhook,
> so Aven does **not** depend on one. The reliable path is **polling** — after
> starting a call, call `/voice/.../sync` and Aven fetches the transcript via
> `GET /agents/{agent_id}/calls/{call_id}`. The webhook endpoint exists as an
> optional fast-path for plans that support it and for local testing.

---

## 6. Quick local demo (no BimpeAI needed)

With the backend running in one terminal and the venv active:

```bash
# 1. Seed the DB
python -m scripts.seed

# 2. Fire the sample post-call payload through the pipeline
curl -X POST http://localhost:8000/webhooks/bimpeai ^
  -H "Content-Type: application/json" ^
  -H "x-webhook-secret: dev-secret" ^
  -d @data/sample_webhook.json
```

(macOS/Linux: use `\` line continuations instead of `^`.)

The dashboard numbers change within 3 seconds.

---

## 7. Run the dashboard

```bash
cd dashboard
pip install -r requirements.txt
streamlit run app.py
```

> **Python 3.14:** if `pip install` starts building `numpy` from source and
> fails with `Unknown compiler(s)` / `metadata-generation-failed`, force
> prebuilt wheels instead:
>
> ```bash
> pip install --only-binary=:all: -r requirements.txt
> ```
>
> The pins in `dashboard/requirements.txt` are known to have 3.11–3.14 wheels.

- Opens at http://localhost:8501.
- Reads the SQLite DB directly and auto-refreshes every 3 seconds.
- It auto-discovers `backend/aven.db` or `./aven.db`; override with
  `DB_PATH=/path/to/aven.db`.
- For the projector: wide window, dark mode, ~110% zoom.

---

## 8. The full voice loop (what actually happens)

### Trigger + wait + process in one call
```bash
# Start a BimpeAI call for a customer, wait for it to end, process it:
curl -X POST "http://localhost:8000/voice/customers/CUS-1042/call?is_test_call=true"
# -> {"ok": true, "call_id": "call_...", "poll_url": "/voice/customers/CUS-1042/calls/call_.../sync"}

curl -X POST "http://localhost:8000/voice/customers/CUS-1042/calls/call_.../sync?wait=true"
# -> {"ok": true, "processed": true, "call_id": "...", "actions": [...]}
```

Or the one-shot script from `backend/`:

```bash
python -m scripts.trigger_call CUS-1042          # test call, prints sync URL
python -m scripts.trigger_call CUS-1042 --live   # live call
python -m scripts.trigger_call CUS-1042 --wait   # call + wait + process
```

### What the code does
1. `POST /voice/.../call` → `services/bimpeai.start_call()` →
   `POST /agents/{agent_id}/calls` with `{destination, is_test_call}`.
2. `POST /voice/.../sync` → `services/bimpeai.wait_for_call()` polls
   `GET /agents/{agent_id}/calls/{call_id}` until the status is terminal.
3. `conversation_to_transcript()` flattens BimpeAI's `conversation_logs`
   (`role: assistant|user`, `message`) into an `agent:` / `customer:` transcript.
4. The shared `run_pipeline()` in
   [`backend/app/routes/webhooks.py`](backend/app/routes/webhooks.py:32)
   stores the call, runs LLM (or fallback) extraction, then the rule-based
   action engine. It is **idempotent** — re-syncing the same `call_id` won't
   double-process.
5. The dashboard picks it up within 3 seconds.

### Webhook path (optional)
If your BimpeAI plan posts a webhook, Aven accepts it at
`POST /webhooks/bimpeai`. It understands **both**:

- a plain transcript, and
- BimpeAI's native `conversation_logs` array.

Both paths call the same `run_pipeline()`.

---

## 9. Demo day flow

1. **Dashboard up** — show dormant ₦ value and the seeded history.
2. **Start the call** — `POST /voice/customers/CUS-1042/call`. Put the phone on
   speaker so the room hears Aven talking.
3. **Adaptation** — answer as a frustrated customer; Aven acknowledges and
   offers the right fix. Try a fraud report to show it escalates safely.
4. **End the call** — `POST /voice/customers/CUS-1042/calls/{call_id}/sync`.
5. **Structured understanding** — open `GET /calls/{call_id}` (or the feed):
   issue, churn reason, sentiment, intent, urgency, fraud flag.
6. **Business impact** — the dashboard's ₦-at-risk-by-reason chart and the
   actions table update live.

---

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `BimpeAIError: BIMPEAI_API_KEY is not set` | Set `BIMPEAI_API_KEY` in `.env`, or leave it empty to run stubbed. |
| `BimpeAI 401: Invalid API key` | Key wrong/expired, or not `sk_...`. Recreate it in the console. |
| `BimpeAI 404` on call | `BIMPEAI_AGENT_ID` wrong, or the call id belongs to another agent. |
| Call never ends / sync times out | Raise `BIMPEAI_WAIT_TIMEOUT`, or sync later with `wait=false`. |
| Transcript empty | The call didn't connect (test telephony) — try a live call, or check the agent channel. |
| 400 "customer not found" | Run `python -m scripts.seed` and use a real id like `CUS-1042`. |
| Dashboard shows nothing | Confirm `DB_PATH` points at the file uvicorn is writing; check the `DB:` caption. |
| Extraction always `fallback` | Check the server log line `extract retry:<Type>: <msg>`. Common: key empty, `anthropic` not installed, `400 workspace-id` (unscoped key → set `LLM_WORKSPACE_ID`), or `401` (bad key/endpoint). Falls back quietly by design. |
| Webhook 401/403 | The `x-webhook-secret` header must match `WEBHOOK_SECRET`. |

---

## 11. Tests

```bash
cd backend
.venv\Scripts\python.exe -m pytest -q     # Windows
python -m pytest -q                        # macOS/Linux
```

All 22 tests are **offline** — no API key and no network. The LLM and BimpeAI
HTTP layer are monkeypatched, so they verify the pipeline, the voice
orchestration, idempotency, and both webhook payload shapes.
