/**
 * 插件管理页上的配置卡片。
 *
 * 用与 dsh 设置页相同的 primitives 与设计令牌搭出开关行；开关和档位即时写入，并读回配置确认落地。
 * locale 服务缺席时按浏览器语言显示。
 */
import {useCallback, useId, useState, useSyncExternalStore} from 'react'
import type {ReactElement} from 'react'
import {SegmentedControl, Switch, Tag} from '@deepseek-ai/dsh-client-ui-primitives'
import type {SegmentedControlOption} from '@deepseek-ai/dsh-client-ui-primitives'
import type {CaretMotionMode} from '../chat/caret/caret-motion'
import {CARD_CLASS} from './config-card-styles'
import {
    DEFAULT_AUTO_FOLD, DEFAULT_CARET_MOTION, DEFAULT_COMPOSER_GLASS, DEFAULT_CONTEXT_PIE,
    DEFAULT_FOLLOW_ON_APPEAR, DEFAULT_HIT_REEL, DEFAULT_LIVE_DIFF, DEFAULT_SEND_FLIGHT,
} from './settings-scope'
import type {ChatUxSection, ConfigForm, LocaleLike} from './settings-scope'

/** 设置分节里的字段名；必须与 host 侧的 schema 一致。 */
const AUTO_FOLD_FIELD = 'autoFold'
const CARET_FIELD = 'caretMotion'
const SEND_FLIGHT_FIELD = 'sendFlight'
const HIT_REEL_FIELD = 'hitReel'
const CONTEXT_PIE_FIELD = 'contextPie'
const COMPOSER_GLASS_FIELD = 'composerGlass'
const LIVE_DIFF_FIELD = 'liveDiff'
const FOLLOW_FIELD = 'followOnAppear'

type BooleanSettingField = typeof AUTO_FOLD_FIELD | typeof SEND_FLIGHT_FIELD | typeof HIT_REEL_FIELD
    | typeof CONTEXT_PIE_FIELD | typeof COMPOSER_GLASS_FIELD | typeof LIVE_DIFF_FIELD | typeof FOLLOW_FIELD
type ChatUxField = BooleanSettingField | typeof CARET_FIELD

/** 一种语言的文案。 */
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
    summary: () => '光标动效、气泡动效、读数与输入框玻璃都在这里调。',
    autoFoldLabel: '自动开合',
    autoFoldHint:
        '思考时思考行自己展开、思考结束就收起；工具调用开始时过程组自己打开、这一段跑完再收起。'
        + '你自己动手折叠过的，它不再打扰。',
    followLabel: '工具行跟随',
    followHint:
        '工具调用和新出现的思考行一到，滚动条就自己跟到底，新内容不会落到看不见的地方。'
        + '你自己往上翻的时候它一概不动，回到最下面又接着跟。',
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
        + '数字一变，变了的那一位会像读数那样在原地弹到新值。'
        + '默认开着。',
    overridden: '已覆盖',
    reset: '重置',
    failed: '保存未生效，请重试。',
    unavailable: '这个页面暂时读不到本插件的配置，设置改不了。请确认插件已在当前环境启用，然后重新打开这一页。',
    readOnly: '当前设置不可修改，改动无法保存。',
}

const EN_COPY: Copy = {
    summary: () => 'Caret motion, bubble motion, the readouts and the composer glass are all adjustable here.',
    autoFoldLabel: 'Automatic folding',
    autoFoldHint:
        'A reasoning row opens while the model thinks and folds when thinking ends; a process group opens when a '
        + 'tool call starts and folds when that stretch ends. Anything you folded yourself is left alone.',
    followLabel: 'Follow new rows',
    followHint:
        'When a tool call or a new reasoning row arrives, the scroll follows to the bottom so nothing lands '
        + 'out of sight. While you scroll up yourself it keeps still, and picks up again once you are back at '
        + 'the bottom.',
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
        + 'is still streaming, instead of appearing only once it finishes. A digit that changes pops to its new value '
        + 'the way the readouts do. On by default.',
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
    // dsh 的活跃语言优先，子标签按主语言归类；没有 locale 或取不到时问浏览器，仍认不出就用中文
    const language = nonEmpty(activeLanguage) ?? nonEmpty(browserLanguage) ?? 'zh'
    const copy = language.toLowerCase().split('-')[0] === 'en' ? EN_COPY : ZH_COPY
    const [saving, setSaving] = useState(false)
    const [failed, setFailed] = useState(false)
    const fieldId = useId()

    const autoFoldOn = storedBoolean(snapshot.value, AUTO_FOLD_FIELD, DEFAULT_AUTO_FOLD)
    const followOn = storedBoolean(snapshot.value, FOLLOW_FIELD, DEFAULT_FOLLOW_ON_APPEAR)
    const sendOn = storedBoolean(snapshot.value, SEND_FLIGHT_FIELD, DEFAULT_SEND_FLIGHT)
    const reelOn = storedBoolean(snapshot.value, HIT_REEL_FIELD, DEFAULT_HIT_REEL)
    const pieOn = storedBoolean(snapshot.value, CONTEXT_PIE_FIELD, DEFAULT_CONTEXT_PIE)
    const glassOn = storedBoolean(snapshot.value, COMPOSER_GLASS_FIELD, DEFAULT_COMPOSER_GLASS)
    const liveDiffOn = storedBoolean(snapshot.value, LIVE_DIFF_FIELD, DEFAULT_LIVE_DIFF)
    const caretMode = storedCaret(snapshot.value)
    const unavailable = snapshot.status === 'unavailable'
    const readOnly = snapshot.writable === false
    const controlsDisabled = saving || unavailable || readOnly
    const caretOptions: readonly SegmentedControlOption<CaretMotionMode>[] = [
        {value: 'off', label: copy.caretOff},
        {value: 'move', label: copy.caretMove},
        {value: 'typing', label: copy.caretTyping},
    ]

    if (view === 'summary') return <>{copy.summary()}</>
    // 一个没有东西服务的命名空间，给的是页面自己那些卡片给的同一行回答，而不是 host 会拒绝的控件。
    if (unavailable) return <p className={CARD_CLASS.notice} role="status">{copy.unavailable}</p>

    /** 写入一个字段，然后从 host 读回来确认它真的落地了。 */
    const writeField = async <T, >(
        field: ChatUxField,
        next: T,
        readBack: (section: ChatUxSection | undefined) => T,
    ): Promise<void> => {
        setSaving(true)
        setFailed(false)
        try {
            const accepted = await scope.set(field, next)
            const landed = accepted && readBack(scope.getSnapshot().value) === next
            setFailed(!landed)
        } catch {
            setFailed(true)
        } finally {
            setSaving(false)
        }
    }

    /** 清掉用户层里的覆盖，让取值退回默认层。 */
    const reset = async (field: ChatUxField): Promise<void> => {
        setSaving(true)
        setFailed(false)
        try {
            await scope.unset(field)
            setFailed(userLayerHasField(scope.getSnapshot().user, field))
        } catch {
            setFailed(true)
        } finally {
            setSaving(false)
        }
    }

    /** 一行「标签 + 说明 + 覆盖徽标 + 控件」的骨架。 */
    const rowChrome = (
        field: ChatUxField,
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
            {userLayerHasField(snapshot.user, field) && overrideBadges(copy, controlsDisabled, () => void reset(field))}
            {control}
        </div>
    )

    /** 一行布尔开关；读回时沿用同一个字段和默认值。 */
    const switchRow = (
        field: BooleanSettingField,
        label: string,
        hint: string,
        checked: boolean,
        fallback: boolean,
    ): ReactElement => rowChrome(field, label, hint, (
        <Switch
            checked={checked}
            disabled={controlsDisabled}
            label={label}
            onChange={(next: boolean) => void writeField(field, next, section => storedBoolean(section, field, fallback))}
        />
    ))

    return (
        <div className={CARD_CLASS.form} data-plugin-config-form="dsh-chat-ux">
            {readOnly && <p className={CARD_CLASS.notice} role="status">{copy.readOnly}</p>}
            {switchRow(AUTO_FOLD_FIELD, copy.autoFoldLabel, copy.autoFoldHint, autoFoldOn, DEFAULT_AUTO_FOLD)}
            {switchRow(FOLLOW_FIELD, copy.followLabel, copy.followHint, followOn, DEFAULT_FOLLOW_ON_APPEAR)}
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
            {switchRow(SEND_FLIGHT_FIELD, copy.sendLabel, copy.sendHint, sendOn, DEFAULT_SEND_FLIGHT)}
            {switchRow(HIT_REEL_FIELD, copy.reelLabel, copy.reelHint, reelOn, DEFAULT_HIT_REEL)}
            {switchRow(CONTEXT_PIE_FIELD, copy.pieLabel, copy.pieHint, pieOn, DEFAULT_CONTEXT_PIE)}
            {switchRow(COMPOSER_GLASS_FIELD, copy.glassLabel, copy.glassHint, glassOn, DEFAULT_COMPOSER_GLASS)}
            {switchRow(LIVE_DIFF_FIELD, copy.liveDiffLabel, copy.liveDiffHint, liveDiffOn, DEFAULT_LIVE_DIFF)}
            {failed && <p className={CARD_CLASS.failed} role="status">{copy.failed}</p>}
        </div>
    )
}


/** 「已覆盖」徽标与重置按钮。 */
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

/** 从 host 的值里读一个布尔开关；字段缺席时用默认值。 */
function storedBoolean(section: ChatUxSection | undefined, field: BooleanSettingField, fallback: boolean): boolean {
    return section?.[field] ?? fallback
}

/** 从 host 的值里读光标动效档位。 */
function storedCaret(section: ChatUxSection | undefined): CaretMotionMode {
    return section?.caretMotion ?? DEFAULT_CARET_MOTION
}

/** 只放行非空字符串。 */
function nonEmpty(candidate: string | null | undefined): string | undefined {
    if (typeof candidate !== 'string' || candidate === '') return undefined
    return candidate
}

/**
 * 原始用户层里有没有这个字段。标记「已覆盖」看的是「在不在」，而不是值比不比得上默认值：
 * 一个恰好等于默认值的覆盖，仍然是覆盖。
 */
function userLayerHasField(user: unknown, field: string): boolean {
    if (typeof user !== 'object' || user === null) return false
    return Object.hasOwn(user, field)
}
