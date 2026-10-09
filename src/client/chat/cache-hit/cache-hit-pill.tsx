/**
 * 输入框下方那枚「缓存命中」胶囊。
 *
 * dsh 在 `conversation.composer.dock` 上发两个座位条目（`activity` order 0、`usage` order 1），
 * 同一个 id 与同一个 order 上按 priority 取最低的那个渲染，内置那两个是默认的 0。这里用 -1 遮蔽
 * 掉 `usage` 重画一份：命中率恒取一位小数，并按四档取色——≥98 绿、93~98 浅绿、90~93 黄、<90 红，
 * 判据用的是显示值本身（读者看到 98.0 就该是绿的）。简洁档只留这一截读数，详细档另加 token 总量
 * 与点开的明细，明细里的命中率走同一个小数口径。
 *
 * 内置那两套类名带构建期 hash、组件也不在冻结的基座模块表里，拿不到，所以这一枚是照着它的样子
 * 重画的；弹窗的定位与「点外面就关」复用 primitives 里那两个共享钩子，行为与内置一致。
 *
 * @module dsh-chat-ux/client/chat/cache-hit/cache-hit-pill
 */
import {useEffect, useRef, useState, useSyncExternalStore} from 'react'
import type {CSSProperties, MutableRefObject, ReactElement} from 'react'
import {createPortal} from 'react-dom'
import {
    IconDatabaseOutlineRegular, useAnchoredPosition, useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {SlotsService} from '../file-mutation/file-mutation-row'
import type {ConfigForm} from '../../settings/settings-scope'
import {
    CACHE_HIT_ANCHOR_CLASS, CACHE_HIT_BAD_CLASS, CACHE_HIT_DETAILS_CLASS, CACHE_HIT_FAIR_CLASS,
    CACHE_HIT_GOOD_CLASS, CACHE_HIT_LABEL_CLASS, CACHE_HIT_PANEL_CLASS, CACHE_HIT_PILL_CLASS,
    CACHE_HIT_RULE_CLASS, CACHE_HIT_SEP_CLASS, CACHE_HIT_TITLE_CLASS, CACHE_HIT_TITLE_LABEL_CLASS,
    CACHE_HIT_TITLE_VALUE_CLASS, CACHE_HIT_VALUE_CLASS, CACHE_HIT_WARN_CLASS,
} from './cache-hit-styles'

/** 锚点顶边与面板底边之间那道缝，与内置的 stat 弹窗同值。 */
const PANEL_GAP = 8

/** 面板与视口边缘留的余量，与内置的 stat 弹窗同值。 */
const PANEL_MARGIN = 12

/** 还没量出位置的那一帧：先按隐藏布局画出来，让夹取量到真实尺寸。 */
const MEASURE_STYLE: CSSProperties = {visibility: 'hidden', left: 0, top: 0}

/** 没有读到 host 分节时的档位，与 dsh 自己的默认值一致。 */
const DEFAULT_PERFORMANCE_USAGE = 'detailed'

/** dsh 那份「性能与用量」表单的条目 id。 */
const CHAT_SETTINGS_NAMESPACE = 'ui-chat'

/** 一位小数：千分之一是这条口径的最小单位。 */
const PERCENT_UNITS_PER_TENTH = 1000

/** 部分命中的上限：读作 100.0% 之前必须真的全中。 */
const PERCENT_UNITS_CAP = 999

/** token 计数的两个进位点，与 dsh 的 formatTokens 同规则。 */
const THOUSAND = 1_000
const MILLION = 1_000_000

/** 每三位一组，做精确计数的千分位。 */
const GROUP_SIZE = 3

/** 这一枚在 chat 命名空间里读文案。 */
const CHAT_LOCALE_NAMESPACE = 'chat'

/** 这个座位的 id 与顺序，与内置那一枚一模一样：遮蔽靠的是更低的 priority。 */
const USAGE_STAT_ID = 'usage'
const USAGE_STAT_ORDER = 1

/** 遮蔽内置那一枚：同一个 id 与 order 上，priority 最低的那个渲染，内置是 0。 */
const USAGE_STAT_PRIORITY = -1

/** dsh 的「性能与用量」档位：简洁只留命中率读数，详细另给 token 总量与明细。 */
type PerformanceUsageMode = 'compact' | 'detailed'

/** 命中率落在四档里的哪一档。 */
type HitTone = 'good' | 'fair' | 'warn' | 'bad'

/** 四档对应的类名，取色写在样式表里。 */
const HIT_TONE_CLASS: Readonly<Record<HitTone, string>> = {
    good: CACHE_HIT_GOOD_CLASS,
    fair: CACHE_HIT_FAIR_CLASS,
    warn: CACHE_HIT_WARN_CLASS,
    bad: CACHE_HIT_BAD_CLASS,
}

/** token 用量投影里这一枚用到的几个桶。 */
interface TokenUsageProjection {
    /** 没命中缓存、按原价计费的输入。 */
    uncachedInputTokens: number
    /** 从缓存读到的输入。 */
    cacheReadTokens: number
    /** 写进缓存的输入。 */
    cacheWriteTokens: number
    /** 输出。 */
    outputTokens: number
}

/** 会话级的投影读取座位：按 key 取 Host 算好的值。 */
type UseProjection = (key: 'tokenUsage') => TokenUsageProjection | undefined

/** chat 命名空间的文案座位。 */
type Translate = (key: string, params?: Record<string, unknown>) => string

/** 共享配置表单的提供者，收窄到本模块那一次读取。 */
export interface ConfigFormsReader {
    get<T>(entryId: string): ConfigForm<T>
}

/** 这一枚收到的载荷：投影读取座位加文案座位。 */
export interface CacheHitPillProps {
    useProjection: UseProjection
    t: Translate
}

/**
 * 遮蔽 `conversation.composer.dock` 上的 `usage` 座位，换成自带一位小数与四档取色的那一枚。
 *
 * 档位读的是 dsh 自己那份 `ui-chat` 表单，而不是本插件的配置：简洁档只留命中率读数，详细档另加
 * 总量与明细，跟着读者在设置页里的选择走。
 * @param slots - 客户端座位注册表。
 * @param configForms - 共享配置表单的提供者。
 */
export function installCacheHitPill(slots: SlotsService, configForms: ConfigFormsReader): void {
    slots.inject('conversation.composer.dock', () => {
        const releaseUsageMode = adoptUsageMode(
            configForms.get<{performanceUsage?: PerformanceUsageMode}>(CHAT_SETTINGS_NAMESPACE),
        )
        const releaseSeat = slots.register({
            name: 'conversation.composer.dock',
            id: USAGE_STAT_ID,
            order: USAGE_STAT_ORDER,
            priority: USAGE_STAT_PRIORITY,
            locale: CHAT_LOCALE_NAMESPACE,
        }, CacheHitPill)
        return () => {
            releaseSeat()
            releaseUsageMode()
        }
    })
}

/**
 * 渲染这一枚：简洁档是静态读数，详细档是能点开明细的按钮。
 * @param props - 投影读取座位与文案座位。
 * @returns 胶囊；这一场没有计过账时是 null，与内置同一条闸门。
 */
export function CacheHitPill({useProjection, t}: CacheHitPillProps): ReactElement | null {
    const usage = useProjection('tokenUsage')
    const mode = useUsageMode()
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLSpanElement | null>(null)
    const panelRef = useRef<HTMLDivElement | null>(null)
    const pos = useAnchoredPosition({
        open, anchorRef: rootRef, panelRef, side: 'top', gap: PANEL_GAP, margin: PANEL_MARGIN,
    })
    useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
    useEscapeAndOutsideClick(open, setOpen, rootRef, panelRef)

    if (usage === undefined) return null
    const billedInput = billedInputTokens(usage)
    // 整场都没计过账（例如每次请求都失败）就不占位，与内置一致。
    if (billedInput === 0 && usage.outputTokens === 0) return null

    const hit = hitReading(usage.cacheReadTokens, billedInput)
    const icon = <IconDatabaseOutlineRegular/>
    const hitLabel = t('message.turnUsage.cacheHit')

    if (mode === 'compact') {
        if (hit === null) return null
        return (
            <span className={CACHE_HIT_ANCHOR_CLASS} data-composer-stat={USAGE_STAT_ID}>
                <span className={CACHE_HIT_PILL_CLASS}>
                    {icon}
                    <span className={CACHE_HIT_LABEL_CLASS}>
                        {hitLabel}{' '}
                        <span className={[CACHE_HIT_VALUE_CLASS, hit.toneClass].join(' ')}>{hit.text}</span>
                    </span>
                </span>
            </span>
        )
    }

    const total = billedInput + usage.outputTokens
    const totalText = t('message.turnUsage.count', {count: formatTokens(total, t)})
    const title = t('stats.dialog.usageTitle')
    const summary = hit === null ? totalText : totalText + ' · ' + hitLabel + ' ' + hit.text
    return (
        <span ref={rootRef} className={CACHE_HIT_ANCHOR_CLASS} data-composer-stat={USAGE_STAT_ID}>
            <button
                type="button"
                className={CACHE_HIT_PILL_CLASS}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={summary}
                onClick={() => { setOpen(!open) }}
            >
                {icon}
                <span className={CACHE_HIT_LABEL_CLASS}>
                    {totalText}
                    {hit !== null && (
                        <>
                            <span className={CACHE_HIT_SEP_CLASS} aria-hidden>·</span>
                            {hitLabel}{' '}
                            <span className={[CACHE_HIT_VALUE_CLASS, hit.toneClass].join(' ')}>{hit.text}</span>
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
                    style={pos ?? MEASURE_STYLE}
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
                        <dt>{t('message.turnUsage.input')}</dt>
                        <dd>{exactCount(usage.uncachedInputTokens, t)}</dd>
                        <dt>{t('message.turnUsage.cacheRead')}</dt>
                        <dd>{exactCount(usage.cacheReadTokens, t)}</dd>
                        {usage.cacheWriteTokens !== 0 && (
                            <>
                                <dt>{t('message.turnUsage.cacheWrite')}</dt>
                                <dd>{exactCount(usage.cacheWriteTokens, t)}</dd>
                            </>
                        )}
                        <dt>{t('message.turnUsage.output')}</dt>
                        <dd>{exactCount(usage.outputTokens, t)}</dd>
                    </dl>
                </div>,
                document.body,
            )}
        </span>
    )
}

/** 命中率那一截的文本与档位类名；没有计过价的输入时是 null。 */
interface HitReading {
    /** `97.3%` 这样的文本。 */
    text: string
    /** 四档里的那一档。 */
    toneClass: string
}

/**
 * 命中率读数，恒一位小数。
 * @param cacheReadTokens - 从缓存读到的输入。
 * @param billedInputTokens - 三个输入计费桶之和。
 * @returns 文本与档位；没有计过价的输入时是 null。
 */
function hitReading(cacheReadTokens: number, billedInputTokens: number): HitReading | null {
    const percent = formatHitPercent(cacheReadTokens, billedInputTokens)
    if (percent === null) return null
    return {text: percent + '%', toneClass: HIT_TONE_CLASS[hitTone(Number(percent))]}
}

/**
 * 命中率文本，恒一位小数。
 *
 * 先把千分之一的整数单位算出来再落成文本，躲开浮点误差在 x.x5 上翻面。部分命中不许读成满命中：
 * 舍进 100.0 但没有全中的压回 99.9。
 * @param cacheReadTokens - 从缓存读到的输入。
 * @param billedInputTokens - 三个输入计费桶之和。
 * @returns `97.3` 这样的文本；没有计过价的输入时是 null。
 */
function formatHitPercent(cacheReadTokens: number, billedInputTokens: number): string | null {
    if (billedInputTokens === 0) return null
    const units = Math.round(cacheReadTokens * PERCENT_UNITS_PER_TENTH / billedInputTokens)
    const capped = cacheReadTokens < billedInputTokens && units > PERCENT_UNITS_CAP
        ? PERCENT_UNITS_CAP
        : units
    return (capped / 10).toFixed(1)
}

/**
 * 一档命中率落在哪一档。
 *
 * 判据用的是**显示值**那一份（一位小数）：读者看到 98.0 就该是绿的，而不是因为精确值 97.96
 * 落进浅绿。
 * @param percent - 显示用的百分比数值。
 * @returns 四档里的那一档。
 */
function hitTone(percent: number): HitTone {
    if (percent >= 98) return 'good'
    if (percent >= 93) return 'fair'
    if (percent >= 90) return 'warn'
    return 'bad'
}

/** 三个互不重叠的输入计费桶之和。 */
function billedInputTokens(usage: TokenUsageProjection): number {
    return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/**
 * 紧凑的 token 计数：517 / 12.2K / 517K / 1.2M，与 dsh 的 formatTokens 同规则。
 * @param value - token 数。
 * @param t - chat 文案座位。
 * @returns 显示文本。
 */
function formatTokens(value: number, t: Translate): string {
    if (value < THOUSAND) return String(value)
    if (value < MILLION) return t('number.thousand', {value: scaledCount(value / THOUSAND)})
    return t('number.million', {value: scaledCount(value / MILLION)})
}

/** 进位之后的缩放数：过百取整，否则留一位小数。 */
function scaledCount(value: number): string {
    return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
}

/**
 * 精确 token 计数，带 chat 命名空间的千分位。
 * @param value - token 数。
 * @param t - chat 文案座位。
 * @returns 分组后的数字文本。
 */
function formatExactTokens(value: number, t: Translate): string {
    const digits = String(value)
    const groups: string[] = []
    for (let end = digits.length; end > 0; end -= GROUP_SIZE) {
        groups.unshift(digits.slice(Math.max(0, end - GROUP_SIZE), end))
    }
    return groups.join(t('number.groupSeparator'))
}

/** 明细里的一行：精确计数加 chat 自己的计数单位。 */
function exactCount(value: number, t: Translate): string {
    return t('message.turnUsage.count', {count: formatExactTokens(value, t)})
}

/** 档位：订阅 dsh 那份 `ui-chat` 表单里的取值。 */
function useUsageMode(): PerformanceUsageMode {
    return useSyncExternalStore(subscribeUsageMode, readUsageMode)
}

/**
 * 明细面板的键盘与外部点击关闭，与内置的 stat 弹窗同一条规则：Escape 关，点到触发点与面板之外也
 * 关——后者走捕获阶段，让键盘激活旁边那个胶囊时这一颗先关掉，而不是两张面板叠在一起。
 * @param open - 面板是否开着。
 * @param setOpen - 开合状态。
 * @param rootRef - 触发点。
 * @param panelRef - 面板。
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
            if (event.key === 'Escape') setOpen(false)
        }
        const onClick = (event: MouseEvent): void => {
            if (event.target instanceof Node
                && rootRef.current?.contains(event.target) !== true
                && panelRef.current?.contains(event.target) !== true) {
                setOpen(false)
            }
        }
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('click', onClick, true)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('click', onClick, true)
        }
    }, [open, setOpen, rootRef, panelRef])
}

/** 当前档位。模块级一份：这个座位只有一处安装，订阅跟着装卸走。 */
let usageMode: PerformanceUsageMode = DEFAULT_PERFORMANCE_USAGE

/** 档位变化时要叫的那些回调，由 `useSyncExternalStore` 提供。 */
const usageModeListeners = new Set<() => void>()

/** @returns 当前档位。 */
function readUsageMode(): PerformanceUsageMode {
    return usageMode
}

/** @param listener - 档位变化时要叫的回调。 @returns 撤下这次订阅。 */
function subscribeUsageMode(listener: () => void): () => void {
    usageModeListeners.add(listener)
    return () => {
        usageModeListeners.delete(listener)
    }
}

/**
 * 把档位接上 dsh 那份 `ui-chat` 表单。
 *
 * 没有这一份表单时（别的部署不向这个客户端暴露它）保持默认档，而不是整枚胶囊不挂。
 * @param form - 共享表单。
 * @returns 撤下这次订阅。
 */
function adoptUsageMode(form: ConfigForm<{performanceUsage?: PerformanceUsageMode}> | undefined): () => void {
    if (form === undefined) return () => {}
    const adopt = (): void => {
        const next = form.getSnapshot().value?.performanceUsage ?? DEFAULT_PERFORMANCE_USAGE
        if (next === usageMode) return
        usageMode = next
        for (const listener of usageModeListeners) listener()
    }
    const unsubscribe = form.subscribe(adopt)
    adopt()
    return unsubscribe
}
