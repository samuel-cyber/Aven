import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { PhoneCall, PhoneSlash, WifiSlash } from '@phosphor-icons/react'
import { useData } from '../state/data'
import { needsHuman } from '../lib/needsHuman'
import { href, type View } from '../lib/router'

const TABS: { view: View; label: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'customers', label: 'Customers' },
  { view: 'calls', label: 'Calls' },
  { view: 'actions', label: 'Actions' },
]

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export function TopBar({ view }: { view: View }) {
  const { voice, connection, lastSync, actions, customers, calls } = useData()
  const now = useNow(1000)
  const waiting = useMemo(() => needsHuman(customers, actions, calls).length, [customers, actions, calls])
  const age = lastSync ? Math.max(0, Math.round((now - lastSync) / 1000)) : null

  let voiceLabel = 'Checking voice'
  let voiceShort = 'Voice'
  let voiceState = 'idle'
  if (voice) {
    if (!voice.configured) {
      voiceLabel = 'Voice not configured'
      voiceShort = 'No voice'
      voiceState = 'off'
    } else {
      voiceLabel = voice.is_test_call ? 'BimpeAI test line' : 'BimpeAI live line'
      voiceShort = voice.is_test_call ? 'Test line' : 'Live line'
      voiceState = 'on'
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href={href('overview')} aria-label="Aven overview">
          <svg className="brand-mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            {/* Aven's mark: a voice wave returning upward, Aven calling a customer back. */}
            <rect width="28" height="28" rx="9" fill="#9fe870" />
            <rect x="7" y="11" width="3" height="8" rx="1.5" fill="#0e0f0c" />
            <rect x="12.5" y="7" width="3" height="14" rx="1.5" fill="#0e0f0c" />
            <rect x="18" y="9" width="3" height="10" rx="1.5" fill="#0e0f0c" />
          </svg>
          <span className="brand-word">aven</span>
          <span className="brand-for">for Demo Bank</span>
        </a>

        <nav className="tabs" aria-label="Main">
          {TABS.map((t) => {
            const active = view === t.view
            return (
              <a key={t.view} href={href(t.view)} className="tab" aria-current={active ? 'page' : undefined}>
                {active && (
                  <motion.span
                    layoutId="tab-thumb"
                    className="tab-thumb"
                    transition={{ duration: 0.25, ease: [0.77, 0, 0.175, 1] }}
                  />
                )}
                <span className="tab-label">
                  {t.label}
                  {t.view === 'actions' && waiting > 0 && (
                    <span className="tab-count num" aria-label={`${waiting} need a person`}>
                      {waiting}
                    </span>
                  )}
                </span>
              </a>
            )
          })}
        </nav>

        <div className="topbar-status">
          <span
            className={`status-chip is-${voiceState}`}
            title={voice?.configured ? `Agent ${voice.agent_id ?? ''}` : 'Set BIMPEAI_API_KEY and BIMPEAI_AGENT_ID in backend/.env to place real calls'}
          >
            {voiceState === 'off' ? <PhoneSlash size={16} weight="bold" /> : <PhoneCall size={16} weight="bold" />}
            <span className="chip-text">{voiceLabel}</span>
            <span className="chip-short">{voiceShort}</span>
          </span>
          {connection === 'error' ? (
            <span className="status-chip is-error" role="status">
              <WifiSlash size={16} weight="bold" />
              <span className="chip-text">API offline</span>
              <span className="chip-short">Offline</span>
            </span>
          ) : (
            <span className="sync" role="status" aria-live="off">
              <span className={`sync-dot${connection === 'ok' ? ' is-ok' : ''}`} aria-hidden="true" />
              <span className="num">{age === null ? 'Connecting' : age < 2 ? 'Live' : `Synced ${age}s ago`}</span>
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
