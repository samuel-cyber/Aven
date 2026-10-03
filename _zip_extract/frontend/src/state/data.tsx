import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiError } from '../api/client'
import type { Action, Call, Customer, Insights, VoiceStatus } from '../api/types'
import { newSimCallId, type Scenario } from '../lib/scripts'

const REFRESH_MS = 3000
const VOICE_REFRESH_MS = 30000
const LIVE_SYNC_MS = 5000
const TERMINAL_REMOTE = new Set(['ended', 'completed', 'failed', 'cancelled', 'canceled', 'no-answer', 'busy'])

export type CallPhase = 'dialing' | 'live' | 'stubbed' | 'posting' | 'posted' | 'error'

export interface CallSession {
  customerId: string
  phase: CallPhase
  callId: string | null
  startedAt: number
  isTest: boolean | null
  simulated: boolean
  scenario?: string
  remoteStatus?: string | null
  message?: string
}

type Connection = 'loading' | 'ok' | 'error'

interface DataState {
  customers: Customer[]
  calls: Call[]
  actions: Action[]
  insights: Insights | null
  voice: VoiceStatus | null
  connection: Connection
  error: string | null
  lastSync: number | null
  freshCallIds: Set<string>
  sessions: Record<string, CallSession>
  selectedId: string | null
  select: (id: string) => void
  refresh: () => Promise<void>
  startCall: (customer: Customer) => Promise<void>
  syncNow: (customerId: string) => Promise<void>
  runScenario: (customer: Customer, scenario: Scenario) => Promise<void>
  dismissSession: (customerId: string) => void
  resolveAction: (id: number) => Promise<void>
}

const DataContext = createContext<DataState | null>(null)

function messageOf(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return 'The backend rejected the webhook secret. Set VITE_WEBHOOK_SECRET in frontend/.env to match WEBHOOK_SECRET.'
    }
    return err.message
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [insights, setInsights] = useState<Insights | null>(null)
  const [voice, setVoice] = useState<VoiceStatus | null>(null)
  const [connection, setConnection] = useState<Connection>('loading')
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [freshCallIds, setFreshCallIds] = useState<Set<string>>(() => new Set())
  const [sessions, setSessions] = useState<Record<string, CallSession>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const inFlight = useRef(false)
  const knownCallIds = useRef<Set<string> | null>(null)
  const syncing = useRef<Set<string>>(new Set())
  const sessionsRef = useRef(sessions)
  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  const patchSession = useCallback((customerId: string, patch: Partial<CallSession>) => {
    setSessions((prev) => {
      const current = prev[customerId]
      if (!current) return prev
      return { ...prev, [customerId]: { ...current, ...patch } }
    })
  }, [])

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const [cu, ca, ac, ins] = await Promise.all([
        api.customers(),
        api.calls(),
        api.actions(),
        api.insights(),
      ])
      // Calls that appear after the first load get the "posted" treatment once.
      if (knownCallIds.current) {
        const fresh = ca.filter((c) => !knownCallIds.current!.has(c.id)).map((c) => c.id)
        if (fresh.length) {
          setFreshCallIds((prev) => new Set([...prev, ...fresh]))
          window.setTimeout(() => {
            setFreshCallIds((prev) => {
              const next = new Set(prev)
              fresh.forEach((id) => next.delete(id))
              return next
            })
          }, 6000)
        }
      }
      knownCallIds.current = new Set(ca.map((c) => c.id))
      setCustomers(cu)
      setCalls(ca)
      setActions(ac)
      setInsights(ins)
      setConnection('ok')
      setError(null)
      setLastSync(Date.now())
      setSelectedId((cur) => {
        if (cur && cu.some((c) => c.id === cur)) return cur
        const atRisk = cu
          .filter((c) => c.status === 'dormant')
          .sort((a, b) => b.dormant_balance_ngn - a.dormant_balance_ngn)
        return atRisk[0]?.id ?? cu[0]?.id ?? null
      })
    } catch (err) {
      setConnection('error')
      setError(messageOf(err))
    } finally {
      inFlight.current = false
    }
  }, [])

  const refreshVoice = useCallback(async () => {
    try {
      setVoice(await api.voiceStatus())
    } catch {
      /* the main refresh already reports connection problems */
    }
  }, [])

  // Poll the API. Paused while the tab is hidden so a forgotten tab costs nothing.
  useEffect(() => {
    const first = window.setTimeout(() => {
      void refresh()
      void refreshVoice()
    }, 0)
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, REFRESH_MS)
    const voiceTick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshVoice()
    }, VOICE_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(tick)
      window.clearInterval(voiceTick)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, refreshVoice])

  const syncNow = useCallback(
    async (customerId: string) => {
      const session = sessionsRef.current[customerId]
      if (!session?.callId || session.phase !== 'live') return
      if (syncing.current.has(customerId)) return
      syncing.current.add(customerId)
      try {
        const res = await api.syncCall(customerId, session.callId)
        if (res.ok && (res.processed || res.already_processed)) {
          patchSession(customerId, { phase: 'posted', remoteStatus: res.status ?? 'ended' })
          await refresh()
        } else if (res.status && TERMINAL_REMOTE.has(res.status.toLowerCase())) {
          patchSession(customerId, {
            phase: 'error',
            remoteStatus: res.status,
            message: 'The call ended without a transcript. It may not have connected.',
          })
        } else {
          patchSession(customerId, { remoteStatus: res.status ?? null })
        }
      } catch (err) {
        patchSession(customerId, { message: messageOf(err) })
      } finally {
        syncing.current.delete(customerId)
      }
    },
    [patchSession, refresh],
  )

  // While a real call is live, keep asking BimpeAI for its transcript.
  const liveIds = Object.values(sessions)
    .filter((s) => s.phase === 'live')
    .map((s) => s.customerId)
    .join(',')
  useEffect(() => {
    if (!liveIds) return
    const tick = window.setInterval(() => {
      liveIds.split(',').forEach((id) => void syncNow(id))
    }, LIVE_SYNC_MS)
    return () => window.clearInterval(tick)
  }, [liveIds, syncNow])

  const startCall = useCallback(
    async (customer: Customer) => {
      setSessions((prev) => ({
        ...prev,
        [customer.id]: {
          customerId: customer.id,
          phase: 'dialing',
          callId: null,
          startedAt: Date.now(),
          isTest: null,
          simulated: false,
        },
      }))
      try {
        const res = await api.startCall(customer.id)
        if (res.status === 'initiated' && res.call_id) {
          patchSession(customer.id, {
            phase: 'live',
            callId: res.call_id,
            isTest: res.is_test_call,
            startedAt: Date.now(),
          })
        } else {
          patchSession(customer.id, {
            phase: 'stubbed',
            message: 'BimpeAI is not configured on the backend, so no phone call was placed.',
          })
        }
      } catch (err) {
        patchSession(customer.id, { phase: 'error', message: messageOf(err) })
      }
    },
    [patchSession],
  )

  const runScenario = useCallback(
    async (customer: Customer, scenario: Scenario) => {
      const callId = newSimCallId()
      setSessions((prev) => ({
        ...prev,
        [customer.id]: {
          customerId: customer.id,
          phase: 'posting',
          callId,
          startedAt: Date.now(),
          isTest: true,
          simulated: true,
          scenario: scenario.label,
        },
      }))
      try {
        await api.postTranscript({
          call_id: callId,
          customer_id: customer.id,
          transcript: scenario.build(customer),
          duration_sec: scenario.durationSec,
        })
        // The webhook processes in the background; wait for the call row to land.
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => window.setTimeout(r, 600))
          try {
            await api.call(callId)
            patchSession(customer.id, { phase: 'posted' })
            await refresh()
            return
          } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 404) throw err
          }
        }
        patchSession(customer.id, {
          phase: 'error',
          message: 'The transcript was accepted but processing is taking too long. Check the backend logs.',
        })
      } catch (err) {
        patchSession(customer.id, { phase: 'error', message: messageOf(err) })
      }
    },
    [patchSession, refresh],
  )

  const dismissSession = useCallback((customerId: string) => {
    setSessions((prev) => {
      const next = { ...prev }
      delete next[customerId]
      return next
    })
  }, [])

  const resolveAction = useCallback(
    async (id: number) => {
      await api.resolveAction(id)
      await refresh()
    },
    [refresh],
  )

  const value = useMemo<DataState>(
    () => ({
      customers,
      calls,
      actions,
      insights,
      voice,
      connection,
      error,
      lastSync,
      freshCallIds,
      sessions,
      selectedId,
      select: setSelectedId,
      refresh,
      startCall,
      syncNow,
      runScenario,
      dismissSession,
      resolveAction,
    }),
    [
      customers,
      calls,
      actions,
      insights,
      voice,
      connection,
      error,
      lastSync,
      freshCallIds,
      sessions,
      selectedId,
      refresh,
      startCall,
      syncNow,
      runScenario,
      dismissSession,
      resolveAction,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}
