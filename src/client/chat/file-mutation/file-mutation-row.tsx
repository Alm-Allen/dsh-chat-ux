/**
 * run_code 内部派发的 write 与 edit 子调用行。
 *
 * 内置的文件变更行只给根调用画 diff 卡片：ui-tool 的 diff-card-model 第一行就按 parentCallId 把子调用
 * 排除掉，行尾那个 +n -m 因此从不出现。这里自己写一份派生，唯一的差别是不排除子调用
 *
 * 遮蔽的是 keyed 座位：同一 priority 上二次注册会抛错，内置那两行是默认的 0，所以这里用 -1
 * 内置 ToolRow 的组件与 CSS Modules 类名都不在冻结的基座模块表里，拿不到，所以这一行照着它的样子重画
 */
import {useCallback, useMemo} from "react"
import type {KeyboardEvent, MouseEvent, ReactElement} from "react"
import {
	DiffBlock, DisclosureRow, IconEditOutlineRegular, IconInspectOutlineRegular, TextShimmer, diffTotals,
} from "@deepseek-ai/dsh-client-ui-primitives"
import type {DiffBlockLabels, DiffHunk} from "@deepseek-ai/dsh-client-ui-primitives"
import {DigitReel} from "../reel/digit-reel"
import {usePacedValue} from "../paced-value"
import {
	FILE_ADD_CLASS, FILE_BODY_CLASS, FILE_CHEVRON_CLASS, FILE_DEL_CLASS, FILE_DIFF_CLASS, FILE_ERROR_CLASS,
	FILE_HIDDEN_CLASS, FILE_INSPECT_CLASS, FILE_IO_CLASS, FILE_IO_DIVIDER_CLASS, FILE_IO_LABEL_CLASS,
	FILE_IO_SECTION_CLASS, FILE_IO_TEXT_CLASS, FILE_LEADING_CLASS, FILE_LINK_CLASS, FILE_ROW_CLASS,
	FILE_ROW_LINE_CLASS, FILE_SEP_CLASS, FILE_STAT_CLASS, FILE_STOPPED_CLASS, FILE_SUFFIX_CLASS,
	FILE_SUMMARY_CLASS, FILE_TITLE_CLASS,
} from "./file-mutation-styles"

// 折叠前展示的行数，与内置的 CHAT_DIFF_MAX_LINES 取同一个值
const CHAT_DIFF_MAX_LINES = 9

// write 用第一个，edit 用后两个；行尾的输入大小与准备态的行数都算它们
const CONTENT_FIELDS = ["content", "old_string", "new_string"] as const

const KILOBYTE = 1024

const FILE_ICON = <IconEditOutlineRegular size={14}/>

// 准备态那两个数开着没有；由 installFileMutationRow 装进来，渲染期现读，卡片上一改下一次渲染就跟着变
let liveDiffEnabled: () => boolean = () => false

// 这一行要用的文案座位：conversation 命名空间下的 t
type Translate = (key: string, params?: Record<string, unknown>) => string

// 平台交给每个原子工具视图的载荷，只取这一行用到的字段
interface ToolCallOwnerProps {
	// 每个调用自己的展开状态，由聊天层注入
	useDisclosure: () => { expanded: boolean; toggle: () => void }
	callId: string
	// 线上工具名，也是 keyed 座位的分发键
	toolName: string
	block: ToolCallBlock
	cwd?: string | undefined
	// 宿主账户主目录，残留的 POSIX home 前缀显示成 ~
	home?: string | undefined
	openFile: (path: string, options?: { line?: number } | undefined) => void
	inspect?: (() => void) | undefined
}

// 这一行的完整输入
export interface FileMutationRowProps extends ToolCallOwnerProps {
	t: Translate
}

// 座位注册表，收窄到本插件会发出的两次调用
export interface SlotsService {
	inject(name: string, callback: () => () => void): void

	register(options: Record<string, unknown>, component: unknown): () => void
}

// 在 edit 与 write 两个座位上遮蔽内置的文件变更行
export function installFileMutationRow(slots: SlotsService, liveDiff: () => boolean): void {
	liveDiffEnabled = liveDiff
	slots.inject("tool.call.toolview", () => {
		const seat = {name: "tool.call.toolview", priority: -1, locale: "conversation"}
		const disposeEdit = slots.register({...seat, key: "edit"}, FileMutationRow)
		const disposeWrite = slots.register({...seat, key: "write"}, FileMutationRow)
		return () => {
			disposeEdit()
			disposeWrite()
		}
	})
}

// 渲染一次 write 或 edit 调用：折叠态是标题、路径与 +n -m，展开态是 diff 卡片
export function FileMutationRow(props: FileMutationRowProps): ReactElement {
	const {t, block, toolName, cwd, home, openFile, inspect, useDisclosure} = props
	const {expanded, toggle} = useDisclosure()
	// dsh 0.2.1-alpha.1 起每个阶段都带 args 视图，不再有旧版那个前缀订阅口
	const parsedArgs = useMemo(() => {
		const head = callHead(block)
		return head === null ? null : parseArgs(head.argsRaw)
	}, [block])
	const displayRow = useMemo(() => rowModel(toolName, block, parsedArgs, cwd, home), [parsedArgs, block, cwd, home, toolName])
	const hunkList = useMemo(() => diffHunks(block, parsedArgs), [parsedArgs, block])
	const diffLabels = useMemo(() => diffBlockLabels(t), [t])
	// 准备态也算在跑，与内置 ToolRow 的判据一致；否则这一段里路径与输入大小都不扫光，而它们旁边就是正在扫光的标题
	const running = displayRow.state === "running" || displayRow.state === "preparing"
	const nextTotals = useMemo(() => rowTotals(block, hunkList), [block, hunkList])
	// 数字滚动常开，只是流式那两态换一档更短的弹动
	const cadence = running ? "fast" as const : undefined
	// 两个工具都按节拍换数，宁可读数滞后一拍，也让每一轮动画走完整：逐批跟随会让 220 ms 的动画每 48 ms
	// 被下一批参数打断，读数看着像硬切
	const shownTotals = usePacedValue(nextTotals, running)
	// 准备态不给展开：那份是半截内容，摊成 diff 会被读成改完了，而且流式的每一批都要重跑一次
	const expandable = displayRow.state !== "preparing"
		&& (hunkList !== null || displayRow.output !== null || displayRow.bodyRaw !== null)
	const open = expanded && expandable
	const summaryText = displayRow.errorSummary ?? displayRow.summary
	// 输入大小只要读得到就显示，不要求路径已经出现：模型给 write 生成的参数是 content 在前、file_path 在最后
	// （2026-10-11 量了 30 次真实 write，file_path 落在整段参数流的 100%），edit 反过来是路径在最前；
	// 照抄内置那条有路径才显示的规则，写入的数字会一直被挡到末尾。它自己拼，不借 dsh 那句 tool.preparing.content
	const inputSizeText = displayRow.kilobytes === null ? null : displayRow.kilobytes + "KB"
	const statusText = stateLabel(displayRow.state, t)
	// 失败与中断的行不给路径链接：那两态下摘要换成的是裁决或失败信息，链接会把它读成一次正常改动
	const linkAvailable = displayRow.filePath !== undefined && displayRow.state !== "error" && displayRow.state !== "stopped"

	const onClickFileLink = useCallback((event: MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation()
		if (displayRow.filePath === undefined) return
		openFile(displayRow.filePath)
	}, [displayRow.filePath, openFile])
	// 路径链接是行内的一颗按钮，而整行也是开合目标：Enter 与空格要落在这颗按钮上，不能冒泡到行的 keydown 里
	const onKeyDownFileLink = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Enter" || event.key === " ") event.stopPropagation()
	}, [])

	// 折叠态那一截由路径（或摘要）、输入大小、增删两个数拼成；路径缺席时另两块照旧显示，原因见上面输入大小那段
	// 行尾那截数字外仍套着 TextShimmer：运行态整行扫光照旧，而它活动期间会把复合子节点另渲染一棵惰性副本
	// （平台契约里那是给纯展示子节点准备的），两份同帧挂载、值同源，动画因此同步，代价是动画期间叠了一层透明度
	const collapsedContent = summaryText === "" && inputSizeText === null && shownTotals === null ? null : (
		<>
			{/* 分隔点是标题与路径之间的那颗点，没有路径时它不该单独出现 */}
			{summaryText !== "" && (
				<>
					<span className={FILE_SEP_CLASS} aria-hidden/>
					{linkAvailable ? (
						<button type="button" className={FILE_LINK_CLASS} onClick={onClickFileLink} onKeyDown={onKeyDownFileLink}>
							<TextShimmer active={running}>{summaryText}</TextShimmer>
						</button>
					) : (
						<span className={summaryClassName(displayRow.state)}>
							<TextShimmer active={running}>{summaryText}</TextShimmer>
						</span>
					)}
				</>
			)}
			{(inputSizeText !== null || shownTotals !== null) && (
				<span className={FILE_SUFFIX_CLASS}>
					{inputSizeText !== null && (
						<TextShimmer className={FILE_STAT_CLASS} active={running}>{inputSizeText}</TextShimmer>
					)}
					{shownTotals !== null && (
						<>
							<TextShimmer className={FILE_STAT_CLASS + " " + FILE_ADD_CLASS} active={running}>
								<DigitReel
									text={"+" + shownTotals.added}
									prefix="+"
									suffix=""
									rolling
									cadence={cadence}
									spoken
								/>
							</TextShimmer>
							<TextShimmer className={FILE_STAT_CLASS + " " + FILE_DEL_CLASS} active={running}>
								<DigitReel
									text={"-" + shownTotals.removed}
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

	const expandedContent = open ? (
		<div className={FILE_BODY_CLASS}>
			{hunkList !== null ? (
				<DiffBlock diffs={hunkList} labels={diffLabels} maxLines={CHAT_DIFF_MAX_LINES} className={FILE_DIFF_CLASS}/>
			) : (
				<div className={FILE_IO_CLASS}>
					{displayRow.bodyRaw !== null && (
						<div className={FILE_IO_SECTION_CLASS}>
							<span className={FILE_IO_LABEL_CLASS}>{t("row.input")}</span>
							<span className={FILE_IO_TEXT_CLASS}>{displayRow.bodyRaw}</span>
						</div>
					)}
					{displayRow.bodyRaw !== null && displayRow.output !== null && (
						<span className={FILE_IO_DIVIDER_CLASS} aria-hidden/>
					)}
					{displayRow.output !== null && (
						<div className={FILE_IO_SECTION_CLASS}>
							<span className={FILE_IO_LABEL_CLASS}>{t("row.output")}</span>
							<span className={FILE_IO_TEXT_CLASS} data-error={displayRow.state === "error" || undefined}>
								{displayRow.output}
							</span>
						</div>
					)}
				</div>
			)}
			{inspect !== undefined && (
				<button type="button" className={FILE_INSPECT_CLASS} onClick={inspect}>
					<IconInspectOutlineRegular/>
					{t("row.inspect")}
				</button>
			)}
		</div>
	) : undefined

	return (
		<div className={FILE_ROW_CLASS} data-variant={displayRow.variant} data-tool={toolName} data-state={displayRow.state}>
			{statusText !== null && <span className={FILE_HIDDEN_CLASS}>{statusText}</span>}
			<DisclosureRow
				rowClassName={FILE_ROW_LINE_CLASS}
				leadingClassName={FILE_LEADING_CLASS}
				titleClassName={FILE_TITLE_CLASS}
				chevronClassName={FILE_CHEVRON_CLASS}
				icon={FILE_ICON}
				title={t(displayRow.titleKey)}
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

// 调用头：工具名与原始参数 JSON
interface ToolCallHead {
	name: string
	argsRaw: string
}

/**
 * 参数视图：dsh 0.2.1-alpha.1 起每个阶段都提供它，准备态可能还不完整
 *
 * 这里只复述这一行用到的读法：client bundle 必须自包含，不 import 平台包
 */
interface ToolArgs {
	has(key: string): boolean
	// 字段的收尾定界符到了没有，没到说明文本还缺尾巴
	complete(key: string): boolean
	text(key: string): string | undefined
	stringLength(key: string, options?: {step?: number; offset?: number}): number | undefined
}

// 参数还在流进来的准备态
interface PreparingToolCall {
	phase: "preparing"
	callId: string
	parentCallId?: string | undefined
	name: string
	// 参数视图在这里就可用，但准备态可能还没收全；旧版 dsh 没有它
	args?: ToolArgs | undefined
}

// 已派发、仍在跑的那一次调用
interface StartedToolCall {
	phase: "start"
	callId: string
	parentCallId?: string | undefined
	name: string
	argsRaw: string
	args?: ToolArgs | undefined
}

// 结果里的一个内容块；这一行只区分文本与其余
interface ContentBlock {
	type: string
	text?: string | undefined
}

// 结构化失败信息
interface ToolCallError {
	name: string
	code: string
	reason?: unknown
}

// 已结算的结果节点
interface ToolResultNode {
	kind: "tool-result"
	callId: string
	parentCallId?: string | undefined
	args?: ToolArgs | undefined
	// 窗口丢掉了调用头时为 null，结果本身仍可渲染
	call: ToolCallHead | null
	content: readonly ContentBlock[]
	isError: boolean
	error?: ToolCallError | undefined
	// 结果元数据；PTC 子调用不带它
	meta?: unknown
}

// 一次调用的三种形态，按 kind 判别是否已结算
type ToolCallBlock = PreparingToolCall | StartedToolCall | ToolResultNode

// 行状态，与内置 ToolRowState 同名同义
type RowState = "preparing" | "running" | "ok" | "error" | "stopped"

// 这一行渲染需要的全部派生结果
interface RowModel {
	titleKey: string
	variant: "edit" | "write"
	summary: string
	filePath: string | undefined
	bodyRaw: string | null
	output: string | null
	errorSummary: string | null
	state: RowState
	// 已收到的输入大小（KB）；参数视图缺席或还没有内容字段时为 null
	kilobytes: number | null
}

/**
 * 派生这一行要展示的改动：未结算时只有参数可用，结算之后优先用结果元数据里真实应用的 hunks
 *
 * 与内置 diff-card-model 只有一处不同：不排除子调用（见模块注释）
 */
function diffHunks(block: ToolCallBlock, parsedArgs: Record<string, unknown> | null): DiffHunk[] | null {
	if (!("kind" in block)) {
		// 准备态不产出 hunks：那两个数由 rowTotals 直接读参数视图给出，而这一份半截内容摊成 diff
		// 只会被读成改完了（准备态本来也不给展开）
		if (block.phase === "preparing") return null
		// 开关关掉时这一支与接管之前逐字一样：派发后只看参数 JSON
		if (!liveDiffEnabled()) return intendedHunks(block.name, parsedArgs)
		return intendedHunks(block.name, parsedArgs) ?? streamedHunks(block.name, block.args)
	}
	if (block.isError) return null
	const metaHunks = appliedHunks(block.meta)
	if (metaHunks !== null && metaHunks !== "empty") return metaHunks
	// 子调用不持久化 presentationMeta，结算之后拿不到实际应用了什么，只能拿参数说话：
	// write 的参数就是整份内容，edit 的参数就是那一对替换（replace_all 或写入失败时可能与实际不符）
	if (block.call === null) return null
	return intendedHunks(block.call.name, parsedArgs)
}

// 从调用参数派生改动：write 是整份内容，edit 是那一对替换
// 参数这一侧不校验沙箱升级字段：dsh 0.2.1-alpha.1 把这道校验从客户端删掉了，它取决于会话沙箱模式、
// 只有 Host 知道，客户端自己猜只会误杀合法行；它与内置同序，只看路径与字段类型
function intendedHunks(name: string, parsedArgs: Record<string, unknown> | null): DiffHunk[] | null {
	if (parsedArgs === null) return null
	const path = pickString(parsedArgs, ["path", "file_path"])
	if (path === undefined) return null
	if (name === "write") {
		const content = parsedArgs.content
		return typeof content === "string" ? [{path, oldText: null, newText: content}] : null
	}
	if (name !== "edit") return null
	const oldText = parsedArgs.old_string
	const newText = parsedArgs.new_string
	if (typeof oldText !== "string" || typeof newText !== "string") return null
	const replaceAll = parsedArgs.replace_all
	if (replaceAll !== undefined && typeof replaceAll !== "boolean") return null
	return [{path, oldText: oldText === "" ? null : oldText, newText}]
}

// 从参数视图派生改动：准备态唯一拿得到的材料就是视图给出的字段文本，已解码，可能还没收尾
// write 用已收到的那一截内容，与结算后 diffTotals 的计数恒等；edit 要两个字段都收尾才画，
// 行级匹配在部分文本上没有稳定答案，半截 new 会先被算成删除、等字段收尾又变回来，宁可不画
function streamedHunks(name: string, view: ToolArgs | undefined): DiffHunk[] | null {
	if (view === undefined) return null
	const path = viewPath(view)
	if (path === undefined) return null
	if (name === "write") {
		if (!view.has("content")) return null
		const content = view.text("content")
		return content === undefined ? null : [{path, oldText: null, newText: content}]
	}
	if (name !== "edit") return null
	if (!view.complete("old_string") || !view.complete("new_string")) return null
	const oldText = view.text("old_string")
	const newText = view.text("new_string")
	if (oldText === undefined || newText === undefined) return null
	return [{path, oldText: oldText === "" ? null : oldText, newText}]
}

// 读结果元数据里真实应用的 hunks：empty 是元数据明确说没有改动，null 是不可用
function appliedHunks(meta: unknown): DiffHunk[] | "empty" | null {
	if (typeof meta !== "object" || meta === null || Array.isArray(meta)) return null
	const diffs = (meta as Record<string, unknown>).diffs
	if (!Array.isArray(diffs)) return null
	if (diffs.length === 0) return "empty"
	const hunkList: DiffHunk[] = []
	for (const hunk of diffs) {
		if (typeof hunk !== "object" || hunk === null) return null
		const {path, oldText, newText} = hunk as Record<string, unknown>
		if (typeof path !== "string") return null
		if (oldText !== null && typeof oldText !== "string") return null
		if (typeof newText !== "string") return null
		hunkList.push({path, oldText, newText})
	}
	return hunkList
}

function rowModel(
	toolName: string,
	block: ToolCallBlock,
	parsedArgs: Record<string, unknown> | null,
	cwd: string | undefined,
	home: string | undefined,
): RowModel {
	const settled = "kind" in block
	const head = callHead(block)
	let state: RowState
	if (!settled) {
		state = block.phase === "preparing" ? "preparing" : "running"
	} else if (block.error?.code === "interrupted") {
		state = "stopped"
	} else {
		state = block.isError ? "error" : "ok"
	}
	const path = argumentPath(block, parsedArgs)
	const output = settled ? resultText(block) || null : null
	return {
		titleKey: toolName === "write" ? "tool.title.write" : "tool.title.edit",
		variant: toolName === "write" ? "write" : "edit",
		summary: path === undefined ? "" : shortenPath(path, cwd, home),
		filePath: path,
		bodyRaw: head === null || head.argsRaw === "" ? null : head.argsRaw,
		output,
		errorSummary: state === "error" && output !== null ? firstLine(output) : null,
		state,
		kilobytes: contentKilobytes(block.args),
	}
}

// 把一次结算结果摊成展示文本：文本块原样，其余块转成 JSON
function resultText(node: ToolResultNode): string {
	const partList: string[] = []
	for (const block of node.content) {
		if (block.type === "text" && typeof block.text === "string") {
			partList.push(block.text)
			continue
		}
		partList.push(JSON.stringify(block, null, 2))
	}
	if (partList.length === 0 && node.error !== undefined) partList.push(node.error.name + ": " + node.error.code)
	return partList.join("\n")
}

// 调用头：已结算的看结果节点带回的那一份，仍在跑的看它自己的参数，准备态还没有
function callHead(block: ToolCallBlock): ToolCallHead | null {
	if ("kind" in block) return block.call
	return block.phase === "start" ? {name: block.name, argsRaw: block.argsRaw} : null
}

// 解析原始参数 JSON：流式中途截断或不是对象时给 null
function parseArgs(argsRaw: string): Record<string, unknown> | null {
	let parsedJson: unknown
	try {
		parsedJson = JSON.parse(argsRaw)
	} catch {
		return null
	}
	if (typeof parsedJson !== "object" || parsedJson === null || Array.isArray(parsedJson)) return null
	return parsedJson as Record<string, unknown>
}

// 按顺序取第一个非空字符串字段
function pickString(parsedArgs: Record<string, unknown>, keys: readonly string[]): string | undefined {
	for (const key of keys) {
		const fieldValue = parsedArgs[key]
		if (typeof fieldValue === "string" && fieldValue !== "") return fieldValue
	}
	return undefined
}

// 目标路径：先读参数视图（准备态可能还不完整），再退回派发后的原始参数
function argumentPath(block: ToolCallBlock, parsedArgs: Record<string, unknown> | null): string | undefined {
	return viewPath(block.args) ?? (parsedArgs === null ? undefined : pickString(parsedArgs, ["path", "file_path"]))
}

// 路径的视图读法，与内置的文件变更行同一条规则：字段收尾了才算数，解码失败（转义不完整）也当没有
function viewPath(view: ToolArgs | undefined): string | undefined {
	if (view === undefined) return undefined
	for (const key of ["path", "file_path"]) {
		if (!view.has(key) || !view.complete(key)) continue
		const text = view.text(key)
		if (text !== undefined && text !== "") return text
	}
	return undefined
}

// 已收到的输入大小（KB）：内容字段的解码长度之和，口径与内置的文件变更行一致
// 正在流进来的那个字段按已收到的部分算，收完的按整段算；一个内容字段都还没出现时给 null，行头不摆 0KB
function contentKilobytes(view: ToolArgs | undefined): number | null {
	if (view === undefined) return null
	const streamingField = CONTENT_FIELDS.find(key => view.has(key) && !view.complete(key))
	const closedLength = CONTENT_FIELDS.reduce((total, key) => key !== streamingField && view.complete(key)
		? total + (view.stringLength(key, {step: KILOBYTE}) ?? 0)
		: total, 0)
	const rememberedKilobytes = kilobyteMap.get(view)
	let nextKilobytes: number | null
	if (streamingField === undefined) {
		nextKilobytes = CONTENT_FIELDS.some(key => view.has(key)) ? Math.ceil(closedLength / KILOBYTE) : null
	} else {
		const streamedLength = view.stringLength(streamingField, {step: KILOBYTE, offset: closedLength}) ?? 0
		nextKilobytes = Math.ceil((closedLength + streamedLength) / KILOBYTE)
	}
	if (nextKilobytes === null) return rememberedKilobytes ?? null
	// 解码一时读不出来时 stringLength 给 undefined，上面按 0 计，那会让这个数掉回来；
	// 参数只追加，它本该只往上长，所以拿上一次的数兜底、取两者的较大值
	const stableKilobytes = rememberedKilobytes === undefined ? nextKilobytes : Math.max(rememberedKilobytes, nextKilobytes)
	kilobyteMap.set(view, stableKilobytes)
	return stableKilobytes
}

// 每份参数视图、每个字段一份行数记忆：视图是原地追加的，所以只数新来的那一截
// 键必须带上字段名，edit 那一对字段各数各的，共用一个键会互相算错
const lineCountMap = new WeakMap<object, Map<string, {length: number, lines: number}>>()

// 每份参数视图一份 KB 记忆，用来兜住解码一时读不出来的那些帧，不让这个数回落
const kilobyteMap = new WeakMap<object, number>()

// 内容字段已收到的行数，按 dsh 自己的口径：末尾那个换行是行终止符、不算新的一行，正文为空是零行
// 流式期每一批都要问一次，所以记住上一次数到哪、数出多少行，只扫新来的后缀；视图被换成新的一份
// （字段收尾，或 settle 用权威文本替换）时记忆自然落空，整段重数一次
function streamedLineCount(view: ToolArgs | undefined, key: string): number {
	if (view === undefined) return 0
	let memory = lineCountMap.get(view)
	if (memory === undefined) {
		memory = new Map()
		lineCountMap.set(view, memory)
	}
	const remembered = memory.get(key)
	const text = view.text(key)
	// 转义序列还在路上时这个字段解码不出来，那不能读成这一段是空的：参数只追加，归零就是一次假的回落
	if (text === undefined) return remembered?.lines ?? 0
	const body = text.endsWith("\n") ? text.slice(0, -1) : text
	if (body === "") return 0
	let lines = remembered?.lines ?? 1
	for (let at = remembered?.length ?? 0; at < body.length; at++) if (body[at] === "\n") lines++
	memory.set(key, {length: body.length, lines})
	return lines
}

// 行尾那两个数：开关开着时准备态走 streamedTotals 只看参数视图，其余情形与内置同序
function rowTotals(block: ToolCallBlock, hunkList: DiffHunk[] | null): {added: number, removed: number} | null {
	if (!("kind" in block) && block.phase === "preparing" && liveDiffEnabled()) {
		return streamedTotals(block.name, block.args)
	}
	if (hunkList === null) return null
	return diffTotals(hunkList)
}

// 准备态那两个数：write 是已收到的内容行数对 0，edit 是已收到的新文本行数对旧文本行数，两段各自数原始行数，
// 所以都只往上长，结算之后再按真实 diff 修正一次（行级 diff 在部分文本上没有稳定答案，不用它）
//
// 两个字段各自到、各自开始数，不等另一半：等齐才画意味着要等参数里靠后的那个字段，实测滞后 4.5–6.8 s
// （同一段参数流里 KB 在 96 ms 就显示）；先到的那一半先报数，等齐反而会把数过的那一半重报一次，读数往回跳
function streamedTotals(name: string, view: ToolArgs | undefined): {added: number, removed: number} | null {
	if (view === undefined) return null
	if (name === "write") {
		return view.has("content") ? {added: streamedLineCount(view, "content"), removed: 0} : null
	}
	if (name !== "edit") return null
	const hasOld = view.has("old_string")
	const hasNew = view.has("new_string")
	if (!hasOld && !hasNew) return null
	return {
		added: hasNew ? streamedLineCount(view, "new_string") : 0,
		removed: hasOld ? streamedLineCount(view, "old_string") : 0,
	}
}

// 把绝对路径缩成读者更容易对上的形状：先相对会话工作区，再把残留的主目录前缀写成 ~
function shortenPath(path: string, cwd: string | undefined, home: string | undefined): string {
	if (cwd !== undefined && cwd !== "" && path.startsWith(cwd)) {
		const relativePath = path.slice(cwd.length).replace(/^[\\/]+/, "")
		if (relativePath !== "") return relativePath
	}
	if (home !== undefined && home !== "" && path.startsWith(home)) {
		const afterHome = path.slice(home.length)
		if (afterHome === "" || afterHome.startsWith("/") || afterHome.startsWith("\\")) return "~" + afterHome.replace(/\\/g, "/")
	}
	return path
}

// 取一段文本的第一行
function firstLine(text: string): string {
	const lineBreakAt = text.indexOf("\n")
	return lineBreakAt === -1 ? text : text.slice(0, lineBreakAt)
}

// 摘要那半截的类名：失败与中断各自带自己的状态色
function summaryClassName(state: RowState): string {
	if (state === "error") return FILE_SUMMARY_CLASS + " " + FILE_ERROR_CLASS
	if (state === "stopped") return FILE_SUMMARY_CLASS + " " + FILE_STOPPED_CLASS
	return FILE_SUMMARY_CLASS
}

// 读屏用的状态文本：图标与扫光都不表达状态，这句话替它们说；跑完与正常时不播报
function stateLabel(state: RowState, t: Translate): string | null {
	if (state === "running") return t("row.running")
	if (state === "error") return t("row.failed")
	if (state === "stopped") return t("row.stopped")
	return null
}

// diff 卡片自己要的 chrome 文案
function diffBlockLabels(t: Translate): DiffBlockLabels {
	return {
		codeLabel: t("codeBlock.title"),
		wrapLabel: t("codeBlock.wrap"),
		unwrapLabel: t("codeBlock.unwrap"),
		copy: t("copy"),
		copied: t("copied"),
		collapseAria: t("diff.collapseAria"),
		expandAria: hidden => t("diff.expandAria", {count: hidden}),
		collapse: t("collapse"),
		expand: hidden => t("diff.expandRest", {count: hidden}),
	}
}
