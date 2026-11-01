/**
 * 插件管理页上的插件配置卡片。
 *
 * dsh 0.1.6 起把一个 bundle 自己的配置渲染在 bundle 的页面上、plugins.bundle.config 座位里、按包名 keyed；
 * 标题与面包屑由页面画，这里只是 view 为 page 时的那张表单
 *
 * 零件全是平台自带的：开关是 ui-primitives 的 Switch，档位是同一个包里的 SegmentedControl，覆盖徽标是 Tag，
 * 字段节奏与 --dsw-* 令牌见 config-card-styles.ts
 *
 * 开关与档位点一下即写，写入在途时控件禁用；点完之后从 host 读回来的值才算数，写入本身会吞掉传输层与版本号的失败
 */
import {useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore} from "react"
import type {KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement} from "react"
import {SegmentedControl, Switch, Tag} from "@deepseek-ai/dsh-client-ui-primitives"
import type {SegmentedControlOption} from "@deepseek-ai/dsh-client-ui-primitives"
import type {CaretMotionMode} from "../chat/caret/caret-motion"
import {CARD_CLASS} from "./config-card-styles"
import {
    DEFAULT_AUTO_FOLD, DEFAULT_CARET_MOTION, DEFAULT_COMPOSER_GLASS, DEFAULT_CONTEXT_PIE,
    DEFAULT_FOLLOW_ON_APPEAR, DEFAULT_HIT_REEL, DEFAULT_LIVE_DIFF, DEFAULT_PAPER_ON,
    DEFAULT_PAPER_SIDEBAR, DEFAULT_SEND_FLIGHT,
} from "./settings-scope"
import type {ChatUxSection, ConfigForm, LocaleLike} from "./settings-scope"

// 设置分节里的字段名，必须与 host 侧 index.ts 的 schema 一致
const PAPER_ON_FIELD = "paperOn"
const PAPER_SIDEBAR_FIELD = "paperSidebar"
const AUTO_FOLD_FIELD = "autoFold"
const CARET_FIELD = "caretMotion"
const HIT_REEL_FIELD = "hitReel"
const CONTEXT_PIE_FIELD = "contextPie"
const COMPOSER_GLASS_FIELD = "composerGlass"
const LIVE_DIFF_FIELD = "liveDiff"
const FOLLOW_FIELD = "followOnAppear"
const SEND_FLIGHT_FIELD = "sendFlight"

// 一种语言的文案
interface Copy {
    summary: () => string
    paperLabel: string
    paperHint: string
    paperSidebarLabel: string
    paperSidebarHint: string
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
    overridden: string
    reset: string
    failed: string
    unavailable: string
    readOnly: string
}

const ZH_COPY: Copy = {
    summary: () => "纸感、光标动效、读数、输入框玻璃与发送气泡都在这里调。",
    paperLabel: "纸感",
    paperHint:
        "整页铺一张纸，页面底色换成这张纸的调子，输入框与气泡读起来像纸面上压出来的一层。"
        + "关掉就回到 dsh 原来的样子。",
    paperSidebarLabel: "左侧栏也铺纸",
    paperSidebarHint:
        "左侧栏那一列也换成同一张纸，整扇窗看起来是一张纸。关掉时左侧栏保持 dsh 自己的底色，"
        + "只有聊天区铺纸；纸感关掉时这一项同样不起作用。",
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
        "发出之后，一块与输入框同形同色的方块从输入框上沿升起，带在里面的就是刚发的那句话，一边收窄一边折行、"
        + "换成气泡的颜色，落成落点那条气泡。关掉就回到 dsh 原来的样子。",

    overridden: "已覆盖",
    reset: "重置",
    failed: "保存未生效，请重试。",
    unavailable: "这个页面暂时读不到本插件的配置，设置改不了。请确认插件已在当前环境启用，然后重新打开这一页。",
    readOnly: "当前设置不可修改，改动无法保存。",
}

const EN_COPY: Copy = {
    summary: () =>
        "The paper, the caret motion, the readouts, the composer glass and the send bubble are all adjustable here.",
    paperLabel: "Paper",
    paperHint:
        "The whole page lies on a sheet of paper: the page background takes that paper's tone, so the composer and the "
        + "bubbles read as layers pressed into it. Off restores dsh's own look.",
    paperSidebarLabel: "Paper the sidebar",
    paperSidebarHint:
        "The left sidebar takes the same sheet, so the whole window reads as one piece of paper. Off leaves the "
        + "sidebar on dsh's own fill and papers the chat area only; it does nothing while paper is off either.",
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
        "Once sent, a slab the size and colour of the composer lifts off its top edge carrying the text you just typed. "
        + "It narrows and re-wraps as it goes, then turns into the colour of the bubble it lands on. "
        + "Off restores dsh's own behaviour.",

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

// 渲染这个插件的配置：几个开关与光标动效的三档；页面要摘要时只给那一行字
export function ChatUxConfigCard({scope, locale, view}: ChatUxConfigCardProps): ReactElement {
    const snapshot = useSyncExternalStore(
        useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
        () => scope.getSnapshot(),
    )
    // 跟着 host 的语言偏好走，每次切换都重新渲染；locale 服务缺席时问浏览器，认不出英文就落中文
    const subscribeLanguage = useCallback(
        (listener: () => void) => locale ? locale.subscribe(listener) : () => {
        },
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


    const paperOn = storedPaperOn(snapshot.value)
    const paperSidebarOn = storedPaperSidebar(snapshot.value)
    const autoFoldOn = storedAutoFold(snapshot.value)
    const followOn = storedFollow(snapshot.value)
    const reelOn = storedHitReel(snapshot.value)
    const pieOn = storedContextPie(snapshot.value)
    const glassOn = storedGlass(snapshot.value)
    const liveDiffOn = storedLiveDiff(snapshot.value)
    const caretMode = storedCaret(snapshot.value)
    const sendFlightOn = storedSendFlight(snapshot.value)

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
            {rowChrome(PAPER_ON_FIELD, copy.paperLabel, copy.paperHint, (
                <Switch
                    checked={paperOn}
                    disabled={controlsDisabled}
                    label={copy.paperLabel}
                    onChange={(next: boolean) => void writeField(PAPER_ON_FIELD, next, storedPaperOn)}
                />
            ))}
            {rowChrome(PAPER_SIDEBAR_FIELD, copy.paperSidebarLabel, copy.paperSidebarHint, (
                <Switch
                    checked={paperSidebarOn}
                    disabled={controlsDisabled}
                    label={copy.paperSidebarLabel}
                    onChange={(next: boolean) => void writeField(PAPER_SIDEBAR_FIELD, next, storedPaperSidebar)}
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

            {saveFailed && <p className={CARD_CLASS.failed} role="status">{copy.failed}</p>}
        </div>
    )
}


function storedPaperOn(value: ChatUxSection | undefined): boolean {
    return value?.paperOn ?? DEFAULT_PAPER_ON
}

function storedPaperSidebar(value: ChatUxSection | undefined): boolean {
    return value?.paperSidebar ?? DEFAULT_PAPER_SIDEBAR
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


function nonEmpty(value: string | null | undefined): string | undefined {
    if (typeof value !== "string" || value === "") return undefined
    return value
}

// 原始用户层里有没有这个字段：标记已覆盖看的是它在不在，而不是值比不比得上默认值，恰好等于默认值的覆盖也算覆盖
function userLayerHasField(user: unknown, field: string): boolean {
    if (typeof user !== "object" || user === null) return false
    return field in (user as Record<string, unknown>)
}
