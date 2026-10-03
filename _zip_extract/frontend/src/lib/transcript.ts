export interface Turn {
  speaker: 'agent' | 'customer' | 'other'
  text: string
}

const AGENT = /^(agent|assistant|aven|ai|bot)$/i
const CUSTOMER = /^(customer|user|caller|client)$/i

/** Split an "agent: ... / customer: ..." transcript into turns. */
export function parseTranscript(raw: string | null | undefined): Turn[] {
  if (!raw) return []
  const turns: Turn[] = []
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const m = trimmed.match(/^([A-Za-z ]{2,20}):\s*(.*)$/)
    if (m) {
      const who = m[1].trim()
      const speaker = AGENT.test(who) ? 'agent' : CUSTOMER.test(who) ? 'customer' : 'other'
      turns.push({ speaker, text: m[2] })
    } else if (turns.length) {
      turns[turns.length - 1].text += ` ${trimmed}`
    } else {
      turns.push({ speaker: 'other', text: trimmed })
    }
  }
  return turns
}

/** The customer's most telling line: the longest thing they said, in their own words. */
export function customerQuote(raw: string | null | undefined): string | null {
  const said = parseTranscript(raw).filter((t) => t.speaker === 'customer' && t.text.length > 12)
  if (!said.length) return null
  return said.reduce((best, t) => (t.text.length > best.text.length ? t : best)).text
}
