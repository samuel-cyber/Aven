---
version: 1
slug: "frontend-src-app-tsx"
primary_target: "frontend/src/App.tsx"
related_targets: ["frontend/index.html"]
---

# Aven ops dashboard (frontend/)

Scope: the whole React app in `frontend/` (Overview, Customers, Calls, Actions, customer panel with call control). Visitor mode: **Operate**. Primary scene: hackathon projector demo; secondary: ops/customer-success team.

Job: show who went dormant and how much is at risk, start a recovery call, show what Aven understood and did, and move the recovery numbers. Constraints: FastAPI REST only; zero-key mode (stubbed calls, fallback extraction) must read as intentional; never fabricate customers, benchmarks or claims; all data is fictional demo seed data.

Redesign note: the first build (dark navy "Debit Alert" ledger with mono DR/CR codes) was rejected by the user as reading AI-generated. That look is the anti-reference: no dark neon dashboard, no mono status codes, no outline chips everywhere.

## Direction contract

THESIS: Aven looks like a modern consumer fintech app, not an AI ops console: a calm sage canvas, white rounded cards, one lime accent, heavy friendly figures. Recovery reads like a bank app's activity feed where every dormant customer has a story and Aven's call writes the next line. Refuses the dark dashboard with neon status chips.

OWN-WORLD: User-pinned to the Wise design language from design-references/design-md/wise (Wise-inspired, Aven-branded). Sage canvas #e8ebe6, white cards at 24px radius with no borders or shadows (surface contrast is the elevation), near-black olive ink #0e0f0c, lime #9fe870 only for primary actions and the hero figure, full semantic palette (positive green, warning yellow, negative red, maroon) for status. Figtree 800-900 for display figures (Wise Sans substitute), Inter for UI and tabular figures. Pill buttons, pill status badges, rounded-square initials avatars.

STORY: The visitor sees the naira still at risk on a dark hero card, scans a recovery feed of real people, picks one, starts the call, watches a live voice waveform while Aven talks, then sees the result post into the feed and the numbers count to their new values.

FIRST VIEWPORT: White top bar (Aven wordmark, pill tabs with sliding indicator, voice and sync status). Row 1: dark ink hero card with value at risk in lime at display scale plus the dormant minus recovered balance; white stats card with contacted, recovered, recovery rate, open escalations. Row 2: recovery feed card (left, wider) with filter pills; selected customer card (right) with what went wrong, the lime call button, live call state and what Aven understood.

FORM: User-pinned direction (Wise design system from the downloaded awesome-design-md references), so no concept-seed roll. Motion grammar: Motion (motion/react) for layout reorder, shared-layout tab and filter indicators, panel swap and posted lines; CSS for press, waveform and chart reveal. Signature interaction: the live-call waveform, then the posted activity line wiping in under the customer while hero and stat figures count to their new values. Reduced motion keeps fades, drops movement.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
