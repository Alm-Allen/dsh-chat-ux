/**
 * dsh-chat-ux - composer inline markdown decoration.
 *
 * `composer-markdown.ts` decorates whole blocks from the outside: a paragraph is
 * one element, so an attribute on it is enough. An inline mark is not — it sits
 * *inside* a text node, and the editor owns that subtree, so a wrapper element
 * added from outside would be reconciled away. Styling part of a text node has
 * to go through the editor's own model.
 *
 * Two facts, both read off the shipped Lexical 0.49 sources, make that reachable
 * without importing `lexical` (which the client bundle could not resolve
 * anyway):
 *
 *   - The editor is kept on its root element as `__lexicalEditor`
 *     (`addRootElementEvents`), which is how Lexical's own event routing finds
 *     the editor for a DOM target. It is an internal field, so a composer
 *     without one gets no decoration rather than an error.
 *   - `registerNodeTransform` resolves its class argument through
 *     `klass.getType()` alone (`getRegisteredNode`), so a stand-in carrying
 *     that one method registers a transform on the registered text node type.
 *
 * The decoration is `TextNode.setStyle` — the same lever dsh itself pulls for
 * its claim token. The mark stays in the text, because the submitted draft IS
 * that text, and the whole mark is styled rather than only the span between its
 * characters: leaving the marks unstyled would leave a stray closing backtick at
 * the head of every tail node, where the next pass would pair it with the
 * *opening* backtick of the following span and paint everything in between.
 *
 * What the reader sees is a second, independent layer: a code span's backticks
 * are painted transparent through `::highlight()`, which marks character ranges
 * without touching the DOM at all. Nothing about the draft changes — the
 * backticks are still there for the model, and still there for the caret.
 *
 * @module dsh-chat-ux/client/composer-inline
 */

/** The composer's contenteditable, as the platform marks it. */
const INPUT_SELECTOR = '[data-composer-input]'

/** Field Lexical keeps on its root element; the only handle on the editor. */
const EDITOR_FIELD = '__lexicalEditor'

/** Registered node type a stand-in class registers its transform against. */
const TEXT_TYPE = 'text'

/** Highlight name that paints a code span's backticks invisible. */
const TICK_HIGHLIGHT = 'dsh-chat-ux-tick'

/** Substring identifying this module's code style on a rendered span. */
const CODE_MARK = 'ui-monospace'

/** Style written on a code span, matching the transcript's inline code. */
const CODE_STYLE = [
  'background-color: var(--dsw-alias-markdown-inline-code, rgba(127, 127, 127, 0.16))',
  'border-radius: 6px',
  'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  'font-size: 0.875em',
  'padding: 0 2px',
].join('; ')

/** Style written on a bold span. */
const BOLD_STYLE = 'font-weight: 600'

/** Style written on a link. */
const LINK_STYLE = 'color: var(--dsw-alias-link, #4d9bff); text-decoration: underline'

/** Every style this module writes, so a leftover can be told from a foreign one. */
const OWN_STYLES = new Set([CODE_STYLE, BOLD_STYLE, LINK_STYLE])

/**
 * Rule hiding the backticks a code span still carries.
 *
 * `::highlight()` reaches character ranges that no selector can, and it changes
 * only paint: the backticks stay in the text node, stay in the draft the model
 * receives, and stay addressable by the caret.
 */
export const COMPOSER_INLINE_CSS = '::highlight(' + TICK_HIGHLIGHT + ') {\n  color: transparent;\n}'

/** One run of non-backtick text between backticks. */
const CODE_RE = /`([^`\n]+)`/

/** Doubled asterisks or underscores around non-empty text, pair-matched. */
const BOLD_RE = /(\*\*|__)([^\n]+?)\1/

/** `[label](target)`. */
const LINK_RE = /\[([^\]\n]+)\]\(([^)\n]+)\)/

/** How many animation frames a composer is retried before it is left alone. */
const MAX_EDITOR_LOOKUPS = 120

/**
 * The slice of Lexical's `TextNode` this module touches. Every member is public
 * Lexical API; the type is declared here because the package cannot be imported.
 */
interface TextNodeLike {
  getTextContent(): string
  getStyle(): string
  setStyle(style: string): void
  splitText(offset: number): [TextNodeLike, TextNodeLike]
}

/** The slice of Lexical's `LexicalEditor` this module touches. */
interface EditorLike {
  registerNodeTransform(
    klass: { getType(): string },
    listener: (node: TextNodeLike) => void,
  ): () => void
}

/** Stand-in for the `TextNode` class, which the registry only reads a type from. */
const TEXT_KLASS = { getType: (): string => TEXT_TYPE }

/** The browser highlight registry, typed loosely to avoid lib.dom version drift. */
interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

/** One inline mark located in a node's text, with the whole mark as its range. */
interface InlineMark {
  /** Offset of the mark's first character. */
  readonly start: number
  /** Offset just past the mark's last character. */
  readonly end: number
  /** Style written on the mark. */
  readonly style: string
}

/**
 * Find the leftmost inline mark in a slice of text.
 * @param text - the text to search.
 * @returns the mark, or null when the slice holds none.
 */
function firstMark(text: string): InlineMark | null {
  const marks: InlineMark[] = []
  const code = CODE_RE.exec(text)
  if (code !== null) {
    marks.push({ start: code.index, end: code.index + code[0].length, style: CODE_STYLE })
  }
  const bold = BOLD_RE.exec(text)
  if (bold !== null) {
    marks.push({ start: bold.index, end: bold.index + bold[0].length, style: BOLD_STYLE })
  }
  const link = LINK_RE.exec(text)
  if (link !== null) {
    marks.push({ start: link.index, end: link.index + link[0].length, style: LINK_STYLE })
  }
  let best: InlineMark | null = null
  for (const mark of marks) {
    if (best === null || mark.start < best.start) best = mark
  }
  return best
}

/**
 * Every non-overlapping inline mark in one node's text, in text order.
 * @param text - the node's text content.
 * @returns the marks to paint.
 */
function allMarks(text: string): InlineMark[] {
  const marks: InlineMark[] = []
  let cursor = 0
  while (cursor < text.length) {
    const mark = firstMark(text.slice(cursor))
    if (mark === null) break
    marks.push({ start: mark.start + cursor, end: mark.end + cursor, style: mark.style })
    cursor += mark.end
  }
  return marks
}

/**
 * Drop a style this module wrote, leaving any other style alone.
 * @param node - the node to clear.
 */
function clearOwnStyle(node: TextNodeLike): void {
  if (OWN_STYLES.has(node.getStyle())) node.setStyle('')
}

/**
 * Write one of this module's styles, skipping the write when it is already there.
 *
 * The comparison is what keeps the transform finite: `setStyle` marks the node
 * dirty, so an unconditional write would re-enter the transform forever.
 * @param node - the node to style.
 * @param style - the style to write.
 */
function setOwnStyle(node: TextNodeLike, style: string): void {
  if (node.getStyle() !== style) node.setStyle(style)
}

/**
 * Paint every inline mark in one text node, splitting the node so each mark
 * becomes its own leaf.
 *
 * The splits run right to left: each one shortens the node from its end, so the
 * offsets of the marks still waiting are untouched and none of them has to be
 * recomputed against a moving target. Marks are found in one sweep up front for
 * the same reason the whole mark is styled — a node that still held half a mark
 * would be re-parsed and mis-paired.
 *
 * A node that is exactly one complete mark and already carries its style is left
 * alone. Anything else falls through, which is what catches the common case of
 * typing at the end of a mark: the caret sits inside the styled node, so the new
 * characters land in it and the node stops being a complete mark. Splitting the
 * overflow back out is what dsh's own claim decoration does for the same reason.
 * @param node - the text node a transform was called on.
 */
function decorateText(node: TextNodeLike): void {
  const text = node.getTextContent()
  const marks = allMarks(text)
  if (marks.length === 1) {
    const only = marks[0]!
    if (only.start === 0 && only.end === text.length) {
      setOwnStyle(node, only.style)
      return
    }
  }
  if (marks.length === 0) {
    clearOwnStyle(node)
    return
  }
  let rest = node
  let restEnd = text.length
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    const mark = marks[index]!
    if (mark.end < restEnd) {
      const [head, tail] = rest.splitText(mark.end)
      rest = head
      restEnd = mark.end
      clearOwnStyle(tail)
    }
    if (mark.start === 0) {
      setOwnStyle(rest, mark.style)
      continue
    }
    const [head, content] = rest.splitText(mark.start)
    rest = head
    restEnd = mark.start
    setOwnStyle(content, mark.style)
  }
  if (marks[0]!.start > 0) clearOwnStyle(rest)
}

/**
 * Paint every code span's backticks transparent.
 *
 * Ranges are rebuilt from scratch on every call rather than tracked: the editor
 * rewrites these nodes as the reader types, so a range kept from the last pass
 * would point at a node that no longer exists.
 */
function paintTicks(): void {
  const registry = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistryLike } })
    .CSS?.highlights
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown })
    .Highlight
  if (registry === undefined || HighlightCtor === undefined) return
  const ranges: Range[] = []
  for (const span of Array.from(document.querySelectorAll(INPUT_SELECTOR + ' span'))) {
    const style = span.getAttribute('style')
    if (style === null || !style.includes(CODE_MARK)) continue
    const textNode = span.firstChild
    if (textNode === null || textNode.nodeType !== Node.TEXT_NODE) continue
    const text = (textNode as Text).data
    if (text.length < 3 || !text.startsWith('`') || !text.endsWith('`')) continue
    const open = document.createRange()
    open.setStart(textNode, 0)
    open.setEnd(textNode, 1)
    ranges.push(open)
    const close = document.createRange()
    close.setStart(textNode, text.length - 1)
    close.setEnd(textNode, text.length)
    ranges.push(close)
  }
  if (ranges.length === 0) registry.delete(TICK_HIGHLIGHT)
  else registry.set(TICK_HIGHLIGHT, new HighlightCtor(...ranges))
}

/**
 * Read the editor off one composer's root element.
 * @param input - the contenteditable element.
 * @returns the editor, or null while it is unbound or unrecognisable.
 */
function readEditor(input: Element): EditorLike | null {
  const value = (input as unknown as Record<string, unknown>)[EDITOR_FIELD]
  if (value === null || typeof value !== 'object') return null
  const editor = value as Partial<EditorLike>
  return typeof editor.registerNodeTransform === 'function' ? (editor as EditorLike) : null
}

/**
 * Decorate inline marks in every composer on the page, including ones mounted
 * later and ones whose editor is bound after the element appears.
 *
 * A composer is per-session, so the set changes as the reader switches
 * sessions. Adoption is coalesced into one animation frame and re-checks each
 * watched element's connection, which retires the transforms of composers React
 * has unmounted. The tick layer watches the whole page instead of one composer,
 * because the highlight it writes is a single page-wide registration.
 *
 * @returns disposer that unregisters every transform and drops the tick
 * highlight. Styles already written stay on their nodes; a later transform pass
 * re-derives them anyway.
 */
export function installComposerInline(): () => void {
  const active = new Map<Element, () => void>()
  const lookups = new WeakMap<Element, number>()
  let frame = 0

  const adopt = (): void => {
    frame = 0
    for (const [element, dispose] of Array.from(active)) {
      if (element.isConnected) continue
      dispose()
      active.delete(element)
    }
    let waiting = false
    for (const input of Array.from(document.querySelectorAll(INPUT_SELECTOR))) {
      if (active.has(input)) continue
      const editor = readEditor(input)
      if (editor === null) {
        // The root element and its editor are bound in separate layout effects,
        // and that binding is not a DOM mutation this observer would see, so a
        // composer that exists without an editor is retried on later frames.
        const tried = lookups.get(input) ?? 0
        if (tried < MAX_EDITOR_LOOKUPS) {
          lookups.set(input, tried + 1)
          waiting = true
        }
        continue
      }
      active.set(input, editor.registerNodeTransform(TEXT_KLASS, decorateText))
      paintTicks()
    }
    if (waiting) schedule()
  }

  const schedule = (): void => {
    if (frame !== 0) return
    frame = window.requestAnimationFrame(adopt)
  }

  const root = new MutationObserver(() => {
    paintTicks()
    schedule()
  })
  root.observe(document.body, { childList: true, subtree: true, characterData: true })
  adopt()

  return () => {
    root.disconnect()
    if (frame !== 0) window.cancelAnimationFrame(frame)
    for (const dispose of Array.from(active.values())) dispose()
    active.clear()
    const registry = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistryLike } })
      .CSS?.highlights
    registry?.delete(TICK_HIGHLIGHT)
  }
}
