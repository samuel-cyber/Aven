import type {
  Action,
  Call,
  CallDetail,
  Customer,
  CustomerDetail,
  Insights,
  StartCallResult,
  SyncResult,
  VoiceStatus,
} from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const WEBHOOK_SECRET = import.meta.env.VITE_WEBHOOK_SECRET ?? ''

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, `Can't reach the Aven API at ${API_BASE}`)
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body && typeof body.detail === 'string') detail = body.detail
    } catch {
      /* body was not JSON; keep the status text */
    }
    throw new ApiError(res.status, detail || `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => request<{ status: string; db: string }>('/health'),
  customers: () => request<Customer[]>('/customers?limit=500'),
  customer: (id: string) => request<CustomerDetail>(`/customers/${encodeURIComponent(id)}`),
  calls: () => request<Call[]>('/calls?limit=500'),
  call: (id: string) => request<CallDetail>(`/calls/${encodeURIComponent(id)}`),
  actions: () => request<Action[]>('/actions?limit=500'),
  resolveAction: (id: number) =>
    request<{ ok: boolean }>(`/actions/${id}/resolve`, { method: 'POST' }),
  insights: () => request<Insights>('/insights'),
  voiceStatus: () => request<VoiceStatus>('/voice/status'),
  startCall: (customerId: string, opts?: { destination?: string; isTestCall?: boolean }) => {
    const params = new URLSearchParams()
    if (opts?.destination) params.set('destination', opts.destination)
    if (opts?.isTestCall !== undefined) params.set('is_test_call', String(opts.isTestCall))
    const qs = params.toString()
    return request<StartCallResult>(
      `/voice/customers/${encodeURIComponent(customerId)}/call${qs ? `?${qs}` : ''}`,
      { method: 'POST' },
    )
  },
  syncCall: (customerId: string, callId: string) =>
    request<SyncResult>(
      `/voice/customers/${encodeURIComponent(customerId)}/calls/${encodeURIComponent(callId)}/sync?wait=false`,
      { method: 'POST' },
    ),
  /** Feed a transcript through the same pipeline a finished BimpeAI call uses. */
  postTranscript: (body: {
    call_id: string
    customer_id: string
    transcript: string
    duration_sec: number
  }) =>
    request<{ ok: boolean; duplicate?: boolean }>('/webhooks/bimpeai', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: WEBHOOK_SECRET ? { 'x-webhook-secret': WEBHOOK_SECRET } : {},
    }),
}
