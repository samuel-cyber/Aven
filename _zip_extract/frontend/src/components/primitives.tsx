import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ChatCircleDots, CheckCircle, HandPalm, ShieldWarning } from '@phosphor-icons/react'
import { STATUS_META, type DisplayStatus, type Tone } from '../lib/ledger'

export function StatusPill({ status }: { status: DisplayStatus }) {
  const meta = STATUS_META[status]
  // Animate only a real change (At risk to Recovery in progress), never a remount
  // from switching tabs or filters. Derived from the previous render, React's pattern.
  const [prev, setPrev] = useState(status)
  const [fresh, setFresh] = useState(false)
  if (prev !== status) {
    setPrev(status)
    setFresh(true)
  }
  return (
    <span key={status} className={`badge badge-${meta.variant}${fresh ? ' is-fresh' : ''}`} data-status={status}>
      {status === 'on_call' && <Waveform small />}
      {status === 'escalated' && <ShieldWarning size={14} weight="fill" aria-hidden="true" />}
      {meta.label}
    </span>
  )
}

/** Rounded-square initials, tinted by where the customer stands. */
export function Avatar({ name, status, size = 40 }: { name: string; status?: DisplayStatus; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  const variant = status ? STATUS_META[status].variant : 'neutral'
  return (
    <span className={`avatar avatar-${variant}`} style={{ width: size, height: size }} aria-hidden="true">
      {initials}
    </span>
  )
}

/** What Aven's call produced, as an icon: fixed, waiting on a person, or just a conversation. */
export function OutcomeIcon({ tone, size = 18 }: { tone: Tone; size?: number }) {
  if (tone === 'cr') return <CheckCircle className="outcome-icon is-cr" size={size} weight="fill" aria-hidden="true" />
  if (tone === 'hold') return <HandPalm className="outcome-icon is-hold" size={size} weight="fill" aria-hidden="true" />
  if (tone === 'live') return <Waveform small />
  return <ChatCircleDots className="outcome-icon is-note" size={size} weight="fill" aria-hidden="true" />
}

/** Voice bars that move while Aven is talking. Static under reduced motion. */
export function Waveform({ small = false, bars = small ? 4 : 18 }: { small?: boolean; bars?: number }) {
  return (
    <span className={`wave${small ? ' wave-sm' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => (
        <span key={i} style={{ animationDelay: `${(i * 97) % 700}ms`, ['--h' as string]: `${30 + ((i * 37) % 70)}%` }} />
      ))}
    </span>
  )
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A figure that counts to its value: up from zero the first time it appears,
 * then to each new value when a call posts. Writes to the DOM directly.
 */
export function TickNumber({
  value,
  format,
  className,
  countUp = true,
}: {
  value: number
  format: (n: number) => string
  className?: string
  countUp?: boolean
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // The first painted value; later values are written by the effect, so React never
  // overwrites a figure mid-count.
  const [initial] = useState(() => (countUp && !prefersReducedMotion() ? 0 : value))
  const shown = useRef(initial)
  const formatRef = useRef(format)
  useLayoutEffect(() => {
    formatRef.current = format
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const from = shown.current
    const to = value
    if (from === to || prefersReducedMotion()) {
      shown.current = to
      el.textContent = formatRef.current(to)
      return
    }
    const start = performance.now()
    const dur = from === 0 ? 1100 : 800
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 4)
      const current = from + (to - from) * eased
      shown.current = current
      el.textContent = formatRef.current(current)
      if (t < 1) frame = requestAnimationFrame(step)
      else shown.current = to
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      shown.current = to
    }
  }, [value])

  return (
    <span ref={ref} className={className}>
      {format(initial)}
    </span>
  )
}

/** Pill filter with a sliding white indicator (shared layout animation). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  const group = useId()
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <button key={o.id} type="button" aria-pressed={active} onClick={() => onChange(o.id)}>
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="segmented-thumb"
                transition={{ duration: 0.25, ease: [0.77, 0, 0.175, 1] }}
              />
            )}
            <span className="segmented-label">
              {o.label}
              {o.count !== undefined && <span className="segmented-count num">{o.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
          <span style={{ flex: 1, display: 'grid', gap: 8 }}>
            <span className="skeleton" style={{ width: '40%', height: 14 }} />
            <span className="skeleton" style={{ width: '65%', height: 12 }} />
          </span>
          <span className="skeleton" style={{ width: 90, height: 14 }} />
        </div>
      ))}
    </div>
  )
}
