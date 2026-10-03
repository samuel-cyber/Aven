---
name: Aven
description: Voice-first customer recovery for Demo Bank, in the Wise design language.
colors:
  canvas: "#e8ebe6"
  card: "#ffffff"
  card-soft: "#f3f5f1"
  line: "#dfe3dc"
  ink: "#0e0f0c"
  ink-deep: "#163300"
  body: "#454745"
  mute: "#6b6d6a"
  lime: "#9fe870"
  lime-hover: "#cdffad"
  lime-neutral: "#c5edab"
  lime-pale: "#e2f6d5"
  positive: "#2ead4b"
  positive-deep: "#054d28"
  warning: "#ffd11a"
  warning-deep: "#b86700"
  warning-content: "#4a3b1c"
  warning-pale: "#fff4c2"
  negative: "#d03238"
  negative-deep: "#a72027"
  negative-pale: "#fbe3e3"
typography:
  display:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 15.5cqi, 6.5rem)"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Figtree Variable, Figtree, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'calt' 1, 'cv11' 1"
  body-strong:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 650
    lineHeight: 1.45
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.4
  figure:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
rounded:
  card: "24px"
  well: "16px"
  input: "12px"
  avatar: "12px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.lime-hover}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "34px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 16px"
    height: "34px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "24px"
  card-hero:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.lime}"
    rounded: "{rounded.card}"
    padding: "24px 32px"
  well:
    backgroundColor: "{colors.card-soft}"
    rounded: "{rounded.well}"
    padding: "16px 20px"
  badge-recovered:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.lime}"
    rounded: "{rounded.pill}"
    height: "28px"
  badge-progress:
    backgroundColor: "{colors.lime-pale}"
    textColor: "{colors.positive-deep}"
    rounded: "{rounded.pill}"
    height: "28px"
  badge-risk:
    backgroundColor: "{colors.negative-pale}"
    textColor: "{colors.negative-deep}"
    rounded: "{rounded.pill}"
    height: "28px"
  badge-escalated:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.warning-content}"
    rounded: "{rounded.pill}"
    height: "28px"
  segmented-thumb:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "34px"
  search-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    height: "44px"
---

# Design System: Aven

## Overview

**Creative North Star: "The Friendly Ledger"**

Aven borrows the Wise design language (from `design-references/design-md/wise`) and keeps its own brand. It is a calm sage page, white cards with generous 24px corners, one lime accent, and heavy, friendly figures. It is meant to read like a modern consumer fintech app that a bank's ops team would actually enjoy using, not an AI ops console. Recovery is presented as a bank app's activity feed: each dormant customer is a row with a face (initials), a reason and an amount, and Aven's call writes the next line underneath.

Elevation comes from surface contrast, not shadows: white cards on sage, sage-tinted wells inside white cards, and one dark ink card for the headline figure. Colour is semantic. Lime is the brand and the call to action. Green, yellow and red carry status, and they always come with a text label.

Motion is purposeful and has one authored moment. The live-call voice waveform plays while Aven talks. Then the result wipes into the feed with a lime glow, and the figures count to their new values. Everything else is a quick, quiet transition.

**Key Characteristics:**
- Sage canvas, white cards, 24px corners, no borders and no shadows on cards.
- Lime is the primary action and the hero figure only.
- Heavy Figtree figures for money and counts; Inter for the interface.
- Initials avatars and pill badges tinted by status.
- One signature motion sequence: waveform, wipe-in with glow, count-up.

## Colors

The palette is a quiet sage-and-white ground, one vivid lime brand colour, and a full semantic set for status.

### Primary
- **Aven Lime** (#9fe870): the primary call button, the brand mark, the value-at-risk figure on the dark card, and the live waveform. Hover lightens it to Lime Hover (#cdffad).

### Secondary
- **Ink** (#0e0f0c): text, the dark hero card, the live-call card, and Aven's turns in transcripts.
- **Ink Deep** (#163300): the "Recovered" badge and avatar, and the bars in the churn-reason chart.

### Tertiary
- **Lime Pale** (#e2f6d5): selected rows, "Recovery in progress", positive posted results, and the fix-index tiles.
- **Status set:**
  - Positive (#2ead4b / #054d28) is for delivered fixes.
  - Warning (#ffd11a with text #4a3b1c, pale #fff4c2) is for escalations, callbacks and stub notices. The deeper Warning Deep (#b86700) colours the "waiting on a person" icon.
  - Negative (#d03238 / #a72027, pale #fbe3e3) is for money at risk and the "At risk" badge.

### Neutral
- **Sage Canvas** (#e8ebe6): the page ground, nav tab thumb, filter track and secondary buttons.
- **Card** (#ffffff) and **Card Soft** (#f3f5f1): cards, and the wells inside them.
- **Hairline** (#dfe3dc): the only divider colour, always 1px and inset.
- **Body** (#454745) and **Mute** (#6b6d6a): secondary text and captions.

### Named Rules
**The One Lime Rule.** Lime fills the primary call button, the hero figure, the brand mark and the live waveform. Nothing else is lime.

**The Label Beside Colour Rule.** Every status colour is paired with its text label or an icon, so meaning never rests on hue alone.

## Typography

**Display Font:** Figtree Variable (with system-ui), standing in for Wise Sans.
**Body Font:** Inter Variable (with system-ui), the face Wise itself uses for its interface.

**Character:** Figtree at 800 to 900 gives figures and card titles Wise's chunky, friendly weight. Inter keeps labels, tables and prose neutral and legible, with tabular numerals for money.

### Hierarchy
- **Display** (900, sized to its card, about 60 to 104px, letter-spacing -0.035em): the value-at-risk balance only.
- **Headline** (900, 2.5rem): the four statement figures.
- **Title** (800, 1.5rem): card titles and the customer's name (2rem in the panel).
- **Body** (400, 1rem, line-height 1.5): prose, descriptions, transcripts.
- **Body strong** (650, 0.9375rem): names, outcomes, list items.
- **Label** (600, 0.8125rem to 0.875rem): field labels, badges, filters, table headers.
- **Figure** (Inter 650, tabular): every naira amount, rounded to whole naira (`₦25,000`). Compact chart labels use `₦471K` or `₦12.4K`.

### Named Rules
**The Heavy Figures Rule.** Money and counts that matter are set in Figtree at weight 800 or more. Inter carries everything you read rather than scan.

## Layout

- **Overview at desktop (1100px and up).** The first screen fills the viewport, with a minimum height of 600px:
  - a hero row: the dark value-at-risk card at 1fr beside the white stats card at 1.65fr;
  - a work row: the recovery feed at 1.5fr beside the customer panel at minmax(380px, 1fr).
- **Scrolling.** The feed and the panel scroll inside their cards, with a soft bottom fade. The panel header (avatar, name, status) stays put.
- **Below the fold.** The insights sit in a 1.5fr / 1fr grid.
- **Customers and Calls.** A 1.6fr table beside a sticky panel.
- **Content width.** Max 1600px, 28px gutters, 20px gaps; on mobile, 16px gutters and 14px gaps.
- **Spacing.** A 4px scale.
- **Below 1100px.** Everything stacks into one column, and selecting a customer scrolls their panel into view.
- **At 760px and below:**
  - the tabs drop under the brand;
  - the stats go two-up;
  - filter tracks scroll sideways on one row.
- **Customers table below 1600px.** Inactive days and monthly value hide so the table fits beside the panel.

## Elevation & Depth

The system is flat. Cards sit on the sage canvas with no shadow, and inner wells use Card Soft. The dark hero card and the live-call card flip polarity to ink. The only shadows are on floating layers: the chart tooltip (`0 12px 32px -12px rgb(22 51 0 / 0.28), 0 2px 8px -2px rgb(22 51 0 / 0.12)`) and the white thumb of a filter track.

**The Surface Is The Elevation Rule.** Hierarchy comes from white-on-sage and sage-on-white, never from drop shadows on cards.

## Shapes

- **Cards:** 24px corners.
- **Inner wells, outcome lines and queue items:** 16 to 20px.
- **Inputs:** 12px.
- **Initials avatars:** rounded squares with 12px corners.
- **Buttons, badges, tabs and filters:** full pills.
- **Speech bubbles:** the customer's quote and the transcript turns are 18 to 22px, with one tight corner toward the speaker.

## Components

### Buttons
- **Shape:** full pill. Heights are 34 (small), 40 (default) and 52 (large).
- **Primary:** an Aven Lime fill with Ink text, weight 650. There is one per panel: "Call {name}" or "Run the cooperative sample".
- **Secondary:** a Sage Canvas fill. **Outline:** a white fill with a 1px Ink border. **Quiet:** transparent with Body text.
- **Press and hover:** press scales to 0.97 over 140ms. Hover darkens the sage or lightens the lime, and only runs on fine-pointer devices.

### Badges
Full-pill status badges, 28px high, 13px weight 650:
- At risk: negative pale with deep red text.
- Contacted: sage.
- Follow-up: warning pale.
- Recovery in progress: lime pale with deep green text.
- Recovered: Ink Deep with lime text.
- Escalated: warning yellow, with a shield icon.
- On a call: ink with lime text and a mini waveform.

A badge blurs in (260ms) only when its status actually changes.

### Cards and wells
White, 24px corners, 24px padding, no border or shadow. Inner wells (the "what went wrong" block, outcome lines, the recoverable list, queue items) are Card Soft with 16 to 20px corners.

### Inputs
The search field is white with a 1px Ink border, 12px corners and 44px height. Focus adds a 2px ink outline.

### Navigation
A white 72px top bar holds the Aven mark (a lime rounded square with a three-bar voice glyph) and the lowercase Figtree 900 wordmark "aven" with "for Demo Bank". Pill tabs have a sage thumb that slides between them (250ms, ease-in-out). The voice status chip is tinted by state, and the sync dot is static.

### Recovery feed (signature)
Each row shows an initials avatar, the name, the reason and date, the whole-naira amount and a status badge. Under it sits the latest outcome well, with an icon, title, one-line detail and a relative time.

The whole row selects the customer. The selected row is Lime Pale and is kept scrolled into view. Rows re-sort with a 400ms layout animation, and a customer with a call in play stays on top.

### Live call card and posted result (signature motion)
- **Live call:** an ink card holds a pulsing lime live dot and a 28-bar lime waveform. The bars use scaleY, 900ms ease-in-out, alternating with staggered delays. The feed row inverts to ink.
- **Posted result:** the outcome wipes in left to right with `clip-path` (450ms ease-out) and glows lime, fading to its well colour over 2.4s. The panel shows the result, tinted by outcome, and the figures count to their new values (800ms).
- **Reduced motion:** the waveform holds still, the wipe becomes a fade, and the counts jump.

## Do's and Don'ts

### Do:
- **Do** keep lime to the primary action, the hero figure, the mark and the live waveform (The One Lime Rule).
- **Do** show money as whole naira with tabular figures, and show status as a labelled pill.
- **Do** keep the Overview's first screen inside 1280×720: the hero, at least four feed rows, and the panel's call button.
- **Do** animate only state changes and the signature call sequence. Keep tab and filter changes near-imperceptible, and honour reduced motion.
- **Do** label sample conversations and fallback extraction as what they are.

### Don't:
- **Don't** return to the dark console look: no near-black page, no mono status codes, no neon chips.
- **Don't** add shadows or borders to cards, or nest a card inside a card.
- **Don't** use the Wise name, flag mark or wordmark lockup. Aven borrows the design language, not the brand.
- **Don't** run looping animations at rest. Only the live call is allowed to move continuously.
- **Don't** set display type tighter than -0.035em, or below weight 800 for headline figures.
