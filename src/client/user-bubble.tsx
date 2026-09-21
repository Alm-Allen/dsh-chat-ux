/**
 * dsh-chat-ux —— 用户气泡的替换渲染器。
 *
 * dsh 用 `MarkdownText` 渲染助手的回答，却用 `projectUserText` 渲染读者自己的消息，而后者是一个
 * 引用装饰器、不是解析器：它把 `@label` / `/name` 之类的 token 变成 chip，其余文本原样奉还。
 * 于是读者在自己气泡里打的反引号路径保持字面量，同样的文字出现在回答里却是代码。
 *
 * 这个模块补上这道缝的办法，是在 `conversation.chat.node` 这个 keyed 座位上以负 priority 接管
 * `user` 与 `steering`。槽位契约写着复用同一个 key 会替换该渲染器、且**最低** priority 者渲染，
 * 而官方注册没传 priority（默认 0）——所以负值才是替换，在 0 上注册只会变成同 key 同 priority 的
 * 第二个占位者，直接抛错。
 *
 * 代价说得直白些，因为其中没有一条能在插件内部挽回：
 *
 *   - `UserStyleBubble` 与 `MessageIconActions` 是 ui-chat 的内部实现、没有包导出，所以气泡外壳
 *     和复制/时钟那一行是按同样的设计令牌在这里重写的。
 *   - 两种文本投影无法合成。`projectUserText` 和 `MarkdownText` 都是「整串文本 → React 节点」的
 *     投影，而 markdown 渲染器的输出是任意嵌套的元素树，中间没有能让 chip 穿过去的缝。所以带引用
 *     上下文的消息保留投影、放弃 markdown；其余消息得到 markdown、放弃可点击的 `@path`。分流按
 *     `referenceLabels`/`skillNames`——host 真正为这条消息解析出来的 label——而不是按文本里有没有
 *     `@`，后者会把邮箱地址也算进去。
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
import { USER_BUBBLE_CLASS } from './user-bubble-styles'

/** 交给 markdown 渲染器的外壳文案。只有三条字符串，所以不需要 locale 座位。 */
const MARKDOWN_LABELS: MarkdownLabels = {
  code: { copyLabel: '复制代码', copiedLabel: '已复制' },
  footnotes: '脚注',
}

const COPY_LABEL = '复制'
const COPIED_LABEL = '已复制'
const EXTRA_BLOCK_LABEL = '附加内容'

/** 消息没带引用上下文时共用的那个空数组，省掉每次渲染新建一个。 */
const EMPTY_NAMES: readonly string[] = []

/** 气泡呈现在文字上方的一个附件。 */
type PresentedAttachment =
  | { readonly type: 'image'; readonly image: { readonly attachment: unknown } }
  | { readonly type: 'file'; readonly file: FileAttachment }

/** 这个渲染器会读的文件附件字段。 */
interface FileAttachment {
  readonly name: string
  readonly bytes: number
}

/** user 与 steering 两个座位共同的节点数据。 */
interface UserMessageData {
  readonly content: readonly unknown[]
  readonly time: number
  /** 紧跟其后的会话引用上下文所引用的那些 label。 */
  readonly referenceLabels?: readonly string[] | undefined
  /** 同一步的 `skill-invocation` 注入所加载的技能名。 */
  readonly skillNames?: readonly string[] | undefined
}

/** 一个 keyed 聊天节点渲染器从 owner 那里拿到的份额。 */
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
 * `user` 与 `steering` 两个聊天节点 key 的替换渲染器。
 * @param props - 节点、owner 提供的座位，以及聊天动作。
 * @returns 右对齐的气泡、它的附件，以及它的操作行。
 */
export const ChatUxUserBubble = memo(function ChatUxUserBubble({
  node, renderMessageImages, openFile, openSkill,
}: UserBubbleProps): ReactNode {
  const data = node.data

  // 按官方气泡的做法切分内容块：文本拼成一整串，附件保持顺序，其余块落到 JSON 块里，
  // 这样没见过的界面至少还看得见。
  const { bubbleText, attachments, restBlocks } = useMemo(() => {
    const texts: string[] = []
    const presented: PresentedAttachment[] = []
    const rest: unknown[] = []
    for (const block of data.content) {
      const candidate = block as { type?: string; text?: string; attachment?: unknown }
      if (candidate.type === 'text' && typeof candidate.text === 'string') {
        texts.push(candidate.text)
        continue
      }
      if (candidate.type === 'image' && candidate.attachment !== undefined) {
        presented.push({ type: 'image', image: { attachment: candidate.attachment } })
        continue
      }
      if (candidate.type === 'file' && candidate.attachment !== undefined) {
        presented.push({ type: 'file', file: candidate.attachment as FileAttachment })
        continue
      }
      rest.push(block)
    }
    return { bubbleText: texts.join(''), attachments: presented, restBlocks: rest }
  }, [data.content])

  const referenceLabels = data.referenceLabels ?? EMPTY_NAMES
  const skillNames = data.skillNames ?? EMPTY_NAMES
  // 只认已经解析出来的 label。按裸的 `@` 分流，连地址或者一个 host 从没链到任何东西的
  // handle 都会被抓进来。
  const projectsReferences = referenceLabels.length > 0 || skillNames.length > 0
  const referenceActions = useMemo<UserTextReferences>(
    () => ({ openFile, openSkill }),
    [openFile, openSkill],
  )
  const compactImages = attachments.length > 1
  const showBubble = bubbleText !== '' || restBlocks.length > 0

  // 引用投影是一段行内文本，markdown 交给渲染器的块级元素自己排。
  let bubbleClass = USER_BUBBLE_CLASS.bubble + ' ' + USER_BUBBLE_CLASS.markdown
  if (projectsReferences) bubbleClass = USER_BUBBLE_CLASS.bubble + ' ' + USER_BUBBLE_CLASS.plain
  let bubbleBody: ReactNode = <MarkdownText text={bubbleText} labels={MARKDOWN_LABELS} />
  if (projectsReferences) {
    bubbleBody = projectUserText(bubbleText, referenceLabels, skillNames, 'skill', referenceActions)
  }

  // 时钟：同一天只留 HH:mm；今年更早的日子加上月日；别的年份加上完整日期。官方那个 helper
  // 从 chat locale 命名空间读这些日期模板，而插件够不到它，所以这里自己拼；时钟本身仍然是
  // 补零的 24 小时制，与它一致。
  const day = useCalendarDay()
  const moment = new Date(data.time)
  const referenceDay = new Date(day)
  const sameDay = moment.getFullYear() === referenceDay.getFullYear()
    && moment.getMonth() === referenceDay.getMonth()
    && moment.getDate() === referenceDay.getDate()
  let datePrefix = ''
  if (!sameDay) datePrefix = `${moment.getFullYear()}年${moment.getMonth() + 1}月${moment.getDate()}日 `
  if (!sameDay && moment.getFullYear() === referenceDay.getFullYear()) {
    datePrefix = `${moment.getMonth() + 1}月${moment.getDate()}日 `
  }
  const clockText = String(moment.getHours()).padStart(2, '0') + ':' + String(moment.getMinutes()).padStart(2, '0')

  return (
    <div className={USER_BUBBLE_CLASS.row}>
      <div className={USER_BUBBLE_CLASS.stack}>
        {attachments.length > 0 && (
          <div className={USER_BUBBLE_CLASS.attachments} data-message-attachments>
            {attachments.map((attachment, index) => {
              if (attachment.type === 'image') {
                return (
                  <Fragment key={`image:${index}`}>
                    {renderMessageImages({
                      images: [attachment.image],
                      align: 'end',
                      compact: compactImages,
                    })}
                  </Fragment>
                )
              }
              const { name, bytes } = attachment.file
              return (
                <span key={`file:${index}`} className={USER_BUBBLE_CLASS.file} title={name}>
                  <FileTypeIcon path={name} className={USER_BUBBLE_CLASS.fileIcon} />
                  <span className={USER_BUBBLE_CLASS.fileContent}>
                    <span className={USER_BUBBLE_CLASS.fileName}>{name}</span>
                    <span className={USER_BUBBLE_CLASS.fileMeta}>
                      {[fileExtension(name).toUpperCase().slice(0, 8), fileSizeText(bytes)]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </span>
                </span>
              )
            })}
          </div>
        )}
        {showBubble && (
          <div className={bubbleClass}>
            {bubbleBody}
            {restBlocks.map((block, index) => (
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
          <div className={USER_BUBBLE_CLASS.refs}>{referenceLabels.join('、')}</div>
        )}
      </div>
      <div className={USER_BUBBLE_CLASS.actions}>
        <span className={USER_BUBBLE_CLASS.time}>{datePrefix + clockText}</span>
        <CopyAction text={bubbleText} />
      </div>
    </div>
  )
})

/**
 * 复制控件，带官方那个写入后确认窗口：一个对勾顶上来一秒钟，而在这段时间里再点一下，
 * 既不会重新复制，也不会叠上定时器。
 * @param props.text - 复制动作写进剪贴板的纯文本。
 * @returns 那个复制按钮。
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
    void writeClipboard(text).then((written) => {
      if (current !== epoch.current) return
      pending.current = false
      if (!written) return
      setCopied(true)
      timer.current = window.setTimeout(() => {
        timer.current = null
        setCopied(false)
      }, 1000)
    })
  }, [copied, text])
  let label = COPY_LABEL
  if (copied) label = COPIED_LABEL
  let icon = <IconCopyOutline16 />
  if (copied) icon = <IconCheckOutline16 />
  return (
    <Tooltip label={label} side="bottom">
      <button type="button" className={USER_BUBBLE_CLASS.action} aria-label={label} onClick={onCopy}>
        {icon}
      </button>
    </Tooltip>
  )
}

/**
 * 本地日历日的零点时间戳，每到午夜往前走一天。
 *
 * 被 memo 住的行跨过午夜时 props 不会变，所以时钟需要自己的心跳，而不能指望从上面传下来的重渲染。
 * @returns 当前本地日的零点毫秒数。
 */
function useCalendarDay(): number {
  const [day, setDay] = useState(() => {
    const midnight = new Date(Date.now())
    midnight.setHours(0, 0, 0, 0)
    return midnight.getTime()
  })
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    /** 立刻对上今天的零点，并把下一次唤醒排在下一个本地午夜。 */
    const arm = (): void => {
      const now = Date.now()
      const midnight = new Date(now)
      midnight.setHours(0, 0, 0, 0)
      setDay(midnight.getTime())
      const nextMidnight = new Date(now)
      nextMidnight.setHours(24, 0, 0, 0)
      timer = setTimeout(arm, Math.max(nextMidnight.getTime() - now, 1))
    }
    arm()
    return () => { clearTimeout(timer) }
  }, [])
  return day
}
