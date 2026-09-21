/**
 * One-shot token reveal for streaming assistant output.
 *
 * Every newly appended character in a streaming message takes the highlight
 * color once, eases back to the text's own color, and then stays there. Both
 * halves of an answer are covered for free: reasoning and body render through
 * the same Markdown layer, and both sit inside the container the layer marks
 * with `data-streaming` while the message grows.
 *
 * One character is one run, and a run carries a single color from start to
 * finish — there is deliberately no sweep across a character and no artificial
 * stagger between neighbours. Every character's fade is decided only by when it
 * arrived, so a chunk that lands together lights up together, and the reading
 * order in the transcript comes from the API's own arrival order rather than
 * from anything this module invents.
 *
 * Why the CSS Custom Highlight API instead of wrapping tokens in <span>: the
 * transcript is React-owned, and the Markdown layer
 * (`@deepseek-ai/dsh-client-ui-primitives`) exposes no node-render hook — its
 * `MarkdownDelegate` only carries link navigation. Rewriting text nodes would
 * fight reconciliation, while highlight ranges mark character runs without
 * touching the DOM: React keeps owning structure, this module only owns color.
 *
 * `::highlight()` takes no transition, so the fade is sampled rather than
 * animated: live runs are bucketed by age at roughly one step per browser
 * frame, and one highlight name per step carries the color (see `styles.ts`,
 * which derives its rules from `REVEAL_STEPS` below and mixes them linearly in
 * sRGB, so the color moves at a constant rate).
 *
 * @module dsh-chat-ux/client/token-motion
 */

/**
 * Number of color steps between the highlight color and the text's own color.
 * Sized at roughly one step per browser frame across `REVEAL_MS`, which is what
 * makes a stepped fade read as a continuous one.
 */
export const REVEAL_STEPS = 32

/** Time one character takes to settle back to the text color. */
export const REVEAL_MS = 320

/** Only the tail of a growing message is diffed; earlier text never changes. */
const DIFF_TAIL_CHARS = 6000

/** A rewrite larger than this is a re-parse, not an append; do not animate it. */
const REWRITE_LIMIT_CHARS = 200

/** Prefix of every highlight name this module registers. */
export const HIGHLIGHT_PREFIX = 'dsh-chat-ux-tok-'

/** The container the Markdown layer marks while an assistant message streams. */
const STREAMING_SELECTOR = '[data-streaming]'

/** One character run awaiting its fade. */
interface LiveRun {
  readonly container: Element
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
 * Fade step for a run's age: 0 is the full highlight, the last step is the
 * text's own color. The mapping is linear in time, so the color settles at a
 * constant rate instead of easing out.
 * @param age - milliseconds since the run appeared.
 * @returns the step index, clamped into range.
 */
export function stepForAge(age: number): number {
  if (age <= 0) return 0
  if (age >= REVEAL_MS) return REVEAL_STEPS - 1
  return Math.min(REVEAL_STEPS - 1, Math.floor((age / REVEAL_MS) * REVEAL_STEPS))
}

/**
 * Split one appended chunk into per-character runs.
 *
 * Every character of the chunk shares one birth time on purpose: they arrived
 * together, so they fade together, and no run is offset from its neighbours.
 * Iteration is by code point, so a surrogate pair stays one run; whitespace gets
 * no run of its own but still advances the offset.
 * @param added - the appended text.
 * @param baseOffset - offset of `added` in the container's concatenated text.
 * @param now - current `performance.now()` timestamp, shared by every run.
 * @returns runs ready to be pushed onto the live list.
 */
export function planRuns(
  added: string,
  baseOffset: number,
  now: number,
): Array<{ start: number; length: number; born: number }> {
  const runs: Array<{ start: number; length: number; born: number }> = []
  let offset = baseOffset
  for (const character of added) {
    if (character.trim().length !== 0) {
      runs.push({ start: offset, length: character.length, born: now })
    }
    offset += character.length
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
 * @returns disposer that disconnects the observer and clears every highlight.
 */
export function installTokenMotion(): () => void {
  const registry = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistryLike } })
    .CSS?.highlights
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
    .Highlight
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  if (registry === undefined || HighlightCtor === undefined || reducedMotion) return () => {}

  const runs: LiveRun[] = []
  const seen = new WeakMap<Element, string>()
  let frame = 0

  const clearHighlights = (): void => {
    for (let step = 0; step < REVEAL_STEPS; step += 1) registry.delete(HIGHLIGHT_PREFIX + step)
  }

  const dropRunsIn = (container: Element): void => {
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      if (runs[index]!.container === container) runs.splice(index, 1)
    }
  }

  /** Repaint every live run at its current age, then schedule the next frame. */
  const paint = (now: number): void => {
    frame = 0
    if (runs.length === 0) {
      clearHighlights()
      return
    }
    const snapshots = new Map<Element, TextSnapshot>()
    const buckets: Range[][] = []
    for (let step = 0; step < REVEAL_STEPS; step += 1) buckets.push([])
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      const run = runs[index]!
      const age = now - run.born
      if (age >= REVEAL_MS) {
        runs.splice(index, 1)
        continue
      }
      let snapshot = snapshots.get(run.container)
      if (snapshot === undefined) {
        snapshot = collectText(run.container)
        snapshots.set(run.container, snapshot)
      }
      const range = buildRange(snapshot, run.start, run.length)
      if (range !== null) buckets[stepForAge(age)]!.push(range)
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
      // First sight of a container is a baseline: history never animates.
      if (previous === undefined || snapshot.text.length === 0) continue
      const windowStart = Math.max(0, previous.length - DIFF_TAIL_CHARS)
      const common = windowStart + commonPrefixLength(
        previous.slice(windowStart),
        snapshot.text.slice(windowStart, previous.length),
      )
      // A big rewrite is the Markdown layer re-parsing, not fresh output.
      if (previous.length - common > REWRITE_LIMIT_CHARS) {
        dropRunsIn(container)
        continue
      }
      if (common >= snapshot.text.length) continue
      const added = snapshot.text.slice(common)
      for (const run of planRuns(added, common, now)) runs.push({ container, ...run })
    }
    if (runs.length > 0 && frame === 0) frame = requestAnimationFrame(paint)
  }

  const observer = new MutationObserver(scan)
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  scan()

  return () => {
    observer.disconnect()
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    runs.length = 0
    clearHighlights()
  }
}
