# Aven dashboard (frontend)

The demo and ops screen for Aven, built with React, Vite and TypeScript. It talks to the FastAPI backend in `../backend` over REST and refreshes every 3 seconds.

## Run it

```bash
# 1. Backend (from backend/)
uvicorn app.main:app --reload --port 8000
python -m scripts.seed            # demo data, re-run any time to reset

# 2. Frontend (from frontend/)
cp .env.example .env              # Windows: copy .env.example .env
npm install
npm run dev                       # http://localhost:5173
```

Production build: `npm run build` writes static files to `dist/`. You can host them anywhere, or preview them with `npm run preview`.

## Configuration (`frontend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Where the backend runs |
| `VITE_WEBHOOK_SECRET` | `dev-secret` | Must match `WEBHOOK_SECRET` in `backend/.env`. Only the sample-conversation rehearsal uses it. |

Anything prefixed `VITE_` ends up in the browser bundle, so only put demo secrets here.

## Design

The look follows the Wise design language from `design-references/design-md/wise`, branded as Aven:
- a sage canvas with white cards at a 24px radius;
- lime green only for primary actions and the headline figure;
- a full semantic palette for status;
- Figtree for figures, Inter for the interface.

[Motion](https://motion.dev) handles the animations, and they respect the operating system's reduced-motion setting:
- feed rows re-sort smoothly;
- tab and filter indicators slide;
- a live voice waveform plays while Aven is on a call;
- a new result wipes in under the customer;
- figures count up;
- the chart bars grow when you scroll to them.

## Screens

- **Overview** (the projector view):
  - a dark value-at-risk card and the key metrics;
  - the **recovery feed**, which shows why each customer went quiet and what Aven did about it;
  - the selected customer with the call control and what Aven understood;
  - below those: why customers leave, cases that need a person, frequent issues, and fixes to ship.
- **Customers**: a sortable, filterable table, with the same customer panel alongside.
- **Calls**: every conversation, with its extraction, the actions it posted, and the transcript shown as chat bubbles.
- **Actions**: what the action engine queued. Mark each one done when a person has handled it.

## Running a call from the UI

- **With BimpeAI keys in `backend/.env`:**
  1. Click **Call {name}** in the customer panel. The backend starts the call.
  2. The dashboard asks for the transcript every 5 seconds.
  3. When the call ends, the transcript runs through extraction and the action engine.
  4. The result posts to the feed and the totals move.
- **With no keys:** the panel offers five sample conversations: cooperative, angry, vague, fraud report and refuses. They are the five cases `AVEN_README.md` asks you to test, and they go through the same pipeline via `POST /webhooks/bimpeai`. The UI labels them as samples.

With no `LLM_API_KEY`, the backend's extraction returns its fixed fallback record. That record is issue "other" with a human callback, so a sample posts as **Contacted** with a human callback queued. Set `LLM_API_KEY` to see real issue, sentiment and recovery outcomes.

## Checks

```bash
npm run build   # type-check (tsc -b) + production build
npm run lint    # oxlint
```
