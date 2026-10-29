/**
 * 输入框下方那枚「缓存命中」胶囊
 *
 * 遮蔽 dsh 在 conversation.composer.dock 上 id 为 usage 的那个座位重画一份：命中率恒取一位小数，
 * 按 90% 到 99% 的色阶取色，99.0 及以后一律深绿，判据用显示值本身。色标与插值在 cache-hit-styles，
 * 段标记与段内位置走 ../ramp
 *
 * 内置那一套类名带构建期 hash、组件也不在冻结的基座模块表里，拿不到，所以照着它的样子重画；
 * 弹窗定位与「点外面就关」复用 primitives 那两个共享钩子，行为与内置一致
 */
import {useEffect, useRef, useState, useSyncExternalStore} from "react"
import type {CSSProperties, MutableRefObject, ReactElement} from "react"
import {createPortal} from "react-dom"
import {
	IconDatabaseOutlineRegular, useAnchoredPosition, useDismissOnOutsidePointer,
} from "@deepseek-ai/dsh-client-ui-primitives"
import type {SlotsService} from "../file-mutation/file-mutation-row"
import {DEFAULT_HIT_REEL} from "../../settings/settings-scope"
import type {ChatUxSection, ConfigForm} from "../../settings/settings-scope"
import {
	CACHE_HIT_ANCHOR_CLASS, CACHE_HIT_DETAILS_CLASS, CACHE_HIT_LABEL_CLASS, CACHE_HIT_PANEL_CLASS,
	CACHE_HIT_PILL_CLASS, CACHE_HIT_READING_CLASS, CACHE_HIT_RULE_CLASS, CACHE_HIT_SEP_CLASS,
	CACHE_HIT_TITLE_CLASS, CACHE_HIT_TITLE_LABEL_CLASS, CACHE_HIT_TITLE_VALUE_CLASS,
} from "./cache-hit-styles"
import {RAMP_POSITION_VAR, RAMP_SPAN_ATTRIBUTE, rampPosition} from "../ramp"
import type {RampPosition} from "../ramp"
import {DigitReel} from "../reel/digit-reel"

// 锚点顶边与面板底边之间那道缝，与内置的 stat 弹窗同值
const PANEL_GAP = 8

// 面板与视口边缘留的余量，与内置的 stat 弹窗同值
const PANEL_MARGIN = 12

// 还没量出位置的那一帧：先按隐藏布局画出来，定位夹取才量得到真实尺寸
const MEASURE_STYLE: CSSProperties = {visibility: "hidden", left: 0, top: 0}

// 没读到 host 分节时的档位，与 dsh 自己的默认值一致
const DEFAULT_PERFORMANCE_USAGE = "detailed"

// dsh 那份「性能与用量」表单的条目 id
const CHAT_SETTINGS_NAMESPACE = "ui-chat"

// 本插件自己那一份表单的条目 id：数字滚动的开关在它上面
const PLUGIN_SETTINGS_NAMESPACE = "dsh-chat-ux"

// 一位小数：先算到千分之一，再落成文本
const PERCENT_UNITS_PER_TENTH = 1000

// 部分命中的上限：读作 100.0% 之前必须真的全中
const PERCENT_UNITS_CAP = 999

// token 计数的两个进位点，与 dsh 的 formatTokens 同规则
const THOUSAND = 1_000
const MILLION = 1_000_000

// 每三位一组，做精确计数的千分位
const GROUP_SIZE = 3

// 这一枚在 chat 命名空间里读文案
const CHAT_LOCALE_NAMESPACE = "chat"

// 座位 id 与顺序跟内置那一枚一模一样，遮蔽只靠更低的 priority
const USAGE_STAT_ID = "usage"
const USAGE_STAT_ORDER = 1

// 同一个 id 与 order 上 priority 最低的那个渲染，内置是 0
const USAGE_STAT_PRIORITY = -1

// dsh 的「性能与用量」档位：简洁只留命中率读数，详细另给 token 总量与明细
type PerformanceUsageMode = "compact" | "detailed"

// 命中率那六个色标在显示值上的位置，与样式表里那几段一一对应；末一个落在 99.0，之后一律深绿
const HIT_TONE_STOPS = [90, 92, 94, 96, 98, 99]

// token 用量投影里这一枚用到的几个桶
interface TokenUsageProjection {
	// 没命中缓存的那部分输入，按原价计费
	uncachedInputTokens: number
	cacheReadTokens: number
	cacheWriteTokens: number
	outputTokens: number
}

// 会话级的投影读取座位：按 key 取 Host 算好的值
type UseProjection = (key: "tokenUsage") => TokenUsageProjection | undefined

// chat 命名空间的文案座位
type Translate = (key: string, params?: Record<string, unknown>) => string

// 共享配置表单的提供者，收窄到本模块那一次读取
export interface ConfigFormsReader {
	get<T>(entryId: string): ConfigForm<T>
}

// 这一枚收到的载荷
export interface CacheHitPillProps {
	useProjection: UseProjection
	t: Translate
}

/**
 * 遮蔽 conversation.composer.dock 上的 usage 座位，换成自带一位小数与档位色的那一枚
 *
 * 档位读的是 dsh 自己那份 ui-chat 表单，而不是本插件的配置：简洁档只留命中率读数，详细档另加总量与明细
 */
export function installCacheHitPill(slots: SlotsService, configForms: ConfigFormsReader): void {
	slots.inject("conversation.composer.dock", () => {
		const releaseUsageMode = usageModeMirror.adopt(
			configForms.get<UsageSettingsSection>(CHAT_SETTINGS_NAMESPACE),
		)
		const releaseHitReel = hitReelMirror.adopt(configForms.get<ChatUxSection>(PLUGIN_SETTINGS_NAMESPACE))
		const releaseSeat = slots.register({
			name: "conversation.composer.dock",
			id: USAGE_STAT_ID,
			order: USAGE_STAT_ORDER,
			priority: USAGE_STAT_PRIORITY,
			locale: CHAT_LOCALE_NAMESPACE,
		}, CacheHitPill)
		return () => {
			releaseSeat()
			releaseUsageMode()
			releaseHitReel()
		}
	})
}

/**
 * 简洁档是静态读数，详细档是能点开明细的按钮
 * 这一场没有计过账时返回 null，与内置那条闸门一致
 */
export function CacheHitPill({useProjection, t}: CacheHitPillProps): ReactElement | null {
	const tokenUsage = useProjection("tokenUsage")
	const usageMode = useSyncExternalStore(usageModeMirror.subscribe, usageModeMirror.read)
	const rolling = useSyncExternalStore(hitReelMirror.subscribe, hitReelMirror.read)
	const [open, setOpen] = useState(false)
	const rootRef = useRef<HTMLSpanElement | null>(null)
	const panelRef = useRef<HTMLDivElement | null>(null)
	const panelStyle = useAnchoredPosition({
		open, anchorRef: rootRef, panelRef, side: "top", gap: PANEL_GAP, margin: PANEL_MARGIN,
	})
	useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
	useEscapeAndOutsideClick(open, setOpen, rootRef, panelRef)
	if (tokenUsage === undefined) return null
	// 三个互不重叠的输入计费桶之和：命中率与满量都按它算
	const billedInput = tokenUsage.uncachedInputTokens + tokenUsage.cacheReadTokens + tokenUsage.cacheWriteTokens
	if (billedInput === 0 && tokenUsage.outputTokens === 0) return null

	const hit = hitReading(tokenUsage.cacheReadTokens, billedInput)
	const icon = <IconDatabaseOutlineRegular/>
	const hitLabel = t("message.turnUsage.cacheHit")
	// 「缓存命中」这几个字与后面那串读数是一组，色阶就挂在这一组上，名字与读数因此同色
	// 数字滚动那一截自己不带颜色，从这一组继承
	const reading = hit === null ? null : (
		<span
			className={CACHE_HIT_READING_CLASS}
			{...{[RAMP_SPAN_ATTRIBUTE]: hit.tone.span}}
			style={{[RAMP_POSITION_VAR]: hit.tone.mix} as CSSProperties}
		>
			{hitLabel}{" "}
			<DigitReel text={hit.text} rolling={rolling} spoken/>
		</span>
	)

	if (usageMode === "compact") {
		if (reading === null) return null
		return (
			<span className={CACHE_HIT_ANCHOR_CLASS} data-composer-stat={USAGE_STAT_ID}>
				<span className={CACHE_HIT_PILL_CLASS}>
					{icon}
					<span className={CACHE_HIT_LABEL_CLASS}>{reading}</span>
				</span>
			</span>
		)
	}

	const total = billedInput + tokenUsage.outputTokens
	const totalText = t("message.turnUsage.count", {count: formatTokens(total, t)})
	const title = t("stats.dialog.usageTitle")
	const summary = hit === null ? totalText : totalText + " · " + hitLabel + " " + hit.text
	return (
		<span ref={rootRef} className={CACHE_HIT_ANCHOR_CLASS} data-composer-stat={USAGE_STAT_ID}>
			<button
				type="button"
				className={CACHE_HIT_PILL_CLASS}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-label={summary}
				onClick={() => setOpen(!open)}
			>
				{icon}
				<span className={CACHE_HIT_LABEL_CLASS}>
					{totalText}
					{reading !== null && (
						<>
							<span className={CACHE_HIT_SEP_CLASS} aria-hidden>·</span>
							{reading}
						</>
					)}
				</span>
			</button>
			{open && createPortal(
				<div
					ref={panelRef}
					className={CACHE_HIT_PANEL_CLASS}
					role="dialog"
					aria-label={title}
					style={panelStyle ?? MEASURE_STYLE}
				>
					<div className={CACHE_HIT_TITLE_CLASS}>
						<span className={CACHE_HIT_TITLE_LABEL_CLASS}>{icon}{title}</span>
						<span className={CACHE_HIT_TITLE_VALUE_CLASS}>{exactCount(total, t)}</span>
					</div>
					<div className={CACHE_HIT_RULE_CLASS} aria-hidden />
					<dl className={CACHE_HIT_DETAILS_CLASS}>
						{hit !== null && (
							<>
								<dt>{hitLabel}</dt>
								<dd>{hit.text}</dd>
							</>
						)}
						<dt>{t("message.turnUsage.input")}</dt>
						<dd>{exactCount(tokenUsage.uncachedInputTokens, t)}</dd>
						<dt>{t("message.turnUsage.cacheRead")}</dt>
						<dd>{exactCount(tokenUsage.cacheReadTokens, t)}</dd>
						{tokenUsage.cacheWriteTokens !== 0 && (
							<>
								<dt>{t("message.turnUsage.cacheWrite")}</dt>
								<dd>{exactCount(tokenUsage.cacheWriteTokens, t)}</dd>
							</>
						)}
						<dt>{t("message.turnUsage.output")}</dt>
						<dd>{exactCount(tokenUsage.outputTokens, t)}</dd>
					</dl>
				</div>,
				document.body,
			)}
		</span>
	)
}

// 命中率那一截的文本与色阶位置；没有计过价的输入时是 null
interface HitReading {
	// `97.3%` 这样的文本
	text: string
	// 读数落在色标的哪一段、段内位置多少
	tone: RampPosition
}

// 命中率读数：恒一位小数，同时给出色阶位置；没有计过价的输入时是 null
function hitReading(cacheReadTokens: number, billedInputTokens: number): HitReading | null {
	if (billedInputTokens === 0) return null
	// 先算千分之一的整数单位再落成文本，躲开浮点误差在 x.x5 上翻面
	const units = Math.round(cacheReadTokens * PERCENT_UNITS_PER_TENTH / billedInputTokens)
	// 部分命中不许读成满命中：舍进 100.0 但没有全中的压回 99.9
	const capped = cacheReadTokens < billedInputTokens && units > PERCENT_UNITS_CAP ? PERCENT_UNITS_CAP : units
	const percent = capped / 10
	return {text: percent.toFixed(1) + "%", tone: rampPosition(percent, HIT_TONE_STOPS)}
}

// 紧凑的 token 计数：517 / 12.2K / 517K / 1.2M，与 dsh 的 formatTokens 同规则
function formatTokens(value: number, t: Translate): string {
	if (value < THOUSAND) return String(value)
	if (value < MILLION) return t("number.thousand", {value: scaledCount(value / THOUSAND)})
	return t("number.million", {value: scaledCount(value / MILLION)})
}

// 进位之后的缩放数：过百取整，否则留一位小数
function scaledCount(value: number): string {
	return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
}

// 明细里的一行：精确计数，每三位一组，分隔符走 chat 自己的文案
function exactCount(value: number, t: Translate): string {
	const digits = String(value)
	const groups: string[] = []
	for (let end = digits.length; end > 0; end -= GROUP_SIZE) {
		groups.unshift(digits.slice(Math.max(0, end - GROUP_SIZE), end))
	}
	return t("message.turnUsage.count", {count: groups.join(t("number.groupSeparator"))})
}

/**
 * 明细面板的键盘与外部点击关闭，与内置的 stat 弹窗同一条规则：Escape 关，点到触发点与面板之外也关
 * 后者走捕获阶段，键盘激活旁边那个胶囊时这一颗先关掉，而不是两张面板叠在一起
 */
function useEscapeAndOutsideClick(
	open: boolean,
	setOpen: (open: boolean) => void,
	rootRef: MutableRefObject<HTMLSpanElement | null>,
	panelRef: MutableRefObject<HTMLDivElement | null>,
): void {
	useEffect(() => {
		if (!open) return
		const onKeyDown = (event: KeyboardEvent): void => {
			if (event.key === "Escape") setOpen(false)
		}
		const onClick = (event: MouseEvent): void => {
			if (event.target instanceof Node
				&& rootRef.current?.contains(event.target) !== true
				&& panelRef.current?.contains(event.target) !== true) {
				setOpen(false)
			}
		}
		document.addEventListener("keydown", onKeyDown)
		document.addEventListener("click", onClick, true)
		return () => {
			document.removeEventListener("keydown", onKeyDown)
			document.removeEventListener("click", onClick, true)
		}
	}, [open, setOpen, rootRef, panelRef])
}

// dsh 那份 ui-chat 表单里这一枚读到的取值
interface UsageSettingsSection {
	// 简洁只留命中率读数，详细另给总量与明细
	performanceUsage?: PerformanceUsageMode
}

// 一份共享表单里的某个字段，镜像到模块级：值一变就叫订阅者
interface SettingMirror<T, S> {
	// 值变化时要叫的回调；返回撤下这次订阅
	subscribe(listener: () => void): () => void

	read(): T

	/**
	 * 把一份共享表单接上这一份镜像
	 * 没有这一份表单时（别的部署不向这个客户端暴露它）保持默认值，而不是整枚胶囊不挂
	 */
	adopt(form: ConfigForm<S> | undefined): () => void
}

/**
 * 造一份模块级镜像
 *
 * 这个座位只有一处安装，读者在设置页改完不必重新安装任何东西，所以取值与订阅都收在模块级这一份里
 */
function createSettingMirror<T, S>(initial: T, pick: (section: S | undefined) => T): SettingMirror<T, S> {
	let current = initial
	const listeners = new Set<() => void>()
	return {
		read: () => current,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		adopt: (form) => {
			if (form === undefined) return () => {}
			const pullFromForm = (): void => {
				const next = pick(form.getSnapshot().value)
				if (next === current) return
				current = next
				for (const listener of listeners) listener()
			}
			const unsubscribe = form.subscribe(pullFromForm)
			pullFromForm()
			return unsubscribe
		},
	}
}

// 档位的镜像
const usageModeMirror = createSettingMirror<PerformanceUsageMode, UsageSettingsSection>(
	DEFAULT_PERFORMANCE_USAGE,
	section => section?.performanceUsage ?? DEFAULT_PERFORMANCE_USAGE,
)

// 命中率数字滚动那个开关的镜像
const hitReelMirror = createSettingMirror<boolean, ChatUxSection>(
	DEFAULT_HIT_REEL,
	section => section?.hitReel ?? DEFAULT_HIT_REEL,
)
