/**
 * run_code 内部 write 与 edit 子调用的文件变更行。
 *
 * 内置行只给根调用画 diff；这里遮蔽 edit 与 write 两个 keyed 座位，用同一份参数派生改动。
 * 准备态直接读参数视图，所以 +n -m 会随参数流增长；结算后优先使用结果元数据里的 hunks。
 *
 * 子调用没有 presentationMeta，结算后只能按参数展示；edit 在 replace_all 或失败时可能与实际不同。
 */
import {useCallback, useMemo} from 'react'
import type {KeyboardEvent, MouseEvent, ReactElement} from 'react'
import {
    DiffBlock, DisclosureRow, IconEditOutlineRegular, IconInspectOutlineRegular, TextShimmer, diffTotals,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {DiffBlockLabels, DiffHunk} from '@deepseek-ai/dsh-client-ui-primitives'
import {DigitReel} from '../reel/digit-reel'
import {usePacedValue} from '../paced-value'
import {
    FILE_ADD_CLASS, FILE_BODY_CLASS, FILE_CHEVRON_CLASS, FILE_DEL_CLASS, FILE_DIFF_CLASS, FILE_ERROR_CLASS,
    FILE_HIDDEN_CLASS, FILE_INSPECT_CLASS, FILE_IO_CLASS, FILE_IO_DIVIDER_CLASS, FILE_IO_LABEL_CLASS,
    FILE_IO_SECTION_CLASS, FILE_IO_TEXT_CLASS, FILE_LEADING_CLASS, FILE_LINK_CLASS, FILE_ROW_CLASS,
    FILE_ROW_LINE_CLASS, FILE_SEP_CLASS, FILE_STAT_CLASS, FILE_STOPPED_CLASS, FILE_SUFFIX_CLASS,
    FILE_SUMMARY_CLASS, FILE_TITLE_CLASS,
} from './file-mutation-styles'

/** 聊天行里 diff 卡片折叠中段前展示的行数；与内置的 `CHAT_DIFF_MAX_LINES` 取同一个值。 */
const CHAT_DIFF_MAX_LINES = 9

/** 三个内容字段：write 用第一个，edit 用后两个。行尾那个输入大小算的就是它们。 */
const CONTENT_FIELDS = ['content', 'old_string', 'new_string'] as const

/** 一个 KB 的字符数。 */
const KILOBYTE = 1024

/** 两个文件工具共用同一枚图标：编辑铅笔。 */
const FILE_ICON = <IconEditOutlineRegular size={14}/>

/**
 * 准备态那两个数开着没有。由 `installFileMutationRow` 装进来，渲染期现读——所以插件管理页上
 * 一改，下一次渲染就跟着变。
 */
let liveDiffEnabled: () => boolean = () => false

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

/** 座位注册表，收窄到本插件会发出的两次调用。 */
export interface SlotsService {
    inject(name: string, callback: () => () => void): void

    register(options: Record<string, unknown>, component: unknown): () => void
}

/**
 * 在 edit / write 两个座位上遮蔽内置的文件变更行。
 */
export function installFileMutationRow(slots: SlotsService, liveDiff: () => boolean): void {
    liveDiffEnabled = liveDiff
    slots.inject('tool.call.toolview', () => {
        const seat = {name: 'tool.call.toolview', priority: -1, locale: 'conversation'}
        const disposeEdit = slots.register({...seat, key: 'edit'}, FileMutationRow)
        const disposeWrite = slots.register({...seat, key: 'write'}, FileMutationRow)
        return () => {
            disposeEdit()
            disposeWrite()
        }
    })
}

/**
 * 渲染一次 write / edit 调用：折叠态是标题、路径与 `+n -m`，展开态是 diff 卡片。
 */
export function FileMutationRow(props: FileMutationRowProps): ReactElement {
    const {t, toolName, cwd, home, openFile, inspect, useDisclosure} = props
    const {expanded, toggle} = useDisclosure()
    // 每个阶段都带 `args` 视图；准备态的读数直接读它
    const block = props.block
    const args = useMemo(() => {
        const head = callHead(block)
        return head === null ? null : parseArgs(head.argsRaw)
    }, [block])
    const model = useMemo(() => rowModel(toolName, block, args, cwd, home), [args, block, cwd, home, toolName])
    const hunks = useMemo(() => diffHunks(block, args), [args, block])
    const labels = useMemo(() => diffBlockLabels(t), [t])
    // 准备态也算在跑，与内置 ToolRow 的判据一致（`state === 'running' || state === 'preparing'`）。
    // 否则这一段里路径与输入大小都不扫光，而它们旁边就是正在扫光的标题。
    const running = model.state === 'running' || model.state === 'preparing'
    const rawTotals = useMemo(() => rowTotals(block, hunks), [block, hunks])
    // 老虎机常开，只是流式那两态换一档更短的弹动。
    const cadence = running ? 'fast' as const : undefined
    // 两个工具都走节拍：每一轮数字轮动画要走完整，宁可读数滞后一拍
    // 逐批跟随会让 220 ms 的动画每 48 ms 被下一批参数打断
    const totals = usePacedValue(rawTotals, running)
    // 准备态不给展开：那份是半截内容，摊成 diff 会被读成改完了，而且流式的每一批都要重跑一次。
    const expandable = model.state !== 'preparing'
        && (hunks !== null || model.output !== null || model.bodyRaw !== null)
    const open = expanded && expandable
    const summaryText = model.errorSummary ?? model.summary
    // 输入大小只要读得到就显示，不要求路径已经到达
    // write 的 `file_path` 常常排在参数流最末，等路径会让整段准备态都没有读数
    // 没有路径时输入大小直接跟在描述后面，分隔点只在有描述时渲染
    // 不借用 dsh 的 `tool.preparing.content`：准备态这一行只需要这个数，前面再加一句会把行头撑长
    const size = model.kilobytes === null ? null : model.kilobytes + 'KB'
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

    // 路径缺席时，输入大小与增删数照旧显示；原因见上面 `size` 的四行注释
    const collapsedContent = (summaryText !== '' || size !== null || totals !== null) && (
        <>
            {/* 那个分隔点是「标题 · 路径」之间的一颗点：没有路径时它不该单独出现。 */}
            {summaryText !== '' && (
                <>
                    <span className={FILE_SEP_CLASS} aria-hidden/>
                    {linkAvailable && (
                        <button type="button" className={FILE_LINK_CLASS} onClick={openFileClick} onKeyDown={linkKeyDown}>
                            <TextShimmer active={running}>{summaryText}</TextShimmer>
                        </button>
                    )}
                    {!linkAvailable && (
                        <span className={summaryClassName(model.state)}>
                            <TextShimmer active={running}>{summaryText}</TextShimmer>
                        </span>
                    )}
                </>
            )}
            {(size !== null || totals !== null) && (
                <span className={FILE_SUFFIX_CLASS}>
                    {size !== null && (
                        <TextShimmer className={FILE_STAT_CLASS} active={running}>{size}</TextShimmer>
                    )}
                    {totals !== null && (
                        <>
                            <TextShimmer className={FILE_STAT_CLASS + ' ' + FILE_ADD_CLASS} active={running}>
                                <DigitReel
                                    text={'+' + totals.added}
                                    prefix="+"
                                    suffix=""
                                    rolling
                                    cadence={cadence}
                                    spoken
                                />
                            </TextShimmer>
                            <TextShimmer className={FILE_STAT_CLASS + ' ' + FILE_DEL_CLASS} active={running}>
                                <DigitReel
                                    text={'-' + totals.removed}
                                    prefix="-"
                                    suffix=""
                                    rolling
                                    cadence={cadence}
                                    spoken
                                />
                            </TextShimmer>
                        </>
                    )}
                </span>
            )}
        </>
    )

    const expandedContent = open && (
        <div className={FILE_BODY_CLASS}>
            {hunks !== null && (
                <DiffBlock diffs={hunks} labels={labels} maxLines={CHAT_DIFF_MAX_LINES} className={FILE_DIFF_CLASS}/>
            )}
            {hunks === null && (
                <div className={FILE_IO_CLASS}>
                    {model.bodyRaw !== null && (
                        <div className={FILE_IO_SECTION_CLASS}>
                            <span className={FILE_IO_LABEL_CLASS}>{t('row.input')}</span>
                            <span className={FILE_IO_TEXT_CLASS}>{model.bodyRaw}</span>
                        </div>
                    )}
                    {model.bodyRaw !== null && model.output !== null && (
                        <span className={FILE_IO_DIVIDER_CLASS} aria-hidden/>
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
                    <IconInspectOutlineRegular/>
                    {t('row.inspect')}
                </button>
            )}
        </div>
    )

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

/** 调用头：工具名与原始参数 JSON。 */
interface ToolCallHead {
    name: string
    argsRaw: string
}

/**
 * 参数视图：dsh 0.2.1-alpha.1 起每个阶段都提供它，准备态可能还不完整。
 *
 * 这里只复述这一行用到的读法——client bundle 必须自包含，不 import 平台包。
 */
interface ToolArgs {
    /** 这个字段出现了没有。 */
    has(key: string): boolean
    /** 这个字段的收尾定界符到了没有。 */
    complete(key: string): boolean
    /** 已解码的字段文本。 */
    text(key: string): string | undefined
    /** 已解码的字段长度；`step` 与 `offset` 只影响流式下的变化检测粒度。 */
    stringLength(key: string, options?: {step?: number; offset?: number}): number | undefined
}

/** 参数还在流进来的准备态。 */
interface PreparingToolCall {
    phase: 'preparing'
    callId: string
    parentCallId?: string | undefined
    name: string
    /** 参数视图；dsh 0.2.1-alpha.1 起每个阶段都在。 */
    args?: ToolArgs | undefined
}

/** 已派发、仍在跑的那一次调用。 */
interface StartedToolCall {
    phase: 'start'
    callId: string
    parentCallId?: string | undefined
    name: string
    argsRaw: string
    /** 参数视图；dsh 0.2.1-alpha.1 起每个阶段都在。 */
    args?: ToolArgs | undefined
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
    /** 参数视图；dsh 0.2.1-alpha.1 起每个阶段都在。 */
    args?: ToolArgs | undefined
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
    /** 已收到的输入大小（KB）；参数视图缺席或还没有内容字段时为 null。 */
    kilobytes: number | null
}

/**
 * 派生这一行要展示的改动。
 *
 * 与内置 diff-card-model 只有一处不同：**不排除子调用**（原因见模块注释）。其余分支保持同序：
 * 未结算时只有参数可用；结算后优先用结果元数据里真实应用的 hunks，拿不到才退回参数。
 */
function diffHunks(block: ToolCallBlock, args: Record<string, unknown> | null): DiffHunk[] | null {
    if (!('kind' in block)) {
        // 关掉时这一支与接管之前逐字一样：准备态不画，派发后只看参数 JSON。
        if (!liveDiffEnabled()) return block.phase === 'preparing' ? null : intendedHunks(block.name, args)
        // 开着时准备态不产出 hunks：那两个数由 streamedTotals 直接读参数视图给出（见 rowTotals），
        // 而这一份半截内容摊成 diff 只会被读成改完了（准备态本来也不给展开）。
        if (block.phase === 'preparing') return null
        return intendedHunks(block.name, args) ?? streamedHunks(block.name, block.args)
    }
    if (block.isError) return null
    const applied = appliedHunks(block.meta)
    if (applied !== null && applied !== 'empty') return applied
    // 没有真实 hunks 可依：write 的参数就是整份内容，edit 的参数就是那一对替换。
    if (block.call === null) return null
    return intendedHunks(block.call.name, args)
}

/**
 * 从调用参数派生改动：write 是整份内容，edit 是那一对替换。
 */
function intendedHunks(name: string, args: Record<string, unknown> | null): DiffHunk[] | null {
    if (args === null) return null
    const path = pickString(args, ['path', 'file_path'])
    if (path === undefined) return null
    if (name === 'write') {
        const content = args.content
        return typeof content === 'string' ? [{path, oldText: null, newText: content}] : null
    }
    if (name !== 'edit') return null
    const oldText = args.old_string
    const newText = args.new_string
    if (typeof oldText !== 'string' || typeof newText !== 'string') return null
    const replaceAll = args.replace_all
    if (replaceAll !== undefined && typeof replaceAll !== 'boolean') return null
    return [{path, oldText: oldText === '' ? null : oldText, newText}]
}

/**
 * 从参数视图派生改动：准备态唯一拿得到的材料就是视图给出的字段文本——已解码，可能还没收尾。
 *
 * write 用已收到的那一截内容：`oldText` 为 null 时它同时就是「新增了多少行」的答案，与结算后的
 * 口径（`diffTotals` 对一份全 `+` 的改动计数）恒等。edit 要等价的两个字段都收尾才画——行级匹配
 * 在部分文本上没有稳定答案（部分 new 会先被算成删除，补齐后又变回来），宁可不画，也不给一个会
 * 上下跳的数字。
 */
function streamedHunks(name: string, view: ToolArgs | undefined): DiffHunk[] | null {
    if (view === undefined) return null
    const path = viewPath(view)
    if (path === undefined) return null
    if (name === 'write') {
        if (!view.has('content')) return null
        const content = view.text('content')
        return content === undefined ? null : [{path, oldText: null, newText: content}]
    }
    if (name !== 'edit') return null
    if (!view.complete('old_string') || !view.complete('new_string')) return null
    const oldText = view.text('old_string')
    const newText = view.text('new_string')
    if (oldText === undefined || newText === undefined) return null
    return [{path, oldText: oldText === '' ? null : oldText, newText}]
}

/**
 * 读结果元数据里真实应用的 hunks。
 */
function appliedHunks(meta: unknown): DiffHunk[] | 'empty' | null {
    if (!isRecord(meta)) return null
    const diffs = meta.diffs
    if (!Array.isArray(diffs)) return null
    if (diffs.length === 0) return 'empty'
    const hunks: DiffHunk[] = []
    for (const hunk of diffs) {
        if (!isRecord(hunk)) return null
        const {path, oldText, newText} = hunk
        if (typeof path !== 'string') return null
        if (oldText !== null && typeof oldText !== 'string') return null
        if (typeof newText !== 'string') return null
        hunks.push({path, oldText, newText})
    }
    return hunks
}

/** 调用块处在哪个展示状态。 */
function rowStateOfToolCall(block: ToolCallBlock): RowState {
    if (!('kind' in block)) return block.phase === 'preparing' ? 'preparing' : 'running'
    if (block.error?.code === 'interrupted') return 'stopped'
    if (block.isError) return 'error'
    return 'ok'
}

/** 派生整行的展示模型。 */
function rowModel(
    toolName: string,
    block: ToolCallBlock,
    args: Record<string, unknown> | null,
    cwd: string | undefined,
    home: string | undefined,
): RowModel {
    const done = 'kind' in block
    const head = callHead(block)
    const rowState = rowStateOfToolCall(block)
    const path = argumentPath(block, args)
    const output = done ? resultText(block) || null : null
    return {
        titleKey: toolName === 'write' ? 'tool.title.write' : 'tool.title.edit',
        variant: toolName === 'write' ? 'write' : 'edit',
        summary: path === undefined ? '' : shortenPath(path, cwd, home),
        filePath: path,
        bodyRaw: head === null || head.argsRaw === '' ? null : head.argsRaw,
        output,
        errorSummary: rowState === 'error' && output !== null ? firstLine(output) : null,
        state: rowState,
        kilobytes: contentKilobytes(block.args),
    }
}

/**
 * 把一次结算结果摊成展示文本：文本块原样，其余块转成 JSON。
 */
function resultText(node: ToolResultNode): string {
    const parts: string[] = []
    for (const block of node.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
            parts.push(block.text)
            continue
        }
        parts.push(JSON.stringify(block, null, 2))
    }
    if (parts.length === 0 && node.error !== undefined) parts.push(node.error.name + ': ' + node.error.code)
    return parts.join('\n')
}

/**
 * 这一行的调用头：已结算的看结果节点带回的那一份，仍在跑的看它自己的参数。
 */
function callHead(block: ToolCallBlock): ToolCallHead | null {
    if ('kind' in block) return block.call
    return block.phase === 'start' ? {name: block.name, argsRaw: block.argsRaw} : null
}

/**
 * 解析原始参数 JSON。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseArgs(argsRaw: string): Record<string, unknown> | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(argsRaw)
    } catch {
        return null
    }
    return isRecord(parsed) ? parsed : null
}

/**
 * 按顺序取第一个非空字符串字段。
 */
function pickString(args: Record<string, unknown>, keys: readonly string[]): string | undefined {
    for (const key of keys) {
        const fieldValue = args[key]
        if (typeof fieldValue === 'string' && fieldValue !== '') return fieldValue
    }
    return undefined
}

/**
 * 这一行的目标路径：先读参数视图（每个阶段都在，准备态可能还不完整），再退回派发后的原始参数。
 */
function argumentPath(block: ToolCallBlock, args: Record<string, unknown> | null): string | undefined {
    const streamedPath = viewPath(block.args)
    if (streamedPath !== undefined) return streamedPath
    if (args === null) return undefined
    return pickString(args, ['path', 'file_path'])
}

/**
 * 路径的视图读法。
 *
 * 与内置的文件变更行同一条规则：字段收尾了才算数——准备态可能只到了半截——解码失败
 * （转义不完整）也当没有。
 */
function viewPath(view: ToolArgs | undefined): string | undefined {
    if (view === undefined) return undefined
    for (const key of ['path', 'file_path']) {
        if (!view.has(key) || !view.complete(key)) continue
        const text = view.text(key)
        if (text !== undefined && text !== '') return text
    }
    return undefined
}

/**
 * 已收到的输入大小（KB）：内容字段的解码长度之和。
 *
 * 与内置的文件变更行取同一个口径，所以同一个位置在两边显示同一个数：正在流进来的那一个字段按
 * 已收到的部分算，已经收完的按整段算。一个内容字段都还没出现时返回 null——行头不摆一个 0KB。
 */
function contentKilobytes(view: ToolArgs | undefined): number | null {
    if (view === undefined) return null
    const open = CONTENT_FIELDS.find(key => view.has(key) && !view.complete(key))
    const completed = CONTENT_FIELDS.reduce((total, key) => key !== open && view.complete(key)
        ? total + (view.stringLength(key, {step: KILOBYTE}) ?? 0)
        : total, 0)
    const remembered = countedKilobytes.get(view)
    let next: number | null
    if (open === undefined) {
        next = CONTENT_FIELDS.some(key => view.has(key)) ? Math.ceil(completed / KILOBYTE) : null
    } else {
        const openLength = view.stringLength(open, {step: KILOBYTE, offset: completed}) ?? 0
        next = Math.ceil((completed + openLength) / KILOBYTE)
    }
    if (next === null) return remembered ?? null
    // 解码一时读不出来时 `stringLength` 给 undefined，上面按 0 计——那会让这个数掉回来。参数只追加，
    // 它本该只往上长，所以拿上一次的数兜底、取两者的较大值。
    const value = remembered === undefined ? next : Math.max(remembered, next)
    countedKilobytes.set(view, value)
    return value
}

/**
 * 每份参数视图、每个字段一份数行记忆：视图是原地追加的，所以只数新来的那一截。
 *
 * 键必须带上字段名——edit 那一对字段（`old_string` / `new_string`）各数各的，共用一个键会互相算错。
 */
const countedLines = new WeakMap<object, Map<string, {length: number, lines: number}>>()

/** 每份参数视图一份 KB 记忆：用来兜住解码一时读不出来的那些帧，不让这个数回落。 */
const countedKilobytes = new WeakMap<object, number>()

/**
 * 内容字段已收到的行数，按 dsh 自己的口径：末尾那个换行是行终止符、不算新的一行，正文为空是零行。
 *
 * 流式期每一批都要问一次，所以记住上一次数到哪、数出多少行，只扫新来的后缀；视图被换成新的
 * 一份（字段收尾，或 `settle` 用权威文本替换）时记忆自然落空，整段重数一次。
 */
function streamedLineCount(view: ToolArgs | undefined, key: string): number {
    let memory: Map<string, {length: number, lines: number}> | undefined
    let remembered: {length: number, lines: number} | undefined
    if (view !== undefined) {
        memory = countedLines.get(view)
        if (memory === undefined) {
            memory = new Map()
            countedLines.set(view, memory)
        }
        remembered = memory.get(key)
    }
    const fieldText = view?.text(key)
    // 转义序列还在路上时这一字段解码不出来（`text` 给 undefined）。那不能读成「这一段是空的」——
    // 参数只追加，这个数本该只往上长，归零就是一次假的回落，所以保留上一次数过的结果。
    if (fieldText === undefined) return remembered?.lines ?? 0
    const body = fieldText.endsWith('\n') ? fieldText.slice(0, -1) : fieldText
    if (body === '') return 0
    let lines = remembered?.lines ?? 1
    for (let at = remembered?.length ?? 0; at < body.length; at++) if (body[at] === '\n') lines++
    memory?.set(key, {length: body.length, lines})
    return lines
}

/**
 * 行尾那两个数。
 *
 * 准备态（开关开着时）走 `streamedTotals`，只看参数视图。其余情形与内置同序：结算后优先用结果
 * 元数据里真实应用的 hunks，拿不到就用参数派生的那一份。
 */
function rowTotals(block: ToolCallBlock, hunks: DiffHunk[] | null): {added: number, removed: number} | null {
    if (!('kind' in block) && block.phase === 'preparing' && liveDiffEnabled()) {
        return streamedTotals(block.name, block.args)
    }
    if (hunks === null) return null
    return diffTotals(hunks)
}

/**
 * 准备态那两个数：只看参数视图，不跑行级 diff。
 *
 * write 是「已收到的内容行数 / 0」；edit 是「已收到的新文本行数 / 已收到的旧文本行数」——两段各自数
 * 原始行数，所以两个数都只往上长，不会因为另一半补齐而回头。派发或结算之后换成真实应用的 hunks，
 * 于是落定那一下会按真实 diff 修正一次。
 *
 * 行级 diff 在部分文本上没有稳定答案（部分 new 会先被算成删除，补齐后又变回来），而这一处要的是一个
 * 只会往上跳的数——与数字轮那边的口径一致。
 *
 * **两个字段各自到、各自开始数**，不等另一半：等齐才画意味着行数要等参数 JSON 里**靠后**的那一个字段
 * 到达——模型先把 `old_string` 写完再写 `new_string` 时，那是一整段原文的时长（实测同一段参数流里 KB
 * 在 96 ms 就显示，行数要等 4.5–6.8 s）。那一位没到之前先报 0，到齐之前它只往上跳；等齐写法反而会在
 * 另一半到达时把已经数过的那一半按新进度重报一次，读数往回跳，与数字轮那一套相冲。
 */
function streamedTotals(name: string, view: ToolArgs | undefined): {added: number, removed: number} | null {
    if (view === undefined) return null
    if (name === 'write') {
        return view.has('content') ? {added: streamedLineCount(view, 'content'), removed: 0} : null
    }
    if (name !== 'edit') return null
    const hasOld = view.has('old_string')
    const hasNew = view.has('new_string')
    if (!hasOld && !hasNew) return null
    return {
        added: hasNew ? streamedLineCount(view, 'new_string') : 0,
        removed: hasOld ? streamedLineCount(view, 'old_string') : 0,
    }
}

/**
 * 把绝对路径缩成读者更容易对上的形状：先相对会话工作区，再把残留的主目录前缀写成 `~`。
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
 */
function firstLine(text: string): string {
    const lineBreakAt = text.indexOf('\n')
    return lineBreakAt === -1 ? text : text.slice(0, lineBreakAt)
}

/**
 * 摘要那半截的类名：失败与中断各自带自己的状态色。
 */
function summaryClassName(rowState: RowState): string {
    if (rowState === 'error') return FILE_SUMMARY_CLASS + ' ' + FILE_ERROR_CLASS
    if (rowState === 'stopped') return FILE_SUMMARY_CLASS + ' ' + FILE_STOPPED_CLASS
    return FILE_SUMMARY_CLASS
}

/**
 * 给读屏的状态文本：图标与扫光都不表达状态，这句话替它们说。
 */
function stateLabel(rowState: RowState, t: Translate): string | null {
    if (rowState === 'running') return t('row.running')
    if (rowState === 'error') return t('row.failed')
    if (rowState === 'stopped') return t('row.stopped')
    return null
}

/**
 * 组装 diff 卡片自己的 chrome 文案。
 */
function diffBlockLabels(t: Translate): DiffBlockLabels {
    return {
        codeLabel: t('codeBlock.title'),
        wrapLabel: t('codeBlock.wrap'),
        unwrapLabel: t('codeBlock.unwrap'),
        copy: t('copy'),
        copied: t('copied'),
        collapseAria: t('diff.collapseAria'),
        expandAria: hidden => t('diff.expandAria', {count: hidden}),
        collapse: t('collapse'),
        expand: hidden => t('diff.expandRest', {count: hidden}),
    }
}
