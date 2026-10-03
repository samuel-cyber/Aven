// Shapes returned by the Aven FastAPI backend (backend/app/schemas.py + routes).

export type CustomerStatus = 'dormant' | 'contacted' | 'recovered' | 'escalated' | 'follow_up'

export type ActionType =
  | 'retry_ticket'
  | 'fee_waiver'
  | 'reactivation_link'
  | 'human_callback'
  | 'fraud_escalation'

export type Resolution = ActionType | 'none'

export interface Customer {
  id: string
  name: string
  phone: string
  preferred_language: string | null
  last_active_date: string | null
  dormant_balance_ngn: number
  est_monthly_value_ngn: number
  last_event_type: string | null
  last_event_detail: string | null
  last_event_date: string | null
  status: CustomerStatus | string
}

export interface Call {
  id: string
  customer_id: string
  status: string
  transcript?: string | null
  duration_sec: number
  created_at: string | null
  churn_reason: string | null
  reason_detail: string | null
  issue: string | null
  sentiment: string | null
  intent_to_return: string | null
  urgency: string | null
  recovery_possible: number
  fraud_flag: number
  fraud_detail: string | null
  resolution_offered: Resolution | string | null
  customer_accepted: number
  follow_up_needed: number
  summary: string | null
  recommended_product_fix: string | null
  extraction_source: string | null
}

export interface Action {
  id: number
  call_id: string | null
  customer_id: string | null
  type: ActionType | string
  detail: string | null
  status: 'open' | 'done' | string
  urgent: number
  created_at: string | null
}

export interface CustomerDetail extends Customer {
  calls: Call[]
  actions: Action[]
}

export interface CallDetail extends Call {
  actions: Action[]
}

export interface InsightKpi {
  contacted: number
  recovered: number
  escalated: number
  recovery_rate: number
  ngn_at_risk: number
  ngn_recovered: number
  open_actions: number
  open_escalations: number
}

export interface Insights {
  kpi: InsightKpi
  by_reason: { reason: string; calls: number; ngn_at_risk: number; recovered: number }[]
  by_issue: { issue: string | null; calls: number }[]
  top_product_fixes: { fix: string | null; calls: number }[]
}

export interface VoiceStatus {
  configured: boolean
  base_url: string
  api_path: string
  agent_id: string | null
  is_test_call: boolean
  has_phone_number: boolean
}

export interface StartCallResult {
  ok: boolean
  customer_id: string
  call_id: string | null
  status: 'initiated' | 'stubbed' | string | null
  detail: unknown
  is_test_call: boolean | null
  poll_url: string | null
}

export interface SyncResult {
  ok: boolean
  customer_id: string
  call_id: string
  status?: string | null
  processed?: boolean
  already_processed?: boolean
  error?: string
  duration_sec?: number
}
