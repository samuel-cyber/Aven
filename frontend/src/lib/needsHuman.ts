// One definition of "needs a human", shared by every count on screen:
// the statement header, the Actions tab badge, the ledger's Holds filter,
// the Needs a human panel and the Actions view.

import type { Action, Call, Customer } from '../api/types'
import { actionLabel, parseDate } from './format'
import { actionTone } from './ledger'

export interface HumanItem {
  key: string
  customerId: string
  name: string
  title: string
  detail: string
  urgent: boolean
  at: string | null
  actionId: number | null
  more: number
}

const time = (v: string | null | undefined) => parseDate(v)?.getTime() ?? 0

/** One entry per customer: their most urgent open HOLD action, or their escalation. */
export function needsHuman(customers: Customer[], actions: Action[], calls: Call[]): HumanItem[] {
  const items: HumanItem[] = []
  for (const c of customers) {
    const holds = actions
      .filter((a) => a.customer_id === c.id && actionTone(a).tone === 'hold')
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || time(b.created_at) - time(a.created_at))
    if (holds.length) {
      const top = holds[0]
      items.push({
        key: `a-${top.id}`,
        customerId: c.id,
        name: c.name,
        title: actionLabel(top.type),
        detail: top.detail ?? '',
        urgent: Boolean(top.urgent) || top.type === 'fraud_escalation' || c.status === 'escalated',
        at: top.created_at,
        actionId: top.id,
        more: holds.length - 1,
      })
    } else if (c.status === 'escalated') {
      const fraud = calls
        .filter((k) => k.customer_id === c.id && k.fraud_flag)
        .sort((a, b) => time(b.created_at) - time(a.created_at))[0]
      items.push({
        key: `c-${c.id}`,
        customerId: c.id,
        name: c.name,
        title: 'Fraud escalation',
        detail: fraud?.fraud_detail ?? fraud?.summary ?? 'Escalated for specialist review.',
        urgent: true,
        at: fraud?.created_at ?? null,
        actionId: null,
        more: 0,
      })
    }
  }
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent) || time(b.at) - time(a.at))
}
