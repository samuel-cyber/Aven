// Formatting and vocabulary shared by every view.

const nairaFull = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const nairaWhole = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 })

/** ₦25,400.00, the way a bank alert prints it. */
export function naira(value: number | null | undefined): string {
  return `₦${nairaFull.format(value ?? 0)}`
}

/** ₦25,400, for headline figures. */
export function nairaRound(value: number | null | undefined): string {
  return `₦${nairaWhole.format(Math.round(value ?? 0))}`
}

/** ₦1.06M / ₦346.7K, for axis-free chart labels. */
export function nairaCompact(value: number): string {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`
  if (value >= 100_000) return `₦${Math.round(value / 1_000)}K`
  if (value >= 1_000) return `₦${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `₦${Math.round(value)}`
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** SQLite CURRENT_TIMESTAMP has no zone; it is UTC. ISO strings from the seed carry one. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  let v = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = `${v}T00:00:00Z`
  else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)) v = `${v.replace(' ', 'T')}Z`
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysSince(value: string | null | undefined, now = Date.now()): number | null {
  const d = parseDate(value)
  if (!d) return null
  return Math.max(0, Math.floor((now - d.getTime()) / 86_400_000))
}

export function relativeTime(value: string | null | undefined, now = Date.now()): string {
  const d = parseDate(value)
  if (!d) return 'unknown'
  const secs = Math.max(0, Math.round((now - d.getTime()) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 60) return `${days} days ago`
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** 10d ago / 3h ago / just now, for narrow table columns. */
export function compactAgo(ms: number, now = Date.now()): string {
  const secs = Math.max(0, Math.round((now - ms) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** 12 Sep, for alert date columns. */
export function shortDate(value: string | null | undefined): string {
  const d = parseDate(value)
  if (!d) return ''
  return d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })
}

export function clock(value: string | null | undefined): string {
  const d = parseDate(value)
  if (!d) return ''
  return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** +234 803 *** 4501. Enough to recognise a number on a projector, not enough to dial it. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/[^\d+]/g, '')
  const m = digits.match(/^\+?234(\d{3})\d*(\d{4})$/)
  if (m) return `+234 ${m[1]} *** ${m[2]}`
  return digits.length > 6 ? `${digits.slice(0, 4)} *** ${digits.slice(-4)}` : digits
}

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

function humanize(value: string | null | undefined): string {
  if (!value) return 'Unknown'
  const s = value.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const EVENT_LABELS: Record<string, string> = {
  failed_transfer: 'Transfer failed',
  fee_charge: 'Unexpected fee',
  card_declined: 'Card declined',
  kyc_block: 'Account restricted',
}

export function eventLabel(type: string | null | undefined): string {
  return (type && EVENT_LABELS[type]) || humanize(type)
}

const ISSUE_LABELS: Record<string, string> = {
  failed_transfer: 'Failed transfer',
  unexpected_fee: 'Unexpected fee',
  poor_ux: 'Poor app experience',
  card_problem: 'Card problem',
  kyc_block: 'KYC block',
  fraud_report: 'Fraud report',
  no_need: 'No longer needs it',
  other: 'Other',
}

export function issueLabel(issue: string | null | undefined): string {
  return (issue && ISSUE_LABELS[issue]) || humanize(issue)
}

const REASON_LABELS: Record<string, string> = {
  failed_transaction: 'Failed transactions',
  fees: 'Fees',
  trust_security: 'Trust and security',
  bad_support: 'Poor support',
  competitor: 'Moved to a competitor',
  no_need: 'No longer needs it',
  other: 'Unclear, needs review',
}

export function reasonLabel(reason: string | null | undefined): string {
  return (reason && REASON_LABELS[reason]) || humanize(reason)
}

const ACTION_LABELS: Record<string, string> = {
  retry_ticket: 'Retry / reversal ticket',
  fee_waiver: 'Fee waiver',
  reactivation_link: 'Reactivation link',
  human_callback: 'Human callback',
  fraud_escalation: 'Fraud escalation',
  none: 'No action',
}

export function actionLabel(type: string | null | undefined): string {
  return (type && ACTION_LABELS[type]) || humanize(type)
}

export function sentimentLabel(s: string | null | undefined): string {
  return humanize(s)
}

const INTENT_LABELS: Record<string, string> = {
  yes: 'Willing to return',
  maybe: 'Unsure',
  no: 'Not returning',
}

export function intentLabel(intent: string | null | undefined): string {
  return (intent && INTENT_LABELS[intent]) || humanize(intent)
}

export function urgencyLabel(u: string | null | undefined): string {
  return humanize(u)
}
