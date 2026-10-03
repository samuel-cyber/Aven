import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Check } from '@phosphor-icons/react'
import { api } from '../api/client'
import type { CustomerDetail } from '../api/types'
import { useData } from '../state/data'
import {
  actionLabel,
  daysSince,
  eventLabel,
  maskPhone,
  nairaRound,
  parseDate,
  relativeTime,
  shortDate,
} from '../lib/format'
import { actionTone, displayStatus } from '../lib/ledger'
import { href } from '../lib/router'
import { Avatar, OutcomeIcon, StatusPill } from './primitives'
import { CallControl } from './CallControl'
import { Understanding } from './Understanding'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

export function CustomerPanel({ customerId }: { customerId: string | null }) {
  const { customers, actions, sessions, lastSync, resolveAction } = useData()
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const customer = customers.find((c) => c.id === customerId) ?? null
  const panelRef = useRef<HTMLElement>(null)
  const callRef = useRef<HTMLElement>(null)
  const scrolledFor = useRef<string | null>(null)
  const activeSession = customerId ? sessions[customerId] : undefined
  const postedCallId = activeSession?.phase === 'posted' ? activeSession.callId : null
  const detailHasPosted = Boolean(postedCallId && detail?.calls.some((c) => c.id === postedCallId))
  // Scroll once when a call starts (to show the live waveform) and once when it posts
  // (to show the result and "What Aven understood"): steps 2 and 5 of the demo.
  const scrollKey = !activeSession
    ? null
    : activeSession.phase === 'posted'
      ? detailHasPosted
        ? `posted:${postedCallId}`
        : null
      : activeSession.phase === 'dialing' || activeSession.phase === 'posting'
        ? `live:${activeSession.startedAt}`
        : null

  useEffect(() => {
    if (!scrollKey || scrolledFor.current === scrollKey) return
    scrolledFor.current = scrollKey
    const section = callRef.current
    const panel = panelRef.current
    if (!section || !panel) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // The header is sticky, so land the call section just under it.
    const head = panel.querySelector<HTMLElement>('.cp-head')?.offsetHeight ?? 0
    panel.scrollTo({ top: Math.max(0, section.offsetTop - head - 8), behavior: reduce ? 'auto' : 'smooth' })
  }, [scrollKey])

  // A new customer starts at the top of the panel.
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [customerId])

  // Re-read the full record (calls with transcripts) on every sync tick.
  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    api
      .customer(customerId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(() => {
        /* the shell reports connection problems */
      })
    return () => {
      cancelled = true
    }
  }, [customerId, lastSync])

  if (!customer) {
    return (
      <aside className="card customer-panel is-empty" aria-label="Customer">
        <p className="empty">Pick a customer from the feed to see their story and start a call.</p>
      </aside>
    )
  }

  const session = sessions[customer.id]
  const onCall = session && ['dialing', 'live', 'posting'].includes(session.phase)
  const status = displayStatus(customer, actions, Boolean(onCall))
  const sameCustomer = detail?.id === customer.id
  const latestCall = sameCustomer
    ? detail.calls
        .slice()
        .sort((a, b) => (parseDate(b.created_at)?.getTime() ?? 0) - (parseDate(a.created_at)?.getTime() ?? 0))[0]
    : undefined
  const myActions = sameCustomer ? detail.actions : actions.filter((a) => a.customer_id === customer.id)
  const inactive = daysSince(customer.last_active_date)

  return (
    <aside ref={panelRef} className="card customer-panel enter" style={{ ['--i' as string]: 3 }} aria-labelledby="cp-name">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={customer.id}
          className="cp-inner"
          initial={{ opacity: 0, transform: 'translateY(10px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          transition={{ duration: 0.24, ease: EASE_OUT }}
        >
          <header className="cp-head">
            <Avatar name={customer.name} status={status} size={52} />
            <div className="cp-id">
              <h2 id="cp-name" className="cp-name">
                {customer.name}
              </h2>
              <p className="cp-ref num">
                {customer.id} · {maskPhone(customer.phone)}
              </p>
            </div>
            <StatusPill status={status} />
          </header>

          <section className="cp-debit" aria-label="What went wrong">
            <div className="cp-debit-top">
              <h3 className="cp-debit-title">{eventLabel(customer.last_event_type)}</h3>
              <span className="cp-debit-date">{shortDate(customer.last_event_date)}</span>
            </div>
            {customer.last_event_detail && <p className="cp-debit-detail">{customer.last_event_detail}</p>}
            <dl className="cp-figures">
              <div className="cp-figure-main">
                <dt>At risk</dt>
                <dd className="num">{nairaRound(customer.dormant_balance_ngn)}</dd>
              </div>
              <div>
                <dt>Monthly value</dt>
                <dd className="num">{nairaRound(customer.est_monthly_value_ngn)}</dd>
              </div>
              <div>
                <dt>Inactive</dt>
                <dd className="num">{inactive === null ? 'unknown' : `${inactive} days`}</dd>
              </div>
            </dl>
          </section>

          <section className="cp-section" aria-label="Call" ref={callRef}>
            <CallControl customer={customer} />
          </section>

          <section className="cp-section" aria-labelledby="cp-understood">
            <div className="cp-section-head">
              <h3 id="cp-understood" className="cp-section-title">
                What Aven understood
              </h3>
              {latestCall && (
                <a className="cp-link" href={href('calls', latestCall.id)}>
                  {relativeTime(latestCall.created_at)}
                  <ArrowRight size={13} weight="bold" />
                </a>
              )}
            </div>
            {latestCall ? (
              <Understanding call={latestCall} />
            ) : sameCustomer ? (
              <p className="cp-muted">
                No conversation yet. Once Aven talks to {customer.name.split(' ')[0]}, the issue, sentiment and agreed fix
                appear here.
              </p>
            ) : (
              <div className="skeleton" style={{ height: 120 }} aria-hidden="true" />
            )}
          </section>

          {myActions.length > 0 && (
            <section className="cp-section" aria-labelledby="cp-actions">
              <h3 id="cp-actions" className="cp-section-title">
                Recovery actions
              </h3>
              <ul className="cp-actions">
                {myActions.map((a) => {
                  const t = actionTone(a)
                  return (
                    <li key={a.id} className="cp-action">
                      <OutcomeIcon tone={t.tone === 'note' ? 'cr' : t.tone} />
                      <div className="cp-action-body">
                        <p className="cp-action-title">{actionLabel(a.type)}</p>
                        {a.detail && <p className="cp-action-detail">{a.detail}</p>}
                      </div>
                      {a.status === 'done' ? (
                        <span className="done-mark">
                          <Check size={16} weight="bold" /> Done
                        </span>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => void resolveAction(a.id)}>
                          Mark done
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}
