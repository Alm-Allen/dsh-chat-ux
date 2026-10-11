/**
 * `run_code` 那一行的两样东西：折叠态的进度读数，与展开体的**预览清单**。
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
 * ## 预览清单
 *
 * 子调用行要等程序跑起来才出现，所以准备态里这一段自己扫程序文本，把「接下来要动哪几份文件、各多少
 * 行」先摆出来（扫法与它能读出什么，见 `./preview-scan`）。三处刻意的选择：
 *
 * 1. **只在认得出东西时展开，而且只替读者展开一次**。认不出就什么都不说、也不动读者的开合状态；
 *    读者自己收过之后这一行不再抢回来。
 * 2. **虚线 + 一句「还没执行」**，与正式工具行（实线卡片、状态色）一眼分得开。它是一次预告，不是一次
 *    已经发生的改动，视觉上不能长得像后者。
 * 3. **数字走节拍、并且不撤回**。同一套 `usePacedValue` 与数字轮，`preview-scan` 那一边保证读到的数
 *    只往上长。
 *
 * 那一段默认关着（插件管理页上的「实时改动行数」）；关掉时这一行不显示读数与预览，其余照常。
 *
 * @module dsh-chat-ux/chat/code-progress/run-code-row
 */
import {Fragment, useMemo, useRef} from 'react'
import type {ReactElement} from 'react'
import {
    DiffBlock, DisclosureRow, IconEditOutlineRegular, IconInspectOutlineRegular, TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {DiffBlockLabels, DiffHunk} from '@deepseek-ai/dsh-client-ui-primitives'
import {
    FILE_BODY_CLASS, FILE_DIFF_CLASS, FILE_IO_CLASS, FILE_IO_LABEL_CLASS, FILE_IO_SECTION_CLASS,
    FILE_IO_TEXT_CLASS, FILE_ROW_CLASS, FILE_ROW_LINE_CLASS,
} from '../file-mutation/file-mutation-styles'
import {DigitReel} from '../reel/digit-reel'
import {usePacedValue} from '../paced-value'
import {useInterfaceLanguage} from '../../settings/language'
import type {LocaleLike} from '../../settings/settings-scope'
import {
    CODE_PROGRESS_CLASS, PREVIEW_ADD_CLASS, PREVIEW_BOX_CLASS, PREVIEW_DEL_CLASS, PREVIEW_HEAD_CLASS,
    PREVIEW_ICON_CLASS, PREVIEW_NOTE_CLASS, PREVIEW_PATH_CLASS, PREVIEW_ROW_CLASS, PREVIEW_STAT_CLASS,
    PREVIEW_SUMMARY_CLASS, PREVIEW_SUMMARY_PATH_CLASS, PREVIEW_TAG_CLASS,
} from './code-progress-styles'
import {scanDraft, scanPreviewTargets} from './preview-scan'
import type {DraftHint, PreviewTarget} from './preview-scan'

/** 一个 KB 的字符数。 */
const KILOBYTE = 1024

/** 展开体里那份代码的行数上限；`run_code` 的程序比文件 diff 长得多，所以不沿用 9。 */
const CODE_MAX_LINES = 200

/** 预览里那份 diff 的行数上限；它与聊天区里真正的 diff 卡片同一个口径。 */
const PREVIEW_DIFF_MAX_LINES = 9

/** 拿它给 `DiffBlock` 推语言：那一层只认路径后缀，不认别的提示。 */
const CODE_LANGUAGE_PATH = 'run_code.ts'

/** 没有预览时用的空清单：引用要稳定，否则节拍器每一批都会重排一次定时器。 */
const NO_PREVIEWS: readonly PreviewTarget[] = []

/**
 * 折叠态那一截预告最多列几处。
 *
 * 它是 `flex: none` 的，不收缩；列多了会把左边的描述挤没。剩下的用省略号带过——展开体里有完整的清单。
 */
const PREVIEW_SUMMARY_LIMIT = 2

/**
 * 这一行的图标。
 *
 * 内置的 code 变体用的是编码图标，但它不在基座模块表里（表里只有编辑、检视、数据库三枚），所以这里
 * 用编辑铅笔——它与文件变更行同款，观感上也是「一次改动」那一族。
 */
const CODE_ICON = <IconEditOutlineRegular size={14}/>

/** 预览行那枚更小的图标。 */
const PREVIEW_ICON = <IconEditOutlineRegular size={12}/>

/** 预览区那几句话。插件自己的句子不进 dsh 词典，所以按界面语言选一份。 */
interface PreviewCopy {
    /** 那枚小标签。 */
    tag: string
    /** 紧跟着的一句说明。 */
    note: string
    /** 路径读不出时的占位。 */
    unknownPath: string
    /** 只认出长内容、还没有锚点时那句「可能」的开头。 */
    draftLead: string
}

const ZH_PREVIEW: PreviewCopy = {
    tag: '预览',
    note: '还没执行，写什么由程序自己决定',
    unknownPath: '目标未知',
    draftLead: '可能写入 ',
}

const EN_PREVIEW: PreviewCopy = {
    tag: 'Preview',
    note: 'Not run yet — the program decides what it writes',
    unknownPath: 'unknown target',
    draftLead: 'maybe writing ',
}

/**
 * 准备态那两个读数（已写多少、以及预览清单）开着没有。由 `installRunCodeRow` 装进来，渲染期现读——
 * 插件管理页上一改就跟着变。
 */
let liveReadingsEnabled: () => boolean = () => false

/**
 * 拿 locale 服务，用于选预览区的文案。同样渲染期现读，缺席时退化成按浏览器语言。
 */
let readLocale: () => LocaleLike | undefined = () => undefined

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
    call: {name: string, argsRaw: string} | null
    content: readonly ContentBlock[]
    isError: boolean
    error?: {name: string, code: string} | undefined
}

/** 一次调用的三种形态，按 `kind` 判别是否已结算。 */
type ToolCallBlock = PreparingToolCall | StartedToolCall | ToolResultNode

/** 行状态，与内置 `ToolRowState` 同名同义。 */
type RowState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'

/** 平台交给每个原子工具视图的载荷，只取这一行用到的字段。 */
interface ToolCallOwnerProps {
    /** 每个调用自己的展开状态，由聊天层注入。 */
    useDisclosure: () => {expanded: boolean, toggle: () => void}
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
 * @param liveReadings - 那两个读数开着没有；渲染期现读，所以卡片上一改就跟着变。
 * @param locale - 取 locale 服务；缺席的部署退化成按浏览器语言选文案。
 */
export function installRunCodeRow(
    slots: SlotsService,
    liveReadings: () => boolean,
    locale: () => LocaleLike | undefined,
): void {
    liveReadingsEnabled = liveReadings
    readLocale = locale
    slots.inject('tool.call.toolview', () => slots.register(
        {name: 'tool.call.toolview', priority: -1, locale: 'conversation', key: 'run_code'},
        RunCodeRow,
    ))
}

/**
 * 渲染一次 `run_code` 调用：折叠态是标题、描述与已写大小，展开态是预览清单、那份程序与输出。
 * @param props - owner 载荷与文案座位。
 * @returns 这一行。
 */
export function RunCodeRow(props: RunCodeRowProps): ReactElement {
    const {t, block, inspect, useDisclosure} = props
    const {expanded, toggle} = useDisclosure()
    const state = rowState(block)
    // 准备态也算在跑，与内置 ToolRow 的判据一致：否则这一段的标题与描述都不扫光。
    const running = state === 'running' || state === 'preparing'
    const preparing = !('kind' in block) && block.phase === 'preparing'
    const previewOn = preparing && liveReadingsEnabled()
    const copy = useInterfaceLanguage(readLocale()) === 'en' ? EN_PREVIEW : ZH_PREVIEW
    const kilobytes = useMemo(() => codeKilobytes(block), [block])
    const description = useMemo(() => callDescription(block), [block])
    const output = useMemo(() => resultText(block), [block])
    const labels = useMemo(() => diffBlockLabels(t), [t])
    // 可展开性只看「code 字段来了没有」，不去读全文：读过全文，dsh 就会**每一批**都重发这一行。
    const expandable = useMemo(() => codeFieldPresent(block), [block]) || output !== null
    const open = expanded && expandable

    // 预览清单：每一批重扫一遍（实测一份程序体约 0.03 ms），但把上一批的结果带过去，读出来的数不撤回。
    const previousPreviews = useRef<readonly PreviewTarget[]>(NO_PREVIEWS)
    const rawPreviews = useMemo(() => {
        if (!previewOn) {
            previousPreviews.current = NO_PREVIEWS
            return NO_PREVIEWS
        }
        const text = block.args?.text('code')
        if (text === undefined) return NO_PREVIEWS
        const next = scanPreviewTargets(text, previousPreviews.current)
        previousPreviews.current = next
        return next
    }, [block, previewOn])
    const previews = usePacedValue(rawPreviews, previewOn)

    // 只有长内容、还没有锚点时的那一版读数：`tools.write` 那一段文本往往排在程序很后面（真实中位 67%、
    // 读者那次 96%），而它要写的那段内容必然在它前面（语言语义），所以那一段才是能提前的信号。
    // 判据与成色见 `./preview-scan` 的 `DraftHint`；这里同样按节拍换数。
    const draft = useMemo(
        () => (previewOn ? scanDraft(block.args?.text('code') ?? '') : null),
        [block, previewOn],
    )
    const pacedDraft = usePacedValue<DraftHint | null>(draft, previewOn)

    // 那份程序：只有真的要画它（展开着）才读全文。
    const code = useMemo(() => (open ? callCode(block) : null), [block, open])
    const hunks = useMemo(() => codeHunks(code), [code])
    const status = stateLabel(state, t)

    // 折叠态那一截预告——**「尽快把子调用露出来」的着力点就在这一处**。
    //
    // `tools.write` 那一段文本一出现（真实程序里常在 90% 之后），这一截立刻跟上，读者不必展开任何东西
    // 就能看见「接下来要写哪份文件、多少行」。在那之前程序里根本没有「要调用什么」这几个字：dsh 的子调用
    // 行是执行到那一句才 append 的（`ptc.ts:617`），而参数是运行时求值的——**上限就是这么高**，不是这一
    // 处偷懒。参见 `./preview-scan` 开头那段「尽力而为」的说明。
    //
    // 早先这一处试过替读者把整行展开（预览块在展开体里），那是错的方向：读者要的是「不用动就能看见」，
    // 而展开会连带把整份代码摊开、把这一行的开合状态也一起改掉。
    const shownPreviews = previews.slice(0, PREVIEW_SUMMARY_LIMIT)
    const trailingPreviews = previews.length - shownPreviews.length
    // 有确凿路径就报路径；路径读不出（比如 `file_path: dir + "\\渡口.txt"` 这种拼接出来的）就退回去报
    // 那段正在攒的内容——它至少告诉了读者在写什么，而「目标未知 +53」比它信息更少。
    const showTargets = previews.length > 0
        && (previews.some(target => target.path !== null) || pacedDraft === null)
    const showDraft = !showTargets && pacedDraft !== null

    const collapsedContent = description === '' && kilobytes === null && previews.length === 0
        && pacedDraft === null ? null : (
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
            {kilobytes !== null && (
                <span className={CODE_PROGRESS_CLASS}>
                    <DigitReel
                        text={kilobytes + 'KB'}
                        prefix=""
                        suffix="KB"
                        rolling
                        cadence={running ? 'fast' : undefined}
                        spoken
                    />
                </span>
            )}
            {showDraft && (
                <span className={PREVIEW_SUMMARY_CLASS} data-draft="run_code">
                    {'→ ' + copy.draftLead}
                    {pacedDraft.heading !== '' && (
                        <span className={PREVIEW_SUMMARY_PATH_CLASS}>{pacedDraft.heading}</span>
                    )}
                    {' '}
                    <span className={PREVIEW_ADD_CLASS}>
                        <DigitReel
                            text={'+' + pacedDraft.lines}
                            prefix="+"
                            suffix=""
                            rolling
                            cadence={running ? 'fast' as const : undefined}
                            spoken
                        />
                    </span>
                </span>
            )}
            {showTargets && (
                <span className={PREVIEW_SUMMARY_CLASS}>
                    {'→ '}
                    {shownPreviews.map((target, index) => (
                        <Fragment key={target.at}>
                            {index > 0 && ' · '}
                            <span className={PREVIEW_SUMMARY_PATH_CLASS}>
                                {target.path === null ? copy.unknownPath : fileNameOf(target.path)}
                            </span>
                            {target.added !== null && (
                                <span className={PREVIEW_ADD_CLASS}>
                                    <DigitReel
                                        text={'+' + target.added}
                                        prefix="+"
                                        suffix=""
                                        rolling
                                        cadence="fast"
                                        spoken
                                    />
                                </span>
                            )}
                            {target.removed !== null && (
                                <span className={PREVIEW_DEL_CLASS}>
                                    <DigitReel
                                        text={'-' + target.removed}
                                        prefix="-"
                                        suffix=""
                                        rolling
                                        cadence="fast"
                                        spoken
                                    />
                                </span>
                            )}
                        </Fragment>
                    ))}
                    {trailingPreviews > 0 && ' …'}
                </span>
            )}
        </>
    )

    const expandedContent = open ? (
        <div className={FILE_BODY_CLASS}>
            {previews.length > 0 && (
                <div className={PREVIEW_BOX_CLASS} data-preview="run_code">
                    <div className={PREVIEW_HEAD_CLASS}>
                        <span className={PREVIEW_TAG_CLASS}>{copy.tag}</span>
                        <span className={PREVIEW_NOTE_CLASS}>{copy.note}</span>
                    </div>
                    {previews.map(target => (
                        <Fragment key={target.at}>
                            <div className={PREVIEW_ROW_CLASS}>
                                <span className={PREVIEW_ICON_CLASS}>{PREVIEW_ICON}</span>
                                <span className={PREVIEW_PATH_CLASS}>{target.path ?? copy.unknownPath}</span>
                                {target.added !== null && (
                                    <span className={PREVIEW_STAT_CLASS + ' ' + PREVIEW_ADD_CLASS}>
                                        <DigitReel
                                            text={'+' + target.added}
                                            prefix="+"
                                            suffix=""
                                            rolling
                                            cadence="fast"
                                            spoken
                                        />
                                    </span>
                                )}
                                {target.removed !== null && (
                                    <span className={PREVIEW_STAT_CLASS + ' ' + PREVIEW_DEL_CLASS}>
                                        <DigitReel
                                            text={'-' + target.removed}
                                            prefix="-"
                                            suffix=""
                                            rolling
                                            cadence="fast"
                                            spoken
                                        />
                                    </span>
                                )}
                            </div>
                            {/* 改动的那两段都**收尾**了才画（`settled`）：半截正文每 300 ms 变一次高度，会
                                把这一块连同下面那份程序一直撑，而输入区是 sticky 贴底的、会跟着动。这是
                                「实时」两个字落到实处的地方——它出现在程序还在生成的时候，而不是等子调用
                                跑起来。`write` 不画：它的 diff 就是那份内容本身，而展开体下面已经有一份
                                正在长的代码了，再画一遍只是把同一段文字誊一次。 */}
                            {target.settled && target.oldText !== null && target.newText !== null && (
                                <DiffBlock
                                    diffs={[{
                                        path: target.path ?? CODE_LANGUAGE_PATH,
                                        oldText: target.oldText,
                                        newText: target.newText,
                                    }]}
                                    labels={labels}
                                    maxLines={PREVIEW_DIFF_MAX_LINES}
                                    className={FILE_DIFF_CLASS}
                                />
                            )}
                        </Fragment>
                    ))}
                </div>
            )}
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
 *
 * 给的是**数**不是句子：这一截也要走数字轮（`2` 弹到 `3`，`KB` 原地不动），而数字轮要的是可拆的数与
 * 单位两半。dsh 词典里那个 `tool.preparing.content` 是一整句 `2KB`，用不了。
 * @param block - 调用块。
 * @returns 千字节数，或 null（关着、或代码字段还没出现）。
 */
function codeKilobytes(block: ToolCallBlock): number | null {
    if (!liveReadingsEnabled()) return null
    if ('kind' in block || block.phase !== 'preparing') return null
    const view = block.args
    if (view === undefined || !view.has('code')) return null
    const characters = view.stringLength('code', {step: KILOBYTE}) ?? 0
    return Math.ceil(characters / KILOBYTE)
}

/**
 * `code` 字段来了没有——**不读它的正文**。
 *
 * 判据只用 `has`：它给的是布尔，只在字段第一次出现时变一次，所以这一行不会因为「读全文」而每一批重发
 * （`text('code')` 会让 dsh 按批重新发布这一行，而几十 KB 的程序参数不值得为「能不能展开」付这个钱）。
 * @param block - 调用块。
 * @returns 能不能展开。
 */
function codeFieldPresent(block: ToolCallBlock): boolean {
    if (!('kind' in block) && block.phase === 'preparing') return block.args?.has('code') === true
    const raw = 'kind' in block ? block.call?.argsRaw ?? '' : block.argsRaw
    const parsed = parseArgs(raw)
    return parsed !== null && typeof parsed.code === 'string'
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
 * 路径最后那一段。
 *
 * 折叠态那一截只有几十像素的位置，放不下绝对路径；读者要认的是文件名，目录在展开体里能看到完整的。
 * @param path - 参数里给出的路径。
 * @returns 最后一段；没有分隔符时就是它自己。
 */
function fileNameOf(path: string): string {
    const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
    return at < 0 ? path : path.slice(at + 1)
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
