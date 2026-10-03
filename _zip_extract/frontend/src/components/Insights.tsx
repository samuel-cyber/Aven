import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { Check, Wrench } from '@phosphor-icons/react'
import { useData } from '../state/data'
import { issueLabel, naira, nairaCompact, nairaRound, parseDate, reasonLabel, relativeTime } from '../lib/format'
import { needsHuman } from '../lib/needsHuman'
import { href } from '../lib/router'
import { Avatar, Segmented } from './primitives'

/** Why customers leave: naira at risk behind each churn reason, one hue, sorted. */
export function ReasonChart() {
  const { insights, customers, calls } = useData()
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [hover, setHover] = useState<string | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const inView = useInView(chartRef, { once: true, margin: '-60px' })
  const reduce = useReducedMotion()
  const show = inView || Boolean(reduce)

  const rows = insights?.by_reason ?? []
  const max = Math.max(1, ...rows.map((r) => r.ngn_at_risk))

  // Customers Aven has spoken to whose latest call says they can still be won back.
  const recoverable = useMemo(() => {
    const latest = new Map<string, (typeof calls)[number]>()
    for (const c of calls) {
      const prev = latest.get(c.customer_id)
      if (!prev || (parseDate(c.created_at)?.getTime() ?? 0) > (parseDate(prev.created_at)?.getTime() ?? 0)) {
        latest.set(c.customer_id, c)
      }
    }
    return customers
      .filter((cu) => cu.status !== 'recovered' && latest.get(cu.id)?.recovery_possible)
      .sort((a, b) => b.dormant_balance_ngn - a.dormant_balance_ngn)
  }, [customers, calls])

  return (
    <section className="card insight reasons" aria-labelledby="reasons-title">
      <div className="card-head">
        <div>
          <h2 id="reasons-title" className="card-title">
            Why customers leave
          </h2>
          <p className="card-sub">Naira at risk behind each reason, from what customers said on calls</p>
        </div>
        <Segmented
          label="Show as"
          value={view}
          onChange={setView}
          options={[
            { id: 'chart', label: 'Chart' },
            { id: 'table', label: 'Table' },
          ]}
        />
      </div>

      <div className="card-body" ref={chartRef}>
        {rows.length === 0 ? (
          <p className="empty">No calls yet. Churn reasons appear after the first conversation.</p>
        ) : view === 'table' ? (
          <table className="mini-table">
            <thead>
              <tr>
                <th scope="col">Reason</th>
                <th scope="col" className="right">
                  At risk
                </th>
                <th scope="col" className="right">
                  Calls
                </th>
                <th scope="col" className="right">
                  Won back
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.reason}>
                  <td>{reasonLabel(r.reason)}</td>
                  <td className="right num">{naira(r.ngn_at_risk)}</td>
                  <td className="right num">{r.calls}</td>
                  <td className="right num">{r.recovered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="bars" onMouseLeave={() => setHover(null)}>
            {rows.map((r, i) => {
              const pct = show ? (r.ngn_at_risk / max) * 100 : 0
              const active = hover === r.reason
              return (
                <li
                  key={r.reason}
                  className={`bar-row${active ? ' is-active' : ''}`}
                  style={{ ['--pct' as string]: pct, ['--i' as string]: i }}
                  onMouseEnter={() => setHover(r.reason)}
                  onFocus={() => setHover(r.reason)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${reasonLabel(r.reason)}: ${naira(r.ngn_at_risk)} at risk across ${r.calls} calls, ${r.recovered} won back`}
                >
                  <span className="bar-label">{reasonLabel(r.reason)}</span>
                  <span className="bar-track">
                    <span className="bar-fill" />
                    <span className="bar-value-rail">
                      <span className="bar-value num">{nairaCompact(r.ngn_at_risk)}</span>
                    </span>
                  </span>
                  <span className="bar-meta">
                    {r.calls} call{r.calls === 1 ? '' : 's'}, {r.recovered} won back
                  </span>
                  {active && (
                    <span className="bar-tip" role="tooltip">
                      <strong className="num">{naira(r.ngn_at_risk)}</strong>
                      <span>
                        {r.calls} call{r.calls === 1 ? '' : 's'}, {r.recovered} recovered
                      </span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="recoverable">
          <h3 className="recoverable-title">
            Can still be won back <span className="num">{recoverable.length}</span>
          </h3>
          {recoverable.length === 0 ? (
            <p className="cp-muted">No one Aven has spoken to is still recoverable and not yet recovered.</p>
          ) : (
            <ul className="recoverable-list">
              {recoverable.slice(0, 8).map((c) => (
                <li key={c.id}>
                  <a href={href('customers', c.id)}>
                    <Avatar name={c.name} size={28} />
                    {c.name}
                  </a>
                  <span className="num">{nairaRound(c.dormant_balance_ngn)}</span>
                </li>
              ))}
              {recoverable.length > 8 && <li className="recoverable-more">+{recoverable.length - 8} more in Customers</li>}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

export function IssueList() {
  const { insights } = useData()
  const rows = (insights?.by_issue ?? []).filter((r) => r.calls > 0)
  return (
    <section className="card insight" aria-labelledby="issues-title">
      <div className="card-head">
        <h2 id="issues-title" className="card-title">
          Most frequent issues
        </h2>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <p className="empty">Issues are counted once calls come in.</p>
        ) : (
          <ol className="rank">
            {rows.map((r) => (
              <li key={r.issue ?? 'none'}>
                <span className="rank-label">{issueLabel(r.issue)}</span>
                <span className="rank-count num">
                  {r.calls} <span className="rank-unit">call{r.calls === 1 ? '' : 's'}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

export function FixList() {
  const { insights } = useData()
  const rows = (insights?.top_product_fixes ?? []).filter((r) => r.fix)
  return (
    <section className="card insight fixes-card" aria-labelledby="fixes-title">
      <div className="card-head">
        <h2 id="fixes-title" className="card-title">
          Fixes to ship
        </h2>
        <Wrench size={22} weight="duotone" aria-hidden="true" />
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <p className="empty">Product fixes suggested on calls are grouped here.</p>
        ) : (
          <ol className="fixes">
            {rows.map((r, i) => (
              <li key={r.fix}>
                <span className="fix-index num">{i + 1}</span>
                <span>
                  <p>{r.fix}</p>
                  <span className="fix-count">
                    raised in {r.calls} call{r.calls === 1 ? '' : 's'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

/** Cases a person must own: the shared needs-a-human list, one line per customer. */
export function HumanQueue() {
  const { customers, actions, calls, resolveAction } = useData()
  const items = useMemo(() => needsHuman(customers, actions, calls), [customers, actions, calls])
  const urgent = items.filter((i) => i.urgent).length

  return (
    <section className="card insight human" aria-labelledby="human-title">
      <div className="card-head">
        <h2 id="human-title" className="card-title">
          Needs a person
        </h2>
        {items.length > 0 && (
          <span className="badge badge-escalated">
            {items.length} open{urgent ? `, ${urgent} urgent` : ''}
          </span>
        )}
      </div>
      <div className="card-body">
        {items.length === 0 ? (
          <p className="empty">Nothing waiting. Fraud reports and requested callbacks show up here first.</p>
        ) : (
          <ul className="queue">
            <AnimatePresence initial={false}>
              {items.map((i) => (
                <motion.li
                  key={i.key}
                  layout="position"
                  className="queue-item"
                  initial={{ opacity: 0, transform: 'translateY(8px)' }}
                  animate={{ opacity: 1, transform: 'translateY(0px)' }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1], layout: { duration: 0.35, ease: [0.77, 0, 0.175, 1] } }}
                >
                  <Avatar name={i.name} status={i.urgent ? 'escalated' : 'follow_up'} size={36} />
                  <div className="queue-body">
                    <p className="queue-title">
                      <a href={href('customers', i.customerId)}>{i.name}</a>
                      <span className={`queue-type${i.urgent ? ' is-urgent' : ''}`}>
                        {i.title}
                        {i.urgent ? ', urgent' : ''}
                      </span>
                    </p>
                    <p className="queue-detail">{i.detail}</p>
                    {(i.at || i.more > 0) && (
                      <p className="queue-at">
                        {i.at ? relativeTime(i.at) : ''}
                        {i.more > 0 ? `${i.at ? ', ' : ''}+${i.more} more` : ''}
                      </p>
                    )}
                  </div>
                  {i.actionId !== null && (
                    <button type="button" className="btn btn-sm" onClick={() => void resolveAction(i.actionId as number)}>
                      <Check size={16} weight="bold" />
                      Done
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  )
}
