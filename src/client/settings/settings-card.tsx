/**
 * 插件管理页上的插件配置卡片。
 *
 * dsh 0.1.6 起把一个 bundle 自己的配置渲染在 bundle 的页面上、plugins.bundle.config 座位里、按包名 keyed；
 * 标题与面包屑由页面画，这里只是 view 为 page 时的那张表单
 *
 * 零件全是平台自带的：开关是 ui-primitives 的 Switch，档位是同一个包里的 SegmentedControl，覆盖徽标是 Tag，
 * 字段节奏与 --dsw-* 令牌见 config-card-styles.ts
 *
 * 开关与档位点一下即写，写入在途时控件禁用；点完之后从 host 读回来的值才算数，写入本身会吞掉传输层与版本号的失败。
 * 冒头那十个参数是滑杆，冒出那一段的缓动是一张可以拖的曲线图：改的时候只动本地的草稿，松手或停手一小会儿才写一次，
 * host 接受之后草稿撤掉、以读回的值为准
 */
import {useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore} from "react"
import type {KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement} from "react"
import {SegmentedControl, Switch, Tag} from "@deepseek-ai/dsh-client-ui-primitives"
import type {SegmentedControlOption} from "@deepseek-ai/dsh-client-ui-primitives"
import type {CaretMotionMode} from "../chat/caret/caret-motion"
import {bernsteinWeight, createTravelCurve, CURVE_GAP} from "./bubble-curve"
import {CARD_CLASS} from "./config-card-styles"
import {
	DEFAULT_AUTO_FOLD, DEFAULT_BUBBLE_RISE, DEFAULT_CARET_MOTION, DEFAULT_COMPOSER_GLASS, DEFAULT_CONTEXT_PIE,
	DEFAULT_FOLLOW_ON_APPEAR, DEFAULT_HIT_REEL, DEFAULT_LIVE_DIFF, DEFAULT_SEND_FLIGHT, readBubbleTuning,
} from "./settings-scope"
import type {BubbleRiseTuning, ChatUxSection, ConfigForm, LocaleLike} from "./settings-scope"

// 设置分节里的字段名，必须与 host 侧 index.ts 的 schema 一致
const AUTO_FOLD_FIELD = "autoFold"
const CARET_FIELD = "caretMotion"
const HIT_REEL_FIELD = "hitReel"
const CONTEXT_PIE_FIELD = "contextPie"
const COMPOSER_GLASS_FIELD = "composerGlass"
const LIVE_DIFF_FIELD = "liveDiff"
const FOLLOW_FIELD = "followOnAppear"
const SEND_FLIGHT_FIELD = "sendFlight"
const BUBBLE_RISE_FIELD = "bubbleRise"
const BUBBLE_EMERGE_SCALE_FIELD = "bubbleEmergeScale"
const BUBBLE_REVEAL_FIELD = "bubbleReveal"
const BUBBLE_OUTDENT_FIELD = "bubbleOutdent"
const BUBBLE_TOTAL_MS_FIELD = "bubbleTotalMs"
const BUBBLE_CURVE_X_FIELD = "bubbleCurveX"
const BUBBLE_CURVE_Y_FIELD = "bubbleCurveY"

// 拖动之后停手这么久就写一次；写盘太频繁没有意义，松手那一刻还会立刻补一次
const TUNING_WRITE_DELAY_MS = 220

// 参数键到 host 字段名的翻译表：滑杆与曲线图都按它写盘，被拒时也按它找回草稿
const BUBBLE_TUNING_FIELDS: Record<keyof BubbleRiseTuning, string> = {
	emergeScale: BUBBLE_EMERGE_SCALE_FIELD,
	reveal: BUBBLE_REVEAL_FIELD,
	outdent: BUBBLE_OUTDENT_FIELD,
	totalMs: BUBBLE_TOTAL_MS_FIELD,
	curveX: BUBBLE_CURVE_X_FIELD,
	curveY: BUBBLE_CURVE_Y_FIELD,
}

// 曲线图纵轴能拖到的范围：0 到 1 之外各留一点看得见的余量，负值是退回输入区里，越过 1 就是冲过落点
const CURVE_Y_MIN = -0.15
const CURVE_Y_MAX = 1.3

// 冒头参数里落成滑杆的那几个：曲线之外都是数，滑杆只管这几个
type BubbleNumberKey = {
	[K in keyof BubbleRiseTuning]: BubbleRiseTuning[K] extends number ? K : never
}[keyof BubbleRiseTuning]

// 一根滑杆：参数键、范围与单位，字段名查上面那张表
interface BubbleTunerSpec {
	readonly key: BubbleNumberKey
	readonly min: number
	readonly max: number
	readonly step: number
	readonly digits: number
	// 单位直接拼在读数后面："×" 不带空格，像素与毫秒各带一个
	readonly suffix: string
}

// 顺序照那份 demo 的面板：先起手那三个，再整段多长；曲线在那张图上，不占滑杆
const BUBBLE_TUNERS: readonly BubbleTunerSpec[] = [
	{key: "emergeScale", min: 0.2, max: 2, step: 0.01, digits: 2, suffix: "×"},
	{key: "reveal", min: 0, max: 120, step: 1, digits: 0, suffix: " px"},
	{key: "outdent", min: 0, max: 40, step: 1, digits: 0, suffix: " px"},
	{key: "totalMs", min: 100, max: 3000, step: 10, digits: 0, suffix: " ms"},
]

// 一种语言的文案
interface Copy {
	summary: () => string
	autoFoldLabel: string
	autoFoldHint: string
	followLabel: string
	followHint: string
	caretLabel: string
	caretHint: string
	caretOff: string
	caretMove: string
	caretTyping: string
	reelLabel: string
	reelHint: string
	pieLabel: string
	pieHint: string
	glassLabel: string
	glassHint: string
	liveDiffLabel: string
	liveDiffHint: string
	sendFlightLabel: string
	sendFlightHint: string
	bubbleLabel: string
	bubbleHint: string
	tuningSummary: string
	tuningHint: string
	curveLabel: string
	curveHint: string
	curveHandle: (index: number) => string
	tuningReset: string
	tuners: Record<BubbleNumberKey, string>
	overridden: string
	reset: string
	failed: string
	unavailable: string
	readOnly: string
}

const ZH_COPY: Copy = {
	summary: () => "光标动效、读数、输入框玻璃与发送气泡都在这里调。",
	autoFoldLabel: "自动开合",
	autoFoldHint:
		"思考时思考行自己展开、思考结束就收起；工具调用开始时过程组自己打开、这一段跑完再收起。"
		+ "你自己动手折叠过的，它不再打扰。",
	followLabel: "工具行跟随",
	followHint:
		"工具调用和新出现的思考行一到，滚动条就自己跟到底，新内容不会落到看不见的地方。"
		+ "你自己往上翻的时候它一概不动，回到最下面又接着跟。",
	caretLabel: "光标动效",
	caretHint:
		"输入光标滑到新位置，而不是直接跳过去。「移动时」只在方向键、点击这类明确移动时滑动，"
		+ "打字瞬时；「无论何时」连打字也一起滑。关掉就用浏览器原本的光标。",
	caretOff: "关",
	caretMove: "移动时",
	caretTyping: "无论何时",
	reelLabel: "命中率转轮",
	reelHint:
		"输入框下方那枚胶囊里的命中率变化时，变了的那几位数字在原地弹一下就落到新读数——"
		+ "新的从下方一点落回来，旧的朝反方向淡出。关掉就直接换成新数字。",
	pieLabel: "上下文占用饼",
	pieHint:
		"输入框下方那圈上下文占用环换成一枚实心饼，按占用多少取色；已占用那一角沿折线切开、推开一点，"
		+ "像从盘子里切下来的一块。关掉就回到 dsh 原来的环。",
	glassLabel: "输入框毛玻璃",
	glassHint:
		"输入框那一块带一条蓝调渐变，底微微透出背后的一点色调，玻璃的亮边与内阴影也在这里；"
		+ "右下角那枚发送（跑起来时是停止）与左下角那枚加号跟着同一套材质。关掉就回到 dsh 原来的输入框与按钮。",
	liveDiffLabel: "实时改动行数",
	liveDiffHint:
		"直接调用写入或编辑时，行尾那两个 +n -m 在内容还在流进来时就开始长，不必等整段写完才一起跳出来。"
		+ "数字一变，变了的那一位会像读数那样在原地弹到新值。",
	sendFlightLabel: "发送气泡形变",
	sendFlightHint:
		"发出之后整张输入卡片收成落点那条气泡：越收越窄、圆角跟着收，草稿的字换成气泡里的字。"
		+ "关掉就回到 dsh 原来的样子；这一项开着时「冒头」不生效。",
	bubbleLabel: "发送气泡冒头",
	bubbleHint:
		"发出之后，那一条先从输入框上沿探出来一点、微微一沉，再冲上去落到它该在的位置——落下时还冲过一点再收回来。"
		+ "关掉就直接出现在落点。",
	tuningSummary: "动效参数",
	tuningHint:
		"拖完就生效，不用保存，也不用刷新；下一次发送按新的走。整段只有一条曲线：起手多小、一开始露出多高一截、"
		+ "往右探多少、整段多长都在上面调，形状在那张图上拖。"
		+ "「右探出」超过 16 像素之后不再往外——那是滚动器给的内边距，再远就被裁掉了。",
	curveLabel: "行程曲线",
	curveHint:
		"横轴是整段走了几成，纵轴是行程：贴底是还整个藏在输入区后面，顶边那条线是落点，浅虚线是「露出一整截」的高度。"
		+ "曲线在那条虚线附近压平就是微顿，越过顶边就是冲过落点再落回来。六个白点横竖都能拖，曲线本身也能按住拖。",
	curveHandle: (index: number) => "第 " + index + " 个控制点",
	tuningReset: "全部恢复默认",
	tuners: {
		emergeScale: "起点大小",
		reveal: "露出高度",
		outdent: "右探出",
		totalMs: "总时长",
	},
	overridden: "已覆盖",
	reset: "重置",
	failed: "保存未生效，请重试。",
	unavailable: "这个页面暂时读不到本插件的配置，设置改不了。请确认插件已在当前环境启用，然后重新打开这一页。",
	readOnly: "当前设置不可修改，改动无法保存。",
}

const EN_COPY: Copy = {
	summary: () => "Caret motion, the readouts, the composer glass and the send bubble are all adjustable here.",
	autoFoldLabel: "Automatic folding",
	autoFoldHint:
		"A reasoning row opens while the model thinks and folds when thinking ends; a process group opens when a "
		+ "tool call starts and folds when that stretch ends. Anything you folded yourself is left alone.",
	followLabel: "Follow new rows",
	followHint:
		"When a tool call or a new reasoning row arrives, the scroll follows to the bottom so nothing lands "
		+ "out of sight. While you scroll up yourself it keeps still, and picks up again once you are back at "
		+ "the bottom.",
	caretLabel: "Caret motion",
	caretHint:
		`The text cursor slides to its new position instead of jumping. "On move" animates deliberate moves — arrow `
		+ `keys, clicks — and leaves typing instant; "On typing" animates typing too. Off keeps the browser's own cursor.`,
	caretOff: "Off",
	caretMove: "On move",
	caretTyping: "On typing",
	reelLabel: "Cache-hit reels",
	reelHint:
		"When the cache-hit rate in the pill below the composer changes, the digits that changed pop to their new "
		+ "values — each one drops back in from just below while the old digit fades out the other way. Off swaps "
		+ "the number instantly.",
	pieLabel: "Context pie",
	pieHint:
		"The context ring under the composer becomes a solid pie that takes its colour from how full the context "
		+ "is; the occupied slice is cut along a fold line and slides out a little, like a piece cut from a plate. "
		+ "Turning it off restores dsh's own ring.",
	glassLabel: "Composer glass",
	glassHint:
		"The composer carries its own blue gradient and lets a little of what sits behind it through; its "
		+ "highlight and inner shadow belong to this too, and the send button (stop while it runs) wears the "
		+ "same material. Turning it off restores dsh's own composer and button.",
	liveDiffLabel: "Live change counts",
	liveDiffHint:
		"When you write or edit a file directly, the +n -m at the end of the row starts growing while the content "
		+ "is still streaming, instead of appearing only once it finishes. A digit that changes pops to its new value "
		+ "the way the readouts do.",
	sendFlightLabel: "Send bubble morph",
	sendFlightHint:
		"Once sent, the whole composer card shrinks into the bubble that lands in the chat: it narrows, its corners "
		+ "close up, and the draft text hands over to the message text. Off restores dsh's own behaviour; while this "
		+ "is on, the rise below does not run.",
	bubbleLabel: "Send bubble rises",
	bubbleHint:
		"Once sent, the message first shows a sliver above the composer, sinks a touch, then rushes up to where it "
		+ "belongs — overshooting a little before it settles. Off puts it straight at its place.",
	tuningSummary: "Motion tuning",
	tuningHint:
		"Changes apply as you drag them — no save, no reload; the next send uses them. The whole rise is one curve: "
		+ "start size, how much shows at first, how far it leans out and total length are the sliders here, and the "
		+ "shape is dragged on the plot. Outdent stops moving past 16px — that is the inner padding of the scroller, "
		+ "and anything further is clipped.",
	curveLabel: "Travel curve",
	curveHint:
		"Across is how far the animation has got, up is how far the bubble has travelled: the bottom is still hidden "
		+ "behind the composer, the top line is its landing spot, and the dashed line is where a full sliver shows. "
		+ "Flat near that line is the pause; above the top line is the overshoot. The six dots move both ways, and the "
		+ "curve itself can be dragged too.",
	curveHandle: (index: number) => "Control point " + index,
	tuningReset: "Restore all defaults",
	tuners: {
		emergeScale: "Start size",
		reveal: "Reveal",
		outdent: "Outdent",
		totalMs: "Total length",
	},
	overridden: "Overridden",
	reset: "Reset",
	failed: "The save did not take effect. Please try again.",
	unavailable:
		"This page cannot read the plugin configuration right now, so settings cannot be changed. Check that the "
		+ "plugin is enabled in this environment, then open this page again.",
	readOnly: "These settings cannot be changed, so edits cannot be saved.",
}

// 插件管理页为一条 plugins.bundle.config 记录绑定的 props
export interface ChatUxConfigCardProps {
	// dsh-chat-ux 这一行的共享配置表单
	scope: ConfigForm<ChatUxSection>
	// locale 服务，部署里有的话
	locale?: LocaleLike | undefined
	// page 是要表单，summary 是标题下面那一行摘要
	view?: "summary" | "page" | undefined
}

// 渲染这个插件的配置：几个开关、光标动效的三档，以及冒头那十根滑杆；页面要摘要时只给那一行字
export function ChatUxConfigCard({scope, locale, view}: ChatUxConfigCardProps): ReactElement {
	const snapshot = useSyncExternalStore(
		useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
		() => scope.getSnapshot(),
	)
	// 跟着 host 的语言偏好走，每次切换都重新渲染；locale 服务缺席时问浏览器，认不出英文就落中文
	const subscribeLanguage = useCallback(
		(listener: () => void) => locale ? locale.subscribe(listener) : () => {},
		[locale],
	)
	const readLanguage = useCallback(() => locale ? locale.getSnapshot().active : null, [locale])
	const activeLanguage = useSyncExternalStore(subscribeLanguage, readLanguage)
	const browserLanguage = typeof navigator === "undefined" ? null : navigator.language
	// dsh 的活跃语言优先，zh-Hant 这类子标签按主语言归到中文；它缺席或拿不出内容时问浏览器语言，
	// 两条都认不出英文就用中文。dsh 自己把认不出的语言落回英文，这张卡片不跟它：中文是这套文案的主要读者
	const language = nonEmpty(activeLanguage) ?? nonEmpty(browserLanguage) ?? "zh"
	const copy = language.toLowerCase().split("-")[0] === "en" ? EN_COPY : ZH_COPY
	const [saving, setSaving] = useState(false)
	const [saveFailed, setSaveFailed] = useState(false)
	const fieldId = useId()

	// 滑杆拖动期间的本地值：host 接受之后撤掉，显示回到读回来的那一份
	const [draft, setDraft] = useState<Partial<BubbleRiseTuning>>({})
	const pendingWrites = useRef(new Map<string, unknown>())
	const flushTimer = useRef<number | null>(null)
	// 草稿只在 host 还没追上它的时候才有用：追上之后撤掉，显示回到读回来的那一份，
	// 别处改了同一份配置也不会被手里的旧值盖住
	useEffect(() => {
		const host = readBubbleTuning(snapshot.value)
		setDraft(current => {
			const kept: Partial<BubbleRiseTuning> = {}
			for (const key of Object.keys(current) as (keyof BubbleRiseTuning)[]) {
				if (current[key] === host[key]) continue
				keepEntry(kept, key, current[key])
			}
			return Object.keys(kept).length === Object.keys(current).length ? current : kept
		})
	}, [snapshot.value])

	const autoFoldOn = storedAutoFold(snapshot.value)
	const followOn = storedFollow(snapshot.value)
	const reelOn = storedHitReel(snapshot.value)
	const pieOn = storedContextPie(snapshot.value)
	const glassOn = storedGlass(snapshot.value)
	const liveDiffOn = storedLiveDiff(snapshot.value)
	const caretMode = storedCaret(snapshot.value)
	const sendFlightOn = storedSendFlight(snapshot.value)
	const bubbleRiseOn = storedBubbleRise(snapshot.value)
	const tuning: BubbleRiseTuning = {...readBubbleTuning(snapshot.value), ...draft}
	const unavailable = snapshot.status === "unavailable"
	const readOnly = snapshot.writable === false
	const controlsDisabled = saving || unavailable || readOnly
	const caretOptionList: readonly SegmentedControlOption<CaretMotionMode>[] = [
		{value: "off", label: copy.caretOff},
		{value: "move", label: copy.caretMove},
		{value: "typing", label: copy.caretTyping},
	]

	if (view === "summary") return <>{copy.summary()}</>
	// 没有东西服务的命名空间，给的是页面自己那些卡片给的同一行回答，而不是 host 会拒绝的控件
	if (unavailable) return <p className={CARD_CLASS.notice} role="status">{copy.unavailable}</p>

	// 写入一个字段，再从 host 读回来确认它真的落地了
	const writeField = async <T, >(
		field: string,
		next: T,
		readBack: (value: ChatUxSection | undefined) => T,
	): Promise<void> => {
		setSaving(true)
		setSaveFailed(false)
		const accepted = await scope.set(field, next)
		const landed = accepted && readBack(scope.getSnapshot().value) === next
		setSaveFailed(!landed)
		setSaving(false)
	}

	// 清掉用户层里的覆盖，让取值退回默认层
	const resetField = async (field: string): Promise<void> => {
		setSaving(true)
		setSaveFailed(false)
		await scope.unset(field)
		setSaveFailed(userLayerHasField(scope.getSnapshot().user, field))
		setSaving(false)
	}

	// 把这几次拖动攒下的字段一次写出去。被拒的那几个把草稿删掉，滑杆弹回真实值并给出失败提示；
	// 被接受的草稿先留着——host 的快照可能晚一拍才追上，这时撤草稿会让滑杆往回跳一帧
	const flushTuning = async (): Promise<void> => {
		flushTimer.current = null
		const entries = [...pendingWrites.current]
		pendingWrites.current.clear()
		if (entries.length === 0) return
		setSaveFailed(false)
		const accepted = await Promise.all(entries.map(([field, value]) => scope.set(field, value)))
		const rejected = new Set(entries.filter((_, index) => accepted[index] !== true).map(([field]) => field))
		if (rejected.size > 0) {
			setDraft(current => {
				const kept = {...current}
				for (const [key, field] of Object.entries(BUBBLE_TUNING_FIELDS) as [keyof BubbleRiseTuning, string][]) {
					if (rejected.has(field)) delete kept[key]
				}
				return kept
			})
			setSaveFailed(true)
		}
	}

	// 拖动只改本地；停手一小会儿或松手时再写，写盘频率与拖动次数无关
	const previewValues = (next: Partial<BubbleRiseTuning>): void => {
		setDraft(current => ({...current, ...next}))
		for (const [key, value] of Object.entries(next) as [keyof BubbleRiseTuning, unknown][]) {
			pendingWrites.current.set(BUBBLE_TUNING_FIELDS[key], value)
		}
		if (flushTimer.current !== null) window.clearTimeout(flushTimer.current)
		flushTimer.current = window.setTimeout(() => void flushTuning(), TUNING_WRITE_DELAY_MS)
	}

	// 一根滑杆只改一个键；曲线图的一个圆点改两个
	const previewTuning = (spec: BubbleTunerSpec, raw: number): void => {
		const next: Partial<BubbleRiseTuning> = {}
		next[spec.key] = roundToStep(raw, spec.step)
		previewValues(next)
	}

	const flushNow = (): void => {
		if (flushTimer.current === null) return
		window.clearTimeout(flushTimer.current)
		void flushTuning()
	}

	// 所有参数一起退回默认层
	const resetTuning = async (): Promise<void> => {
		if (flushTimer.current !== null) {
			window.clearTimeout(flushTimer.current)
			flushTimer.current = null
		}
		pendingWrites.current.clear()
		setSaving(true)
		setSaveFailed(false)
		const accepted = await Promise.all(Object.values(BUBBLE_TUNING_FIELDS).map(field => scope.unset(field)))
		setDraft({})
		setSaveFailed(accepted.some(landed => !landed))
		setSaving(false)
	}

	// 一行开关的骨架：标签、说明、覆盖徽标、控件；用户层盖过这个字段时才挂徽标与重置
	const rowChrome = (
		field: string,
		label: string,
		hint: string,
		control: ReactElement,
	): ReactElement => (
		<div className={CARD_CLASS.row}>
			<div className={CARD_CLASS.rowText}>
				<div className={CARD_CLASS.labelLine}>
					<span className={CARD_CLASS.label}>{label}</span>
				</div>
				<p className={CARD_CLASS.hint}>{hint}</p>
			</div>
			{userLayerHasField(snapshot.user, field) && (
				<span className={CARD_CLASS.badges}>
					<Tag tone="neutral">{copy.overridden}</Tag>
					<button
						type="button"
						className={CARD_CLASS.reset}
						disabled={controlsDisabled}
						onClick={() => void resetField(field)}
					>
						{copy.reset}
					</button>
				</span>
			)}
			{control}
		</div>
	)

	return (
		<div className={CARD_CLASS.form} data-plugin-config-form="dsh-chat-ux">
			{readOnly && <p className={CARD_CLASS.notice} role="status">{copy.readOnly}</p>}
			{rowChrome(AUTO_FOLD_FIELD, copy.autoFoldLabel, copy.autoFoldHint, (
				<Switch
					checked={autoFoldOn}
					disabled={controlsDisabled}
					label={copy.autoFoldLabel}
					onChange={(next: boolean) => void writeField(AUTO_FOLD_FIELD, next, storedAutoFold)}
				/>
			))}
			{rowChrome(FOLLOW_FIELD, copy.followLabel, copy.followHint, (
				<Switch
					checked={followOn}
					disabled={controlsDisabled}
					label={copy.followLabel}
					onChange={(next: boolean) => void writeField(FOLLOW_FIELD, next, storedFollow)}
				/>
			))}
			{rowChrome(CARET_FIELD, copy.caretLabel, copy.caretHint, (
				<SegmentedControl
					id={fieldId + "-caret"}
					value={caretMode}
					options={caretOptionList}
					onChange={(next) => void writeField(CARET_FIELD, next, storedCaret)}
					label={copy.caretLabel}
					disabled={controlsDisabled}
					className={CARD_CLASS.segment}
				/>
			))}
			{rowChrome(HIT_REEL_FIELD, copy.reelLabel, copy.reelHint, (
				<Switch
					checked={reelOn}
					disabled={controlsDisabled}
					label={copy.reelLabel}
					onChange={(next: boolean) => void writeField(HIT_REEL_FIELD, next, storedHitReel)}
				/>
			))}
			{rowChrome(CONTEXT_PIE_FIELD, copy.pieLabel, copy.pieHint, (
				<Switch
					checked={pieOn}
					disabled={controlsDisabled}
					label={copy.pieLabel}
					onChange={(next: boolean) => void writeField(CONTEXT_PIE_FIELD, next, storedContextPie)}
				/>
			))}
			{rowChrome(COMPOSER_GLASS_FIELD, copy.glassLabel, copy.glassHint, (
				<Switch
					checked={glassOn}
					disabled={controlsDisabled}
					label={copy.glassLabel}
					onChange={(next: boolean) => void writeField(COMPOSER_GLASS_FIELD, next, storedGlass)}
				/>
			))}
			{rowChrome(LIVE_DIFF_FIELD, copy.liveDiffLabel, copy.liveDiffHint, (
				<Switch
					checked={liveDiffOn}
					disabled={controlsDisabled}
					label={copy.liveDiffLabel}
					onChange={(next: boolean) => void writeField(LIVE_DIFF_FIELD, next, storedLiveDiff)}
				/>
			))}
			{rowChrome(SEND_FLIGHT_FIELD, copy.sendFlightLabel, copy.sendFlightHint, (
				<Switch
					checked={sendFlightOn}
					disabled={controlsDisabled}
					label={copy.sendFlightLabel}
					onChange={(next: boolean) => void writeField(SEND_FLIGHT_FIELD, next, storedSendFlight)}
				/>
			))}
			{rowChrome(BUBBLE_RISE_FIELD, copy.bubbleLabel, copy.bubbleHint, (
				<Switch
					checked={bubbleRiseOn}
					disabled={controlsDisabled}
					label={copy.bubbleLabel}
					onChange={(next: boolean) => void writeField(BUBBLE_RISE_FIELD, next, storedBubbleRise)}
				/>
			))}
			<details className={CARD_CLASS.tuning}>
				<summary className={CARD_CLASS.tuningSummary}>{copy.tuningSummary}</summary>
				<p className={CARD_CLASS.hint}>{copy.tuningHint}</p>
				<BubbleCurveEditor
					tuning={tuning}
					disabled={controlsDisabled}
					label={copy.curveLabel}
					hint={copy.curveHint}
					handleLabel={copy.curveHandle}
					onChange={previewValues}
					onCommit={flushNow}
				/>
				{BUBBLE_TUNERS.map(spec => {
					const value = tuning[spec.key]
					const label = copy.tuners[spec.key]
					return (
						<div className={CARD_CLASS.tuner} key={spec.key}>
							<span className={CARD_CLASS.tunerLabel}>{label}</span>
							<input
								type="range"
								className={CARD_CLASS.tunerInput}
								min={spec.min}
								max={spec.max}
								step={spec.step}
								value={value}
								disabled={controlsDisabled}
								aria-label={label}
								onChange={(event) => previewTuning(spec, Number(event.currentTarget.value))}
								onPointerUp={flushNow}
								onKeyUp={flushNow}
							/>
							<output className={CARD_CLASS.tunerValue}>{formatTuned(value, spec)}</output>
						</div>
					)
				})}
				<div className={CARD_CLASS.tuningActions}>
					<button
						type="button"
						className={CARD_CLASS.reset}
						disabled={controlsDisabled}
						onClick={() => void resetTuning()}
					>
						{copy.tuningReset}
					</button>
				</div>
			</details>
			{saveFailed && <p className={CARD_CLASS.failed} role="status">{copy.failed}</p>}
		</div>
	)
}

// 行程曲线：横轴 0..1 铺满整张图，纵轴按 CURVE_Y_MIN..CURVE_Y_MAX 换算成百分比
// 拖法与 .probe/想实现的气泡动效.html 里那张图一致：六个把手横纵都能拖，曲线本身也能按住拖
interface BubbleCurveEditorProps {
	// 当前这一份参数，草稿已经合进来了
	readonly tuning: BubbleRiseTuning
	// 卡片不可写时把手与曲线都拖不动
	readonly disabled: boolean
	readonly label: string
	readonly hint: string
	// 第几个控制点叫什么，给六个把手各自的无障碍名字
	readonly handleLabel: (index: number) => string
	// 拖动时每动一下交出去一次，写盘由外面按自己的节奏攒
	readonly onChange: (next: Partial<BubbleRiseTuning>) => void
	// 松手或按键结束的时候立刻补一次写
	readonly onCommit: () => void
}

// 曲线图现在能不能拖：开发阶段开着随时调；打包给读者时置成 false，图上只剩一条只读的曲线
const CURVE_EDITABLE = true

// 画那条线取多少个点：够平滑，又不至于每帧算太多
const CURVE_SAMPLES = 48

// 拖曲线时离拖动处越远的把手越少动：窗宽这么宽，远到两端基本不动
const CURVE_BEND_WIDTH = 0.3

// 指针纵向离曲线这么近才算按住了它，像素
const CURVE_PICK_PX = 10

// 曲线坐标写进配置时留三位小数：浮点尾巴不必带进配置里
const CURVE_DIGITS = 3

// 首尾两点钉死，只有中间这六个可以拖
const CURVE_HANDLES = [1, 2, 3, 4, 5, 6] as const

function BubbleCurveEditor({tuning, disabled, label, hint, handleLabel, onChange, onCommit}: BubbleCurveEditorProps): ReactElement {
	const plot = useRef<HTMLDivElement | null>(null)
	// 正在拖哪个把手：只决定下一次 move 改谁，不参与渲染
	const draggingHandle = useRef<number | null>(null)
	// 正在拖曲线本身：按各把手在拖动处的权重把纵向偏移摊下去
	const bendingCurve = useRef(false)
	// 这一份卡片现在能不能改：卡片本身不可写、或者发布版关掉了曲线编辑，都拖不动
	const editable = CURVE_EDITABLE && !disabled
	const curve = useMemo(() => createTravelCurve(tuning.curveX, tuning.curveY), [tuning.curveX, tuning.curveY])
	const outline = useMemo(() => {
		let path = ""
		for (let step = 0; step <= CURVE_SAMPLES; step++) {
			const progress = step / CURVE_SAMPLES
			path += (step === 0 ? "M " : " L ") + plotCurveX(progress) + " " + plotCurveY(curve.at(progress))
		}
		return path
	}, [curve])

	// 指针位置换算回曲线坐标：横轴铺满整张图，纵轴从下往上
	const readPoint = (event: {clientX: number; clientY: number}): {x: number; y: number} | null => {
		const rect = plot.current?.getBoundingClientRect()
		if (rect === undefined || rect.width === 0 || rect.height === 0) return null
		const ratio = (event.clientY - rect.top) / rect.height
		return {
			x: clampRange((event.clientX - rect.left) / rect.width, 0, 1),
			y: CURVE_Y_MAX - ratio * (CURVE_Y_MAX - CURVE_Y_MIN),
		}
	}

	// 一个把手的两维一起交出去：横坐标不越过相邻两点，纵坐标不出图的上下边
	const writeHandle = (index: number, point: {x: number; y: number}): void => {
		const lowest = (tuning.curveX[index - 1] ?? 0) + CURVE_GAP
		const highest = (tuning.curveX[index + 1] ?? 1) - CURVE_GAP
		const nextX = tuning.curveX.slice()
		const nextY = tuning.curveY.slice()
		nextX[index] = roundToDigits(clampRange(point.x, lowest, highest))
		nextY[index] = roundToDigits(clampRange(point.y, CURVE_Y_MIN, CURVE_Y_MAX))
		onChange({curveX: nextX, curveY: nextY})
	}

	// 拖曲线本身：这一点要挪多少，就按各把手在这里的权重摊下去，改动最小的那种分法
	const bendAt = (position: number, target: number): void => {
		const param = curve.paramAt(position)
		const share: number[] = []
		let norm = 0
		for (const index of CURVE_HANDLES) {
			const distance = (tuning.curveX[index] ?? position) - position
			const weight = bernsteinWeight(index, param) * Math.exp(-((distance / CURVE_BEND_WIDTH) ** 2))
			share[index] = weight
			norm += weight * weight
		}
		if (!(norm > 0)) return
		const delta = target - curve.at(position)
		const nextY = tuning.curveY.slice()
		for (const index of CURVE_HANDLES) {
			const moved = (nextY[index] ?? 0) + delta * (share[index] ?? 0) / norm
			nextY[index] = roundToDigits(clampRange(moved, CURVE_Y_MIN, CURVE_Y_MAX))
		}
		onChange({curveY: nextY})
	}

	const startHandle = (index: number) => (event: ReactPointerEvent<HTMLButtonElement>): void => {
		if (!editable) return
		// 别让这一下冒泡到图上，否则同一次按下会又被当成「拖曲线」
		event.stopPropagation()
		event.preventDefault()
		draggingHandle.current = index
		// 捕获挂在图上：指针拖到卡片外面也还能收到 move 与 up
		plot.current?.setPointerCapture(event.pointerId)
		const point = readPoint(event)
		if (point !== null) writeHandle(index, point)
	}

	// 按在曲线那一带上也是拖曲线：先把纵向偏差算出来，够近才开始
	const startBend = (event: ReactPointerEvent<HTMLDivElement>): void => {
		if (!editable) return
		const point = readPoint(event)
		if (point === null) return
		const rect = plot.current?.getBoundingClientRect()
		if (rect === undefined || rect.height === 0) return
		const tolerance = (CURVE_PICK_PX / rect.height) * (CURVE_Y_MAX - CURVE_Y_MIN)
		if (Math.abs(point.y - curve.at(point.x)) > tolerance) return
		event.preventDefault()
		bendingCurve.current = true
		plot.current?.setPointerCapture(event.pointerId)
		bendAt(point.x, point.y)
	}

	const moveDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
		const point = readPoint(event)
		if (point === null) return
		const handle = draggingHandle.current
		if (handle !== null) {
			writeHandle(handle, point)
			return
		}
		if (bendingCurve.current) bendAt(point.x, point.y)
	}

	const endDrag = (): void => {
		if (draggingHandle.current === null && !bendingCurve.current) return
		draggingHandle.current = null
		bendingCurve.current = false
		onCommit()
	}

	// 键盘也能挪：方向键一次 0.01，按住 Shift 一次 0.05
	const keyHandle = (index: number) => (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
		const delta = event.shiftKey ? 0.05 : 0.01
		const point = {x: tuning.curveX[index] ?? 0, y: tuning.curveY[index] ?? 0}
		if (event.key === "ArrowLeft") point.x -= delta
		else if (event.key === "ArrowRight") point.x += delta
		else if (event.key === "ArrowUp") point.y += delta
		else if (event.key === "ArrowDown") point.y -= delta
		else return
		event.preventDefault()
		writeHandle(index, point)
		onCommit()
	}

	return (
		<div className={CARD_CLASS.bezier}>
			<span className={CARD_CLASS.tunerLabel}>{label}</span>
			<div
				className={CARD_CLASS.bezierPlot}
				ref={plot}
				onPointerDown={startBend}
				onPointerMove={moveDrag}
				onPointerUp={endDrag}
				onPointerCancel={endDrag}
			>
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					<rect className={CARD_CLASS.bezierFrame} x={0} y={plotCurveY(1)} width={100} height={plotCurveY(0) - plotCurveY(1)} />
					<path className={CARD_CLASS.bezierCurve} d={outline} />
				</svg>
				{CURVE_HANDLES.map(index => (
					<button
						key={index}
						type="button"
						className={CARD_CLASS.bezierHandle}
						style={{
							left: plotCurveX(tuning.curveX[index] ?? 0) + "%",
							top: plotCurveY(tuning.curveY[index] ?? 0) + "%",
						}}
						disabled={!editable}
						aria-label={handleLabel(index)}
						onPointerDown={startHandle(index)}
						onKeyDown={keyHandle(index)}
					/>
				))}
			</div>
			<p className={CARD_CLASS.hint}>{hint}</p>
			<div className={CARD_CLASS.bezierReadout}>
				<div>{"X " + tuning.curveX.map(value => value.toFixed(CURVE_DIGITS)).join(", ")}</div>
				<div>{"Y " + tuning.curveY.map(value => value.toFixed(CURVE_DIGITS)).join(", ")}</div>
			</div>
		</div>
	)
}

// 横轴只认 0..1：这里就是时间进度，越界没有意义
function plotCurveX(value: number): number {
	return clampRange(value, 0, 1) * 100
}

// 纵轴按 CURVE_Y_MIN..CURVE_Y_MAX 铺满整张图，0 与 1 于是落在方框的上下边
function plotCurveY(value: number): number {
	return ((CURVE_Y_MAX - clampRange(value, CURVE_Y_MIN, CURVE_Y_MAX)) / (CURVE_Y_MAX - CURVE_Y_MIN)) * 100
}

// 曲线坐标收到三位小数，写进配置的数不带浮点尾巴
function roundToDigits(value: number): number {
	return Number(value.toFixed(CURVE_DIGITS))
}

// 一列一列地把草稿搬过去：键是联合类型，直接索引赋值会要求两条分支的值同时成立
function keepEntry<K extends keyof BubbleRiseTuning>(
	target: Partial<BubbleRiseTuning>,
	key: K,
	value: BubbleRiseTuning[K] | undefined,
): void {
	target[key] = value
}

function clampRange(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) return min
	return Math.min(max, Math.max(min, value))
}

// 滑杆给的是按步进对齐的原始数，浮点步进要收一次小数位，否则 host 的 schema 会因为差一滴滴判它不合法
function roundToStep(value: number, step: number): number {
	return step < 1 ? Number(value.toFixed(2)) : Math.round(value)
}

// 读数：整数部分按位数补齐，单位直接跟在后面
function formatTuned(value: number, spec: BubbleTunerSpec): string {
	return value.toFixed(spec.digits) + spec.suffix
}

function storedAutoFold(value: ChatUxSection | undefined): boolean {
	return value?.autoFold ?? DEFAULT_AUTO_FOLD
}

function storedFollow(value: ChatUxSection | undefined): boolean {
	return value?.followOnAppear ?? DEFAULT_FOLLOW_ON_APPEAR
}

function storedHitReel(value: ChatUxSection | undefined): boolean {
	return value?.hitReel ?? DEFAULT_HIT_REEL
}

function storedLiveDiff(value: ChatUxSection | undefined): boolean {
	return value?.liveDiff ?? DEFAULT_LIVE_DIFF
}

function storedContextPie(value: ChatUxSection | undefined): boolean {
	return value?.contextPie ?? DEFAULT_CONTEXT_PIE
}

function storedGlass(value: ChatUxSection | undefined): boolean {
	return value?.composerGlass ?? DEFAULT_COMPOSER_GLASS
}

function storedCaret(value: ChatUxSection | undefined): CaretMotionMode {
	return value?.caretMotion ?? DEFAULT_CARET_MOTION
}

function storedSendFlight(value: ChatUxSection | undefined): boolean {
	return value?.sendFlight ?? DEFAULT_SEND_FLIGHT
}

function storedBubbleRise(value: ChatUxSection | undefined): boolean {
	return value?.bubbleRise ?? DEFAULT_BUBBLE_RISE
}

function nonEmpty(value: string | null | undefined): string | undefined {
	if (typeof value !== "string" || value === "") return undefined
	return value
}

// 原始用户层里有没有这个字段：标记已覆盖看的是它在不在，而不是值比不比得上默认值，恰好等于默认值的覆盖也算覆盖
function userLayerHasField(user: unknown, field: string): boolean {
	if (typeof user !== "object" || user === null) return false
	return field in (user as Record<string, unknown>)
}
