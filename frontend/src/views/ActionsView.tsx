import { useMemo, useState } from 'react'
import { ArrowRight, Check } from '@phosphor-icons/react'
import { useData } from '../state/data'
import { OutcomeIcon, Segmented } from '../components/primitives'
import { actionLabel, parseDate, relativeTime } from '../lib/format'
import { actionTone } from '../lib/ledger'
import { needsHuman } from '../lib/needsHuman'
import { href } from '../lib/router'

type ActionFilter = 'open' | 'human' | 'done' | 'all'

const time = (v: string | null | undefined) => parseDate(v)?.getTime() ?? 0

export function ActionsView() {
  const { actions, customers, calls, resolveAction, connection } = useData()
  const [filter, setFilter] = useState<ActionFilter>('open')
  const [busy, setBusy] = useState<number | null>(null)
  const names = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers])

  // Escalated customers with no action row still belong to a person; show them as rows too.
  const escalations = useMemo(
    () => needsHuman(customers, actions, calls).filter((i) => i.actionId === null),
    [customers, actions, calls],
  )
  const isHold = (a: (typeof actions)[number]) => a.status !== 'done' && actionTone(a).tone === 'hold'

  const counts: Record<ActionFilter, number> = {
    open: actions.filter((a) => a.status !== 'done').length + escalations.length,
    human: actions.filter(isHold).length + escalations.length,
    done: actions.filter((a) => a.status === 'done').length,
    all: actions.length + escalations.length,
  }

  const rows = actions
    .filter((a) => {
      if (filter === 'open') return a.status !== 'done'
      if (filter === 'human') return isHold(a)
      if (filter === 'done') return a.status === 'done'
      return true
    })
    .sort(
      (a, b) =>
        Number(isHold(b)) - Number(isHold(a)) ||
        Number(b.urgent) - Number(a.urgent) ||
        time(b.created_at) - time(a.created_at),
    )
  const showEscalations = filter !== 'done'

  const resolve = async (id: number) => {
    setBusy(id)
    try {
      await resolveAction(id)
    } finally {
      setBusy(null)
    }
  }

  const empty = rows.length === 0 && (!showEscalations || escalations.length === 0)

  return (
    <section className="card table-card enter" aria-labelledby="actions-title">
      <div className="card-head">
        <div>
          <h1 id="actions-title" className="card-title">
            Recovery actions
          </h1>
          <p className="card-sub">
            What the action engine queued after each call. These are internal demo workflows, not real banking transactions.
          </p>
        </div>
        <Segmented
          label="Filter actions"
          value={filter}
          onChange={setFilter}
          options={(
            [
              ['open', 'Open'],
              ['human', 'Needs a person'],
              ['done', 'Done'],
              ['all', 'All'],
            ] as [ActionFilter, string][]
          ).map(([id, label]) => ({ id, label, count: counts[id] }))}
        />
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Action</th>
              <th scope="col">Customer</th>
              <th scope="col">Detail</th>
              <th scope="col">Queued</th>
              <th scope="col" className="num">
                <span className="visually-hidden">Resolve</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showEscalations &&
              escalations.map((e) => (
                <tr key={e.key}>
                  <td>
                    <span className="outcome">
                      <OutcomeIcon tone="hold" />
                      <span className="cell-strong">{e.title}</span>
                    </span>
                  </td>
                  <td>
                    <a className="cell-strong" href={href('customers', e.customerId)}>
                      {e.name}
                    </a>
                    <span className="cell-sub">Escalated on the call</span>
                  </td>
                  <td className="cell-detail">{e.detail}</td>
                  <td>
                    <span className="cell-sub">{e.at ? relativeTime(e.at) : ''}</span>
                  </td>
                  <td className="num">
                    <a className="btn btn-sm" href={href('customers', e.customerId)}>
                      Open
                      <ArrowRight size={14} weight="bold" />
                    </a>
                  </td>
                </tr>
              ))}
            {rows.map((a) => {
              const code = actionTone(a)
              return (
                <tr key={a.id}>
                  <td>
                    <span className="outcome">
                      <OutcomeIcon tone={code.tone === 'note' ? 'cr' : code.tone} />
                      <span className="cell-strong">{actionLabel(a.type)}</span>
                    </span>
                  </td>
                  <td>
                    <a className="cell-strong" href={href('customers', a.customer_id ?? '')}>
                      {names.get(a.customer_id ?? '') ?? a.customer_id}
                    </a>
                    {a.call_id && (
                      <a className="cell-sub num" href={href('calls', a.call_id)}>
                        {a.call_id}
                      </a>
                    )}
                  </td>
                  <td className="cell-detail">{a.detail}</td>
                  <td>
                    <span className="cell-sub">{relativeTime(a.created_at)}</span>
                  </td>
                  <td className="num">
                    {a.status === 'done' ? (
                      <span className="done-mark">
                        <Check size={16} weight="bold" /> Done
                      </span>
                    ) : (
                      <button type="button" className="btn btn-sm" disabled={busy === a.id} onClick={() => void resolve(a.id)}>
                        {busy === a.id ? 'Saving' : 'Mark done'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {empty && connection !== 'loading' && (
          <p className="empty">
            {filter === 'done'
              ? 'Nothing marked done yet.'
              : 'Nothing open. When a call ends with an agreed fix or an escalation, the action engine queues it here.'}
          </p>
        )}
      </div>
    </section>
  )
}
