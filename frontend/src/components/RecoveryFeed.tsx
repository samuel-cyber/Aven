import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight } from '@phosphor-icons/react'
import { useData } from '../state/data'
import { buildLedger, matchesFilter, type CreditLine, type LedgerEntry, type LedgerFilter } from '../lib/ledger'
import { eventLabel, firstName, nairaRound, relativeTime, shortDate } from '../lib/format'
import { needsHuman } from '../lib/needsHuman'
import { revealPanel } from '../lib/reveal'
import { href } from '../lib/router'
import { Avatar, OutcomeIcon, Segmented, SkeletonRows, StatusPill, Waveform } from './primitives'

const FILTERS: { id: LedgerFilter; label: string }[] = [
  { id: 'all', label: 'Everyone' },
  { id: 'open', label: 'Not called' },
  { id: 'answered', label: 'Fixed' },
  { id: 'holds', label: 'Needs a person' },
]

const PAGE = 12
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const
const EASE_OUT = [0.23, 1, 0.32, 1] as const

export function RecoveryFeed() {
  const { customers, calls, actions, sessions, selectedId, select, connection } = useData()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<LedgerFilter>('all')
  const [showAll, setShowAll] = useState(false)

  const liveIds = useMemo(
    () =>
      new Set(
        Object.values(sessions)
          .filter((s) => s.phase === 'dialing' || s.phase === 'live' || s.phase === 'posting')
          .map((s) => s.customerId),
      ),
    [sessions],
  )
  const humanIds = useMemo(
    () => new Set(needsHuman(customers, actions, calls).map((i) => i.customerId)),
    [customers, actions, calls],
  )
  const sessionKey = Object.keys(sessions).sort().join(',')
  const pinnedIds = useMemo(() => new Set(sessionKey ? sessionKey.split(',') : []), [sessionKey])
  const ledger = useMemo(
    () => buildLedger(customers, calls, actions, liveIds, humanIds, pinnedIds),
    [customers, calls, actions, liveIds, humanIds, pinnedIds],
  )
  const counts = useMemo(
    () =>
      Object.fromEntries(FILTERS.map((f) => [f.id, ledger.filter((e) => matchesFilter(e, f.id)).length])) as Record<
        LedgerFilter,
        number
      >,
    [ledger],
  )
  const rows = ledger.filter((e) => matchesFilter(e, filter))
  const visible = showAll ? rows : rows.slice(0, PAGE)

  // Keep the selected customer visible in the feed. Scroll only the feed, never the page.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || !selectedId) return
    const row = scroller.querySelector<HTMLElement>(`[data-customer="${CSS.escape(selectedId)}"]`)
    if (!row) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < scroller.scrollTop || bottom > scroller.scrollTop + scroller.clientHeight) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.scrollTo({ top: Math.max(0, top - 8), behavior: reduce ? 'auto' : 'smooth' })
    }
  }, [selectedId, filter, ledger.length])

  return (
    <section className="card feed enter" style={{ ['--i' as string]: 2 }} aria-labelledby="feed-title">
      <div className="card-head">
        <div>
          <h2 id="feed-title" className="card-title">
            Recovery feed
          </h2>
          <p className="card-sub">Why each customer went quiet, and what Aven did about it.</p>
        </div>
        <Segmented
          label="Filter the feed"
          value={filter}
          onChange={(id) => {
            setFilter(id)
            setShowAll(false)
          }}
          options={FILTERS.map((f) => ({ ...f, count: counts[f.id] }))}
        />
      </div>

      <motion.div className="feed-scroll" layoutScroll ref={scrollRef}>
        {connection === 'loading' && ledger.length === 0 ? (
          <SkeletonRows rows={6} />
        ) : rows.length === 0 ? (
          <FeedEmpty filter={filter} />
        ) : (
          <ul className="feed-list">
            <AnimatePresence initial={false}>
              {visible.map((entry) => (
                <FeedItem
                  key={entry.customer.id}
                  entry={entry}
                  selected={entry.customer.id === selectedId}
                  onSelect={() => {
                    select(entry.customer.id)
                    revealPanel()
                  }}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
        {rows.length > PAGE && (
          <div className="feed-more">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          </div>
        )}
      </motion.div>
    </section>
  )
}

function FeedEmpty({ filter }: { filter: LedgerFilter }) {
  const copy: Record<LedgerFilter, string> = {
    all: 'No customers yet. Seed the demo database with `python -m scripts.seed` in backend/.',
    open: 'Everyone who went quiet has had a call. New customers appear here as they go dormant.',
    answered: 'No fixes agreed yet. Start a call with someone who has not been called.',
    holds: 'Nothing is waiting on a person. Fraud reports and callback requests land here.',
  }
  return <p className="empty">{copy[filter]}</p>
}

const FeedItem = function FeedItem({
  entry,
  selected,
  onSelect,
}: {
  entry: LedgerEntry
  selected: boolean
  onSelect: () => void
}) {
  const { freshCallIds, sessions } = useData()
  const { customer, credits, status } = entry
  const latest = credits[0]
  const earlier = credits.length - 1
  const session = sessions[customer.id]
  const onCallNow = status === 'on_call'
  const name = firstName(customer.name)

  return (
    <motion.li
      layout="position"
      data-customer={customer.id}
      className={`feed-item${selected ? ' is-selected' : ''}`}
      initial={{ opacity: 0, transform: 'translateY(8px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.22, ease: EASE_OUT, layout: { duration: 0.4, ease: EASE_IN_OUT } }}
    >
      <button type="button" className="feed-main" onClick={onSelect} aria-pressed={selected}>
        <Avatar name={customer.name} status={status} />
        <span className="feed-text">
          <span className="feed-name">{customer.name}</span>
          <span className="feed-sub">
            {eventLabel(customer.last_event_type)}
            {customer.last_event_date ? `, ${shortDate(customer.last_event_date)}` : ''}
          </span>
        </span>
        <span className="feed-right">
          <span className="feed-amt num">{nairaRound(customer.dormant_balance_ngn)}</span>
          <StatusPill status={status} />
        </span>
      </button>

      <AnimatePresence initial={false} mode="wait">
        {onCallNow ? (
          <motion.div
            key="live"
            className="feed-outcome is-live"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <Waveform small />
            <span className="feed-outcome-title">
              {session?.simulated
                ? `Playing the ${session.scenario?.toLowerCase()} sample conversation`
                : `Aven is on the line with ${name}`}
            </span>
          </motion.div>
        ) : latest ? (
          <OutcomeRow key={latest.callId} line={latest} fresh={freshCallIds.has(latest.callId)} compact={!selected} />
        ) : null}
      </AnimatePresence>

      {!onCallNow && earlier > 0 && (
        <a className="feed-earlier" href={href('customers', customer.id)}>
          {earlier} earlier call{earlier > 1 ? 's' : ''}
          <ArrowRight size={13} weight="bold" />
        </a>
      )}

    </motion.li>
  )
}

function OutcomeRow({ line, fresh, compact }: { line: CreditLine; fresh: boolean; compact: boolean }) {
  // A freshly posted result wipes in left to right; older ones simply appear.
  // Unselected rows show the outcome as one line so the feed fits more people.
  return (
    <motion.div
      className={`feed-outcome is-${line.tone}${fresh ? ' is-posted' : ''}${compact && !fresh ? ' is-compact' : ''}`}
      initial={fresh ? { opacity: 0, clipPath: 'inset(0 100% 0 0 round 16px)' } : false}
      animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0 round 16px)' }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.45, ease: EASE_OUT }}
    >
      <OutcomeIcon tone={line.tone} />
      <span className="feed-outcome-body">
        <span className="feed-outcome-title">{line.title}</span>
        {line.detail && !compact && <span className="feed-outcome-detail">{line.detail}</span>}
      </span>
      <a className="feed-outcome-ref" href={href('calls', line.callId)}>
        {relativeTime(line.at)}
      </a>
    </motion.div>
  )
}
