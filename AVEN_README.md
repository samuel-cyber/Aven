# Aven

> **AI customer recovery that talks to customers, understands what went
> wrong, and helps recover them.**

Aven is a voice-first customer recovery system for fintechs. Instead of
simply sending a survey after a customer becomes inactive, Aven uses an
interactive AI voice agent to speak with the customer, understand the
reason for churn or inactivity, take appropriate recovery actions, and
turn the conversation into structured business insights.

## The Problem

Fintechs can see that a customer has stopped using their product, but
the dashboard rarely explains **why**.

A customer may have:

-   experienced a failed transfer
-   been charged an unexpected fee
-   had trouble using a feature
-   lost trust after a poor experience
-   simply stopped using the product
-   experienced a suspicious or unauthorized transaction

Traditional win-back systems often stop at messages, forms, or static
surveys.

Aven closes the loop by actually **talking to the customer**.

## What Aven Does

Aven follows a complete recovery workflow:

1.  **Understand the customer before calling**
    -   Loads relevant customer context.
    -   Examples: name, last transaction, failed transfer, dormant
        balance, recent activity.
2.  **Make an interactive voice call**
    -   Aven uses BimpeAI's voice infrastructure.
    -   The conversation is real-time and two-way.
    -   The customer speaks naturally.
    -   Aven listens, responds, asks relevant follow-up questions, and
        adapts to the conversation.
    -   The goal is a short, friendly, useful conversation rather than
        an interrogation.
3.  **Understand what went wrong**
    -   The conversation is converted into structured information.
    -   Aven identifies the customer's issue, sentiment, intent, and
        whether recovery is possible.
4.  **Take an appropriate action**
    -   Examples:
        -   create a transaction retry/reversal request
        -   offer a fee-waiver workflow
        -   generate a reactivation path
        -   request a human callback
        -   escalate a possible fraud report
5.  **Turn conversations into business intelligence**
    -   The dashboard shows:
        -   customers contacted
        -   customers recovered
        -   churn reasons
        -   revenue/value at risk
        -   escalations
        -   recovery actions
        -   product issues that repeatedly appear in conversations

## Example Conversation

Aven should sound warm, conversational, concise, patient, and
professional.

It should feel natural without pretending to be human or forcing slang.

Example:

``` text
Aven: Hi Tunde, this is Aven calling from Demo Bank. How are you doing today?

Customer: I'm alright.

Aven: Good to hear. I'll keep this brief. I noticed you haven't used the app in a little while, and I wanted to check if everything's alright. I also noticed a ₦25,000 transfer that didn't go through recently. Was that part of the problem?

Customer: Yeah, the transfer failed twice and I got tired of trying.

Aven: I understand. That would be frustrating. I can help raise a priority request for that failed transfer. Would you like me to do that?

Customer: Yes.

Aven: Alright. I'll flag it for review. Is there anything else that made you stop using the app?

Customer: No, that was basically it.

Aven: Got it. Thanks for explaining that, Tunde. We'll follow up on the transfer issue.
```

The important part is that the customer can **respond naturally** and
Aven can react to what they say.

## Voice AI

Voice is central to Aven.

The intended interaction is:

``` text
Customer speaks
      ↓
Speech recognition
      ↓
AI understands the customer
      ↓
AI generates a response
      ↓
Text-to-speech
      ↓
Customer hears the response
      ↓
Conversation continues
```

BimpeAI provides the voice/phone infrastructure for the hackathon build.
The exact outbound-call API, webhook payload, and integration details
should be implemented according to the current BimpeAI documentation
rather than assumed endpoints.

Aven's backend does not need to implement the entire telephony stack
itself.

## Architecture

``` text
                    ┌─────────────────────┐
                    │    Aven Frontend    │
                    │ Customer Dashboard  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   FastAPI Backend   │
                    │                     │
                    │ Customer Context    │
                    │ Call Trigger        │
                    │ Webhooks            │
                    │ Action Engine       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │      BimpeAI        │
                    │ Interactive Voice   │
                    │ Agent / Phone Layer │
                    └──────────┬──────────┘
                               │
                               ▼
                         ┌───────────┐
                         │ Customer  │
                         │   Phone   │
                         └─────┬─────┘
                               │
                     Voice conversation
                               │
                               ▼
                    ┌─────────────────────┐
                    │   BimpeAI Webhook   │
                    │  Post-call results  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Extraction / LLM    │
                    │ Structured JSON     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Action Engine    │
                    │                     │
                    │ Retry / Reversal    │
                    │ Fee Waiver          │
                    │ Human Callback      │
                    │ Fraud Escalation    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │       SQLite        │
                    │ Customers / Calls   │
                    │ Actions / Insights │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Dashboard       │
                    │ Recovery Analytics  │
                    └─────────────────────┘
```

## Tech Stack

  Component              Technology
  ---------------------- -----------------------------------
  Voice AI               BimpeAI + YarnGPT Voice
  Backend                Python + FastAPI
  Database               SQLite
  Data validation        Pydantic
  Post-call extraction   LLM-based structured extraction
  Frontend               Any suitable modern web stack
  Development            Freebuff (backend) + Claude Code (review/testing)
  Cost target            Free / hackathon-provided credits

The application should avoid unnecessary paid infrastructure. BimpeAI's
hackathon credits are intended for the voice experience, while the rest
of the stack can run with free/open-source tooling or locally.

## Database

A simple SQLite database is sufficient for the demo.

Core entities:

### Customers

``` text
id
name
phone
last_transaction
last_transaction_amount
failed_transaction
dormant_days
balance
status
```

### Calls

``` text
id
customer_id
status
started_at
ended_at
transcript
summary
```

### Insights

``` text
call_id
issue
sentiment
intent
churn_reason
urgency
recovery_possible
```

### Actions

``` text
call_id
action_type
status
details
created_at
```

## Structured Call Output

The post-call analysis should produce predictable structured data
instead of leaving the backend to interpret raw transcript text every
time.

Example:

``` json
{
  "customer_id": "CUS-1042",
  "issue": "failed_transfer",
  "churn_reason": "repeated_failed_transfer",
  "sentiment": "frustrated",
  "intent": "willing_to_return",
  "urgency": "medium",
  "recovery_possible": true,
  "recommended_action": "priority_reversal_request",
  "fraud_flag": false,
  "summary": "Customer stopped using the app after repeated failed transfers."
}
```

## Action Engine

The action engine converts the structured result into a concrete next
step.

Example logic:

``` text
failed transfer
      ↓
priority reversal/retry request

unexpected fee
      ↓
fee-waiver workflow

customer wants help
      ↓
human callback

customer reports unauthorized activity
      ↓
urgent fraud escalation

customer is willing to return
      ↓
reactivation workflow
```

For the hackathon demo, these actions can be represented as
mock/internal workflows rather than real banking transactions.

## Fraud Safety

Aven should never ask a customer for sensitive authentication
information.

The agent should **not** request:

-   PINs
-   OTPs
-   passwords
-   full card numbers
-   security answers

If a customer reports suspicious or unauthorized activity, Aven should
acknowledge the issue, avoid collecting sensitive credentials, and
escalate the case for appropriate human/security handling.

## Dashboard

The dashboard is designed for a fintech operations or customer-success
team.

### Key metrics

``` text
Customers Contacted
Customers Recovered
Recovery Rate
Value At Risk
Value Recovered
Open Escalations
```

### Customer table

Example:

``` text
Customer       Issue                Status
------------------------------------------------
Tunde          Failed transfer      Recovered
Amaka          Unexpected fee       Follow-up
David          Poor UX              Escalated
Chioma         Fraud report         Urgent
```

### Recovery insights

The dashboard should also answer:

-   Why are customers leaving?
-   Which issues occur most frequently?
-   How many customers can potentially be recovered?
-   How much customer value is at risk?
-   Which cases require a human?
-   Are the same product problems appearing repeatedly?

## Seed Data

For the demo, use realistic fictional customers.

Example:

``` text
CUS-1001 | Tunde | Failed transfer | ₦25,000
CUS-1002 | Amaka | Unexpected fee  | ₦8,500
CUS-1003 | David | Poor UX         | ₦42,000
CUS-1004 | Chioma| Fraud concern   | ₦75,000
```

All customer information used in the demo should be fictional.

## Demo Flow

The demo should focus on the product working, not a long slide deck.

### 1. Show the dashboard

Start with a customer who is currently inactive.

Show:

-   customer profile
-   recent transaction
-   failed transaction
-   estimated value at risk

### 2. Start the call

Trigger Aven's voice agent.

The customer receives the call and has an interactive conversation with
Aven.

### 3. Demonstrate adaptation

The customer explains the problem in their own words.

Aven should:

-   listen
-   acknowledge the problem
-   ask a relevant follow-up
-   offer an appropriate next step

### 4. End the call

The post-call result is sent to the backend.

### 5. Show structured understanding

The dashboard updates with:

``` text
Issue: Failed transfer
Sentiment: Frustrated
Recovery possible: Yes
Recommended action: Priority reversal request
```

### 6. Show the business impact

The customer changes from:

``` text
At Risk
```

to:

``` text
Recovery In Progress
```

and the dashboard updates the relevant recovery metrics.

## Voice Agent Personality

Aven should be:

-   friendly
-   warm
-   concise
-   patient
-   empathetic
-   professional
-   conversational
-   adaptive

Aven should not be:

-   robotic
-   overly corporate
-   excessively enthusiastic
-   pushy
-   repetitive
-   overly formal
-   pretending to be a human

The agent should avoid forcing Nigerian slang. Natural, clear English is
the default, with local phrasing only when it fits naturally into the
conversation.

## Important Conversation Behaviors

### Cooperative customer

Move quickly toward understanding the problem and resolving it.

### Angry customer

Do not argue.

Aven should acknowledge the frustration, keep the conversation short,
and offer an appropriate escalation or resolution path.

### Vague customer

Ask one useful clarifying question at a time instead of interrogating
the customer.

### Customer refuses

Respect the refusal and end the call politely.

### Fraud report

Treat it as an escalation signal. Do not request sensitive credentials.

## Build Order

### Phase 1: Verify the voice platform

Before writing integration code:

-   create/verify the BimpeAI account
-   claim the hackathon credits with `LAGOSHACKNIGHT`
-   inspect the current BimpeAI voice-agent documentation
-   confirm how outbound calls are started
-   confirm how post-call webhooks work
-   confirm the available YarnGPT Voice configuration
-   create the voice agent
-   test a real interactive conversation

**Checkpoint:** A real customer can speak to Aven and receive an
appropriate response.

### Phase 2: Backend foundation

Create:

``` text
backend/
├── app/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   ├── routes/
│   │   ├── customers.py
│   │   ├── calls.py
│   │   ├── webhooks.py
│   │   └── insights.py
│   └── services/
│       ├── extraction.py
│       ├── actions.py
│       └── context.py
├── seed.py
├── requirements.txt
└── .env
```

Build:

1.  SQLite database
2.  Pydantic models
3.  customer endpoints
4.  call endpoints
5.  webhook endpoint
6.  extraction service
7.  action engine
8.  insights endpoints

### Phase 3: Connect voice → backend

The actual BimpeAI payload should determine the webhook schema.

Flow:

``` text
BimpeAI
   ↓
POST /webhooks/bimpeai
   ↓
Validate payload
   ↓
Store transcript/call data
   ↓
Extract structured result
   ↓
Run action engine
   ↓
Update database
```

Do not hard-code undocumented BimpeAI fields before checking the current
documentation.

### Phase 4: Dashboard

Build the smallest polished interface that demonstrates:

-   customers
-   call status
-   transcripts/summaries
-   churn reasons
-   recovery actions
-   value at risk
-   recovered customers
-   escalations

### Phase 5: Demo hardening

Test at least:

1.  cooperative customer
2.  angry customer
3.  vague customer
4.  fraud report
5.  customer who refuses

Also test the backend without a real call using a fake webhook payload
so the full pipeline can be debugged quickly.

## Testing the Backend Without a Real Call

A fake webhook can simulate the BimpeAI callback.

Example:

``` bash
curl -X POST http://localhost:8000/webhooks/bimpeai   -H "Content-Type: application/json"   -d '{
    "call_id": "CALL-001",
    "customer_id": "CUS-1001",
    "transcript": "The transfer failed twice and I stopped using the app."
  }'
```

The expected pipeline is:

``` text
Webhook received
      ↓
Transcript stored
      ↓
Issue extracted
      ↓
Recovery action selected
      ↓
Database updated
      ↓
Dashboard reflects result
```

The exact webhook payload must match BimpeAI's documented format once
the integration is connected.

## Environment Variables

Keep secrets out of source control.

Example:

``` env
BIMPEAI_API_KEY=
BIMPEAI_AGENT_ID=
BIMPEAI_PHONE_NUMBER=
DATABASE_URL=sqlite:///./aven.db
LLM_API_KEY=
```

Only include variables that are actually required by the final
integrations.

## Development With Freebuff and Claude Code

The division of labour is deliberate:

- **Freebuff builds the backend.** It writes the FastAPI app, database,
  extraction service, action engine, seed data, and tests, working from
  `BACKEND_GUIDE.md`.
- **Claude Code tests and reviews.** Once the backend exists, Claude Code
  runs the test suite, fires fake webhook payloads at the running server,
  verifies the extraction and action pipeline end to end, and fixes
  anything broken.

The prompt to give Freebuff lives in `BACKEND_GUIDE.md`. In short:

``` text
Build the Aven backend exactly as specified in BACKEND_GUIDE.md.

Requirements:
- Python, FastAPI, Pydantic v2, SQLite via stdlib sqlite3 (no ORM)
- clean service separation
- environment variables for secrets
- REST endpoints for customers, calls, insights, and actions
- a webhook endpoint for BimpeAI post-call results
- structured LLM extraction from transcripts, with a safe fallback
- a rule-based action engine for recovery workflows
- seed data for a fintech demo (18 customers, 15 past calls)
- a pytest suite that passes with no API key and no network

Do not invent undocumented BimpeAI API fields.
Keep the BimpeAI integration isolated in a single stub service module so
its implementation can be updated after checking the official documentation.
```

`BUILD_GUIDE.md` is the design and rationale reference; `BACKEND_GUIDE.md`
is the step-by-step build spec with the verify command for each step.

## Hackathon Scope

The goal is a convincing working demo, not a production banking
platform.

### Must Have

-   interactive voice conversation
-   customer context
-   post-call transcript/result
-   structured issue extraction
-   recovery action
-   dashboard
-   clear business value

### Nice To Have

-   live dashboard updates
-   multiple voice personas
-   richer analytics
-   more recovery actions
-   customer segmentation
-   historical call timeline

### Cut If Time Runs Out

Do not spend the final minutes building:

-   complex authentication
-   elaborate admin permissions
-   production-grade banking integrations
-   complicated microservices
-   unnecessary frontend animations
-   advanced analytics that do not improve the demo

A smaller system that completes the full loop is more useful for the
demo:

``` text
Customer
   ↓
Voice conversation
   ↓
Understanding
   ↓
Action
   ↓
Recovery
   ↓
Business insight
```

## The Core Demo Message

Aven is not just a chatbot that calls customers.

It is a customer recovery loop:

> **Talk to the customer. Understand what went wrong. Do something about
> it. Learn from the conversation.**

That is the core of the product.
