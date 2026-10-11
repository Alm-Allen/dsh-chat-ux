/**
 * `run_code` 的进度读数：接管这一行，在折叠态尾部显示「代码已写多少」。
 *
 * ## 为什么这一处必须重画整行
 *
 * 进度数据在 `block.args` 里，而拿到它的唯一入口是 `tool.call.toolview` 座位——座位的语义是**替换**
 * 而不是追加（`renderSlot(name, owner, {entryKey, fallback})`），dsh 没有「只读参数、不动这一行」的
 * 注入点（`DisclosureRow` 的 `headerAccessory` 是 `ToolRow` 的内部 prop，座位之外拿不到）。所以这一
 * 处与 `file-mutation-row` 同样的做法：用更低的 priority 遮蔽内置那一行，照着它的样子重画。
 *
 * 与文件变更行唯一的取舍在**展开体的代码块**：内置用 `CodeBlock`（shiki 高亮 + 语言标签 + 复制/折行），
 * 而 `CodeBlock` 虽然从 `@deepseek-ai/dsh-client-ui-primitives` 导出，却**不在 dsh 开放给插件的基座
 * 模块表里**（`platform-modules.d.ts` 只给到 `DiffBlock`），所以这里用 `DiffBlock` 顶——同一个 shiki
 * 高亮、同一个工具栏，代价是行首多一个 `+`、新增行带一条绿底。想不降级就得改 dsh 自己，那时这一行可
 * 以整个撤掉。
 *
 * ## 读数本身
 *
 * `code` 字段的已解码长度，按 1 KB 一档（与文件变更行的输入大小同一个口径），只在准备态显示——派发
 * 之后「代码正在写」这件事就结束了。读的是 `stringLength` 而不是 `text()`：后者会让 dsh 按「每一批」
 * 重新发布这一行，几十 KB 的代码参数不值得为一个小读数付这个钱。
 *
 * 那一段默认关着（插件管理页上的「实时改动行数」）；关掉时这一行不显示读数，其余照常。
 *
 * @module dsh-chat-ux/chat/code-progress/run-code-row
 */
import {useMemo} from 'react'
import type {ReactElement} from 'react'
import {
    DiffBlock, DisclosureRow, IconEditOutlineRegular, IconInspectOutlineRegular, TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {DiffBlockLabels, DiffHunk} from '@deepseek-ai/dsh-client-ui-primitives'
import {
    FILE_BODY_CLASS, FILE_IO_CLASS, FILE_IO_LABEL_CLASS, FILE_IO_SECTION_CLASS, FILE_IO_TEXT_CLASS,
    FILE_ROW_CLASS, FILE_ROW_LINE_CLASS,
} from '../file-mutation/file-mutation-styles'
import {CODE_PROGRESS_CLASS} from './code-progress-styles'

/** 一个 KB 的字符数。 */
const KILOBYTE = 1024

/** 展开体里那份代码的行数上限；`run_code` 的程序比文件 diff 长得多，所以不沿用 9。 */
const CODE_MAX_LINES = 200

/** 拿它给 `DiffBlock` 推语言：那一层只认路径后缀，不认别的提示。 */
const CODE_LANGUAGE_PATH = 'run_code.ts'

/**
 * 这一行的图标。
 *
 * 内置的 code 变体用的是编码图标，但它不在基座模块表里（表里只有编辑、检视、数据库三枚），所以这里
 * 用编辑铅笔——它与文件变更行同款，观感上也是「一次改动」那一族。
 */
const CODE_ICON = <IconEditOutlineRegular size={14}/>

/**
 * 准备态那个读数开着没有。由 `installRunCodeRow` 装进来，渲染期现读——插件管理页上一改就跟着变。
 */
let liveSizeEnabled: () => boolean = () => false

/** 文案座位：conversation 命名空间下的 `t`。 */
type Translate = (key: string, params?: Record<string, unknown>) => string

/** 参数视图：只复述这一处用到的读法。 */
interface ToolArgs {
    /** 这个字段出现了没有。 */
    has(key: string): boolean
    /** 已解码的字段长度；`step` 只影响流式下的变化检测粒度。 */
    stringLength(key: string, options?: {step?: number; offset?: number}): number | undefined
    /** 已解码的字段文本。 */
    text(key: string): string | undefined
}

/** 还在流进来的准备态调用块。 */
interface PreparingToolCall {
    phase: 'preparing'
    callId: string
    name: string
    /** 参数视图；旧版 dsh 没有。 */
    args?: ToolArgs | undefined
}

/** 已派发、仍在跑的那一次调用。 */
interface StartedToolCall {
    phase: 'start'
    callId: string
    name: string
    argsRaw: string
    /** 参数视图；旧版 dsh 没有。 */
    args?: ToolArgs | undefined
}

/** 结果里的一个内容块；这一处只区分文本与其余。 */
interface ContentBlock {
    type: string
    text?: string | undefined
}

/** 已结算的结果节点。 */
interface ToolResultNode {
    kind: 'tool-result'
    callId: string
    name: string
    /** 窗口丢掉了调用头时为 null。 */
    call: {name: string; argsRaw: string} | null
    content: readonly ContentBlock[]
    isError: boolean
    error?: {name: string; code: string} | undefined
}

/** 一次调用的三种形态，按 `kind` 判别是否已结算。 */
type ToolCallBlock = PreparingToolCall | StartedToolCall | ToolResultNode

/** 行状态，与内置 `ToolRowState` 同名同义。 */
type RowState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'

/** 平台交给每个原子工具视图的载荷，只取这一行用到的字段。 */
interface ToolCallOwnerProps {
    /** 每个调用自己的展开状态，由聊天层注入。 */
    useDisclosure: () => {expanded: boolean; toggle: () => void}
    callId: string
    /** 线上工具名，也是 keyed 座位的分发键。 */
    toolName: string
    block: ToolCallBlock
    /** 有轨迹视图时给的跳转入口。 */
    inspect?: (() => void) | undefined
}

/** 这一行的完整输入。 */
interface RunCodeRowProps extends ToolCallOwnerProps {
    t: Translate
}

/** 座位注册表，收窄到本插件会发出的调用。 */
export interface SlotsService {
    inject(name: string, callback: () => () => void): void

    register(options: Record<string, unknown>, component: unknown): () => void
}

/**
 * 在 `run_code` 座位上遮蔽内置那一行。
 * @param slots - 客户端座位注册表。
 * @param liveSize - 准备态那个读数开着没有；渲染期现读，所以卡片上一改就跟着变。
 */
export function installRunCodeRow(slots: SlotsService, liveSize: () => boolean): void {
    liveSizeEnabled = liveSize
    slots.inject('tool.call.toolview', () => slots.register(
        {name: 'tool.call.toolview', priority: -1, locale: 'conversation', key: 'run_code'},
        RunCodeRow,
    ))
}

/**
 * 渲染一次 `run_code` 调用：折叠态是标题、描述与已写大小，展开态是那份程序与输出。
 * @param props - owner 载荷与文案座位。
 * @returns 这一行。
 */
export function RunCodeRow(props: RunCodeRowProps): ReactElement {
    const {t, block, inspect, useDisclosure} = props
    const {expanded, toggle} = useDisclosure()
    const state = rowState(block)
    // 准备态也算在跑，与内置 ToolRow 的判据一致：否则这一段的标题与描述都不扫光。
    const running = state === 'running' || state === 'preparing'
    const size = useMemo(() => codeSizeText(block, t), [block, t])
    const description = useMemo(() => callDescription(block), [block])
    const code = useMemo(() => callCode(block), [block])
    const hunks = useMemo(() => codeHunks(code), [code])
    const output = useMemo(() => resultText(block), [block])
    const labels = useMemo(() => diffBlockLabels(t), [t])
    const expandable = hunks !== null || output !== null
    const open = expanded && expandable
    const status = stateLabel(state, t)

    const collapsedContent = description === '' && size === null ? null : (
        <>
            {/* 那个分隔点是「标题 · 描述」的一部分：没有描述时它不该单独出现。 */}
            {description !== '' && (
                <>
                    <span className="dsh-chat-ux-file-sep" aria-hidden/>
                    <span className="dsh-chat-ux-file-summary">
                        <TextShimmer active={running}>{description}</TextShimmer>
                    </span>
                </>
            )}
            {size !== null && <span className={CODE_PROGRESS_CLASS}>{size}</span>}
        </>
    )

    const expandedContent = open ? (
        <div className={FILE_BODY_CLASS}>
            {hunks !== null ? (
                <DiffBlock diffs={hunks} labels={labels} maxLines={CODE_MAX_LINES}/>
            ) : (
                <div className={FILE_IO_CLASS}>
                    {output !== null && (
                        <div className={FILE_IO_SECTION_CLASS}>
                            <span className={FILE_IO_LABEL_CLASS}>{t('row.output')}</span>
                            <span className={FILE_IO_TEXT_CLASS} data-error={state === 'error' || undefined}>
                                {output}
                            </span>
                        </div>
                    )}
                </div>
            )}
            {inspect !== undefined && (
                <button type="button" className="dsh-chat-ux-file-inspect" onClick={inspect}>
                    <IconInspectOutlineRegular/>
                    {t('row.inspect')}
                </button>
            )}
        </div>
    ) : undefined

    return (
        <div className={FILE_ROW_CLASS} data-variant="code" data-tool="run_code" data-state={state}>
            {status !== null && <span className="dsh-chat-ux-file-hidden">{status}</span>}
            <DisclosureRow
                rowClassName={FILE_ROW_LINE_CLASS}
                leadingClassName="dsh-chat-ux-file-leading"
                titleClassName="dsh-chat-ux-file-title"
                chevronClassName="dsh-chat-ux-file-chevron"
                icon={CODE_ICON}
                title={t('tool.title.code')}
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
 * 行状态。
 * @param block - 调用块。
 * @returns 状态。
 */
function rowState(block: ToolCallBlock): RowState {
    if (!('kind' in block)) return block.phase === 'preparing' ? 'preparing' : 'running'
    if (block.error?.code === 'interrupted') return 'stopped'
    return block.isError ? 'error' : 'ok'
}

/**
 * 此刻的读数：代码字段已收到的长度，向上取整成 KB。
 * @param block - 调用块。
 * @param t - 文案座位。
 * @returns 读数文本，或 null（关着、或代码字段还没出现）。
 */
function codeSizeText(block: ToolCallBlock, t: Translate): string | null {
    if (!liveSizeEnabled()) return null
    if ('kind' in block || block.phase !== 'preparing') return null
    const view = block.args
    if (view === undefined || !view.has('code')) return null
    const characters = view.stringLength('code', {step: KILOBYTE}) ?? 0
    return t('tool.preparing.content', {kilobytes: Math.ceil(characters / KILOBYTE)})
}

/**
 * 折叠态那半截描述文本。
 *
 * 准备态读参数视图（流式期间就有），派发后退回原始参数——与内置 `code` 变体取的是同一个字段。
 * @param block - 调用块。
 * @returns 描述，或空串。
 */
function callDescription(block: ToolCallBlock): string {
    if (!('kind' in block) && block.phase === 'preparing') {
        const text = block.args?.text('description')
        return text === undefined ? '' : firstLine(text)
    }
    const raw = 'kind' in block ? block.call?.argsRaw ?? '' : block.argsRaw
    const parsed = parseArgs(raw)
    return parsed === null ? '' : firstLine(pickString(parsed, ['description']) ?? '')
}

/**
 * 那份程序本体。
 *
 * 准备态只能读参数视图给出的那一段（流式期间就是半截），派发之后读完整参数——准备态因此也能展开看
 * 到正在生成的代码。
 * @param block - 调用块。
 * @returns 代码，或 null。
 */
function callCode(block: ToolCallBlock): string | null {
    if (!('kind' in block) && block.phase === 'preparing') return block.args?.text('code') ?? null
    const raw = 'kind' in block ? block.call?.argsRaw ?? '' : block.argsRaw
    const parsed = parseArgs(raw)
    return parsed === null ? null : pickString(parsed, ['code']) ?? null
}

/**
 * 把代码摊成一份「整份新增」的改动，交给 `DiffBlock` 画——这样 shiki 高亮与工具栏都还在。
 * @param code - 代码文本。
 * @returns 单个 hunk，或 null（还没有代码）。
 */
function codeHunks(code: string | null): DiffHunk[] | null {
    if (code === null || code === '') return null
    return [{path: CODE_LANGUAGE_PATH, oldText: null, newText: code}]
}

/**
 * 展开体里那份输出。
 * @param block - 调用块。
 * @returns 摊平后的文本，或 null。
 */
function resultText(block: ToolCallBlock): string | null {
    if (!('kind' in block)) return null
    const parts: string[] = []
    for (const item of block.content) {
        if (item.type === 'text' && typeof item.text === 'string') {
            parts.push(item.text)
            continue
        }
        parts.push(JSON.stringify(item, null, 2))
    }
    if (parts.length === 0 && block.error !== undefined) parts.push(block.error.name + ': ' + block.error.code)
    return parts.length === 0 ? null : parts.join('\n')
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
 * @param keys - 候选字段名。
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
 * 取一段文本的第一行。
 * @param text - 任意文本。
 * @returns 第一行。
 */
function firstLine(text: string): string {
    const lineBreakAt = text.indexOf('\n')
    return lineBreakAt === -1 ? text : text.slice(0, lineBreakAt)
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
        expandAria: hidden => t('diff.expandAria', {count: hidden}),
        collapse: t('collapse'),
        expand: hidden => t('diff.expandRest', {count: hidden}),
    }
}
