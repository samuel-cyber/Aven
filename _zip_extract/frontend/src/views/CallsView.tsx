import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { CallDetail } from '../api/types'
import { useData } from '../state/data'
import { Understanding } from '../components/Understanding'
import { motion } from 'motion/react'
import { Avatar, OutcomeIcon, Segmented } from '../components/primitives'
import { actionLabel, clock, duration, issueLabel, parseDate, relativeTime, shortDate } from '../lib/format'
import { actionTone, creditForCall } from '../lib/ledger'
import { href, navigate } from '../lib/router'
import { parseTranscript } from '../lib/transcript'

type CallFilter = 'all' | 'fraud' | 'accepted' | 'declined'

export function CallsView({ param }: { param: string | null }) {
  const { calls, customers, actions, connection } = useData()
  const [filter, setFilter] = useState<CallFilter>('all')

  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])
  const sorted = useMemo(
    () =>
      calls
        .slice()
        .sort((a, b) => (parseDate(b.created_at)?.getTime() ?? 0) - (parseDate(a.created_at)?.getTime() ?? 0))
        .filter((c) => {
          if (filter === 'fraud') return Boolean(c.fraud_flag)
          if (filter === 'accepted') return Boolean(c.customer_accepted) && !c.fraud_flag
          if (filter === 'declined') return !c.customer_accepted && !c.fraud_flag
          return true
        }),
    [calls, filter],
  )
  const selected = param ?? sorted[0]?.id ?? null

  return (
    <div className="split">
      <section className="card table-card enter" aria-labelledby="calls-title">
        <div className="card-head">
          <div>
            <h1 id="calls-title" className="card-title">
              Calls
            </h1>
            <p className="card-sub">Every conversation Aven has had, newest first</p>
          </div>
          <Segmented
            label="Filter calls"
            value={filter}
            onChange={setFilter}
            options={(
              [
                ['all', 'All'],
                ['accepted', 'Fix agreed'],
                ['declined', 'No fix'],
                ['fraud', 'Fraud'],
              ] as [CallFilter, string][]
            ).map(([id, label]) => ({ id, label }))}
          />
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Customer</th>
                <th scope="col">Issue</th>
                <th scope="col">Outcome</th>
                <th scope="col" className="num">
                  Length
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const line = creditForCall(c, actions)
                return (
                  <tr key={c.id} className={c.id === selected ? 'is-selected' : undefined} onClick={() => navigate('calls', c.id)}>
                    <td>
                      <button type="button" className="row-link is-stacked" onClick={() => navigate('calls', c.id)}>
                        <span className="cell-strong num">{shortDate(c.created_at)}</span>
                        <span className="cell-sub num">{clock(c.created_at)}</span>
                      </button>
                    </td>
                    <td>
                      <span className="cell-strong">{names.get(c.customer_id) ?? c.customer_id}</span>
                      <span className="cell-sub num">{c.id}</span>
                    </td>
                    <td>{issueLabel(c.issue)}</td>
                    <td className="cell-wrap">
                      <span className="outcome">
                        <OutcomeIcon tone={line.tone} />
                        {line.title}
                      </span>
                    </td>
                    <td className="num">{duration(c.duration_sec)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {sorted.length === 0 && connection !== 'loading' && (
            <p className="empty">No calls here yet. Start one from the Overview and it lands at the top.</p>
          )}
        </div>
      </section>
      <CallDetailPanel callId={selected} customerName={selected ? names.get(calls.find((c) => c.id === selected)?.customer_id ?? '') : undefined} />
    </div>
  )
}

function CallDetailPanel({ callId, customerName }: { callId: string | null; customerName?: string }) {
  const { lastSync } = useData()
  const [detail, setDetail] = useState<CallDetail | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!callId) return
    let cancelled = false
    api
      .call(callId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
          setMissing(false)
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [callId, lastSync])

  if (!callId) {
    return (
      <aside className="card customer-panel is-empty">
        <p className="empty">Select a call to read the conversation.</p>
      </aside>
    )
  }
  if (missing && detail?.id !== callId) {
    return (
      <aside className="card customer-panel is-empty">
        <p className="empty">That call could not be loaded. It may have been removed by a reseed.</p>
      </aside>
    )
  }
  if (!detail || detail.id !== callId) {
    return (
      <aside className="card customer-panel" aria-busy="true">
        <div className="cp-inner">
          <div className="skeleton" style={{ height: 28, width: '60%' }} />
          <div className="skeleton" style={{ height: 180 }} />
        </div>
      </aside>
    )
  }

  const turns = parseTranscript(detail.transcript)

  return (
    <aside className="card customer-panel" aria-labelledby="call-detail-title">
      <motion.div
        key={detail.id}
        className="cp-inner"
        initial={{ opacity: 0, transform: 'translateY(10px)' }}
        animate={{ opacity: 1, transform: 'translateY(0px)' }}
        transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
      >
      <header className="cp-head">
        <Avatar name={customerName ?? detail.customer_id} size={52} />
        <div className="cp-id">
          <h2 id="call-detail-title" className="cp-name">
            {customerName ?? detail.customer_id}
          </h2>
          <p className="cp-ref num">
            {detail.id} · {relativeTime(detail.created_at)} · {duration(detail.duration_sec)}
          </p>
        </div>
        <a className="btn btn-sm btn-outline" href={href('customers', detail.customer_id)}>
          Open customer
        </a>
      </header>

      <section className="cp-section">
        <Understanding call={detail} showQuote={false} />
      </section>

      {detail.actions.length > 0 && (
        <section className="cp-section" aria-label="Actions from this call">
          <h3 className="cp-section-title">Actions posted</h3>
          <ul className="cp-actions">
            {detail.actions.map((a) => (
              <li key={a.id} className="cp-action">
                <OutcomeIcon tone={actionTone(a).tone === 'note' ? 'cr' : actionTone(a).tone} />
                <div className="cp-action-body">
                  <p className="cp-action-title">{actionLabel(a.type)}</p>
                  {a.detail && <p className="cp-action-detail">{a.detail}</p>}
                </div>
                <span className="cell-sub">{a.status === 'done' ? 'Done' : 'Open'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="cp-section" aria-labelledby="transcript-title">
        <h3 id="transcript-title" className="cp-section-title">
          Transcript
        </h3>
        {turns.length === 0 ? (
          <p className="cp-muted">
            No transcript stored for this call. Seeded demo history keeps only the structured result.
          </p>
        ) : (
          <ol className="transcript">
            {turns.map((t, i) => (
              <li key={i} className={`turn turn-${t.speaker}`}>
                <span className="turn-who">{t.speaker === 'agent' ? 'Aven' : t.speaker === 'customer' ? 'Customer' : 'Note'}</span>
                <p>{t.text}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
      </motion.div>
    </aside>
  )
}
