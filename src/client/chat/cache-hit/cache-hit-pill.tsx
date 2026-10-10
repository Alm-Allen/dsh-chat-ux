/**
 * 输入框下方那枚「缓存命中」胶囊。
 *
 * dsh 在 `conversation.composer.dock` 上发两个座位条目（`activity` order 0、`usage` order 1），
 * 同一个 id 与同一个 order 上按 priority 取最低的那个渲染，内置那两个是默认的 0。这里用 -1 遮蔽
 * 掉 `usage` 重画一份：命中率恒取一位小数，并按 90%~99% 的无极色阶取色——低于 90% 一律红，90.0 起
 * 由红经橙黄、黄、黄绿、浅绿走到 99.0 的深绿，**99.0 及以后都是深绿**，不必等到 100.0；判据用的是
 * 显示值本身（读者看到 98.0 就该是 98.0 的颜色）。色标与插值都在样式表里，这里只算「落在哪一段、
 * 段内位置多少」。简洁档只留这一截读数，详细档另加 token 总量与点开的明细，明细里的命中率走同一个
 * 小数口径。
 *
 * 版本边界：**两个 id 加 priority 遮蔽这一套，是 dsh 0.2.1-alpha.1 起才成立的**。0.2.0-rc.2 及
 * 以前，坞里只有一枚内置胶囊、id 是 stats，插件按 usage 注册上去不会遮蔽它，而是多出一枚。所以
 * 这一枚只在认得出新版坞那一层时才画（见 CacheHitPill 里那道闸门）。
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
import {COMPOSER_DOCK_SELECTOR} from '../../dom-contract'
import type {SlotsService} from '../file-mutation/file-mutation-row'
import {DEFAULT_HIT_REEL} from '../../settings/settings-scope'
import type {ChatUxSection, ConfigForm} from '../../settings/settings-scope'
import {
    CACHE_HIT_ANCHOR_CLASS, CACHE_HIT_DETAILS_CLASS, CACHE_HIT_LABEL_CLASS, CACHE_HIT_PANEL_CLASS,
    CACHE_HIT_PILL_CLASS, CACHE_HIT_RULE_CLASS, CACHE_HIT_SEP_CLASS, CACHE_HIT_TITLE_CLASS,
    CACHE_HIT_TITLE_LABEL_CLASS, CACHE_HIT_TITLE_VALUE_CLASS,
} from './cache-hit-styles'
import {rampPosition} from '../ramp'
import type {RampPosition} from '../ramp'
import {DigitReel} from '../reel/digit-reel'

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

/** 本插件自己那一份表单的条目 id：转轮开关就在它上面。 */
const PLUGIN_SETTINGS_NAMESPACE = 'dsh-chat-ux'

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

/** 命中率那六个色标在显示值上的位置，与样式表里那几段一一对应；末一个落在 99.0，之后一律深绿。 */
const HIT_TONE_STOPS = [90, 92, 94, 96, 98, 99]

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
        const releaseUsageMode = usageModeMirror.adopt(
            configForms.get<UsageSettingsSection>(CHAT_SETTINGS_NAMESPACE),
        )
        const releaseHitReel = hitReelMirror.adopt(configForms.get<ChatUxSection>(PLUGIN_SETTINGS_NAMESPACE))
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
            releaseHitReel()
        }
    })
}

/**
 * 坞那一层是不是带 data-composer-dock 的那一代；读一次就记住。
 *
 * 一个页面生命周期里 dsh 的版本不会变，所以缓存安全；缓存的用处是重挂载时不必再从「还没量过」
 * 起一帧。
 */
let composerDockIsModern: boolean | null = null

/**
 * 读一次坞的形态，结果留在 composerDockIsModern 里。
 * @returns 页面上的坞带不带新版属性。
 */
function dshHasComposerDock(): boolean {
    // 只把「是新版」这个肯定结论记住：认不出时每次都重探，免得某一次探测时机不巧（坞还没挂上）
    // 就把这一枚永久关掉。
    if (composerDockIsModern === true) return true
    composerDockIsModern = document.querySelector(COMPOSER_DOCK_SELECTOR) !== null
    return composerDockIsModern
}

/**
 * 渲染这一枚：简洁档是静态读数，详细档是能点开明细的按钮。
 * @param props - 投影读取座位与文案座位。
 * @returns 胶囊；这一场没有计过账时是 null，与内置同一条闸门。
 */
export function CacheHitPill({useProjection, t}: CacheHitPillProps): ReactElement | null {
    const usage = useProjection('tokenUsage')
    const mode = useUsageMode()
    const rolling = useHitReel()
    const [open, setOpen] = useState(false)
    const rootRef = useRef<HTMLSpanElement | null>(null)
    const panelRef = useRef<HTMLDivElement | null>(null)
    const pos = useAnchoredPosition({
        open, anchorRef: rootRef, panelRef, side: 'top', gap: PANEL_GAP, margin: PANEL_MARGIN,
    })
    useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
    useEscapeAndOutsideClick(open, setOpen, rootRef, panelRef)
    // 坞的形态先按上一次读到的值起手，重挂载时不必再从「还没量过」起一帧。effect 跑在这一帧的
    // DOM 提交之后，那时坞已经在页面里。
    const [shadowing, setShadowing] = useState(composerDockIsModern === true)
    useEffect(() => { setShadowing(dshHasComposerDock()) }, [])

    // 认不出新版坞那一层就什么都不画：读者看到的是 dsh 自己那一枚（整数口径、没有档位色），
    // 而不是两枚并列的命中率。
    if (!shadowing) return null
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
                        <DigitReel text={hit.text} tone={hit.tone} rolling={rolling} spoken/>
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
                            <DigitReel text={hit.text} tone={hit.tone} rolling={rolling} spoken/>
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

/** 命中率那一截的文本与色阶位置；没有计过价的输入时是 null。 */
interface HitReading {
    /** `97.3%` 这样的文本。 */
    text: string
    /** 读数落在色标的哪一段、段内位置多少。 */
    tone: RampPosition
}

/**
 * 命中率读数，恒一位小数。
 * @param cacheReadTokens - 从缓存读到的输入。
 * @param billedInputTokens - 三个输入计费桶之和。
 * @returns 文本与色阶位置；没有计过价的输入时是 null。
 */
function hitReading(cacheReadTokens: number, billedInputTokens: number): HitReading | null {
    const percent = formatHitPercent(cacheReadTokens, billedInputTokens)
    if (percent === null) return null
    return {text: percent + '%', tone: rampPosition(Number(percent), HIT_TONE_STOPS)}
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
    return useSyncExternalStore(usageModeMirror.subscribe, usageModeMirror.read)
}

/** 转轮开着没有：订阅本插件那份表单里的取值。 */
function useHitReel(): boolean {
    return useSyncExternalStore(hitReelMirror.subscribe, hitReelMirror.read)
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

/** dsh 那份 `ui-chat` 表单里这一枚读到的取值。 */
interface UsageSettingsSection {
    /** 「简洁」只留命中率读数，「详细」另给总量与明细。 */
    performanceUsage?: PerformanceUsageMode
}

/** 一份共享表单里的某个字段，镜像到模块级：值一变就叫订阅者。 */
interface SettingMirror<T, S> {
    /** @param listener - 值变化时要叫的回调。 @returns 撤下这次订阅。 */
    subscribe(listener: () => void): () => void

    /** @returns 当前值。 */
    read(): T

    /**
     * 把一份共享表单接上这一份镜像。
     *
     * 没有这一份表单时（别的部署不向这个客户端暴露它）保持默认值，而不是整枚胶囊不挂。
     * @param form - 共享表单。
     * @returns 撤下这次订阅。
     */
    adopt(form: ConfigForm<S> | undefined): () => void
}

/**
 * 造一份模块级镜像。
 *
 * 这个座位只有一处安装，读者在设置页改完不必重新安装任何东西，所以取值与订阅都收在模块级这一份里。
 * @param initial - 表单缺席时的取值。
 * @param pick - 从表单的取值里挑出这个字段。
 * @returns 那一份镜像。
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
            if (form === undefined) return () => {
            }
            const adopt = (): void => {
                const next = pick(form.getSnapshot().value)
                if (next === current) return
                current = next
                for (const listener of listeners) listener()
            }
            const unsubscribe = form.subscribe(adopt)
            adopt()
            return unsubscribe
        },
    }
}

/** 档位的镜像。 */
const usageModeMirror = createSettingMirror<PerformanceUsageMode, UsageSettingsSection>(
    DEFAULT_PERFORMANCE_USAGE,
    section => section?.performanceUsage ?? DEFAULT_PERFORMANCE_USAGE,
)

/** 命中率转轮的镜像。 */
const hitReelMirror = createSettingMirror<boolean, ChatUxSection>(
    DEFAULT_HIT_REEL,
    section => section?.hitReel ?? DEFAULT_HIT_REEL,
)
