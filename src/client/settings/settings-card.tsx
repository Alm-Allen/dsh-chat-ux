/**
 * 插件管理页上的插件配置卡片。
 *
 * dsh >= 0.1.6 会把一个 bundle 自己的配置渲染在 bundle 的页面上、`plugins.bundle.config` 座位里、
 * 按包名 keyed，位置在包描述和它下面那些行之间。标题、图标和面包屑由页面画；这个组件只是表单本身，
 * 也就是 `view: 'page'` 要的东西。
 *
 * 它是用页面自己的配置卡片所用的同一批零件搭出来的：开关是 `dsh-client-ui-primitives` 里共享的
 * `Switch`（dsh 设置页里那些开关都是它），光标那三档是同一个包里的 `SegmentedControl`，覆盖徽标
 * 是同一个包里的 `Tag`，字段节奏、控件几何和 `--dsw-*` 令牌来自官方插件配置页（见
 * `config-card-styles.ts`）。这里没有任何东西是从零设计的，因为一张夹在两张官方卡片中间的卡片
 * 不该看起来像来自别处。
 *
 * 开关与档位**即时写入**：点一下就存，和 dsh 自己的开关一样，没有「保存」那一步；写入在途时控件
 * 禁用，之后从 host 读回来的值才是「落地了」的权威——写入在设计上就会吞掉传输层与版本号的失败。
 *
 * 两个输入框（两条字体栈）多一道提交（回车或失焦才写）：它们要等读者把字打完，
 * 而每敲一个字符都是一次设置文档写入。打完之前那串字只活在这个组件里，不合法的那串一个字都不写。
 *
 * @module dsh-chat-ux/client/settings/settings-card
 */
import {useCallback, useId, useState, useSyncExternalStore} from 'react'
import type {ReactElement} from 'react'
import {SegmentedControl, Switch, Tag} from '@deepseek-ai/dsh-client-ui-primitives'
import type {SegmentedControlOption} from '@deepseek-ai/dsh-client-ui-primitives'
import type {CaretMotionMode} from '../chat/caret/caret-motion'
import {CARD_CLASS} from './config-card-styles'
import {
    DEFAULT_AUTO_FOLD, DEFAULT_CARET_MOTION, DEFAULT_COMPOSER_GLASS, DEFAULT_CONTEXT_PIE,
    DEFAULT_ENHANCED_FOLLOW, DEFAULT_HIT_REEL, DEFAULT_LIVE_DIFF, DEFAULT_SEND_FLIGHT, DEFAULT_TOKEN_FADE,
} from './settings-scope'
import type {ChatUxSection, ConfigForm, LocaleLike} from './settings-scope'

/** 设置分节里的字段名；必须与 host 侧的 schema 一致。 */
const FOLLOW_FIELD = 'enhancedFollow'
const AUTO_FOLD_FIELD = 'autoFold'
const TOKEN_FADE_FIELD = 'tokenFade'
const CARET_FIELD = 'caretMotion'
const SEND_FLIGHT_FIELD = 'sendFlight'
const HIT_REEL_FIELD = 'hitReel'
const CONTEXT_PIE_FIELD = 'contextPie'
const COMPOSER_GLASS_FIELD = 'composerGlass'
const LIVE_DIFF_FIELD = 'liveDiff'

/** 一种语言的文案。 */
interface Copy {
    summary: (followOn: boolean) => string
    followLabel: string
    followHint: string
    autoFoldLabel: string
    autoFoldHint: string
    tokenLabel: string
    tokenHint: string
    caretLabel: string
    caretHint: string
    caretOff: string
    caretMove: string
    caretTyping: string
    sendLabel: string
    sendHint: string
    reelLabel: string
    reelHint: string
    pieLabel: string
    pieHint: string
    glassLabel: string
    glassHint: string
    liveDiffLabel: string
    liveDiffHint: string
    overridden: string
    reset: string
    failed: string
    unavailable: string
    readOnly: string
}

const ZH_COPY: Copy = {
    summary: (followOn) =>
        '跟随守护：' + (followOn ? '开' : '关') + '。光标、气泡动效与字体也在这里调。',
    followLabel: '增强跟随',
    followHint:
        '回复还在继续时，聊天区自动待在最新内容上，不用手动往下拖。'
        + '你往上翻看历史的那段时间，它不会来抢你的位置。',
    autoFoldLabel: '自动开合',
    autoFoldHint:
        '思考时思考行自己展开、思考结束就收起；工具调用开始时过程组自己打开、这一段跑完再收起。'
        + '你自己动手折叠过的，它不再打扰。',
    tokenLabel: 'token 淡入',
    tokenHint:
        '回复逐字出现时，新出现的文字轻轻浮现，读起来更顺。关掉就直接显示。'
        + '若与其它插件一起使用时明显卡顿，可以关掉这一项。',
    caretLabel: '光标动效',
    caretHint:
        '输入光标滑到新位置，而不是直接跳过去。「移动时」只在方向键、点击这类明确移动时滑动，'
        + '打字瞬时；「无论何时」连打字也一起滑。关掉就用浏览器原本的光标。',
    caretOff: '关',
    caretMove: '移动时',
    caretTyping: '无论何时',
    sendLabel: '聊天气泡动效',
    sendHint: '按下发送后，输入框浮起来收成一条气泡飞进对话里，让「已经发出去了」看得见。',
    reelLabel: '命中率转轮',
    reelHint:
        '输入框下方那枚胶囊里的命中率变化时，变了的那几位数字在原地弹一下就落到新读数——'
        + '新的从下方一点落回来，旧的朝反方向淡出。关掉就直接换成新数字。',
    pieLabel: '上下文占用饼',
    pieHint:
        '输入框下方那圈上下文占用环换成一枚实心饼，按占用多少取色；已占用那一角沿折线切开、推开一点，'
        + '像从盘子里切下来的一块。关掉就回到 dsh 原来的环。',
    glassLabel: '输入框毛玻璃',
    glassHint:
        '输入框那一块带一条蓝调渐变，底微微透出背后的一点色调，玻璃的亮边与内阴影也在这里；'
        + '右下角那枚发送（跑起来时是停止）与左下角那枚加号跟着同一套材质。关掉就回到 dsh 原来的输入框与按钮。',
    liveDiffLabel: '实时改动行数',
    liveDiffHint:
        '直接调用写入或编辑时，行尾那两个 `+n -m` 在内容还在流进来时就开始长，不必等整段写完才一起跳出来。'
        + '这一段还在收，标着 beta，默认关着。',
    overridden: '已覆盖',
    reset: '重置',
    failed: '保存未生效，请重试。',
    unavailable: '这个页面暂时读不到本插件的配置，设置改不了。请确认插件已在当前环境启用，然后重新打开这一页。',
    readOnly: '当前设置不可修改，改动无法保存。',
}

const EN_COPY: Copy = {
    summary: (followOn) =>
        'Follow guard: ' + (followOn ? 'on' : 'off') + '. Caret, bubble motion, and fonts are adjustable here.',
    followLabel: 'Enhanced follow',
    followHint:
        'While a reply is still streaming, the transcript stays on the newest content, so you never have to drag it '
        + 'down by hand. It leaves you alone while you scroll back through history.',
    autoFoldLabel: 'Automatic folding',
    autoFoldHint:
        'A reasoning row opens while the model thinks and folds when thinking ends; a process group opens when a '
        + 'tool call starts and folds when that stretch ends. Anything you folded yourself is left alone.',
    tokenLabel: 'Token fade-in',
    tokenHint:
        'New text fades in as a reply streams, which is easier to read. Turning it off shows the text immediately. '
        + 'If the page stutters noticeably alongside other plugins, turn this off.',
    caretLabel: 'Caret motion',
    caretHint:
        'The text cursor slides to its new position instead of jumping. "On move" animates deliberate moves — arrow '
        + 'keys, clicks — and leaves typing instant; "On typing" animates typing too. Off keeps the browser\'s own cursor.',
    caretOff: 'Off',
    caretMove: 'On move',
    caretTyping: 'On typing',
    sendLabel: 'Chat bubble motion',
    sendHint:
        'When you send a message, the composer lifts off and folds into a bubble that flies into the conversation, '
        + 'so a send is something you can see.',
    reelLabel: 'Cache-hit reels',
    reelHint:
        'When the cache-hit rate in the pill below the composer changes, the digits that changed pop to their new '
        + 'values — each one drops back in from just below while the old digit fades out the other way. Off swaps '
        + 'the number instantly.',
    pieLabel: 'Context pie',
    pieHint:
        'The context ring under the composer becomes a solid pie that takes its colour from how full the context '
        + 'is; the occupied slice is cut along a fold line and slides out a little, like a piece cut from a plate. '
        + 'Turning it off restores dsh\'s own ring.',
    glassLabel: 'Composer glass',
    glassHint:
        'The composer carries its own blue gradient and lets a little of what sits behind it through; its '
        + 'highlight and inner shadow belong to this too, and the send button (stop while it runs) wears the '
        + 'same material. Turning it off restores dsh\'s own composer and button.',
    liveDiffLabel: 'Live change counts',
    liveDiffHint:
        'When you write or edit a file directly, the `+n -m` at the end of the row starts growing while the content '
        + 'is still streaming, instead of appearing only once it finishes. This stretch is still settling, so it is '
        + 'marked beta and off by default.',
    overridden: 'Overridden',
    reset: 'Reset',
    failed: 'The save did not take effect. Please try again.',
    unavailable:
        'This page cannot read the plugin configuration right now, so settings cannot be changed. Check that the '
        + 'plugin is enabled in this environment, then open this page again.',
    readOnly: 'These settings cannot be changed, so edits cannot be saved.',
}

/** 插件管理页为一条 `plugins.bundle.config` 记录绑定的 props。 */
export interface ChatUxConfigCardProps {
    /** `dsh-chat-ux` 这一行的共享配置表单。 */
    scope: ConfigForm<ChatUxSection>
    /** locale 服务，部署里有的话。 */
    locale?: LocaleLike | undefined
    /** `'page'` 是要表单；`'summary'` 是标题下面那一行摘要。 */
    view?: 'summary' | 'page' | undefined
}

/**
 * 渲染这个插件的配置：几个开关与光标动效的三档。
 * @param props - 绑定好的设置 scope、locale 服务，以及视图。
 * @returns 那个表单，或者页面要的一行摘要。
 */
export function ChatUxConfigCard({scope, locale, view}: ChatUxConfigCardProps): ReactElement {
    const snapshot = useSyncExternalStore(
        useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
        () => scope.getSnapshot(),
    )
    // 跟着 host 的语言偏好走，每次切换都重新渲染；locale 服务缺席时问浏览器，认不出英文就落中文。
    const activeLanguage = useSyncExternalStore(
        useCallback((listener: () => void) => (locale ? locale.subscribe(listener) : () => {
        }), [locale]),
        useCallback(() => (locale ? locale.getSnapshot().active : null), [locale]),
    )
    const browserLanguage = typeof navigator === 'undefined' ? null : navigator.language
    // dsh 的活跃语言优先，认得就跟着它——`zh-Hant` 这类子标签按主语言子标签归到中文。它缺席
    // （没有 locale 服务）或拿不出内容时问浏览器语言；两条都认不出英文就用中文，中文在这里是
    // 兜底，而不是「非英文即中文」的巧合。dsh 自己把认不出的语言落回英文，这一张卡片不跟它：
    // 中文是这套文案的主要读者。
    const language = nonEmpty(activeLanguage) ?? nonEmpty(browserLanguage) ?? 'zh'
    const copy = language.toLowerCase().split('-')[0] === 'en' ? EN_COPY : ZH_COPY
    const [saving, setSaving] = useState(false)
    const [failed, setFailed] = useState(false)
    const fieldId = useId()

    const followOn = storedFollow(snapshot.value)
    const autoFoldOn = storedAutoFold(snapshot.value)
    const tokenFadeOn = storedTokenFade(snapshot.value)
    const sendOn = storedSendOn(snapshot.value)
    const reelOn = storedHitReel(snapshot.value)
    const pieOn = storedContextPie(snapshot.value)
    const glassOn = storedGlass(snapshot.value)
    const liveDiffOn = storedLiveDiff(snapshot.value)
    const caretMode = storedCaret(snapshot.value)
    const unavailable = snapshot.status === 'unavailable'
    const readOnly = snapshot.writable === false
    const controlsDisabled = saving || unavailable || readOnly
    const caretOptions: readonly SegmentedControlOption<CaretMotionMode>[] = [
        {value: 'off', label: copy.caretOff},
        {value: 'move', label: copy.caretMove},
        {value: 'typing', label: copy.caretTyping},
    ]

    if (view === 'summary') return <>{copy.summary(followOn)}</>
    // 一个没有东西服务的命名空间，给的是页面自己那些卡片给的同一行回答，而不是 host 会拒绝的控件。
    if (unavailable) return <p className={CARD_CLASS.notice} role="status">{copy.unavailable}</p>

    /** 写入一个字段，然后从 host 读回来确认它真的落地了。 */
    const writeField = async <T, >(
        field: string,
        next: T,
        readBack: (value: ChatUxSection | undefined) => T,
    ): Promise<void> => {
        setSaving(true)
        setFailed(false)
        const accepted = await scope.set(field, next)
        const landed = accepted && readBack(scope.getSnapshot().value) === next
        setFailed(!landed)
        setSaving(false)
    }

    /** 清掉用户层里的覆盖，让取值退回默认层。 */
    const reset = async (field: string): Promise<void> => {
        setSaving(true)
        setFailed(false)
        await scope.unset(field)
        const stillOverridden = userLayerHasField(scope.getSnapshot().user, field)
        setFailed(stillOverridden)
        setSaving(false)
    }

    /**
     * 一行「标签 + 说明 + 覆盖徽标 + 控件」的骨架，几行开关共用。
     * @param badge - 跟在标签后面的小标；只有还在收的那一行带它（beta）。
     */
    const rowChrome = (
        field: string,
        label: string,
        hint: string,
        control: ReactElement,
        badge?: ReactElement | undefined,
    ): ReactElement => (
        <div className={CARD_CLASS.row}>
            <div className={CARD_CLASS.rowText}>
                <div className={CARD_CLASS.labelLine}>
                    <span className={CARD_CLASS.label}>{label}</span>
                    {badge}
                </div>
                <p className={CARD_CLASS.hint}>{hint}</p>
            </div>
            {userLayerHasField(snapshot.user, field) && overrideBadges(copy, controlsDisabled, () => void reset(field))}
            {control}
        </div>
    )

    return (
        <div className={CARD_CLASS.form} data-plugin-config-form="dsh-chat-ux">
            {readOnly && <p className={CARD_CLASS.notice} role="status">{copy.readOnly}</p>}
            {rowChrome(FOLLOW_FIELD, copy.followLabel, copy.followHint, (
                <Switch
                    checked={followOn}
                    disabled={controlsDisabled}
                    label={copy.followLabel}
                    onChange={(next: boolean) => void writeField(FOLLOW_FIELD, next, storedFollow)}
                />
            ))}
            {rowChrome(AUTO_FOLD_FIELD, copy.autoFoldLabel, copy.autoFoldHint, (
                <Switch
                    checked={autoFoldOn}
                    disabled={controlsDisabled}
                    label={copy.autoFoldLabel}
                    onChange={(next: boolean) => void writeField(AUTO_FOLD_FIELD, next, storedAutoFold)}
                />
            ))}
            {rowChrome(TOKEN_FADE_FIELD, copy.tokenLabel, copy.tokenHint, (
                <Switch
                    checked={tokenFadeOn}
                    disabled={controlsDisabled}
                    label={copy.tokenLabel}
                    onChange={(next: boolean) => void writeField(TOKEN_FADE_FIELD, next, storedTokenFade)}
                />
            ))}
            {rowChrome(CARET_FIELD, copy.caretLabel, copy.caretHint, (
                <SegmentedControl
                    id={fieldId + '-caret'}
                    value={caretMode}
                    options={caretOptions}
                    onChange={(next) => void writeField(CARET_FIELD, next, storedCaret)}
                    label={copy.caretLabel}
                    disabled={controlsDisabled}
                    className={CARD_CLASS.segment}
                />
            ))}
            {rowChrome(SEND_FLIGHT_FIELD, copy.sendLabel, copy.sendHint, (
                <Switch
                    checked={sendOn}
                    disabled={controlsDisabled}
                    label={copy.sendLabel}
                    onChange={(next: boolean) => void writeField(SEND_FLIGHT_FIELD, next, storedSendOn)}
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
            ), <Tag tone="info">beta</Tag>)}
            {failed && <p className={CARD_CLASS.failed} role="status">{copy.failed}</p>}
        </div>
    )
}


/**
 * 「已覆盖」徽标与它旁边那个重置按钮，跟在开关行的标签后面。
 * @param copy - 当前语言的文案。
 * @param disabled - 写入在途、这一行不可用、或设置文档只读时锁住它。
 * @param onReset - 清掉用户层里的覆盖，让取值退回默认层。
 * @returns 那一小段 chrome。
 */
function overrideBadges(copy: Copy, disabled: boolean, onReset: () => void): ReactElement {
    return (
        <span className={CARD_CLASS.badges}>
      <Tag tone="neutral">{copy.overridden}</Tag>
      <button type="button" className={CARD_CLASS.reset} disabled={disabled} onClick={onReset}>
        {copy.reset}
      </button>
    </span>
    )
}

/** 从 host 的值里读增强跟随。 */
function storedFollow(value: ChatUxSection | undefined): boolean {
    return value?.enhancedFollow ?? DEFAULT_ENHANCED_FOLLOW
}

/** 从 host 的值里读自动开合的开关。 */
function storedAutoFold(value: ChatUxSection | undefined): boolean {
    return value?.autoFold ?? DEFAULT_AUTO_FOLD
}

/** 从 host 的值里读 token 淡入的开关。 */
function storedTokenFade(value: ChatUxSection | undefined): boolean {
    return value?.tokenFade ?? DEFAULT_TOKEN_FADE
}

/** 从 host 的值里读聊天气泡动效的开关。 */
function storedSendOn(value: ChatUxSection | undefined): boolean {
    return value?.sendFlight ?? DEFAULT_SEND_FLIGHT
}

/** 从 host 的值里读命中率转轮的开关。 */
function storedHitReel(value: ChatUxSection | undefined): boolean {
    return value?.hitReel ?? DEFAULT_HIT_REEL
}

/** 从 host 的值里读准备态改动行数的开关。 */
function storedLiveDiff(value: ChatUxSection | undefined): boolean {
    return value?.liveDiff ?? DEFAULT_LIVE_DIFF
}

/** 从 host 的值里读上下文占用那枚饼的开关。 */
function storedContextPie(value: ChatUxSection | undefined): boolean {
    return value?.contextPie ?? DEFAULT_CONTEXT_PIE
}

/** 从 host 的值里读输入框那块玻璃的开关。 */
function storedGlass(value: ChatUxSection | undefined): boolean {
    return value?.composerGlass ?? DEFAULT_COMPOSER_GLASS
}

/** 从 host 的值里读光标动效档位。 */
function storedCaret(value: ChatUxSection | undefined): CaretMotionMode {
    return value?.caretMotion ?? DEFAULT_CARET_MOTION
}

/**
 * 只放行非空字符串。
 * @param value - 可能是 null、undefined 或空串的候选。
 * @returns 能用的那串字，或 undefined。
 */
function nonEmpty(value: string | null | undefined): string | undefined {
    if (typeof value !== 'string' || value === '') return undefined
    return value
}

/**
 * 原始用户层里有没有这个字段。标记「已覆盖」看的是「在不在」，而不是值比不比得上默认值：
 * 一个恰好等于默认值的覆盖，仍然是覆盖。
 * @param user - 原始的用户分节，形状未知。
 * @param field - 要找的字段名。
 * @returns 用户层里点名了这个字段时为真。
 */
function userLayerHasField(user: unknown, field: string): boolean {
    if (typeof user !== 'object' || user === null) return false
    return field in (user as Record<string, unknown>)
}
