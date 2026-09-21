/**
 * dsh-chat-ux - composer markdown decoration.
 *
 * The composer is a private Lexical editor: its runtime lives inside
 * ui-conversation, its node types are fixed at construction, and it exposes no
 * slot. What it does leave reachable is its DOM — a contenteditable marked
 * `data-composer-input` holding one <p> per line — so this module decorates
 * from the outside, writing one attribute per block and letting the stylesheet
 * do the rest.
 *
 * Why an attribute rather than a node transform: the mark must stay in the
 * document. The submitted draft is the plain text of these paragraphs, so
 * rewriting the tree to hide a bullet would either change what gets sent or
 * leave the editor's own projections (detect spans, text refs, undo) reading a
 * document the reader never typed. An attribute changes nothing but paint.
 *
 * The scanner is idempotent and re-runs on every mutation: Lexical owns this
 * DOM and may rebuild a paragraph at any time, which drops the attribute with
 * it. Writes are guarded by a value comparison, so a re-scan of an unchanged
 * block produces no mutation of its own and the observer cannot feed itself.
 *
 * @module dsh-chat-ux/client/composer-markdown
 */
import { MD_ATTR } from './composer-markdown-styles'

/** The composer's contenteditable, as the platform marks it. */
const INPUT_SELECTOR = '[data-composer-input]'

/** A fence opener: three or more backticks or tildes at the line start. */
const FENCE_RE = /^\s*(`{3,}|~{3,})/

/** Heading opener, capturing the level. */
const HEADING_RE = /^\s*(#{1,6})\s/

/**
 * Classify one non-fenced line by its leading mark.
 * @param text - the paragraph's text content.
 * @returns The block kind, or null for an ordinary line.
 */
function classifyLine(text: string): string | null {
  if (/^\s*[-*+]\s/.test(text)) return 'ul'
  if (/^\s*\d{1,9}[.)]\s/.test(text)) return 'ol'
  if (/^\s*>\s?/.test(text)) return 'quote'
  const heading = HEADING_RE.exec(text)
  if (heading !== null) return `heading-${(heading[1] ?? '').length}`
  return null
}

/**
 * Write one block's kind, touching the DOM only when it actually changes.
 * @param el - the paragraph.
 * @param kind - the block kind, or null to clear.
 */
function setKind(el: Element, kind: string | null): void {
  if (kind === null) {
    if (el.hasAttribute(MD_ATTR)) el.removeAttribute(MD_ATTR)
    return
  }
  if (el.getAttribute(MD_ATTR) !== kind) el.setAttribute(MD_ATTR, kind)
}

/**
 * Walk one composer's paragraphs in document order, tracking fence state
 * across lines because a fence is the one mark that spans them.
 * @param root - the contenteditable element.
 */
function scanBlocks(root: Element): void {
  let fence: string | null = null
  for (const child of Array.from(root.children)) {
    if (child.tagName !== 'P') continue
    const text = child.textContent ?? ''
    const opener = FENCE_RE.exec(text)
    let kind: string | null
    if (fence !== null) {
      const closer = opener === null ? null : (opener[1] ?? '')
      const closes = closer !== null
        && closer.charAt(0) === fence.charAt(0)
        && closer.length >= fence.length
      kind = 'fence-body'
      if (closes) {
        kind = 'fence'
        fence = null
      }
    } else if (opener !== null) {
      kind = 'fence'
      fence = opener[1] ?? ''
    } else {
      kind = classifyLine(text)
    }
    setKind(child, kind)
  }
}

/**
 * Attach a scanner to one composer.
 * @param input - the contenteditable element.
 * @returns disposer that detaches the observer and clears its attributes.
 */
function watch(input: Element): () => void {
  const observer = new MutationObserver(() => { scanBlocks(input) })
  observer.observe(input, { childList: true, characterData: true, subtree: true })
  scanBlocks(input)
  return () => {
    observer.disconnect()
    for (const child of Array.from(input.children)) child.removeAttribute(MD_ATTR)
  }
}

/**
 * Decorate every composer on the page, including ones mounted later.
 *
 * A composer is per-session, so the set changes as the reader switches
 * sessions. Adoption is coalesced into one animation frame and re-checks each
 * watched element's connection, which is what retires the observers of
 * composers React has already unmounted.
 *
 * @returns disposer that stops watching and clears every attribute written.
 */
export function installComposerMarkdown(): () => void {
  const active = new Map<Element, () => void>()
  let frame = 0

  const adopt = (): void => {
    frame = 0
    for (const [element, dispose] of Array.from(active)) {
      if (element.isConnected) continue
      dispose()
      active.delete(element)
    }
    for (const input of Array.from(document.querySelectorAll(INPUT_SELECTOR))) {
      if (active.has(input)) continue
      active.set(input, watch(input))
    }
  }

  const schedule = (): void => {
    if (frame !== 0) return
    frame = window.requestAnimationFrame(adopt)
  }

  const root = new MutationObserver(schedule)
  root.observe(document.body, { childList: true, subtree: true })
  adopt()

  return () => {
    root.disconnect()
    if (frame !== 0) window.cancelAnimationFrame(frame)
    for (const dispose of Array.from(active.values())) dispose()
    active.clear()
  }
}
