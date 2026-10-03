// The alert-ledger model: every dormant customer is a debit (DR) that went wrong,
// every Aven call posts the answering line (CR, HOLD or NOTE) underneath it.

import type { Action, Call, Customer } from '../api/types'
import { actionLabel, parseDate } from './format'

export type Tone = 'dr' | 'cr' | 'hold' | 'note' | 'live'

export type DisplayStatus =
  | 'at_risk'
  | 'on_call'
  | 'contacted'
  | 'follow_up'
  | 'in_progress'
  | 'recovered'
  | 'escalated'

/** Badge look per status, from the Wise semantic palette. */
export type BadgeVariant = 'risk' | 'neutral' | 'followup' | 'progress' | 'recovered' | 'escalated' | 'live'

export const STATUS_META: Record<DisplayStatus, { label: string; variant: BadgeVariant }> = {
  at_risk: { label: 'At risk', variant: 'risk' },
  on_call: { label: 'On a call', variant: 'live' },
  contacted: { label: 'Contacted', variant: 'neutral' },
  follow_up: { label: 'Follow-up', variant: 'followup' },
  in_progress: { label: 'Recovery in progress', variant: 'progress' },
  recovered: { label: 'Recovered', variant: 'recovered' },
  escalated: { label: 'Escalated', variant: 'escalated' },
}

export function displayStatus(
  customer: Customer,
  actions: Action[],
  onCall = false,
): DisplayStatus {
  if (onCall) return 'on_call'
  switch (customer.status) {
    case 'dormant':
      return 'at_risk'
    case 'escalated':
      return 'escalated'
    case 'follow_up':
      return 'follow_up'
    case 'recovered': {
      const mine = actions.filter((a) => a.customer_id === customer.id)
      // An accepted fix whose workflow is still open is recovery in progress;
      // once every action is resolved the customer is recovered.
      return mine.some((a) => a.status !== 'done') ? 'in_progress' : 'recovered'
    }
    default:
      return 'contacted'
  }
}

export interface CreditLine {
  key: string
  tone: Exclude<Tone, 'dr' | 'live'>
  code: 'CR' | 'HOLD' | 'NOTE'
  title: string
  detail: string
  at: string | null
  callId: string
  actionIds: number[]
  open: boolean
}

export interface LedgerEntry {
  customer: Customer
  status: DisplayStatus
  credits: CreditLine[]
  latestAt: number
  needsHuman: boolean
}

/** Callbacks and escalations wait on a person (HOLD); delivered fixes are credits (CR). */
export function actionTone(a: Pick<Action, 'type' | 'urgent' | 'status'>): { tone: 'cr' | 'hold' | 'note'; code: string } {
  if (a.status === 'done') return { tone: 'note', code: 'DONE' }
  if (a.urgent || a.type === 'fraud_escalation' || a.type === 'human_callback') return { tone: 'hold', code: 'HOLD' }
  return { tone: 'cr', code: 'CR' }
}

/** Turn one processed call (plus any action rows it produced) into its posted line. */
export function creditForCall(call: Call, actions: Action[]): CreditLine {
  const mine = actions.filter((a) => a.call_id === call.id)
  const open = mine.some((a) => a.status !== 'done')
  const firstDetail = mine.find((a) => a.detail)?.detail ?? null
  const base = {
    key: call.id,
    at: call.created_at,
    callId: call.id,
    actionIds: mine.map((a) => a.id),
    open,
  }

  if (call.fraud_flag) {
    return {
      ...base,
      tone: 'hold',
      code: 'HOLD',
      title: 'Fraud escalated to a specialist',
      detail: firstDetail ?? call.fraud_detail ?? call.summary ?? 'Suspected fraud reported on the call.',
    }
  }
  const offered = call.resolution_offered ?? 'none'
  if (call.customer_accepted && offered === 'human_callback') {
    return {
      ...base,
      tone: 'hold',
      code: 'HOLD',
      title: 'Human callback agreed',
      detail: firstDetail ?? call.summary ?? '',
    }
  }
  if (call.customer_accepted && offered !== 'none') {
    return {
      ...base,
      tone: 'cr',
      code: 'CR',
      title: `${actionLabel(offered)} agreed`,
      detail: firstDetail ?? call.summary ?? '',
    }
  }
  if (mine.length > 0) {
    // No accepted fix, but the engine still queued something (a follow-up callback).
    return {
      ...base,
      tone: 'hold',
      code: 'HOLD',
      title: `${actionLabel(mine[0].type)} queued`,
      detail: firstDetail ?? call.summary ?? '',
    }
  }
  return {
    ...base,
    tone: 'note',
    code: 'NOTE',
    title: offered !== 'none' ? `${actionLabel(offered)} offered, declined` : 'Spoke to customer, no action agreed',
    detail: call.summary ?? call.reason_detail ?? '',
  }
}

export function buildLedger(
  customers: Customer[],
  calls: Call[],
  actions: Action[],
  liveCustomerIds: Set<string>,
  humanIds: Set<string>,
  pinnedIds: Set<string> = new Set(),
): LedgerEntry[] {
  const callsByCustomer = new Map<string, Call[]>()
  for (const c of calls) {
    const list = callsByCustomer.get(c.customer_id) ?? []
    list.push(c)
    callsByCustomer.set(c.customer_id, list)
  }

  return customers
    .map((customer) => {
      const mine = (callsByCustomer.get(customer.id) ?? []).slice().sort(
        (a, b) => (parseDate(b.created_at)?.getTime() ?? 0) - (parseDate(a.created_at)?.getTime() ?? 0),
      )
      const credits = mine.map((call) => creditForCall(call, actions))
      const latestAt = Math.max(
        parseDate(mine[0]?.created_at)?.getTime() ?? 0,
        parseDate(customer.last_event_date)?.getTime() ?? 0,
      )
      return {
        customer,
        status: displayStatus(customer, actions, liveCustomerIds.has(customer.id)),
        credits,
        latestAt,
        needsHuman: humanIds.has(customer.id),
      }
    })
    // A customer whose call is in play stays on top until the presenter dismisses it,
    // so the posted line lands in view. Then open debits, so someone to call is on screen.
    .sort(
      (a, b) =>
        Number(pinnedIds.has(b.customer.id)) - Number(pinnedIds.has(a.customer.id)) ||
        Number(isOpen(b)) - Number(isOpen(a)) ||
        b.latestAt - a.latestAt,
    )
}

function isOpen(e: { status: DisplayStatus }): boolean {
  return e.status === 'at_risk' || e.status === 'on_call'
}

export type LedgerFilter = 'all' | 'open' | 'answered' | 'holds'

export function matchesFilter(entry: LedgerEntry, filter: LedgerFilter): boolean {
  switch (filter) {
    case 'open':
      return entry.credits.length === 0 || entry.status === 'at_risk' || entry.status === 'on_call'
    case 'answered':
      return entry.credits.some((c) => c.tone === 'cr')
    case 'holds':
      return entry.needsHuman
    default:
      return true
  }
}

/** Value still exposed: dormant balances of everyone not yet won back. */
export function valueStillAtRisk(customers: Customer[]): number {
  return customers
    .filter((c) => c.status !== 'recovered')
    .reduce((sum, c) => sum + (c.dormant_balance_ngn || 0), 0)
}
