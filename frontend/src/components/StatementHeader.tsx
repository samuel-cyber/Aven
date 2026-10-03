import { useMemo } from 'react'
import { ArrowDownRight, ShieldWarning } from '@phosphor-icons/react'
import { useData } from '../state/data'
import { nairaRound, percent } from '../lib/format'
import { needsHuman } from '../lib/needsHuman'
import { TickNumber } from './primitives'

const whole = (n: number) => String(Math.round(n))

/**
 * The recovery position: a dark hero card with the naira still at risk
 * (dormant value minus what Aven has won back), and a white card of counts.
 */
export function StatementHeader() {
  const { insights, customers, actions, calls, connection } = useData()
  const human = useMemo(() => needsHuman(customers, actions, calls), [customers, actions, calls])

  if (!insights) {
    return (
      <section className="hero-row" aria-busy={connection === 'loading'} aria-label="Recovery summary">
        <div className="hero-card">
          <span className="skeleton skeleton-dark" style={{ width: 140, height: 16 }} />
          <span className="skeleton skeleton-dark" style={{ width: 320, height: 64, marginTop: 16 }} />
        </div>
        <div className="card stats-card">
          <span className="skeleton" style={{ width: '80%', height: 64 }} />
        </div>
      </section>
    )
  }

  const k = insights.kpi
  const dormant = customers.reduce((s, c) => s + (c.dormant_balance_ngn || 0), 0)
  const recovered = customers
    .filter((c) => c.status === 'recovered')
    .reduce((s, c) => s + (c.dormant_balance_ngn || 0), 0)
  const atRisk = dormant - recovered
  const urgent = human.filter((i) => i.urgent).length

  return (
    <section className="hero-row" aria-label="Recovery summary">
      <div className="hero-card enter" style={{ ['--i' as string]: 0 }}>
        <h2 className="hero-label">Value at risk</h2>
        <TickNumber className="hero-value num" value={atRisk} format={nairaRound} />
        <dl className="hero-balance">
          <div>
            <dt>Dormant balances</dt>
            <dd className="num">
              <TickNumber value={dormant} format={nairaRound} />
            </dd>
          </div>
          <div>
            <dt>
              <ArrowDownRight size={14} weight="bold" aria-hidden="true" />
              Won back by Aven
            </dt>
            <dd className="num hero-recovered">
              <TickNumber value={recovered} format={nairaRound} />
            </dd>
          </div>
        </dl>
      </div>

      <dl className="card stats-card enter" style={{ ['--i' as string]: 1 }}>
        <div className="stat">
          <dt>Customers contacted</dt>
          <dd>
            <TickNumber className="stat-value num" value={k.contacted} format={whole} />
          </dd>
          <p className="stat-note">of {customers.length} gone quiet</p>
        </div>
        <div className="stat">
          <dt>Customers recovered</dt>
          <dd>
            <TickNumber className="stat-value num" value={k.recovered} format={whole} />
          </dd>
          <p className="stat-note">said yes to a fix</p>
        </div>
        <div className="stat">
          <dt>Recovery rate</dt>
          <dd>
            <TickNumber className="stat-value num" value={k.recovery_rate} format={percent} />
          </dd>
          <p className="stat-note">of customers contacted</p>
        </div>
        <div className={`stat${human.length ? ' stat-alert' : ''}`}>
          <dt>Open escalations</dt>
          <dd className="stat-row">
            <TickNumber className="stat-value num" value={human.length} format={whole} />
            {urgent > 0 && (
              <span className="badge badge-escalated">
                <ShieldWarning size={14} weight="fill" aria-hidden="true" />
                {urgent} urgent
              </span>
            )}
          </dd>
          <p className="stat-note">{human.length ? 'need a person' : 'nothing waiting'}</p>
        </div>
      </dl>
    </section>
  )
}
