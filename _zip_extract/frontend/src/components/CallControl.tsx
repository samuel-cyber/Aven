import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowsClockwise, Info, Phone, PhoneDisconnect, PlayCircle, WarningCircle, X } from '@phosphor-icons/react'
import type { Customer } from '../api/types'
import { useData, type CallSession } from '../state/data'
import { SCENARIOS } from '../lib/scripts'
import { duration, firstName } from '../lib/format'
import { creditForCall, displayStatus } from '../lib/ledger'
import { OutcomeIcon, StatusPill, Waveform } from './primitives'

const EASE_OUT = [0.23, 1, 0.32, 1] as const

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return <span className="num">{duration((now - since) / 1000)}</span>
}

function SamplePicker({ customer }: { customer: Customer }) {
  const { runScenario, calls } = useData()
  const [lead, ...rest] = SCENARIOS
  const name = firstName(customer.name)
  const fallbackSeen = calls.some((c) => c.extraction_source === 'fallback')
  return (
    <div className="samples">
      {fallbackSeen && (
        <p className="note note-warning">
          <Info size={18} weight="fill" aria-hidden="true" />
          <span>No LLM key on the backend, so samples are read by the fallback and queue a human callback.</span>
        </p>
      )}
      <button type="button" className="btn btn-primary btn-lg btn-wide" onClick={() => void runScenario(customer, lead)}>
        <PlayCircle size={22} weight="fill" />
        Run the {lead.label.toLowerCase()} sample with {name}
      </button>
      <div className="sample-row" role="group" aria-label="Other sample conversations">
        <span className="sample-row-label">Or play</span>
        {rest.map((s) => (
          <button key={s.id} type="button" className="btn btn-sm" title={s.hint} onClick={() => void runScenario(customer, s)}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="hint">Samples run through the same pipeline as a real call: transcript, extraction, action.</p>
    </div>
  )
}

/** The dark call card that carries the live waveform while Aven is talking. */
function LiveCard({ session, name, children }: { session: CallSession; name: string; children?: ReactNode }) {
  const title =
    session.phase === 'dialing'
      ? `Calling ${name}`
      : session.phase === 'posting'
        ? session.simulated
          ? `Playing the ${session.scenario?.toLowerCase()} conversation`
          : 'Reading the conversation'
        : `Aven is talking to ${name}`
  return (
    <div className="live-card" role="status">
      <div className="live-top">
        <span className="live-dot" aria-hidden="true" />
        <span className="live-title">{title}</span>
        {session.phase === 'live' && <Elapsed since={session.startedAt} />}
      </div>
      <Waveform bars={28} />
      {children}
    </div>
  )
}

export function CallControl({ customer }: { customer: Customer }) {
  const { sessions, voice, calls, actions, startCall, syncNow, dismissSession } = useData()
  const [rehearse, setRehearse] = useState(false)
  const session = sessions[customer.id]
  const name = firstName(customer.name)
  const voiceReady = voice?.configured ?? false

  let body: ReactNode
  let key: string

  if (!session) {
    key = 'idle'
    body = voiceReady ? (
      <div className="call-control">
        <button type="button" className="btn btn-primary btn-lg btn-wide" onClick={() => void startCall(customer)}>
          <Phone size={20} weight="fill" />
          Call {name}
        </button>
        <p className="hint">
          Aven calls {name} through BimpeAI{voice?.is_test_call ? ' on the test line' : ''}. The transcript comes in when
          the call ends.
        </p>
        <button type="button" className="btn btn-quiet btn-sm" aria-expanded={rehearse} onClick={() => setRehearse((v) => !v)}>
          {rehearse ? 'Hide samples' : 'Rehearse with a sample instead'}
        </button>
        {rehearse && <SamplePicker customer={customer} />}
      </div>
    ) : (
      <div className="call-control">
        <SamplePicker customer={customer} />
        <div className="call-row">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => void startCall(customer)}>
            <Phone size={16} weight="bold" />
            Try a real call
          </button>
          <span className="hint">BimpeAI keys are not set in backend/.env, so real calls are stubbed.</span>
        </div>
      </div>
    )
  } else if (session.phase === 'dialing' || session.phase === 'posting') {
    key = 'live'
    body = <LiveCard session={session} name={name} />
  } else if (session.phase === 'live') {
    key = 'live'
    body = (
      <LiveCard session={session} name={name}>
        <p className="live-meta num">
          {session.callId}
          {session.isTest ? ' · test line' : ''}
          {session.remoteStatus ? ` · ${session.remoteStatus}` : ''}
        </p>
        <div className="call-row">
          <button type="button" className="btn btn-sm btn-on-dark" onClick={() => void syncNow(customer.id)}>
            <ArrowsClockwise size={16} weight="bold" />
            Check now
          </button>
          <button type="button" className="btn btn-sm btn-quiet-dark" onClick={() => dismissSession(customer.id)}>
            <PhoneDisconnect size={16} weight="bold" />
            Stop waiting
          </button>
        </div>
        {session.message && <p className="live-meta">{session.message}</p>}
      </LiveCard>
    )
  } else if (session.phase === 'stubbed') {
    key = 'stubbed'
    body = (
      <div className="call-control">
        <div className="note note-warning">
          <Info size={18} weight="fill" aria-hidden="true" />
          <span>{session.message}</span>
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismissSession(customer.id)}>
            <X size={16} weight="bold" />
          </button>
        </div>
        <SamplePicker customer={customer} />
      </div>
    )
  } else if (session.phase === 'posted') {
    key = 'posted'
    const call = calls.find((c) => c.id === session.callId)
    const credit = call ? creditForCall(call, actions) : null
    const status = displayStatus(customer, actions)
    body = (
      <div className={`posted-card is-${credit?.tone ?? 'cr'}`} role="status">
        <OutcomeIcon tone={credit?.tone ?? 'cr'} size={26} />
        <div className="posted-body">
          <p className="posted-kicker">
            {session.simulated ? `${name}'s ${session.scenario?.toLowerCase()} sample` : `Call with ${name}`} is in
          </p>
          <p className="posted-title">{credit ? credit.title : 'Call posted'}</p>
        </div>
        <StatusPill status={status} />
        <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => dismissSession(customer.id)}>
          <X size={16} weight="bold" />
        </button>
      </div>
    )
  } else {
    key = 'error'
    body = (
      <div className="note note-error" role="alert">
        <WarningCircle size={18} weight="fill" aria-hidden="true" />
        <div className="note-body">
          <p className="note-title">The call didn't go through</p>
          <p>{session.message}</p>
          <div className="call-row">
            <button type="button" className="btn btn-sm btn-outline" onClick={() => void startCall(customer)}>
              <Phone size={16} weight="bold" />
              Try again
            </button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => dismissSession(customer.id)}>
              Dismiss
            </button>
          </div>
        </div>
      </div>
    )
  }

  // States cross-fade with a small lift so the change reads as one card becoming the next.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, transform: 'translateY(6px) scale(0.99)' }}
        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ duration: 0.26, ease: EASE_OUT }}
      >
        {body}
      </motion.div>
    </AnimatePresence>
  )
}
