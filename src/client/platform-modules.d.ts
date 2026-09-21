/**
 * Ambient declarations for the platform modules the DSH client module loader
 * serves from its frozen baseline table (`PLATFORM_MODULES`). The loader hands a
 * plugin bundle a `require` bound to that table, so these are resolved at run
 * time and are deliberately not installed into this project.
 *
 * Only what this plugin actually uses is declared, and only as narrowly as the
 * call sites need: the point is to keep the compiler honest about the calls made,
 * not to restate the platform's own types.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /**
   * A read-only capsule badge.
   * @param props.tone - which palette to use; `neutral` is the muted one.
   * @param props.className - extra class for layout placement.
   * @param props.children - the label, owned by the render site.
   */
  export function Tag(props: {
    tone?: 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'
    className?: string
    children?: ReactNode
  }): ReactElement

  /**
   * Localized chrome for one Markdown document. A plugin cannot address the
   * chat locale namespace, so it supplies its own three strings.
   */
  export interface MarkdownLabels {
    code: { copyLabel: string; copiedLabel: string }
    footnotes: string
  }

  /** Navigation the reference projection offers for resolved mentions. */
  export interface UserTextReferences {
    openFile: (path: string) => void
    openSkill: (name: string) => void
  }

  /**
   * GFM + TeX renderer used by the assistant transcript.
   * @param props.text - the markdown source.
   * @param props.labels - code-fence and footnote chrome.
   */
  export function MarkdownText(props: {
    text: string
    streaming?: boolean
    labels: MarkdownLabels
    fileMentions?: unknown
    pathImages?: unknown
    variant?: 'body' | 'compact'
  }): ReactElement

  /**
   * Display projection of reference forms in sent user text: session, skill,
   * and file mentions become chips; everything else is returned verbatim.
   * @returns inline nodes covering the whole text.
   */
  export function projectUserText(
    text: string,
    sessionLabels: readonly string[],
    slashNames?: readonly string[],
    slashKind?: 'skill' | 'command',
    references?: UserTextReferences,
  ): ReactNode

  /** Collapsible JSON viewer for blocks the bubble does not present itself. */
  export function JsonBlock(props: {
    label: string
    payload: unknown
    truncatedLabel: (total: number) => string
  }): ReactElement

  /** File-type glyph keyed on a path's extension. */
  export function FileTypeIcon(props: { path: string; className?: string }): ReactElement

  /** Lowercase extension of a file name, without the dot. */
  export function fileExtension(name: string): string

  /** Human-readable byte size. */
  export function fileSizeText(bytes: number): string

  /** Wraps one element with a hover/focus label. */
  export function Tooltip(props: {
    label: string
    side?: 'top' | 'bottom' | 'left' | 'right'
    children?: ReactNode
  }): ReactElement

  /** Write plain text to the clipboard; resolves false when the write is refused. */
  export function writeClipboard(text: string): Promise<boolean>

  export function IconCopyOutline16(): ReactElement
  export function IconCheckOutline16(): ReactElement
}
