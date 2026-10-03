# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite + TypeScript, in `frontend/`, calling the existing FastAPI backend over REST (`VITE_API_BASE_URL`, default `http://localhost:8000`). The existing Streamlit dashboard in `dashboard/` stays as a fallback; it is not removed.

## Users

The primary scene is a hackathon demo: judges watch a projector while the presenter runs a live recovery call from the dashboard. The surface must read at distance and tell the story without narration.

The secondary user is a fintech operations or customer-success team using it as a working tool. They see who has gone dormant, why, what Aven did about it, and which cases need a human.

## Product Purpose

Aven is a voice-first customer recovery system for fintechs. It calls a dormant customer through a BimpeAI voice agent and has a real two-way conversation to find out what went wrong. It turns the transcript into structured data (issue, churn reason, sentiment, intent, urgency, fraud flag), runs a recovery action, and feeds the results into business insight.

Success means the full loop is visible in one place: a customer goes from At Risk to Recovery In Progress, and the recovery metrics move.

## Positioning

Fintech dashboards show that a customer stopped. Aven shows why, because it actually talked to them, and it shows what was done about it. The core message: **Talk to the customer. Understand what went wrong. Do something about it. Learn from the conversation.**

## Operating Context

- **Demo flow:**
  1. Show an inactive customer's profile, recent and failed transaction, and value at risk.
  2. Start the call.
  3. The customer explains in their own words, and Aven adapts.
  4. The call ends and the transcript is synced.
  5. The structured understanding appears.
  6. Status and metrics update.
- **Starting a call:** `POST /voice/customers/{id}/call` returns a `call_id`. `POST /voice/customers/{id}/calls/{call_id}/sync?wait=...` pulls the transcript and runs extraction and actions. Without a BimpeAI key the call is "stubbed" and sync returns "no transcript yet".
- **Webhook path:** `POST /webhooks/bimpeai` with `{call_id, customer_id, transcript}` runs the same pipeline. It is used for offline demos and tests.
- **Read endpoints:** `GET /customers`, `/customers/{id}` (with calls and actions), `/calls`, `/calls/{id}` (with transcript and actions), `/actions`, `POST /actions/{id}/resolve`, `GET /insights` (KPIs, by_reason, by_issue, top_product_fixes), `/voice/status`, `/health`.
- **Refresh:** the dashboard should refresh within about 3 seconds of a pipeline run.

## Capabilities and Constraints

- **Customer status:** dormant, contacted, recovered, escalated, follow_up.
- **Churn reasons:** failed_transaction, fees, trust_security, bad_support, competitor, no_need, other.
- **Issues:** failed_transfer, unexpected_fee, poor_ux, card_problem, kyc_block, fraud_report, no_need, other.
- **Actions:** retry_ticket, fee_waiver, reactivation_link, human_callback, fraud_escalation. Each is open or done, and may be marked urgent.
- **Currency:** naira (₦). All amounts are NGN.
- **Mock actions:** recovery actions are internal workflows for the demo, not real banking transactions.
- **Extraction source:** llm, fallback or seed. Fallback runs when no LLM key is set.
- **Out of scope:** auth, permissions and production banking integrations.

## Brand Commitments

- The product name is **Aven**. The fintech it calls on behalf of is the fictional **Demo Bank**.
- **Voice:** warm, concise, patient, professional. Never robotic, pushy or over-enthusiastic. Aven never pretends to be human.
- **Fraud safety:** Aven never asks for a PIN, OTP, password, full card number or security answer. Fraud reports escalate to humans.

## Evidence on Hand

- **Seed data:** fictional customers and past calls in `backend/data/seed_customers.json` and `seed_calls.json`. All customer data is fictional.
- **Demo assets:** a sample transcript in `backend/data/sample_webhook.json` and the agent prompt in `agent/system_prompt.md`.
- **Not available:** no real customers, testimonials, recovery benchmarks or pricing. None may be invented.

## Product Principles

1. Close the loop visibly: conversation, understanding, action, recovery, insight.
2. Show the why, not just the what. Churn reasons and the customer's own words come before vanity counts.
3. Humans own the risky cases. Escalations and fraud are never buried.
4. The demo must never break. Every empty, stubbed and fallback state reads as intentional.

## Accessibility & Inclusion

Projector legibility: high contrast, large type for key numbers, and meaning never carried by color alone.
