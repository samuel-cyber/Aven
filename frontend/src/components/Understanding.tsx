import { ShieldWarning } from '@phosphor-icons/react'
import type { Call } from '../api/types'
import {
  actionLabel,
  intentLabel,
  issueLabel,
  reasonLabel,
  sentimentLabel,
  urgencyLabel,
} from '../lib/format'
import { customerQuote } from '../lib/transcript'

const SENTIMENT_TONE: Record<string, string> = { negative: 'negative', neutral: 'neutral', positive: 'positive' }
const URGENCY_TONE: Record<string, string> = { high: 'negative', medium: 'warning', low: 'neutral' }

/** What Aven took away from one conversation, as structured fields. */
export function Understanding({ call, showQuote = true }: { call: Call; showQuote?: boolean }) {
  const quote = showQuote ? customerQuote(call.transcript) : null
  const offered = call.resolution_offered ?? 'none'
  const fallback = call.extraction_source === 'fallback'

  return (
    <div className="understanding">
      {call.fraud_flag ? (
        <div className="note note-warning" role="note">
          <ShieldWarning size={18} weight="fill" aria-hidden="true" />
          <span>
            <strong>Fraud reported.</strong> Escalated to a human specialist. Aven never asks for PINs, OTPs or passwords.
          </span>
        </div>
      ) : null}

      <dl className="facts">
        <div>
          <dt>Issue</dt>
          <dd>{issueLabel(call.issue)}</dd>
        </div>
        <div>
          <dt>Churn reason</dt>
          <dd>{reasonLabel(call.churn_reason)}</dd>
        </div>
        <div>
          <dt>Sentiment</dt>
          <dd>
            <span className={`dot-label dot-${SENTIMENT_TONE[call.sentiment ?? ''] ?? 'neutral'}`}>
              {sentimentLabel(call.sentiment)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Intent</dt>
          <dd>{intentLabel(call.intent_to_return)}</dd>
        </div>
        <div>
          <dt>Urgency</dt>
          <dd>
            <span className={`dot-label dot-${URGENCY_TONE[call.urgency ?? ''] ?? 'neutral'}`}>
              {urgencyLabel(call.urgency)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Recovery possible</dt>
          <dd className={call.recovery_possible ? 'text-positive' : 'text-negative'}>
            {call.recovery_possible ? 'Yes' : 'No'}
          </dd>
        </div>
        <div className="facts-wide">
          <dt>Recommended action</dt>
          <dd>
            {offered === 'none' ? 'No action offered' : actionLabel(offered)}
            {offered !== 'none' && (
              <span className="facts-aside">{call.customer_accepted ? ' · accepted' : ' · not accepted'}</span>
            )}
          </dd>
        </div>
      </dl>

      {quote && (
        <figure className="quote">
          <blockquote>
            <p>{quote}</p>
          </blockquote>
          <figcaption>In the customer's words</figcaption>
        </figure>
      )}

      {call.summary && <p className="summary">{call.summary}</p>}

      {fallback && (
        <p className="note note-warning note-sm">
          Read by the rule-based fallback because no LLM key is set on the backend. Treat it as needing human review.
        </p>
      )}
    </div>
  )
}
