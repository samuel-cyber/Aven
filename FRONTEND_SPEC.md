# Aven — Frontend Spec (for the frontend engineer)

> Goal: replace the Streamlit dashboard (`dashboard/app.py`) with a sleek, modern,
> demo-grade web app. The backend is **done and stable** — you are building a new
> client for an existing REST API. Do not change the backend.

---

## 0. TL;DR

- **What Aven is:** a voice-first AI system that calls dormant fintech customers,
  figures out *why* they left, and takes a recovery action (retry the failed
  transfer, waive a fee, escalate fraud, etc.).
- **Your job:** a single-page dashboard that makes that story *feel* alive —
  big numbers, a live call feed, and a beautiful transcript + structured summary
  view.
- **Stack:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui.
- **Backend:** FastAPI at `http://localhost:8000`. CORS is already `allow_origins=["*"]`.
- **The one rule:** the backend must keep working during the demo. Never let a
  failed request blank the screen — always show cached/last-known data.

---

## 1. Recommended stack (opinionated — use this)

| Concern | Pick | Why |
|---|---|---|
| Framework | **Next.js 14, App Router, TypeScript** | Fast, file routing, easy deploy (Vercel) |
| Styling | **Tailwind CSS** + **shadcn/ui** | Sleek defaults, accessible primitives |
| Data fetching | **TanStack Query (React Query)** | Caching + polling + retries out of the box |
| Charts | **Recharts** | Simple, themeable, good enough for the demo |
| Animation | **Framer Motion** | The "live call" moments need motion |
| Icons | **lucide-react** | Clean, consistent |
| Toasts | **sonner** | Call started / synced / errors |
| Fonts | **Inter** (UI) + **JetBrains Mono** (numbers/IDs) | Modern fintech look |

If you prefer Vite + React over Next.js, that's fine — the API contract below is
framework-agnostic. Next.js is recommended purely for deploy simplicity.

---

## 2. Run the backend locally

```bash
# from repo root
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health` → `{"status":"ok","db":"ok"}`.

Interactive docs (your best friend): **http://localhost:8000/docs** (FastAPI
auto-generates Swagger from the live code — trust it over this doc if they differ).

Seed demo data first (makes the dashboard non-empty):

```bash
cd backend
.venv\Scripts\python.exe -m scripts.seed
```

---

## 3. API contract (exact, verified)

Base URL: `http://localhost:8000`. All JSON. No auth headers needed.
Configure via `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`).

### 3.1 `GET /health`

```json
{ "status": "ok", "db": "ok" }
```

### 3.2 `GET /insights` — the whole Overview screen in one call

```json
{
  "kpi": {
    "contacted": 5,
    "recovered": 3,
    "escalated": 1,
    "recovery_rate": 0.6,
    "ngn_at_risk": 412000.0,
    "ngn_recovered": 178000.0,
    "open_actions": 4,
    "open_escalations": 1
  },
  "by_reason": [
    { "reason": "failed_transaction", "calls": 4, "ngn_at_risk": 190000.0, "recovered": 2 }
  ],
  "by_issue": [
    { "issue": "failed_transfer", "calls": 4 }
  ],
  "top_product_fixes": [
    { "fix": "Auto-reverse failed-transfer debits within 24 hours.", "calls": 3 }
  ]
}
```

- `recovery_rate` is a **fraction** (0.6 = 60%). Format as a percentage yourself.
- `ngn_at_risk` / `ngn_recovered` are **Naira amounts** (`₦`). Format with thousands separators.

### 3.3 `GET /customers`

Query params: `status?`, `limit?` (1–500, default 100), `offset?` (default 0).

Returns `CustomerOut[]`:

```json
[{
  "id": "CUS-001", "name": "Tunde Bakare", "phone": "+2348000000000",
  "preferred_language": "en", "last_active_date": "2026-09-01",
  "dormant_balance_ngn": 25400.0, "est_monthly_value_ngn": 3800.0,
  "last_event_type": "failed_transfer",
  "last_event_detail": "25000 NGN transfer failed twice",
  "last_event_date": "2026-09-02", "status": "dormant"
}]
```

`status` ∈ `dormant | contacted | recovered | escalated | follow_up`.
`last_event_type` ∈ `failed_transfer | fee_charge | card_declined | kyc_block`.

### 3.4 `GET /customers/{id}`

Same as above **plus** embedded `calls[]` and `actions[]` (full rows). Use this
for the Customer Detail screen — one request, everything you need.

### 3.5 `GET /calls`

Query params: `customer_id?`, `churn_reason?`, `fraud_flag?` (bool),
`limit?` (1–500, default 100), `offset?`.

Returns `CallOut[]` — **identical to the single-call row but WITHOUT `transcript`**
(the list omits the bulky field on purpose).

```json
[{
  "id": "CALL-H1", "customer_id": "CUS-001", "status": "completed",
  "duration_sec": 96, "created_at": "2026-10-02 21:14:03",
  "churn_reason": "failed_transaction",
  "reason_detail": "A 25000 NGN transfer failed twice and was never reversed.",
  "issue": "failed_transfer", "sentiment": "negative",
  "intent_to_return": "yes", "urgency": "medium",
  "recovery_possible": 1, "fraud_flag": 0, "fraud_detail": null,
  "resolution_offered": "retry_ticket", "customer_accepted": 1,
  "follow_up_needed": 0,
  "summary": "Customer left after a failed transfer. Accepted a reversal ticket.",
  "recommended_product_fix": "Auto-reverse failed-transfer debits within 24 hours.",
  "extraction_source": "llm"
}]
```

> **Boolean-as-integer:** `recovery_possible`, `fraud_flag`, `customer_accepted`,
> `follow_up_needed` come back as **`0` / `1`**, not `true`/`false`. Normalize
> them in a mapper function (see §7).

### 3.6 `GET /calls/{call_id}` — the transcript screen

Same shape as a list row **plus** `transcript` (a plain string, one message per
line, prefixed `agent:` / `customer:`) **plus** `actions[]`:

```json
{
  "id": "CALL-H1", "transcript": "agent: Hi, this is Aven from Demo Bank.\ncustomer: The transfer failed twice...",
  "churn_reason": "failed_transaction", "sentiment": "negative",
  "summary": "...", "...": "all CallOut fields",
  "actions": [
    { "id": 1, "call_id": "CALL-H1", "customer_id": "CUS-001",
      "type": "retry_ticket", "detail": "Priority reversal ticket raised",
      "status": "open", "urgent": 0, "created_at": "2026-10-02 21:14:05" }
  ]
}
```

Parse `transcript` by splitting on `\n`; each line starts with `agent:` or
`customer:`. Render as a chat bubble thread — **this is your money shot.**

### 3.7 `GET /actions`

Query params: `customer_id?`, `type?`, `urgent?` (bool), `limit?`, `offset?`.
Returns `ActionOut[]` (same row shape as above).

`type` ∈ `retry_ticket | fee_waiver | reactivation_link | human_callback | fraud_escalation`.

### 3.8 `POST /actions/{id}/resolve`

No body. Returns `{"ok": true, "id": 1, "status": "done"}`. Wire the "Resolve"
button to this and refetch. `404` if the id is unknown.

### 3.9 `GET /voice/status`

```json
{ "configured": true, "base_url": "https://api.bimpe.ai",
  "api_path": "/api/v1/console", "agent_id": "agent_...",
  "is_test_call": true, "has_phone_number": true }
```

Show a small "Voice: connected / not configured" pill in the header.

### 3.10 `GET /voice/customers/{id}/context`

The exact variables the voice agent receives before calling (name, phone,
company, last event, etc.). Useful for a "What Aven knows" panel.

### 3.11 `POST /voice/customers/{id}/call` — **place the call**

Query params (all optional):

| Param | Type | Meaning |
|---|---|---|
| `is_test_call` | bool | `true` = BimpeAI test line, no live number needed |
| `destination` | string | Override the dialled number, e.g. `+2348012345678` to ring yourself |

Response:

```json
{
  "ok": true, "customer_id": "CUS-001", "call_id": "call_abc123",
  "status": "initiated", "detail": "dialing", "is_test_call": true,
  "destination": "+2348012345678",
  "poll_url": "/voice/customers/CUS-001/calls/call_abc123/sync"
}
```

- If the backend has **no BimpeAI key**, `status` is `"stubbed"` and `call_id`
  may be null — handle gracefully (show a "not configured" state, don't crash).
- With a real key, `call_id` is set and the phone starts ringing.

### 3.12 `POST /voice/customers/{id}/calls/{call_id}/sync` — **pull the transcript**

Query param `wait` (bool, default `true`). `wait=true` blocks until the call
ends (bounded by the backend's 240s timeout), flattens BimpeAI's
`conversation_logs`, and runs the recovery pipeline.

```json
{ "ok": true, "customer_id": "CUS-001", "call_id": "call_abc123",
  "status": "ended", "processed": true, "duration_sec": 96,
  "transcript_messages": 4 }
```

- **Idempotent.** Syncing twice returns
  `{"ok": true, "already_processed": true}`.
- If the call hasn't produced a transcript yet:
  `{"ok": false, "processed": false, "error": "no transcript yet"}`.
- **Warning:** with `wait=true` this request can take minutes. Use a generous
  timeout (e.g. 600s) and show a progress/indeterminate state.

### 3.13 `POST /webhooks/bimpeai` (backend-only)

Not for you to call. The backend also accepts BimpeAI's native post-call
payload here. Ignore it.

---

## 4. ⚠️ Real-time behaviour: **poll, don't socket**

There is **no WebSocket / SSE endpoint**. After starting a call:

1. `POST /voice/customers/{id}/call` → get `call_id`.
2. Show a "call in progress" card with a live timer.
3. Poll `POST .../calls/{call_id}/sync?wait=false` every **3 seconds**. While the
   call is live, expect `{"ok": false, "processed": false, "error": "no transcript yet"}` —
   that's normal, keep polling.
4. When you get `{"processed": true}`, stop polling, refetch `/insights`,
   `/calls`, `/customers`, and celebrate.

For the rest of the dashboard, poll `GET /insights` + `GET /calls` every
**3–5 seconds** with TanStack Query (`refetchInterval`). Pause polling when the
tab is hidden (`refetchIntervalInBackground: false`).

Implement a `useCallPolling(customerId, callId)` hook that encapsulates this and
returns `{ status, elapsedSec, transcript, result }`.

---

## 5. Design direction (the "sleek and cool" part)

Aim for **dark, dense, confident fintech** — think Linear / Vercel / Ramp, not
Bootstrap admin.

- **Palette (dark):**
  - Background `#0B0D10`, surface `#14171C`, border `#22272E`
  - Text `#E6E8EB`, muted `#9BA1A9`
  - Accent (primary action) `#5B8CFF` (electric blue)
  - Success/recovered `#34D399`, warning `#FBBF24`, danger/fraud `#F87171`
  - Naira figures: `JetBrains Mono`, tabular-nums
- **Layout:** fixed left sidebar (icon + label nav), top bar (search, voice
  status pill, "Place call" primary button), content grid.
- **Density:** generous but tight — 12-col grid, cards with `1px` hairlines, no
  drop-shadow soup. One soft glow on the active call card only.
- **Motion (Framer Motion):**
  - KPI numbers **count up** on load/update.
  - New call feed rows **fade + slide in** (animate presence).
  - The active-call card has a subtle pulsing ring while polling.
  - Screen transitions: 120–180ms ease-out. Nothing slower.
- **Empty states matter:** the demo may start empty. Make them look intentional
  ("No calls yet — place one to see Aven work"), with a CTA, never a blank panel.
- **Accessibility:** real focus rings, keyboard-navigable, `aria-live` on the
  call status.

---

## 6. Screens & components

### 6.1 Overview (`/`)
- KPI strip: **Customers called, Recovered, Recovery rate, Urgent escalations,
  ₦ dormant total, ₦ recovered** — from `/insights.kpi`.
- Chart: `₦ at risk by churn reason` (bar) from `by_reason`; label bars with
  humanised reasons (`failed_transaction` → "Failed transaction").
- Panel: **Top product fixes to ship** from `top_product_fixes`.
- Panel: **Live call feed** — latest 6 from `/calls`, each showing customer,
  reason, sentiment badge, summary. New rows animate in.

### 6.2 Place a call (header action, opens a modal/sheet)
- Customer picker (from `/customers`, searchable, show ₦ balance).
- "Test call" toggle (default on).
- Optional "Dial this number instead" input (ring your own phone).
- **Start call** → `POST /voice/customers/{id}/call`.
- Then the live-call card takes over (see §4).

### 6.3 Live call card (in-page, after start)
- Timer, pulsing ring, `is_test_call` badge.
- On `processed: true`: confetti-free success toast + auto-navigate to the call
  detail view. This is the demo climax — make it feel good.

### 6.4 Calls list (`/calls`)
- Table/cards, sortable by `created_at`, filter by `churn_reason` and `fraud_flag`.
- Columns: customer, created_at, issue, sentiment, urgency, summary (truncated),
  badges for `fraud_flag` / `customer_accepted`.
- Row click → call detail.

### 6.5 Call detail (`/calls/[id]`) — the transcript screen
- Header: customer name, outcome chip, duration, timestamp.
- **Structured summary** — render as a tidy fact grid: issue, churn reason,
  reason detail, sentiment, intent to return, urgency, recovery possible, fraud
  flagged, resolution offered, customer accepted, follow-up needed, extraction
  source, recommended product fix. Use colour for fraud/urgency.
- **Fraud callout** (red banner) when `fraud_detail` is present.
- **Transcript** — chat thread, `agent:` right-aligned accent bubbles,
  `customer:` left-aligned neutral bubbles. Add a copy + download `.txt` button.
- **Actions raised** for this call (`call.actions`), each with a Resolve button.

### 6.6 Customers (`/customers`) and Customer detail (`/customers/[id]`)
- List: name, status badge, ₦ dormant balance, last event, sort by balance.
- Detail: profile + last transaction/event, their calls (mini-timeline), their
  actions. Reuse the transcript component.

### 6.7 Actions (`/actions`)
- Table with filters (type, urgent toggle, customer).
- Urgent rows visually distinct. Resolve button → `POST /actions/{id}/resolve`
  → optimistic update + refetch.

---

## 7. Data helpers you should write

```ts
// lib/format.ts
export const naira = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
export const pct = (f: number) => `${Math.round(f * 100)}%`;
export const humanize = (s?: string | null) =>
  (s ?? "").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
export const asBool = (n: number | boolean | null | undefined) => n === 1 || n === true;

// lib/transcript.ts
export type Msg = { role: "agent" | "customer"; text: string };
export function parseTranscript(t?: string | null): Msg[] {
  return (t ?? "").split("\n").filter(Boolean).map((line) => {
    const [prefix, ...rest] = line.split(":");
    const text = rest.join(":").trim();
    return { role: prefix.trim() === "agent" ? "agent" : "customer", text };
  });
}
```

Status/type → colour map:

```ts
export const STATUS_COLORS: Record<string, string> = {
  dormant: "muted", contacted: "blue", recovered: "green",
  escalated: "red", follow_up: "amber",
};
```

---

## 8. Suggested file structure

```
web/
├─ app/
│  ├─ layout.tsx            # sidebar + topbar shell
│  ├─ page.tsx              # Overview
│  ├─ calls/page.tsx
│  ├─ calls/[id]/page.tsx
│  ├─ customers/page.tsx
│  ├─ customers/[id]/page.tsx
│  └─ actions/page.tsx
├─ components/
│  ├─ KpiStrip.tsx
│  ├─ LiveCallCard.tsx
│  ├─ PlaceCallDialog.tsx
│  ├─ CallFeed.tsx
│  ├─ Transcript.tsx
│  ├─ StructuredSummary.tsx
│  ├─ StatusBadge.tsx
│  └─ ui/                   # shadcn primitives
├─ lib/
│  ├─ api.ts                # typed fetch wrappers
│  ├─ format.ts
│  └─ transcript.ts
├─ hooks/
│  ├─ useInsights.ts
│  ├─ useCalls.ts
│  └─ useCallPolling.ts
└─ types/api.ts             # TS interfaces mirroring §3
```

`lib/api.ts` should be the **only** place that knows the base URL and shapes.
Everything else consumes typed hooks.

---

## 9. Definition of done / acceptance criteria

- [ ] Overview renders all 6 KPIs, the churn-reason chart, top fixes, and the feed.
- [ ] Data auto-refreshes every 3–5s without a full page reload.
- [ ] "Place a call" works end-to-end with a real BimpeAI key, and shows a clear
      "not configured" state when the backend is stubbed.
- [ ] After a call, the live card transitions to the call detail with a rendered
      transcript (agent/customer bubbles) and the structured summary.
- [ ] `₦` amounts and recovery rate are formatted correctly (fraction → %).
- [ ] `0/1` booleans render as yes/no or badges — never raw `0`/`1`.
- [ ] Actions can be resolved from the UI and the list updates.
- [ ] Empty DB never shows a blank or broken screen.
- [ ] Backend offline/unreachable shows a friendly banner + last-known data, not a crash.
- [ ] Reasonable keyboard access and visible focus states.
- [ ] Lighthouse/visual sanity: dark theme, no layout shift, smooth on a demo laptop.

---

## 10. Handy test data & commands

```bash
# reset to a full, pretty demo dataset (18 customers, calls, insights)
cd backend
.venv\Scripts\python.exe -m scripts.seed

# run the backend
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# trigger a call from the CLI (bypasses the UI) — useful while building
.venv\Scripts\python.exe -m scripts.trigger_call CUS-001
.venv\Scripts\python.exe -m scripts.trigger_call CUS-001 --to +2348012345678
```

Reference implementation (what you're replacing): `dashboard/app.py`. It already
does everything logically — treat it as the wireframe. You're rebuilding the same
information architecture with a real design system, client-side routing, and
animation.

---

## 11. What NOT to do

- Don't modify the backend or its response shapes.
- Don't add auth — this is a local/demo app.
- Don't build a WebSocket layer; polling is the supported path.
- Don't block the whole UI on a long `sync?wait=true` call — show progress.
- Don't hardcode seed values; always read from the API.
