import { useEffect, useMemo, useState } from 'react'
import { CaretDown, CaretUp, MagnifyingGlass } from '@phosphor-icons/react'
import { useData } from '../state/data'
import { CustomerPanel } from '../components/CustomerPanel'
import { Avatar, Segmented, StatusPill } from '../components/primitives'
import { displayStatus, type DisplayStatus } from '../lib/ledger'
import { compactAgo, daysSince, eventLabel, nairaRound, parseDate } from '../lib/format'
import { navigate } from '../lib/router'
import { revealPanel } from '../lib/reveal'

type SortKey = 'name' | 'risk' | 'inactive' | 'value' | 'lastCall'
type StatusFilter = 'all' | 'at_risk' | 'working' | 'in_progress' | 'recovered' | 'escalated'

const STATUS_FILTERS: { id: StatusFilter; label: string; match: (s: DisplayStatus) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'at_risk', label: 'At risk', match: (s) => s === 'at_risk' || s === 'on_call' },
  { id: 'working', label: 'Contacted', match: (s) => s === 'contacted' || s === 'follow_up' },
  { id: 'in_progress', label: 'Recovery in progress', match: (s) => s === 'in_progress' },
  { id: 'recovered', label: 'Recovered', match: (s) => s === 'recovered' },
  { id: 'escalated', label: 'Escalated', match: (s) => s === 'escalated' },
]

export function CustomersView({ param }: { param: string | null }) {
  const { customers, calls, actions, sessions, selectedId, select, connection } = useData()
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'risk', dir: -1 })
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!param) return
    select(param)
    revealPanel()
  }, [param, select])

  const rows = useMemo(() => {
    const lastCall = new Map<string, number>()
    for (const c of calls) {
      const t = parseDate(c.created_at)?.getTime() ?? 0
      if (t > (lastCall.get(c.customer_id) ?? 0)) lastCall.set(c.customer_id, t)
    }
    const q = query.trim().toLowerCase()
    return customers
      .map((c) => {
        const s = sessions[c.id]
        const live = Boolean(s && ['dialing', 'live', 'posting'].includes(s.phase))
        return {
          c,
          status: displayStatus(c, actions, live),
          inactive: daysSince(c.last_active_date) ?? -1,
          lastCall: lastCall.get(c.id) ?? 0,
        }
      })
      .filter((r) => STATUS_FILTERS.find((f) => f.id === filter)!.match(r.status))
      .filter((r) => !q || r.c.name.toLowerCase().includes(q) || r.c.id.toLowerCase().includes(q))
      .sort((a, b) => {
        let d = 0
        switch (sort.key) {
          case 'name':
            d = a.c.name.localeCompare(b.c.name)
            break
          case 'risk':
            d = a.c.dormant_balance_ngn - b.c.dormant_balance_ngn
            break
          case 'inactive':
            d = a.inactive - b.inactive
            break
          case 'value':
            d = a.c.est_monthly_value_ngn - b.c.est_monthly_value_ngn
            break
          case 'lastCall':
            d = a.lastCall - b.lastCall
            break
        }
        return d * sort.dir
      })
  }, [customers, calls, actions, sessions, filter, query, sort])

  const header = (key: SortKey, label: string, numeric = false, extra = '') => {
    const active = sort.key === key
    return (
      <th scope="col" className={[numeric ? 'num' : '', extra].join(' ').trim() || undefined} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className="sort"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : key === 'name' ? 1 : -1 }))}
        >
          {label}
          {active ? (
            sort.dir === 1 ? <CaretUp size={12} weight="bold" /> : <CaretDown size={12} weight="bold" />
          ) : (
            <CaretDown size={12} weight="bold" className="sort-idle" />
          )}
        </button>
      </th>
    )
  }

  return (
    <div className="split">
      <section className="card table-card enter" aria-labelledby="customers-title">
        <div className="card-head">
          <div>
            <h1 id="customers-title" className="card-title">
              Customers
            </h1>
            <p className="card-sub">{customers.length} dormant or recently recovered customers</p>
          </div>
          <label className="search">
            <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
            <span className="visually-hidden">Search customers</span>
            <input type="search" placeholder="Name or ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="table-tools">
          <Segmented
            label="Filter by status"
            value={filter}
            onChange={setFilter}
            options={STATUS_FILTERS.map((f) => ({ id: f.id, label: f.label }))}
          />
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {header('name', 'Customer')}
                <th scope="col">Issue</th>
                {header('inactive', 'Inactive', true, 'col-wide')}
                {header('risk', 'At risk', true)}
                {header('value', 'Monthly', true, 'col-wide')}
                <th scope="col">Status</th>
                {header('lastCall', 'Last call')}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, status, inactive, lastCall }) => (
                <tr
                  key={c.id}
                  className={c.id === selectedId ? 'is-selected' : undefined}
                  onClick={() => navigate('customers', c.id)}
                >
                  <td>
                    <button type="button" className="row-link" onClick={() => navigate('customers', c.id)}>
                      <Avatar name={c.name} status={status} size={36} />
                      <span>
                        <span className="cell-strong">{c.name}</span>
                        <span className="cell-sub">{c.id}</span>
                      </span>
                    </button>
                  </td>
                  <td>{eventLabel(c.last_event_type)}</td>
                  <td className="num col-wide">{inactive >= 0 ? `${inactive}d` : ''}</td>
                  <td className="num">{nairaRound(c.dormant_balance_ngn)}</td>
                  <td className="num col-wide">{nairaRound(c.est_monthly_value_ngn)}</td>
                  <td>
                    <StatusPill status={status} />
                  </td>
                  <td>
                    <span className="cell-sub num">{lastCall ? compactAgo(lastCall) : 'Not called'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && connection !== 'loading' && (
            <p className="empty">No customers match. Clear the search or pick another status.</p>
          )}
        </div>
      </section>
      <CustomerPanel customerId={selectedId} />
    </div>
  )
}
