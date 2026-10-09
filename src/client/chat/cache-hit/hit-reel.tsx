/**
 * 命中率读数里那几位数字的翻新动画：一格一格地翻。
 *
 * 读数一有新值，**变了的那一位**把新数字从下面一格托上来，同时把上一个数字往上面一格送走
 * （220 ms，低位比高位晚 15 ms 起手）。位移写的是 `translateY(±100%)`——百分比相对的是**这一格
 * 自己的行盒**，所以与一格有多高、字号多大、字体度量、页面缩放统统无关；而**终态是零位移**：
 * 动画走完，数字就在它本来的位置上。
 *
 * 这两条合起来，这一处不可能「停歪」：没有中间格、没有归一、没有事后纠正，也不需要问元素任何尺寸。
 *
 * 2026-10 的前两版都栽在「算一格」上：
 *
 * - 第一版按 CSS 变量算整格滚动，位移与每格真实高度每格差 0.84px，误差按格数累积——滚到第 9 格
 *   累计 7.55px，已经超过半格（6.90px），窗口里于是同时露着上下两个数字的各一半；
 * - 第二版整条带滚动加记账，位移换成了百分比，但仍然依赖「条带的高度正好是三十格」。
 *
 * 现在把这条依赖也去掉了：条带没了，只剩下这一格与上一格。
 *
 * 整枚刚挂上（刷新页面、切换会话）与位数变了新长出来的那一位也照滚：没有上一个数字，就只有
 * 新数字从下面一格上来——这正是「换了会话，读数翻了一下」那一下。
 *
 * 给读屏的那一份：视觉块标 `aria-hidden`，读数另给一份视觉隐藏的纯文本。
 *
 * @module dsh-chat-ux/client/chat/cache-hit/hit-reel
 */
import {useState} from 'react'
import type {CSSProperties, ReactElement} from 'react'
import {
    CACHE_HIT_VALUE_CLASS, HIT_REEL_CELL_CLASS, HIT_REEL_CLASS, HIT_REEL_SPOKEN_CLASS, HIT_REEL_STATIC_CLASS,
    HIT_REEL_WAS_CLASS,
} from './cache-hit-styles'

/** 一次翻动用多久。与样式表里那两条关键帧的时长是同一个数，改一处就要改另一处。 */
const REEL_TURN_MS = 220

/** 低位比高位晚这么多起手，动起来的次序从左往右。 */
const REEL_STAGGER_MS = 15

/** 读数的形状：一至三位整数、一位小数、百分号，与 `formatHitPercent` 的产物对上。 */
const READING_PATTERN = /^(\d{1,3})\.(\d)%$/

/** 这一枚收到的：读数、四档取色的类名，以及翻动动画开着没有。 */
export interface HitReelProps {
    /** `97.3%` 这样的读数。 */
    text: string
    /** 四档取色的类名。 */
    toneClass: string
    /** 动画开着没有；关着时这一枚就是一段静态读数。 */
    rolling: boolean
}

/**
 * 命中率那一截：开着时是几位数字加小数点与百分号，关着时是一段纯文本。
 * @param props - 读数、档位色与开关。
 * @returns 命中率那一截。
 */
export function HitReel({text, toneClass, rolling}: HitReelProps): ReactElement {
    const reading = splitReading(text)
    const valueClass = [CACHE_HIT_VALUE_CLASS, toneClass].join(' ')
    // 形状对不上（dsh 那边换了口径）、或者读者关掉了这一项时，退回纯文本：这一枚照旧是那个读数。
    if (!rolling || reading === null) return <span className={valueClass}>{text}</span>
    const digits = reading.integer.split('')
    return (
        <>
            <span className={valueClass} aria-hidden>
                {digits.map((digit, index) => (
                    <Digit key={digits.length - 1 - index} digit={Number(digit)} place={index}/>
                ))}
                <span className={HIT_REEL_STATIC_CLASS}>.</span>
                <Digit digit={Number(reading.decimal)} place={digits.length}/>
                <span className={HIT_REEL_STATIC_CLASS}>%</span>
            </span>
            <span className={HIT_REEL_SPOKEN_CLASS}>{text}</span>
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

/** 这一位现在的数字，以及正在往上面走的那一个。 */
interface ReelPair {
    /** 窗口里现在的数字。 */
    shown: number
    /** 上一个数字；首帧挂载时是 null。 */
    previous: number | null
}

/**
 * 一个数字位：一格窗口，里头最多两个数字——现在的从下面上来，上一个往上面走。
 * @param props - 数字与次序。
 * @returns 这一位。
 */
function Digit({digit, place}: DigitProps): ReactElement {
    // 读数一变就把原来那个挪到上面去，新数字接替它。key 用的是数字本身，所以**没变的那一位不会
    // 重新挂载**、也就不会播动画：读数一变就让每位都翻，看着像一直在抽。
    const [pair, setPair] = useState<ReelPair>({shown: digit, previous: null})
    if (pair.shown !== digit) setPair({shown: digit, previous: pair.shown})
    const delay: CSSProperties = {animationDelay: String(place * REEL_STAGGER_MS) + 'ms'}
    return (
        <span className={HIT_REEL_CLASS}>
            {pair.previous !== null && (
                <span key={'was-' + String(pair.previous)} className={HIT_REEL_WAS_CLASS} style={delay}>
                    {pair.previous}
                </span>
            )}
            <span key={'now-' + String(pair.shown)} className={HIT_REEL_CELL_CLASS} style={delay}>
                {digit}
            </span>
        </span>
    )
}

/** 读数拆出来的两截数字。 */
interface HitReadingParts {
    /** 整数部分，一位到三位。 */
    integer: string
    /** 那一位小数。 */
    decimal: string
}

/**
 * 把读数拆成整数部分与那一位小数。
 * @param text - `97.3%` 这样的读数。
 * @returns 两截数字；形状对不上时是 null，调用方退回纯文本。
 */
function splitReading(text: string): HitReadingParts | null {
    const matched = READING_PATTERN.exec(text)
    if (matched === null) return null
    const integer = matched[1]
    const decimal = matched[2]
    if (integer === undefined || decimal === undefined) return null
    return {integer, decimal}
}
