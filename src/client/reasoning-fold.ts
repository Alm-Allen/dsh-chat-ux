/**
 * Keep a reasoning row open while the model is still thinking, and close it
 * again the moment the thinking stops.
 *
 * dsh ships every reasoning row collapsed — its own README says so outright,
 * and `ReasoningRow` holds that in a plain `useState(false)`. No setting
 * exposes it, so the row's own disclosure control is the only lever a plugin
 * has. That lever is at least a stable one: the row carries
 * `data-variant="think"`, `data-state` (`running` while the model is
 * thinking, `ok` once it has stopped) and `data-expanded` — semantic
 * attributes, unlike the build-hashed class names around them, which change
 * with every dsh build.
 *
 * The reader still owns the row. A click or key press inside one records the
 * phase it happened in, and this module leaves that row alone for the rest of
 * that phase: folding a row mid-thought keeps it folded, and opening a settled
 * row keeps it open. The scope is deliberately the phase and not the row — a
 * reader who folds and re-opens a row while the model is still thinking has
 * not asked for it to stay open once the answer starts, so the close on
 * `ok` still happens.
 *
 * @module dsh-chat-ux/client/reasoning-fold
 */

/** What dsh puts on every reasoning row. */
export const ROW_SELECTOR = '[data-variant="think"]'

/** `data-state` while the model is still thinking; `ok` once it has stopped. */
const RUNNING = 'running'

/**
 * Install the reasoning reveal for the whole page.
 * @returns disposer that disconnects the observer and both listeners.
 */
export function installReasoningFold(): () => void {
  /** The phase in which the reader last touched each row. */
  const touchedIn = new WeakMap<Element, string>()
  /** The phase each row was last toggled in, so a click that changes nothing is not retried. */
  const attempted = new WeakMap<Element, string>()
  /** True while this module is the one pressing a control. */
  let programmatic = false
  let queued = false

  const phaseOf = (row: Element): string => row.getAttribute('data-state') ?? ''

  /**
   * Press one row's own disclosure control.
   *
   * The control differs by how dsh configured the disclosure: with
   * `expandOnRowClick` the whole row is the button, otherwise the leading
   * chevron is. Asking for the first button-ish descendant covers both without
   * depending on which one this build chose.
   * @param row - the reasoning row to toggle.
   */
  const toggle = (row: Element): void => {
    const control = row.querySelector('[role="button"], button')
    if (!(control instanceof HTMLElement)) return
    // The capture-phase listener below sees this click as well; the flag is
    // what tells it the reader did not ask for it.
    programmatic = true
    try {
      control.click()
    } finally {
      programmatic = false
    }
  }

  /** Bring every row in line with the phase it is in. */
  const sweep = (): void => {
    for (const row of document.querySelectorAll(ROW_SELECTOR)) {
      const phase = phaseOf(row)
      if (phase === '') continue
      // The reader decided this row's state during this phase; leave it be.
      if (touchedIn.get(row) === phase) continue
      if (row.hasAttribute('data-expanded') === (phase === RUNNING)) continue
      // A click that changed nothing will not change anything next time either.
      if (attempted.get(row) === phase) continue
      attempted.set(row, phase)
      toggle(row)
    }
  }

  /** Queue one sweep for the next frame; streaming mutates the tree far faster than this needs to run. */
  const schedule = (): void => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      sweep()
    })
  }

  /** Remember that the reader, not this module, just decided a row's state. */
  const noteReader = (event: Event): void => {
    if (programmatic) return
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest(ROW_SELECTOR)
    if (row !== null) touchedIn.set(row, phaseOf(row))
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body ?? document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-state', 'data-expanded'],
  })
  document.addEventListener('click', noteReader, true)
  document.addEventListener('keydown', noteReader, true)
  sweep()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', noteReader, true)
    document.removeEventListener('keydown', noteReader, true)
  }
}
