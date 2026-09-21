/**
 * dsh-chat-ux - user bubble replacement renderer.
 *
 * dsh renders the assistant's answer through `MarkdownText` but the reader's
 * own message through `projectUserText`, which is a reference decorator, not a
 * parser: it turns `@label` / `/name` tokens into chips and hands everything
 * else back verbatim. So a backticked path a reader types stays literal on
 * their own bubble while the same text in an answer renders as code.
 *
 * This module closes that gap by taking the keyed `conversation.chat.node`
 * seat for `user` and `steering` at a negative priority. The slot contract
 * says a reused key replaces the renderer and that the LOWEST priority wins,
 * while the shipped registration passes none (default 0) — so a negative
 * priority is what makes this a replacement rather than a rival.
 *
 * What that costs, stated plainly, because none of it is recoverable from
 * inside a plugin:
 *
 *   - `UserStyleBubble` and `MessageIconActions` are ui-chat internals with no
 *     package export, so the bubble chrome and the copy/clock row are
 *     re-implemented here against the same design tokens.
 *   - The two text projections cannot be composed. `projectUserText` and
 *     `MarkdownText` each map a whole string to React nodes, and the markdown
 *     renderer's output is an arbitrary element tree, so there is no seam to
 *     run chips through. A message that carries reference context therefore
 *     keeps the projection and forgoes markdown; everything else gets markdown
 *     and forgoes the clickable `@path` affordance. The split is on
 *     `referenceLabels`/`skillNames` — the labels the host actually resolved
 *     for this message — rather than on the presence of an `@` character,
 *     which would also match an email address.
 *
 * @module dsh-chat-ux/client/user-bubble
 */
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  FileTypeIcon, fileExtension, fileSizeText, IconCheckOutline16, IconCopyOutline16,
  JsonBlock, MarkdownText, projectUserText, Tooltip, writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownLabels, UserTextReferences } from '@deepseek-ai/dsh-client-ui-primitives'
import { UB } from './user-bubble-styles'

/** Chrome copy for the markdown renderer. Three strings, so no locale seat is needed. */
const MARKDOWN_LABELS: MarkdownLabels = {
  code: { copyLabel: '复制代码', copiedLabel: '已复制' },
  footnotes: '脚注',
}

const COPY_LABEL = '复制'
const COPIED_LABEL = '已复制'
const EXTRA_BLOCK_LABEL = '附加内容'

const EMPTY_NAMES: readonly string[] = []

/** One attachment the bubble presents above its text. */
type PresentedAttachment =
  | { readonly type: 'image'; readonly image: { readonly attachment: unknown } }
  | { readonly type: 'file'; readonly file: FileAttachment }

/** The file attachment fields this renderer reads. */
interface FileAttachment {
  readonly name: string
  readonly bytes: number
}

/** The node data both user and steering seats carry. */
interface UserMessageData {
  readonly content: readonly unknown[]
  readonly time: number
  /** Labels cited by the immediately following session-reference context. */
  readonly referenceLabels?: readonly string[] | undefined
  /** Skill names the same step's `skill-invocation` injections loaded. */
  readonly skillNames?: readonly string[] | undefined
}

/** The owner share of one keyed chat-node renderer. */
interface UserBubbleProps {
  readonly node: { readonly data: UserMessageData }
  readonly renderMessageImages: (spec: {
    images: readonly { readonly attachment: unknown }[]
    align: 'start' | 'end'
    compact?: boolean
  }) => ReactNode
  readonly openFile: (path: string, options?: unknown) => Promise<void> | void
  readonly openSkill: (name: string) => void
}

/**
 * Partition content blocks the way the shipped bubble does: text joins into one
 * string, attachments keep their order, and anything else falls through to a
 * JSON block so an unrecognized surface is still visible.
 * @param content - the node's content blocks.
 * @returns Joined text, presented attachments, and leftover blocks.
 */
function splitContent(content: readonly unknown[]): {
  text: string
  attachments: PresentedAttachment[]
  rest: unknown[]
} {
  const texts: string[] = []
  const attachments: PresentedAttachment[] = []
  const rest: unknown[] = []
  for (const block of content) {
    const b = block as { type?: string; text?: string; attachment?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
    else if (b.type === 'image' && b.attachment !== undefined) {
      attachments.push({ type: 'image', image: { attachment: b.attachment } })
    } else if (b.type === 'file' && b.attachment !== undefined) {
      attachments.push({ type: 'file', file: b.attachment as FileAttachment })
    } else rest.push(block)
  }
  return { text: texts.join(''), attachments, rest }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local midnight of an instant, as epoch ms. */
function startOfLocalDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Milliseconds until the next local midnight after an instant (at least 1). */
function msUntilNextLocalMidnight(ms: number): number {
  const next = new Date(ms)
  next.setHours(24, 0, 0, 0)
  return Math.max(next.getTime() - ms, 1)
}

/**
 * Compact local timestamp. Same day -> `HH:mm`; earlier this year -> month and
 * day plus the clock; another year -> the full date plus the clock.
 *
 * The shipped helper reads these date templates from the chat locale
 * namespace, which a plugin cannot address, so the parts are composed here
 * instead. The clock itself is still zero-padded 24-hour, matching it.
 * @param time - Unix epoch ms from the source session event.
 * @param day - Local midnight of the reference day.
 * @returns The display string.
 */
function formatClock(time: number, day: number): string {
  const d = new Date(time)
  const n = new Date(day)
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const sameDay = d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate()
  if (sameDay) return clock
  const date = d.getFullYear() === n.getFullYear()
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  return `${date} ${clock}`
}

/**
 * Local calendar-day epoch that advances at each midnight.
 *
 * Memoized rows keep stable props across a midnight boundary, so the clock
 * needs its own tick rather than a render trigger from above.
 * @returns Midnight ms for the current local day.
 */
function useCalendarDay(): number {
  const [day, setDay] = useState(() => startOfLocalDay(Date.now()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const arm = (): void => {
      const now = Date.now()
      setDay(startOfLocalDay(now))
      timer = setTimeout(arm, msUntilNextLocalMidnight(now))
    }
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))
    return () => { clearTimeout(timer) }
  }, [])
  return day
}

/**
 * The copy control, with the same post-write confirmation window the shipped
 * one uses: a check swaps in for a second, and re-clicks inside that window
 * neither re-copy nor stack timers.
 * @param props.text - plain text the copy action writes.
 * @returns The copy button.
 */
function CopyAction({ text }: { text: string }): ReactNode {
  const [copied, setCopied] = useState(false)
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const epoch = useRef(0)
  useEffect(() => () => {
    epoch.current += 1
    pending.current = false
    if (timer.current !== null) clearTimeout(timer.current)
  }, [])
  const onCopy = useCallback(() => {
    if (copied || pending.current) return
    const current = epoch.current
    pending.current = true
    void writeClipboard(text).then((ok) => {
      if (current !== epoch.current) return
      pending.current = false
      if (!ok) return
      setCopied(true)
      timer.current = window.setTimeout(() => {
        timer.current = null
        setCopied(false)
      }, 1000)
    })
  }, [copied, text])
  const label = copied ? COPIED_LABEL : COPY_LABEL
  return (
    <Tooltip label={label} side="bottom">
      <button type="button" className={UB.action} aria-label={label} onClick={onCopy}>
        {copied ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
      </button>
    </Tooltip>
  )
}

/**
 * Replacement renderer for the `user` and `steering` chat-node keys.
 * @param props - the node, the owner's seats, and the chat actions.
 * @returns The right-aligned bubble, its attachments, and its action row.
 */
export const ChatUxUserBubble = memo(function ChatUxUserBubble({
  node, renderMessageImages, openFile, openSkill,
}: UserBubbleProps): ReactNode {
  const data = node.data
  const { text, attachments, rest } = useMemo(() => splitContent(data.content), [data.content])
  const referenceLabels = data.referenceLabels ?? EMPTY_NAMES
  const skillNames = data.skillNames ?? EMPTY_NAMES
  // Only resolved labels count. Keying off a bare `@` would also catch an
  // address or a handle the host never linked to anything.
  const projected = referenceLabels.length > 0 || skillNames.length > 0
  const references = useMemo<UserTextReferences>(
    () => ({ openFile, openSkill }),
    [openFile, openSkill],
  )
  const compactImages = attachments.length > 1
  const showBubble = text !== '' || rest.length > 0
  const day = useCalendarDay()
  return (
    <div className={UB.row}>
      <div className={UB.stack}>
        {attachments.length > 0 && (
          <div className={UB.attachments} data-message-attachments>
            {attachments.map((attachment, index) => attachment.type === 'image'
              ? (
                <Fragment key={`image:${index}`}>
                  {renderMessageImages({
                    images: [attachment.image],
                    align: 'end',
                    compact: compactImages,
                  })}
                </Fragment>
              )
              : (
                <span key={`file:${index}`} className={UB.file} title={attachment.file.name}>
                  <FileTypeIcon path={attachment.file.name} className={UB.fileIcon} />
                  <span className={UB.fileContent}>
                    <span className={UB.fileName}>{attachment.file.name}</span>
                    <span className={UB.fileMeta}>
                      {[
                        fileExtension(attachment.file.name).toUpperCase().slice(0, 8),
                        fileSizeText(attachment.file.bytes),
                      ].filter(Boolean).join(' ')}
                    </span>
                  </span>
                </span>
              ))}
          </div>
        )}
        {showBubble && (
          <div className={`${UB.bubble} ${projected ? UB.plain : UB.markdown}`}>
            {projected
              ? projectUserText(text, referenceLabels, skillNames, 'skill', references)
              : <MarkdownText text={text} labels={MARKDOWN_LABELS} />}
            {rest.map((block, index) => (
              <JsonBlock
                key={index}
                label={EXTRA_BLOCK_LABEL}
                payload={block}
                truncatedLabel={total => `… ${total}`}
              />
            ))}
          </div>
        )}
        {referenceLabels.length > 0 && (
          <div className={UB.refs}>{referenceLabels.join('、')}</div>
        )}
      </div>
      <div className={UB.actions}>
        <span className={UB.time}>{formatClock(data.time, day)}</span>
        <CopyAction text={text} />
      </div>
    </div>
  )
})
