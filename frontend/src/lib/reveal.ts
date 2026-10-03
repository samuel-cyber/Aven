/**
 * Below the two-column breakpoint the customer panel sits under the ledger,
 * so selecting someone would change nothing visible. Bring the panel into view.
 */
export function revealPanel() {
  if (!window.matchMedia('(max-width: 1099px)').matches) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  requestAnimationFrame(() => {
    document.querySelector('.customer-panel')?.scrollIntoView({
      block: 'start',
      behavior: reduce ? 'auto' : 'smooth',
    })
  })
}
