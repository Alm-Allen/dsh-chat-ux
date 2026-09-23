/**
 * run_code 内部的 write / edit 子调用行。
 *
 * 内置的文件变更行只给**根调用**画 diff 卡片，行尾那个 `+96 -0` 因此只出现在直接调用的
 * write/edit 上；从 run_code 的程序里派发出去的子调用拿不到它。原因不在渲染层，而在
 * `ui-tool` 的 diff-card-model：它第一行就写着
 * `if (block.parentCallId !== undefined) return null`。那行是 a4c296f9fe
 * （"refactor(client): derive tool cards from raw events"）留下的等价补丁——重构前卡片读的是
 * 事件里的 `callView` / `resultView`，而 PTC 子调用的事件（`tool/ptc-dispatch`）只带
 * name / arguments / content，从来不带那两个 view，所以子调用本来就画不出卡片；重构改成从原始
 * 参数重算之后，参数派生对子调用**也会成功**，于是那行检查把行为钉回原样。
 *
 * 本插件要的正是被钉掉的那一半，所以这里自己写一份派生，唯一的差别就是不放行那行检查。
 *
 * 代价说得明白些：子调用不持久化 `presentationMeta`，所以结算之后拿不到"实际应用了什么"，
 * 只能拿参数说话——write 的参数就是整份内容（确定），edit 的参数就是那一对替换（`replace_all`
 * 或写入失败时可能与实际不符）。
 *
 * 遮蔽的是 keyed 座位：keyed 座位按 priority 升序取最低的那个渲染，同一 priority 上二次注册会
 * 抛错，内置那两行是默认的 0，所以这里用 -1。内置 ToolRow 的组件与 CSS Modules 类名都不在
 * 冻结的基座模块表里，拿不到，所以这一行是照着它的样子重画的（`DisclosureRow` 等 primitives
 * 是共享的，行 chrome 本身仍由它们承担）。
 *
 * @module dsh-chat-ux/client/file-mutation-row
 */
import { useCallback, useMemo } from 'react'
import type { KeyboardEvent, MouseEvent, ReactElement } from 'react'
import {
  DiffBlock, DisclosureRow, IconEditOutlineRegular, IconInspectOutlineRegular, TextShimmer, diffTotals,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiffBlockLabels, DiffHunk } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  FILE_ADD_CLASS, FILE_BODY_CLASS, FILE_CHEVRON_CLASS, FILE_DEL_CLASS, FILE_DIFF_CLASS, FILE_ERROR_CLASS,
  FILE_HIDDEN_CLASS, FILE_INSPECT_CLASS, FILE_IO_CLASS, FILE_IO_DIVIDER_CLASS, FILE_IO_LABEL_CLASS,
  FILE_IO_SECTION_CLASS, FILE_IO_TEXT_CLASS, FILE_LEADING_CLASS, FILE_LINK_CLASS, FILE_ROW_CLASS,
  FILE_ROW_LINE_CLASS, FILE_SEP_CLASS, FILE_STAT_CLASS, FILE_STOPPED_CLASS, FILE_SUFFIX_CLASS,
  FILE_SUMMARY_CLASS, FILE_TITLE_CLASS,
} from './file-mutation-styles'

/** 聊天行里 diff 卡片折叠中段前展示的行数；与内置的 `CHAT_DIFF_MAX_LINES` 取同一个值。 */
const CHAT_DIFF_MAX_LINES = 9

/** 两个文件工具共用同一枚图标：编辑铅笔。 */
const FILE_ICON = <IconEditOutlineRegular size={14} />

/** 这一行要用的文案座位：conversation 命名空间下的 `t`。 */
type Translate = (key: string, params?: Record<string, unknown>) => string

/** 平台交给每个原子工具视图的载荷，只取这一行用到的字段。 */
interface ToolCallOwnerProps {
  /** 每个调用自己的展开状态，由聊天层注入。 */
  useDisclosure: () => { expanded: boolean; toggle: () => void }
  callId: string
  /** 线上工具名，也是 keyed 座位的分发键。 */
  toolName: string
  block: ToolCallBlock
  /** 会话工作区根，用来把绝对路径缩成相对路径。 */
  cwd?: string | undefined
  /** 宿主账户主目录，残留的 POSIX home 前缀显示成 `~`。 */
  home?: string | undefined
  openFile: (path: string, options?: { line?: number } | undefined) => void
  /** 有轨迹视图时给的跳转入口。 */
  inspect?: (() => void) | undefined
}

/** 这一行的完整输入。 */
export interface FileMutationRowProps extends ToolCallOwnerProps {
  t: Translate
}

/** 调用头：工具名与原始参数 JSON。 */
interface ToolCallHead {
  name: string
  argsRaw: string
}

/** 参数还在流进来的准备态。 */
interface PreparingToolCall {
  phase: 'preparing'
  callId: string
  parentCallId?: string | undefined
  name: string
}

/** 已派发、仍在跑的那一次调用。 */
interface StartedToolCall {
  phase: 'start'
  callId: string
  parentCallId?: string | undefined
  name: string
  argsRaw: string
}

/** 结果里的一个内容块；这一行只区分文本与其余。 */
interface ContentBlock {
  type: string
  text?: string | undefined
}

/** 结构化失败信息。 */
interface ToolCallError {
  name: string
  code: string
  reason?: unknown
}

/** 已结算的结果节点。 */
interface ToolResultNode {
  kind: 'tool-result'
  callId: string
  parentCallId?: string | undefined
  /** 窗口丢掉了调用头时为 null；结果本身仍可渲染。 */
  call: ToolCallHead | null
  content: readonly ContentBlock[]
  isError: boolean
  error?: ToolCallError | undefined
  /** 结果元数据；PTC 子调用不带它。 */
  meta?: unknown
}

/** 一次调用的三种形态，按 `kind` 判别是否已结算。 */
type ToolCallBlock = PreparingToolCall | StartedToolCall | ToolResultNode

/** 行状态，与内置 `ToolRowState` 同名同义。 */
type RowState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'

/** 这一行渲染需要的全部派生结果。 */
interface RowModel {
  titleKey: string
  variant: 'edit' | 'write'
  summary: string
  filePath: string | undefined
  bodyRaw: string | null
  output: string | null
  errorSummary: string | null
  state: RowState
}

/** 座位注册表，收窄到本插件会发出的两次调用。 */
export interface SlotsService {
  inject(name: string, callback: () => () => void): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/**
 * 在 edit / write 两个座位上遮蔽内置的文件变更行。
 * @param slots - 客户端座位注册表。
 */
export function installFileMutationRow(slots: SlotsService): void {
  slots.inject('tool.call.toolview', () => {
    const seat = { name: 'tool.call.toolview', priority: -1, locale: 'conversation' }
    const disposeEdit = slots.register({ ...seat, key: 'edit' }, FileMutationRow)
    const disposeWrite = slots.register({ ...seat, key: 'write' }, FileMutationRow)
    return () => {
      disposeEdit()
      disposeWrite()
    }
  })
}

/**
 * 渲染一次 write / edit 调用：折叠态是标题、路径与 `+n -m`，展开态是 diff 卡片。
 * @param props - owner 载荷与文案座位。
 * @returns 这一行。
 */
export function FileMutationRow(props: FileMutationRowProps): ReactElement {
  const { t, toolName, block, cwd, home, openFile, inspect, useDisclosure } = props
  const { expanded, toggle } = useDisclosure()
  const model = useMemo(() => rowModel(toolName, block, cwd, home), [block, cwd, home, toolName])
  const hunks = useMemo(() => diffHunks(block), [block])
  const labels = useMemo(() => diffBlockLabels(t), [t])
  const running = model.state === 'running'
  const totals = useMemo(() => (hunks === null ? null : diffTotals(hunks)), [hunks])
  const expandable = hunks !== null || model.output !== null || model.bodyRaw !== null
  const open = expanded && expandable
  const summaryText = model.errorSummary ?? model.summary
  const status = stateLabel(model.state, t)
  // 失败与中断的行不给路径链接：那两态下摘要换成的是裁决或失败信息，链接会把它读成一次正常改动。
  const linkAvailable = model.filePath !== undefined && model.state !== 'error' && model.state !== 'stopped'

  const openFileClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (model.filePath === undefined) return
    openFile(model.filePath)
  }, [model.filePath, openFile])
  // 路径链接是行内的一个按钮，而整行也是开合目标：Enter / 空格要落在这颗按钮上，
  // 不能冒泡到行的 keydown 里去。
  const linkKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
  }, [])

  const collapsedContent = summaryText === '' ? null : (
    <>
      <span className={FILE_SEP_CLASS} aria-hidden />
      {linkAvailable ? (
        <button type="button" className={FILE_LINK_CLASS} onClick={openFileClick} onKeyDown={linkKeyDown}>
          <TextShimmer active={running}>{summaryText}</TextShimmer>
        </button>
      ) : (
        <span className={summaryClassName(model.state)}>
          <TextShimmer active={running}>{summaryText}</TextShimmer>
        </span>
      )}
      {totals !== null && (
        <span className={FILE_SUFFIX_CLASS}>
          <TextShimmer className={FILE_STAT_CLASS + ' ' + FILE_ADD_CLASS} active={running}>
            {'+' + totals.added}
          </TextShimmer>
          <TextShimmer className={FILE_STAT_CLASS + ' ' + FILE_DEL_CLASS} active={running}>
            {'-' + totals.removed}
          </TextShimmer>
        </span>
      )}
    </>
  )

  const expandedContent = open ? (
    <div className={FILE_BODY_CLASS}>
      {hunks !== null ? (
        <DiffBlock diffs={hunks} labels={labels} maxLines={CHAT_DIFF_MAX_LINES} className={FILE_DIFF_CLASS} />
      ) : (
        <div className={FILE_IO_CLASS}>
          {model.bodyRaw !== null && (
            <div className={FILE_IO_SECTION_CLASS}>
              <span className={FILE_IO_LABEL_CLASS}>{t('row.input')}</span>
              <span className={FILE_IO_TEXT_CLASS}>{model.bodyRaw}</span>
            </div>
          )}
          {model.bodyRaw !== null && model.output !== null && (
            <span className={FILE_IO_DIVIDER_CLASS} aria-hidden />
          )}
          {model.output !== null && (
            <div className={FILE_IO_SECTION_CLASS}>
              <span className={FILE_IO_LABEL_CLASS}>{t('row.output')}</span>
              <span className={FILE_IO_TEXT_CLASS} data-error={model.state === 'error' || undefined}>
                {model.output}
              </span>
            </div>
          )}
        </div>
      )}
      {inspect !== undefined && (
        <button type="button" className={FILE_INSPECT_CLASS} onClick={inspect}>
          <IconInspectOutlineRegular />
          {t('row.inspect')}
        </button>
      )}
    </div>
  ) : undefined

  return (
    <div className={FILE_ROW_CLASS} data-variant={model.variant} data-tool={toolName} data-state={model.state}>
      {status !== null && <span className={FILE_HIDDEN_CLASS}>{status}</span>}
      <DisclosureRow
        rowClassName={FILE_ROW_LINE_CLASS}
        leadingClassName={FILE_LEADING_CLASS}
        titleClassName={FILE_TITLE_CLASS}
        chevronClassName={FILE_CHEVRON_CLASS}
        icon={FILE_ICON}
        title={t(model.titleKey)}
        running={running}
        open={open}
        expandable={expandable}
        expandOnRowClick
        keepContentWhenOpen
        onToggle={toggle}
        collapsedContent={collapsedContent}
      >
        {expandedContent}
      </DisclosureRow>
    </div>
  )
}

/**
 * 派生这一行要展示的改动。
 *
 * 与内置 diff-card-model 只有一处不同：**不排除子调用**（原因见模块注释）。其余分支保持同序：
 * 未结算时只有参数可用；结算后优先用结果元数据里真实应用的 hunks，拿不到才退回参数。
 * @param block - 运行中或已结算的调用块。
 * @returns 要画的 hunks，或 null（这一行没有可画的改动）。
 */
function diffHunks(block: ToolCallBlock): DiffHunk[] | null {
  if (!('kind' in block)) {
    if (block.phase === 'preparing') return null
    return intendedHunks(block.name, block.argsRaw)
  }
  if (block.isError) return null
  const applied = appliedHunks(block.meta)
  if (applied !== null && applied !== 'empty') return applied
  // 没有真实 hunks 可依：write 的参数就是整份内容，edit 的参数就是那一对替换。
  if (block.call === null) return null
  return intendedHunks(block.call.name, block.call.argsRaw)
}

/**
 * 从调用参数派生改动：write 是整份内容，edit 是那一对替换。
 * @param name - 线上工具名。
 * @param argsRaw - 原始参数 JSON。
 * @returns 单个 hunk，或 null（参数不是这一行的形状）。
 */
function intendedHunks(name: string, argsRaw: string): DiffHunk[] | null {
  const args = parseArgs(argsRaw)
  if (args === null) return null
  const path = pickString(args, ['path', 'file_path'])
  if (path === undefined) return null
  if (!validEscalation(args)) return null
  if (name === 'write') {
    const content = args.content
    return typeof content === 'string' ? [{ path, oldText: null, newText: content }] : null
  }
  if (name !== 'edit') return null
  const oldText = args.old_string
  const newText = args.new_string
  if (typeof oldText !== 'string' || typeof newText !== 'string') return null
  const replaceAll = args.replace_all
  if (replaceAll !== undefined && typeof replaceAll !== 'boolean') return null
  return [{ path, oldText: oldText === '' ? null : oldText, newText }]
}

/**
 * 读结果元数据里真实应用的 hunks。
 * @param meta - 结果元数据，未经校验。
 * @returns 校验过的 hunks、`empty`（元数据明确说没有改动），或 null（不可用）。
 */
function appliedHunks(meta: unknown): DiffHunk[] | 'empty' | null {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null
  const diffs = (meta as Record<string, unknown>).diffs
  if (!Array.isArray(diffs)) return null
  if (diffs.length === 0) return 'empty'
  const out: DiffHunk[] = []
  for (const hunk of diffs) {
    if (typeof hunk !== 'object' || hunk === null) return null
    const { path, oldText, newText } = hunk as Record<string, unknown>
    if (typeof path !== 'string') return null
    if (oldText !== null && typeof oldText !== 'string') return null
    if (typeof newText !== 'string') return null
    out.push({ path, oldText, newText })
  }
  return out
}

/**
 * 派生整行的展示模型。
 * @param toolName - 线上工具名。
 * @param block - 运行中或已结算的调用块。
 * @param cwd - 会话工作区根。
 * @param home - 宿主账户主目录。
 * @returns 这一行的模型。
 */
function rowModel(
  toolName: string,
  block: ToolCallBlock,
  cwd: string | undefined,
  home: string | undefined,
): RowModel {
  const done = 'kind' in block
  const head = done ? block.call : block.phase === 'start' ? { name: block.name, argsRaw: block.argsRaw } : null
  const state: RowState = !done
    ? block.phase === 'preparing' ? 'preparing' : 'running'
    : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
  const args = head === null ? null : parseArgs(head.argsRaw)
  const path = args === null ? undefined : pickString(args, ['path', 'file_path'])
  const output = done ? resultText(block) || null : null
  return {
    titleKey: toolName === 'write' ? 'tool.title.write' : 'tool.title.edit',
    variant: toolName === 'write' ? 'write' : 'edit',
    summary: path === undefined ? '' : shortenPath(path, cwd, home),
    filePath: path,
    bodyRaw: head === null || head.argsRaw === '' ? null : head.argsRaw,
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
    state,
  }
}

/**
 * 把一次结算结果摊成展示文本：文本块原样，其余块转成 JSON。
 * @param node - 已结算的结果节点。
 * @returns 摊平后的文本（可能为空串）。
 */
function resultText(node: ToolResultNode): string {
  const parts: string[] = []
  for (const block of node.content) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else parts.push(JSON.stringify(block, null, 2))
  }
  if (parts.length === 0 && node.error !== undefined) parts.push(node.error.name + ': ' + node.error.code)
  return parts.join('\n')
}

/**
 * 解析原始参数 JSON。
 * @param argsRaw - 参数原文。
 * @returns 参数对象，或 null（流式中途截断、或不是对象）。
 */
function parseArgs(argsRaw: string): Record<string, unknown> | null {
  let value: unknown
  try {
    value = JSON.parse(argsRaw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * 按顺序取第一个非空字符串字段。
 * @param args - 解析后的参数。
 * @param keys - 候选字段名，按优先级排列。
 * @returns 命中的值，或 undefined。
 */
function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return undefined
}

/**
 * 校验可选的沙箱升级字段对：写文件的行只有在它们成对合法时才画 diff，
 * 否则落回 IN/OUT 卡片（与内置的判据一致）。
 * @param args - 解析后的参数。
 * @returns 字段对是否合法（或都不存在）。
 */
function validEscalation(args: Record<string, unknown>): boolean {
  const permission = args.sandbox_permissions
  const justification = args.justification
  if (permission === undefined && justification === undefined) return true
  if (permission !== 'workspace-write' && permission !== 'danger-full-access') return false
  return typeof justification === 'string' && justification.trim() !== ''
}

/**
 * 把绝对路径缩成读者更容易对上的形状：先相对会话工作区，再把残留的主目录前缀写成 `~`。
 * @param path - 工具参数里的路径。
 * @param cwd - 会话工作区根。
 * @param home - 宿主账户主目录。
 * @returns 缩短后的路径。
 */
function shortenPath(path: string, cwd: string | undefined, home: string | undefined): string {
  if (cwd !== undefined && cwd !== '' && path.startsWith(cwd)) {
    const rest = path.slice(cwd.length).replace(/^[\\/]+/, '')
    if (rest !== '') return rest
  }
  if (home !== undefined && home !== '' && path.startsWith(home)) {
    const rest = path.slice(home.length)
    if (rest === '' || rest.startsWith('/') || rest.startsWith('\\')) return '~' + rest.replace(/\\/g, '/')
  }
  return path
}

/**
 * 取一段文本的第一行。
 * @param text - 任意文本。
 * @returns 第一行。
 */
function firstLine(text: string): string {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

/**
 * 摘要那半截的类名：失败与中断各自带自己的状态色。
 * @param state - 行状态。
 * @returns 类名。
 */
function summaryClassName(state: RowState): string {
  if (state === 'error') return FILE_SUMMARY_CLASS + ' ' + FILE_ERROR_CLASS
  if (state === 'stopped') return FILE_SUMMARY_CLASS + ' ' + FILE_STOPPED_CLASS
  return FILE_SUMMARY_CLASS
}

/**
 * 给读屏的状态文本：图标与扫光都不表达状态，这句话替它们说。
 * @param state - 行状态。
 * @param t - 文案座位。
 * @returns 状态文本，或 null（无需播报）。
 */
function stateLabel(state: RowState, t: Translate): string | null {
  if (state === 'running') return t('row.running')
  if (state === 'error') return t('row.failed')
  if (state === 'stopped') return t('row.stopped')
  return null
}

/**
 * 组装 diff 卡片自己的 chrome 文案。
 * @param t - 文案座位。
 * @returns diff 卡片的 labels。
 */
function diffBlockLabels(t: Translate): DiffBlockLabels {
  return {
    codeLabel: t('codeBlock.title'),
    wrapLabel: t('codeBlock.wrap'),
    unwrapLabel: t('codeBlock.unwrap'),
    copy: t('copy'),
    copied: t('copied'),
    collapseAria: t('diff.collapseAria'),
    expandAria: hidden => t('diff.expandAria', { count: hidden }),
    collapse: t('collapse'),
    expand: hidden => t('diff.expandRest', { count: hidden }),
  }
}
