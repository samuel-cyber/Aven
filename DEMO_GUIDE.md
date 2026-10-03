# Aven — Demo Guide

A quick, copy-paste walkthrough for showing Aven end to end: a dormant customer
gets called by the Aven voice agent, the transcript is understood, and the
business sees a recovery action.

> **What you need**
> - Windows, with the Python venv at `backend/.venv` already built.
> - Node 20+ (this machine has Node 24) and `frontend/node_modules` installed.
> - Optionally: a `BIMPEAI_API_KEY` (real calls) and a workspace-scoped
>   `LLM_API_KEY` (real extraction). Without them the demo still runs — it just
>   uses the simulated voice line and the rule-based extraction fallback.

---

## 0. One-time setup (skip if already done)

From the repo root:

```cmd
cd backend
.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\frontend
npm install
cd ..
```

Seed the demo database (safe to re-run — this is the reset button):

```cmd
backend\.venv\Scripts\python.exe backend\scripts\seed.py
```

---

## 1. Start the backend

Open a terminal in `backend/` and run the API. **Use port 8001** (the frontend
is pointed at it; port 8000 can be held by a stale process on this machine):

```cmd
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Check it is alive in another terminal:

```cmd
curl http://localhost:8001/health
```

You should see `{"status":"ok", ...}`.

## 2. Start the frontend

Open a **second** terminal in `frontend/`:

```cmd
cd frontend
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). The top bar shows a
green connection dot once it has reached the backend.

> **Connection check:** the frontend reads `VITE_API_BASE_URL` from
> `frontend/.env`. It is set to `http://localhost:8001` to match step 1. If you
> change the backend port, change this file too and Vite will auto-restart.

---

## 3. The happy path (5 minutes)

1. **Overview** — the top KPI row shows dormant customers, calls made, and value
   recovered. Point out the recovery rate.
2. **Customers** — pick a dormant customer, e.g. `CUS-1001`. The customer panel
   opens on the right.

### Place a call

In the **CallControl** card you now have a **"Number to call (optional)"** field:

- **Leave it blank** → Aven dials the customer's own number (a real call, when
  BimpeAI is configured).
- **Type your own number** (e.g. `+2348012345678`) → BimpeAI rings *you*, so you
  can talk to the agent live during the demo. This is the safest way to show it.

Click **Call {name}**. The card switches to a live waveform and shows the call
id and status. When the call ends, Aven pulls the transcript automatically and
the card flips to a **posted** summary (outcome + new status pill).

### No BimpeAI key? Rehearse instead

Click **"Rehearse with a sample"** under the call button. Pick one of the five
recorded conversations (cooperative, angry, vague, refusal, fraud). These run
through the *exact same* pipeline — transcript → extraction → action — without a
phone call. This is the reliable fallback for a live demo.

3. **Understanding panel** — after a call posts, show the structured read:
   issue, churn reason, sentiment, value at risk, recommended action.
4. **Calls** — open the call to show the full transcript alongside the summary.
5. **Actions** — show the queued action (e.g. "human callback", "fraud freeze")
   and click resolve to close it.
6. **Insights** — show the issue/reason breakdown and the top product fixes,
   which is the business case: aggregate what is pushing customers away.

---

## 4. Reading the result

| Where | What it proves |
| --- | --- |
| Live card → **posted** | A call happened and was ingested. |
| Understanding panel | The transcript was turned into structured data. |
| Call detail | The transcript is stored and quotable. |
| Action row | A concrete recovery step was triggered. |
| Insights | The signal rolls up to a business decision. |

---

## 5. Troubleshooting

| Symptom | Fix |
| --- | --- |
| Top bar shows a red "can't reach the API" dot | Backend not running, or wrong port. Start it on 8001 and confirm `frontend/.env` says `VITE_API_BASE_URL=http://localhost:8001`. |
| `Call` button says calls are stubbed | `BIMPEAI_API_KEY` is not set in `backend/.env`. Use the sample rehearsal, or add the key and restart the backend. |
| Every call shows `extraction_source = fallback` | The LLM key is missing or **unscoped**. See the note below. |
| Extraction logs `... must include the anthropic-workspace-id header` | Your `LLM_API_KEY` works but is not scoped to a workspace. Set `LLM_WORKSPACE_ID` in `backend/.env`, or replace the key with a workspace-scoped one. |
| Real call never rings | Confirm `BIMPEAI_AGENT_ID` and a linked phone number in `backend/.env` / the BimpeAI console, and remember calls are polled, not pushed. |
| Want a clean slate | Re-run `backend\scripts\seed.py`. |

> **LLM key gotcha.** This machine has a global `ANTHROPIC_BASE_URL` pointing at
> a relay, which would silently hijack every request. Aven deliberately pins the
> endpoint (`LLM_BASE_URL`, default `https://api.anthropic.com`) so that cannot
> happen — but the key itself must still be valid and scoped to a workspace.

---

## 6. Reset between demos

```cmd
backend\.venv\Scripts\python.exe backend\scripts\seed.py
```

Then refresh the browser. Metrics, calls, and actions return to the seeded
baseline.
