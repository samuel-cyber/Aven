// Rehearsal transcripts for the five conversations the build guide asks to test.
// They run through the real pipeline (POST /webhooks/bimpeai) when no phone call
// can be placed, so the demo works with zero API keys. They are clearly labelled
// as sample conversations in the UI; nothing here pretends to be a real call.

import type { Customer } from '../api/types'
import { eventLabel, firstName } from './format'

export interface Scenario {
  id: 'cooperative' | 'angry' | 'vague' | 'fraud' | 'refuses'
  label: string
  hint: string
  durationSec: number
  build: (c: Customer) => string
}

function eventPhrase(c: Customer): string {
  const detail = (c.last_event_detail ?? '').replace(/\s*NGN/g, ' naira').trim()
  return detail ? detail.charAt(0).toLowerCase() + detail.slice(1) : eventLabel(c.last_event_type).toLowerCase()
}

function opener(c: Customer): string {
  const name = firstName(c.name) || 'there'
  return `agent: Hi ${name}, this is Aven, an AI assistant calling from Demo Bank. Is now a good time for a quick chat?`
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'cooperative',
    label: 'Cooperative',
    hint: 'Explains the problem and accepts the fix',
    durationSec: 128,
    build: (c) =>
      [
        opener(c),
        'customer: Yes, go ahead.',
        `agent: I'll keep this brief. I noticed you haven't used the app in a while, and I saw ${eventPhrase(c)}. Was that part of the problem?`,
        "customer: Yes. I got tired of trying. The money left my account and I never saw it again.",
        "agent: I understand, that would be frustrating. I can raise a priority reversal request right now. Would you like me to do that?",
        "customer: Yes please. If it's sorted I'll start using the app again.",
        "agent: Done. I've flagged it for review and you'll get an update within 24 hours. Thanks for explaining.",
      ].join('\n'),
  },
  {
    id: 'angry',
    label: 'Angry',
    hint: 'Frustrated, wants a human to call back',
    durationSec: 74,
    build: (c) =>
      [
        opener(c),
        "customer: Honestly I'm angry. Nobody at your bank picks up the phone.",
        `agent: I'm sorry. I can hear that this has been a bad experience. Is it about ${eventPhrase(c)}?`,
        "customer: Yes, and I've complained three times already. I don't want another robot.",
        'agent: That is fair. I can have a person from the support team call you back within 24 hours. Would that help?',
        'customer: Fine. Have someone call me.',
        "agent: I've booked that callback. Thank you for your patience.",
      ].join('\n'),
  },
  {
    id: 'vague',
    label: 'Vague',
    hint: 'Unsure why they stopped',
    durationSec: 96,
    build: (c) =>
      [
        opener(c),
        "customer: Okay. I just stopped using it, I don't really know.",
        "agent: No problem. Was there anything about the app that made it harder to use?",
        "customer: Maybe. It's slow sometimes and I couldn't find things.",
        'agent: That helps. Would a quick link to reactivate and a guide to the new app layout be useful?',
        'customer: Maybe, I will see.',
        "agent: I'll send it by SMS so you can look when it suits you. Thanks for your time.",
      ].join('\n'),
  },
  {
    id: 'fraud',
    label: 'Fraud report',
    hint: 'Reports money taken after a scam call',
    durationSec: 141,
    build: (c) =>
      [
        opener(c),
        'customer: Someone called me pretending to be from the bank and money left my account. I stopped using the app after that.',
        "agent: I'm really sorry that happened. To be clear, I will never ask for your PIN, OTP or password. I'm escalating this to our fraud specialists now.",
        'customer: Okay. It was about forty thousand naira.',
        'agent: Thank you. A specialist will call you back urgently today. Please do not share any codes with anyone who calls you.',
        'customer: Alright, thank you.',
      ].join('\n'),
  },
  {
    id: 'refuses',
    label: 'Refuses',
    hint: "Doesn't want to talk",
    durationSec: 22,
    build: (c) =>
      [
        opener(c),
        "customer: No, I'm not interested. Please don't call me again.",
        "agent: Understood. I won't take more of your time. Have a good day.",
      ].join('\n'),
  },
]

export function newSimCallId(): string {
  return `SIM-${Date.now().toString(36).toUpperCase()}`
}
