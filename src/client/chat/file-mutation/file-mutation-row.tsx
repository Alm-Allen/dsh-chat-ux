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
 * 除此之外这一行还多给准备态一次：内置要等参数 JSON 收齐（`parsedToolCall` 在 preparing 直接返回
 * null），所以流式期间那两个数一直不出现；这里在准备态改读 dsh 的参数视图（`block.args`），write
 * 的内容一出现就有 `+n -0`，并随流式增长。
 *
 * 这一段默认关着（插件管理页上的「实时改动行数」，标 beta）：关掉时这一行回到接管之前的样子——
 * 准备态不画那两个数，派发后只看参数 JSON。
 *
 * 代价说得明白些：子调用不持久化 `presentationMeta`，所以结算之后拿不到"实际应用了什么"，
 * 只能拿参数说话——write 的参数就是整份内容（确定），edit 的参数就是那一对替换（`replace_all`
 * 或写入失败时可能与实际不符）。
 *
 * 参数那一侧不再自己校验沙箱升级字段。dsh 在 0.2.1-alpha.1 里把这道校验从客户端删掉了
 * （c74f39b4dc），理由是它取决于会话沙箱模式、只有 Host 知道，而被拒的调用本来就会以错误结果
 * 结算；客户端自己猜只会误杀合法行（Bash 就接受「与当前模式相同的模式 + 空 justification」）。
 * 所以这一行与内置同序：只看路径与字段类型。
 *
 * 行尾那两个数走数字轮（`../reel/digit-reel`）：读数一变，**变了的那一位**原地弹到新值，与命中率、
 * 上下文占用同款。外部仍套着 TextShimmer——运行态整行扫光照旧——而它在活动期间会把这份复合子节点
 * 另渲染一棵惰性副本（平台契约里那是给纯展示子节点准备的）。两份从同一帧挂载、值同源，动画因此同步，
 * 代价只是动画期间那一位的透明度叠了一层。
 *
 * 遮蔽的是 keyed 座位：keyed 座位按 priority 升序取最低的那个渲染，同一 priority 上二次注册会
 * 抛错，内置那两行是默认的 0，所以这里用 -1。内置 ToolRow 的组件与 CSS Modules 类名都不在
 * 冻结的基座模块表里，拿不到，所以这一行是照着它的样子重画的（`DisclosureRow` 等 primitives
 * 是共享的，行 chrome 本身仍由它们承担）。
 *
 * @module dsh-chat-ux/client/chat/file-mutation/file-mutation-row
 */
import {useCallback, useMemo} from 'react'
import type {KeyboardEvent, MouseEvent, ReactElement} from 'react'
import {
    DiffBlock, DisclosureRow, IconEditOutlineRegular, IconInspectOutlineRegular, TextShimmer, diffTotals,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {DiffBlockLabels, DiffHunk} from '@deepseek-ai/dsh-client-ui-primitives'
import {DigitReel} from '../reel/digit-reel'
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
 * @param slots - 客户端座位注册表。
 * @param liveDiff - 准备态那两个数开着没有；渲染期现读，所以卡片上一改就跟着变。
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
 * @param props - owner 载荷与文案座位。
 * @returns 这一行。
 */
export function FileMutationRow(props: FileMutationRowProps): ReactElement {
    const {t, toolName, block, cwd, home, openFile, inspect, useDisclosure} = props
    const {expanded, toggle} = useDisclosure()
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
    const totals = useMemo(() => rowTotals(block, hunks), [block, hunks])
    // 准备态不给展开：那份是半截内容，摊成 diff 会被读成改完了，而且流式的每一批都要重跑一次。
    const expandable = model.state !== 'preparing'
        && (hunks !== null || model.output !== null || model.bodyRaw !== null)
    const open = expanded && expandable
    const summaryText = model.errorSummary ?? model.summary
    // 输入大小跨阶段保留，与内置的 `summarySuffix` 同一条规则：有路径才显示，所以准备态还没
    // 读到路径时它不单独占位。
    const size = model.kilobytes === null || model.summary === ''
        ? null
        : t('tool.preparing.content', {kilobytes: model.kilobytes})
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
            <span className={FILE_SEP_CLASS} aria-hidden/>
            {linkAvailable ? (
                <button type="button" className={FILE_LINK_CLASS} onClick={openFileClick} onKeyDown={linkKeyDown}>
                    <TextShimmer active={running}>{summaryText}</TextShimmer>
                </button>
            ) : (
                <span className={summaryClassName(model.state)}>
          <TextShimmer active={running}>{summaryText}</TextShimmer>
        </span>
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
                                    spoken
                                />
                            </TextShimmer>
                            <TextShimmer className={FILE_STAT_CLASS + ' ' + FILE_DEL_CLASS} active={running}>
                                <DigitReel
                                    text={'-' + totals.removed}
                                    prefix="-"
                                    suffix=""
                                    rolling
                                    spoken
                                />
                            </TextShimmer>
                        </>
                    )}
                </span>
            )}
        </>
    )

    const expandedContent = open ? (
        <div className={FILE_BODY_CLASS}>
            {hunks !== null ? (
                <DiffBlock diffs={hunks} labels={labels} maxLines={CHAT_DIFF_MAX_LINES} className={FILE_DIFF_CLASS}/>
            ) : (
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

/** 调用头：工具名与原始参数 JSON。 */
interface ToolCallHead {
    name: string
    argsRaw: string
}

/**
 * 参数视图：dsh 自 0.2.1-alpha.1 起在每个阶段都提供它，准备态可能还不完整。
 *
 * 这里只复述这一行用到的读法——client bundle 必须自包含，不 import 平台包。旧版 dsh 没有这个
 * 字段，所以引用处一律走可空兜底。
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
    /** 参数视图；旧版 dsh 没有。 */
    args?: ToolArgs | undefined
}

/** 已派发、仍在跑的那一次调用。 */
interface StartedToolCall {
    phase: 'start'
    callId: string
    parentCallId?: string | undefined
    name: string
    argsRaw: string
    /** 参数视图；旧版 dsh 没有。 */
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
    /** 参数视图；旧版 dsh 没有。 */
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
 * @param block - 运行中或已结算的调用块。
 * @param args - 这一行的调用参数，已解析；准备态为 null。
 * @returns 要画的 hunks，或 null（这一行没有可画的改动）。
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
 * @param name - 线上工具名。
 * @param args - 已解析的参数；解析不出来时为 null。
 * @returns 单个 hunk，或 null（参数不是这一行的形状）。
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
 * @param name - 线上工具名。
 * @param view - 参数视图；旧版 dsh 没有它。
 * @returns 单个 hunk，或 null（阶段或字段还不成形状）。
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
 * @param meta - 结果元数据，未经校验。
 * @returns 校验过的 hunks、`empty`（元数据明确说没有改动），或 null（不可用）。
 */
function appliedHunks(meta: unknown): DiffHunk[] | 'empty' | null {
    if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return null
    const diffs = (meta as Record<string, unknown>).diffs
    if (!Array.isArray(diffs)) return null
    if (diffs.length === 0) return 'empty'
    const hunks: DiffHunk[] = []
    for (const hunk of diffs) {
        if (typeof hunk !== 'object' || hunk === null) return null
        const {path, oldText, newText} = hunk as Record<string, unknown>
        if (typeof path !== 'string') return null
        if (oldText !== null && typeof oldText !== 'string') return null
        if (typeof newText !== 'string') return null
        hunks.push({path, oldText, newText})
    }
    return hunks
}

/**
 * 派生整行的展示模型。
 * @param toolName - 线上工具名。
 * @param block - 运行中或已结算的调用块。
 * @param args - 这一行的调用参数，已解析；准备态为 null。
 * @param cwd - 会话工作区根。
 * @param home - 宿主账户主目录。
 * @returns 这一行的模型。
 */
function rowModel(
    toolName: string,
    block: ToolCallBlock,
    args: Record<string, unknown> | null,
    cwd: string | undefined,
    home: string | undefined,
): RowModel {
    const done = 'kind' in block
    const head = callHead(block)
    const state: RowState = !done
        ? block.phase === 'preparing' ? 'preparing' : 'running'
        : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
    const path = argumentPath(block, args)
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
        kilobytes: contentKilobytes(block.args),
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
 * @param block - 运行中或已结算的调用块。
 * @returns 调用头，或 null（参数还在流进来的准备态）。
 */
function callHead(block: ToolCallBlock): ToolCallHead | null {
    if ('kind' in block) return block.call
    return block.phase === 'start' ? {name: block.name, argsRaw: block.argsRaw} : null
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
 * 这一行的目标路径：先读参数视图（每个阶段都在，准备态可能还不完整），再退回派发后的原始参数。
 * @param block - 运行中或已结算的调用块。
 * @param args - 已解析的原始参数；解析不出来时为 null。
 * @returns 路径，或 undefined。
 */
function argumentPath(block: ToolCallBlock, args: Record<string, unknown> | null): string | undefined {
    return viewPath(block.args) ?? (args === null ? undefined : pickString(args, ['path', 'file_path']))
}

/**
 * 路径的视图读法。
 *
 * 与内置的文件变更行同一条规则：字段收尾了才算数——准备态可能只到了半截——解码失败
 * （转义不完整）也当没有。
 * @param view - 参数视图；旧版 dsh 没有它。
 * @returns 路径，或 undefined。
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
 * @param view - 参数视图；旧版 dsh 没有它。
 * @returns 向上取整的 KB 数，或 null。
 */
function contentKilobytes(view: ToolArgs | undefined): number | null {
    if (view === undefined) return null
    const open = CONTENT_FIELDS.find(key => view.has(key) && !view.complete(key))
    const completed = CONTENT_FIELDS.reduce((total, key) => key !== open && view.complete(key)
        ? total + (view.stringLength(key, {step: KILOBYTE}) ?? 0)
        : total, 0)
    const remembered = countedKilobytes.get(view)
    const next = open === undefined
        ? CONTENT_FIELDS.some(key => view.has(key)) ? Math.ceil(completed / KILOBYTE) : null
        : Math.ceil((completed + (view.stringLength(open, {step: KILOBYTE, offset: completed}) ?? 0)) / KILOBYTE)
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
 * @param view - 参数视图；旧版 dsh 没有它。
 * @param key - 内容字段名。
 * @returns 行数。
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
    const text = view?.text(key)
    // 转义序列还在路上时这一字段解码不出来（`text` 给 undefined）。那不能读成「这一段是空的」——
    // 参数只追加，这个数本该只往上长，归零就是一次假的回落，所以保留上一次数过的结果。
    if (text === undefined) return remembered?.lines ?? 0
    const body = text.endsWith('\n') ? text.slice(0, -1) : text
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
 * @param block - 运行中或已结算的调用块。
 * @param hunks - 已派生的改动。
 * @returns 增删两个数，或 null（这一行没有可画的改动）。
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
 * @param name - 线上工具名。
 * @param view - 参数视图；旧版 dsh 没有它。
 * @returns 增删两个数，或 null（参数还没到那一步）。
 */
function streamedTotals(name: string, view: ToolArgs | undefined): {added: number, removed: number} | null {
    if (view === undefined) return null
    if (name === 'write') {
        return view.has('content') ? {added: streamedLineCount(view, 'content'), removed: 0} : null
    }
    if (name !== 'edit') return null
    if (!view.has('old_string') || !view.has('new_string')) return null
    return {added: streamedLineCount(view, 'new_string'), removed: streamedLineCount(view, 'old_string')}
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
    const lineBreakAt = text.indexOf('\n')
    return lineBreakAt === -1 ? text : text.slice(0, lineBreakAt)
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
        expandAria: hidden => t('diff.expandAria', {count: hidden}),
        collapse: t('collapse'),
        expand: hidden => t('diff.expandRest', {count: hidden}),
    }
}
