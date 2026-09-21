/**
 * One-shot token reveal for streaming assistant output.
 *
 * Every newly appended character in a streaming message arrives faint and
 * fades in to the text's own color, then stays there. Both halves of an answer
 * are covered for free: reasoning and body render through the same Markdown
 * layer, and both sit inside the container the layer marks with
 * `data-streaming` while the message grows.
 *
 * One character is one run, and a run carries a single alpha from start to
 * finish: there is deliberately no sweep across a character and no artificial
 * stagger between neighbours. Every character's fade is decided only by when it
 * arrived, so a chunk that lands together fades in together, and the reading
 * order in the transcript comes from the API's own arrival order rather than
 * from anything this module invents.
 *
 * Why the CSS Custom Highlight API instead of wrapping tokens in <span>: the
 * transcript is React-owned, and the Markdown layer
 * (`@deepseek-ai/dsh-client-ui-primitives`) exposes no node-render hook — its
 * `MarkdownDelegate` only carries link navigation. Rewriting text nodes would
 * fight reconciliation, while highlight ranges mark character runs without
 * touching the DOM: React keeps owning structure, this module only owns the
 * text's transparency.
 *
 * `::highlight()` takes no transition, so the fade is sampled rather than
 * animated: live runs are bucketed by age at roughly one step per browser
 * frame, and one highlight name per step carries the alpha (see `styles.ts`,
 * which derives its rules from `REVEAL_STEPS` below and moves the alpha
 * linearly, so the text firms up at a constant rate).
 *
 * The fade's color is the run's own color — read off the element its text
 * renders in and published under `RUN_COLOR_VAR` — never `currentColor` and
 * never one value for the whole page. `::highlight()` collapses `currentColor`
 * to the initial color instead of resolving it against the originating element,
 * which the dark canvas shows as black before the highlight is dropped (see
 * `styles.ts` for the measurement), so the alpha has to ride on an explicit
 * `color`. That color cannot be a single one either: an answer holds more than
 * body text, and painting a link, a syntax token or a list marker in the body's
 * color while it fades reads as a highlight flash instead of a fade.
 *
 * @module dsh-chat-ux/client/token-motion
 */

/**
 * Number of steps between a character's faint arrival and its settled color.
 *
 * Sized against the slowest fade the settings allow on the fastest display
 * likely to run it: `MAX_REVEAL_MS` of 600 ms at 144 Hz is 86 frames, so 96
 * steps keep a step at least every frame even there. A faster fade simply
 * leaves most steps unsampled, which costs nothing — what the eye integrates
 * is the alpha each painted frame carries, not how many steps a frame skips.
 *
 * The count is only worth raising because `styles.ts` writes each step's alpha
 * as a fraction. A whole-number percentage expresses just the 81 values between
 * `TOKEN_MIN_OPACITY` and 1, so any steps past that would repeat one of them and
 * the "finer" fade would be the same staircase under another name.
 */
export const REVEAL_STEPS = 96

/**
 * Alpha a character starts at, before it fades in to fully opaque.
 *
 * The reveal is a change in the text's own transparency, not a shift into some
 * other color: a character arrives faint and becomes solid, and nothing's color
 * is ever swapped for a highlight color. `::highlight()` accepts no `opacity` —
 * its property set is small and does not include it — so the alpha rides on
 * `color` instead, which `styles.ts` turns into one rule per step.
 *
 * A fifth of the way in is faint enough to be unreadable on either theme —
 * `rgb(249, 250, 251)` at 20% over `rgb(21, 21, 23)` lands near
 * `rgb(67, 68, 70)` — while still being visible enough to read as text
 * arriving rather than as nothing having rendered at all.
 */
export const TOKEN_MIN_OPACITY = 0.2

/** Fade duration used until the settings are read, and whenever they are unusable. */
export const DEFAULT_REVEAL_MS = 120

/**
 * Bounds of the fade duration, mirroring the host schema. They exist because
 * `styles.ts` bakes exactly `REVEAL_STEPS` color rules: a longer fade would
 * spread those buckets far enough apart to read as steps, so the maximum is the
 * point where one bucket still lasts about one display frame — 600 ms over 96
 * steps is 6.25 ms, comfortably inside a 144 Hz frame.
 */
export const MIN_REVEAL_MS = 30
export const MAX_REVEAL_MS = 600

/**
 * Coerce whatever the settings hold into a usable fade duration.
 * @param value - the stored `revealMs`, of unknown shape.
 * @returns a whole number of milliseconds inside the supported range.
 */
export function clampRevealMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_REVEAL_MS
  return Math.min(MAX_REVEAL_MS, Math.max(MIN_REVEAL_MS, Math.round(value)))
}

/** Prefix of every highlight name this module registers. */
export const HIGHLIGHT_PREFIX = 'dsh-chat-ux-tok-'

/**
 * The custom property one element's own color is published under.
 *
 * `styles.ts` reads it from inside `::highlight()`, where custom properties do
 * resolve against the run's originating element — measured on a staged page, an
 * element holding `rgb(77, 155, 255)` yields
 * `color(srgb 0.301961 0.607843 1 / 0.7)` for step 0. That is what lets one
 * rule per step cover every color an answer is painted in.
 */
export const RUN_COLOR_VAR = '--dsh-chat-ux-run-color'

/** The container the Markdown layer marks while an assistant message streams. */
const STREAMING_SELECTOR = '[data-streaming]'

/**
 * How long a fold keeps the container it rewrote out of the reveal.
 *
 * The container carries `data-streaming` for as long as its message is
 * `running`, which spans the whole turn — including the answer text that
 * arrives after the reasoning stopped. A click on a reasoning or tool row
 * therefore rewrites a container the scan is still watching. Long enough to
 * cover React's re-render and the mutation batch it produces; short enough
 * that a stream resuming right after the click still animates.
 */
const FOLD_QUIET_MS = 400

/** One character run awaiting its fade. */
interface LiveRun {
  readonly container: Element
  /**
   * Element the run's characters render in; carries `RUN_COLOR_VAR`.
   *
   * Null only for a parentless text node, which cannot occur inside a streaming
   * container — carried anyway so the lookup has one shape.
   */
  readonly element: Element | null
  /** Character offset into the container's concatenated text. */
  readonly start: number
  /** Run length in UTF-16 code units. */
  readonly length: number
  /** `performance.now()` timestamp the run starts fading from. */
  readonly born: number
}

/** Text of one container, with each text node's offset in that concatenation. */
interface TextSnapshot {
  readonly text: string
  readonly nodes: readonly Text[]
  readonly starts: readonly number[]
}

/** The browser highlight registry, typed loosely to avoid lib.dom version drift. */
interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

/**
 * Length of the common prefix of two strings.
 * @param a - first string.
 * @param b - second string.
 * @returns the number of leading UTF-16 code units they share.
 */
export function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a.charCodeAt(index) === b.charCodeAt(index)) index += 1
  return index
}

/**
 * Decide whether a container's text grew by a suffix, and where that suffix
 * starts — the only shape of change that means the model just emitted
 * characters.
 *
 * Everything else is a rewrite of text the reader has already seen: the
 * Markdown layer re-parsing `**bold` into a `<strong>`, a process row folding
 * open or shut, a tool result collapsing. Those can lengthen the container's
 * text as easily as they can shorten it — a collapsed reasoning row shows the
 * first line of the block it expands into, so opening it *appends* the rest —
 * and animating them replays the fade over a paragraph that was already read.
 * Hence the strict test: the old text must be a prefix of the new one.
 * @param previous - the container's text at the last scan.
 * @param current - the container's text now.
 * @returns the offset the appended suffix starts at, or null when the change
 * is a rewrite rather than an append.
 */
export function appendedFrom(previous: string, current: string): number | null {
  if (current.length <= previous.length) return null
  return current.startsWith(previous) ? previous.length : null
}

/**
 * Fade step for a run's age: 0 is the full highlight, the last step is the
 * text's own color. The mapping is linear in time, so the color settles at a
 * constant rate instead of easing out.
 *
 * The duration is an argument rather than a constant because the reader can
 * change it while a fade is in flight: every run is re-sampled against the
 * current value on each frame, so a slower fade lengthens the runs still alive
 * instead of leaving them on the old clock.
 * @param age - milliseconds since the run appeared.
 * @param revealMs - the fade duration in force now.
 * @returns the step index, clamped into range.
 */
export function stepForAge(age: number, revealMs: number = DEFAULT_REVEAL_MS): number {
  if (age <= 0) return 0
  if (age >= revealMs) return REVEAL_STEPS - 1
  return Math.min(REVEAL_STEPS - 1, Math.floor((age / revealMs) * REVEAL_STEPS))
}

/**
 * Split a container's appended suffix into per-character runs.
 *
 * The walk is per text node rather than over the concatenated string because
 * every run has to carry the element its text renders in — that element is what
 * `styles.ts` reads the fade's color from, and one node's text always renders in
 * one element. Within a node every character shares one birth time on purpose:
 * they arrived together, so they fade together, and no run is offset from its
 * neighbours. Iteration is by code point, so a surrogate pair stays one run;
 * whitespace gets no run of its own but still advances the offset.
 * @param snapshot - the container's current text snapshot.
 * @param from - offset the appended suffix starts at.
 * @param now - current `performance.now()` timestamp, shared by every run.
 * @returns runs ready to be pushed onto the live list.
 */
function planSuffixRuns(
  snapshot: TextSnapshot,
  from: number,
  now: number,
): Array<Omit<LiveRun, 'container'>> {
  const runs: Array<Omit<LiveRun, 'container'>> = []
  for (let index = 0; index < snapshot.nodes.length; index += 1) {
    const node = snapshot.nodes[index]!
    const nodeStart = snapshot.starts[index]!
    if (nodeStart + node.data.length <= from) continue
    const begin = Math.max(from, nodeStart)
    const element = node.parentElement
    let offset = begin
    for (const character of node.data.slice(begin - nodeStart)) {
      if (character.trim().length !== 0) {
        runs.push({ element, start: offset, length: character.length, born: now })
      }
      offset += character.length
    }
  }
  return runs
}

/**
 * Concatenate every text node under one container and remember where each sits.
 * @param container - the streaming message root.
 * @returns the text plus per-node offsets.
 */
function collectText(container: Element): TextSnapshot {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  let node = walker.nextNode()
  while (node !== null) {
    const textNode = node as Text
    nodes.push(textNode)
    starts.push(text.length)
    text += textNode.data
    node = walker.nextNode()
  }
  return { text, nodes, starts }
}

/** Color last written to an element, so a repeat pass skips the read and write. */
const runColors = new WeakMap<Element, string>()

/**
 * Publish an element's own color under `RUN_COLOR_VAR`.
 *
 * The computed color is read rather than remembered: what matters is the color
 * the Markdown layer actually painted — a link's token, a syntax token, a list
 * marker — not whatever this module wrote last. The read is skipped while the
 * element still carries the color recorded for it, which is the common case on
 * every frame after the first.
 * @param element - element a run's text renders in.
 */
function ensureRunColor(element: Element | null): void {
  if (element === null) return
  const color = window.getComputedStyle(element).color
  if (runColors.get(element) === color) return
  runColors.set(element, color)
  ;(element as HTMLElement).style.setProperty(RUN_COLOR_VAR, color)
}

/**
 * Build the DOM Range for one character run.
 *
 * Per-character runs mean many lookups per frame, so the first node that can
 * contain the run is found by binary search over the snapshot's offsets rather
 * than by scanning from the top of the message each time.
 * @param snapshot - the container's current text snapshot.
 * @param start - run start offset.
 * @param length - run length.
 * @returns the range, or null when the run no longer exists in the DOM.
 */
function buildRange(snapshot: TextSnapshot, start: number, length: number): Range | null {
  const end = start + length
  let low = 0
  let high = snapshot.starts.length - 1
  let first = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    const nodeStart = snapshot.starts[middle]!
    const nodeEnd = nodeStart + snapshot.nodes[middle]!.data.length
    if (nodeEnd <= start) low = middle + 1
    else {
      first = middle
      high = middle - 1
    }
  }
  if (first < 0 || snapshot.starts[first]! >= end) return null
  const firstNode = snapshot.nodes[first]!
  const range = document.createRange()
  range.setStart(firstNode, Math.max(0, start - snapshot.starts[first]!))
  let lastNode = firstNode
  let lastEnd = Math.min(firstNode.data.length, end - snapshot.starts[first]!)
  for (let index = first + 1; index < snapshot.nodes.length; index += 1) {
    const nodeStart = snapshot.starts[index]!
    if (nodeStart >= end) break
    lastNode = snapshot.nodes[index]!
    lastEnd = Math.min(lastNode.data.length, end - nodeStart)
  }
  range.setEnd(lastNode, lastEnd)
  return range
}

/**
 * Install the reveal effect for the whole page.
 *
 * Safe to call on an engine without the Highlight API, and a no-op when the
 * reader asked for reduced motion — in both cases it returns an inert disposer.
 * @param readRevealMs - reads the fade duration in force right now; called once
 * per painted frame, so a settings change applies to the very next frame.
 * @returns disposer that disconnects the observer and clears every highlight.
 */
export function installTokenMotion(readRevealMs: () => number = () => DEFAULT_REVEAL_MS): () => void {
  const registry = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistryLike } })
    .CSS?.highlights
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
    .Highlight
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  if (registry === undefined || HighlightCtor === undefined || reducedMotion) return () => {}

  const runs: LiveRun[] = []
  const seen = new WeakMap<Element, string>()
  /** Each streaming container's text as of the last scan, reused by `paint`. */
  const latest = new WeakMap<Element, TextSnapshot>()
  /** Containers a reader just folded open or shut, against the guard's expiry. */
  const folded = new WeakMap<Element, number>()
  let frame = 0

  const clearHighlights = (): void => {
    for (let step = 0; step < REVEAL_STEPS; step += 1) registry.delete(HIGHLIGHT_PREFIX + step)
  }

  /**
   * Drop the runs a rewrite invalidated, keeping the ones whose characters are
   * still where they were.
   *
   * Killing every run in a rewritten container would snap the text that was
   * mid-fade straight to its settled color — the hard cut this whole module
   * exists to avoid, and one that lands on exactly the paragraphs the reader is
   * looking at, since a re-parse happens at the end of what is being written.
   * @param container - the container that was rewritten.
   * @param valid - length of the prefix that survived the rewrite.
   */
  const keepRunsBefore = (container: Element, valid: number): void => {
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      const run = runs[index]!
      if (run.container === container && run.start + run.length > valid) runs.splice(index, 1)
    }
  }

  /**
   * Mark the containers a fold is about to rewrite.
   *
   * A click on a reasoning row is not the model emitting text, but the row it
   * toggles lives inside a container that still carries `data-streaming`, and
   * the mutation it produces looks exactly like an append when the collapsed
   * summary happens to be a prefix of the expanded block. The click is the only
   * signal that separates the two, so it is captured before React's handler
   * runs and the containers it can reach are held out of the reveal.
   * @param event - a click or key press anywhere in the page.
   */
  const noteFold = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const until = performance.now() + FOLD_QUIET_MS
    const self = target.closest(STREAMING_SELECTOR)
    if (self !== null) folded.set(self, until)
    // The toggling control can sit outside the container it rewrites, so the
    // subtree is swept too rather than only the target's own ancestors.
    for (const container of target.querySelectorAll(STREAMING_SELECTOR)) folded.set(container, until)
  }

  document.addEventListener('click', noteFold, true)
  document.addEventListener('keydown', noteFold, true)

  /** Repaint every live run at its current age, then schedule the next frame. */
  const paint = (now: number): void => {
    frame = 0
    if (runs.length === 0) {
      clearHighlights()
      return
    }
    const revealMs = clampRevealMs(readRevealMs())
    const buckets: Range[][] = []
    for (let step = 0; step < REVEAL_STEPS; step += 1) buckets.push([])
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      const run = runs[index]!
      const age = now - run.born
      if (age >= revealMs) {
        runs.splice(index, 1)
        continue
      }
      // The scan that queued these runs built the snapshot, and every later
      // mutation goes through another scan before this frame can paint, so the
      // cached text is the text on screen. Re-walking the container here would
      // put an O(message) TreeWalker in the middle of every frame.
      const snapshot = latest.get(run.container)
      if (snapshot === undefined) continue
      const range = buildRange(snapshot, run.start, run.length)
      if (range === null) continue
      // The element is read back from the range, not from the one the scan
      // saw. The Markdown layer rebuilds nodes while a message streams
      // (re-parsing `**bold`, folding a row), and a run whose element was
      // replaced would leave its color on a node nobody renders any more —
      // the live element would then fall back to the page default and flash
      // the body color instead of fading. `ensureRunColor` skips the style
      // read once the element carries the color recorded for it, so this
      // costs one WeakMap lookup per run per frame.
      ensureRunColor(range.startContainer.parentElement)
      buckets[stepForAge(age, revealMs)]!.push(range)
    }
    for (let step = 0; step < REVEAL_STEPS; step += 1) {
      const name = HIGHLIGHT_PREFIX + step
      const ranges = buckets[step]!
      if (ranges.length === 0) registry.delete(name)
      else registry.set(name, new HighlightCtor(...ranges))
    }
    if (runs.length > 0) frame = requestAnimationFrame(paint)
  }

  /** Diff every streaming container against its last snapshot and queue new runs. */
  const scan = (): void => {
    const containers = document.querySelectorAll(STREAMING_SELECTOR)
    if (containers.length === 0) return
    const now = performance.now()
    for (const container of containers) {
      const snapshot = collectText(container)
      const previous = seen.get(container)
      seen.set(container, snapshot.text)
      latest.set(container, snapshot)
      // First sight of a container is a baseline: history never animates.
      if (previous === undefined || snapshot.text.length === 0) continue
      const quiet = folded.get(container)
      const from = quiet !== undefined && now <= quiet
        ? null
        : appendedFrom(previous, snapshot.text)
      if (from === null) {
        keepRunsBefore(container, commonPrefixLength(previous, snapshot.text))
        continue
      }
      // One style read per element per pass: a chunk lands in one or two
      // nodes, so this stays a handful of reads even when a whole paragraph
      // arrives at once.
      const touched = new Set<Element>()
      for (const run of planSuffixRuns(snapshot, from, now)) {
        if (run.element !== null && !touched.has(run.element)) {
          touched.add(run.element)
          ensureRunColor(run.element)
        }
        runs.push({ container, ...run })
      }
    }
    if (runs.length > 0 && frame === 0) frame = requestAnimationFrame(paint)
  }

  const observer = new MutationObserver(scan)
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  scan()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', noteFold, true)
    document.removeEventListener('keydown', noteFold, true)
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    runs.length = 0
    clearHighlights()
  }
}
