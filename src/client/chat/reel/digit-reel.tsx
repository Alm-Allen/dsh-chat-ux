/**
 * 数字轮：变了的那一位原地弹一下。
 *
 * 读数一有新值，**变了的那一位**把新数字从下方 6px 处淡入，上一个数字朝反方向淡出（500 ms，低位比
 * 高位晚 70 ms 起手）。两条用的都是那条带过冲的曲线，所以落定前会先越过去一点再弹回来；**终态是
 * 零位移**：动画走完，数字就在它本来的位置上（进场那一帧的模糊试过又退掉了，见 reel-styles.ts）。
 *
 * 这一处不可能「停歪」：位移是固定的 6px，不参与排版，也不问元素任何尺寸。
 *
 * 2026-10 的前两版都栽在「算一格」上：
 *
 * - 第一版按 CSS 变量算整格滚动，位移与每格真实高度每格差 0.84px，误差按格数累积——滚到第 9 格
 *   累计 7.55px，已经超过半格（6.90px），窗口里于是同时露着上下两个数字的各一半；
 * - 第二版整条带滚动加记账，位移换成了百分比，但仍然依赖「条带的高度正好是三十格」。
 *
 * 第三版去掉条带，只留一格窗口与两条 100% 位移的关键帧：稳是稳了，但整格位移下带过冲的曲线会把
 * 数字顶出窗口、切掉小半个字，所以那一版只能用一条不带过冲的缓动。
 *
 * 现在连窗口也不要了——位移收到 6px，过冲与模糊都接得住，也不再需要「一格有多高」这个数。
 *
 * 整枚刚挂上（刷新页面、切换会话、上下文占用那一处第一帧）与位数变了新长出来的那一位也照弹：
 * 没有上一个数字，就只有新数字进场——这正是「换了会话，读数跳了一下」那一下。
 *
 * 三处都用它：命中率那枚胶囊（座位里由 React 渲染）、上下文占用那串百分比（挂在 dsh 自己的文本
 * 节点旁边，见 reel-host），以及文件变更行行尾那两个 `+n` / `-m`（座位里由 React 渲染，见
 * ../file-mutation/file-mutation-row）。
 *
 * 读数的形状由调用方那一侧决定，这里只认「一个可选的不变前缀 + 几位数字 + 可选的一位小数 + 一个
 * 可选的不变后缀」：命中率与占用是 `97.3%` / `26%`（后缀 `%`），行尾统计是 `+96` / `-3`
 * （前缀正负号、没有后缀），整数位比三位的占用多也照认——行数会过千。
 *
 * 颜色不在这里：这一截**不写 color**，从调用方挂在它外面那一层继承——命中率那一处挂的是「缓存命中 +
 * 读数」那一组（名字与读数同色），占用那一处挂的是 dsh 那颗按钮；段标记与段内位置也归调用方写。
 *
 * @module dsh-chat-ux/chat/reel/digit-reel
 */
import {useState} from 'react'
import type {CSSProperties, ReactElement} from 'react'
import {
    REEL_CELL_CLASS, REEL_SLOT_CLASS, REEL_SPOKEN_CLASS, REEL_STAGGER_MS, REEL_STATIC_CLASS,
    REEL_TEXT_CLASS, REEL_WAS_CLASS,
} from './reel-styles'

/** 读数中间那一段的形状：一至六位整数，可带一位小数。首尾那两个不变的标记由调用方给。 */
const READING_PATTERN = /^(\d{1,6})(?:\.(\d))?$/

/** 这一枚收到的：读数、它首尾那两个不变的标记、翻动开着没有，以及要不要给读屏另留一份。 */
export interface DigitReelProps {
    /** `97.3%` 或 `+96` 这样的读数。 */
    text: string
    /** 读数前面那个不变的标记（行尾统计是 `+` / `-`）；不给时没有前缀。 */
    prefix?: string
    /** 读数后面那个不变的标记；不给时是命中率与占用那个 `%`。 */
    suffix?: string
    /** 翻动开着没有；关着时这一截就是一段静态读数。 */
    rolling: boolean
    /** 视觉块是否标 `aria-hidden` 并另给一份视觉隐藏的纯文本——页面上没有别的可读文本时才要。 */
    spoken: boolean
}

/**
 * 这一截读数：开着时是几位数字加小数点与它首尾那两个标记，关着时是一段纯文本。
 * @param props - 读数、首尾标记、开关与读屏那一份。
 * @returns 这一截。
 */
export function DigitReel({text, prefix = '', suffix = '%', rolling, spoken}: DigitReelProps): ReactElement {
    const reading = splitReading(text, prefix, suffix)
    // 形状对不上（dsh 那边换了口径）、或者读者关掉了这一项时，退回纯文本：这一截照旧是那个读数。
    if (!rolling || reading === null) {
        return <span className={REEL_TEXT_CLASS}>{text}</span>
    }
    const digits = reading.integer.split('')
    return (
        <>
            <span className={REEL_TEXT_CLASS} aria-hidden>
                {/* 首尾两个标记不弹，与数字位并排；它们跟着调用方给的形状走。 */}
                {prefix !== '' && <span className={REEL_STATIC_CLASS}>{prefix}</span>}
                {digits.map((digit, index) => (
                    <Digit key={digits.length - 1 - index} digit={Number(digit)} place={index}/>
                ))}
                {reading.decimal !== null && (
                    <>
                        <span className={REEL_STATIC_CLASS}>.</span>
                        <Digit digit={Number(reading.decimal)} place={digits.length}/>
                    </>
                )}
                {suffix !== '' && <span className={REEL_STATIC_CLASS}>{suffix}</span>}
            </span>
            {spoken && <span className={REEL_SPOKEN_CLASS}>{text}</span>}
        </>
    )
}

/** 一个数字位收到的载荷。 */
interface DigitProps {
    /** 这一位该显示的数字。 */
    digit: number
    /** 这一位在一行里的次序，0 是最高位；低位起手更晚。 */
    place: number
}

/** 这一位现在的数字，以及正在退场的那个。 */
interface ReelPair {
    /** 窗口里现在的数字。 */
    shown: number
    /** 上一个数字；首帧挂载时是 null。 */
    previous: number | null
}

/**
 * 一个数字位：一个槽位，里头最多两个数字——现在的在文档流里，上一个压在它上面。
 * @param props - 数字与次序。
 * @returns 这一位。
 */
function Digit({digit, place}: DigitProps): ReactElement {
    // 读数一变就把原来那个挪到「上一个」的位置，新数字接替它。key 用的是数字本身，所以**没变的那一
    // 位不会重新挂载**、也就不会播动画：读数一变就让每位都弹，看着像一直在抽。
    const [pair, setPair] = useState<ReelPair>({shown: digit, previous: null})
    if (pair.shown !== digit) setPair({shown: digit, previous: pair.shown})
    const delay: CSSProperties = {animationDelay: String(place * REEL_STAGGER_MS) + 'ms'}
    return (
        <span className={REEL_SLOT_CLASS}>
            {pair.previous !== null && (
                <span key={'was-' + String(pair.previous)} className={REEL_WAS_CLASS} style={delay}>
                    {pair.previous}
                </span>
            )}
            <span key={'now-' + String(pair.shown)} className={REEL_CELL_CLASS} style={delay}>
                {digit}
            </span>
        </span>
    )
}

/** 读数拆出来的两截数字。 */
interface ReadingParts {
    /** 整数部分，一位到六位。 */
    integer: string
    /** 那一位小数；读数不带小数位时是 null（上下文占用与行数统计都是整数）。 */
    decimal: string | null
}

/**
 * 把读数拆成整数部分与那一位小数：先按调用方给的形状削掉首尾那两个不变的标记，再认中间那一段。
 *
 * 两个标记都是空串时（行尾统计没有后缀）就是「削掉零个字符」，所以「有没有标记」这一层不必单独判。
 * @param text - `97.3%` 或 `+96` 这样的读数。
 * @param prefix - 前缀标记；没有时是空串。
 * @param suffix - 后缀标记；没有时是空串。
 * @returns 两截数字；形状对不上时是 null，调用方退回纯文本。
 */
function splitReading(text: string, prefix: string, suffix: string): ReadingParts | null {
    if (!text.startsWith(prefix) || !text.endsWith(suffix)) return null
    const matched = READING_PATTERN.exec(text.slice(prefix.length, text.length - suffix.length))
    if (matched === null) return null
    const integer = matched[1]
    if (integer === undefined) return null
    return {integer, decimal: matched[2] ?? null}
}
