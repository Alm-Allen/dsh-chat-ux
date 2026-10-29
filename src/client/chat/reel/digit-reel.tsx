/**
 * 数字滚动：变了的那一位原地弹一下，新数字从下方 6px 处淡入、旧数字朝反方向淡出，500 ms，低位比高位晚 70 ms 起手。
 *
 * 位移固定 6px、不参与排版，也不问元素任何尺寸，所以不可能停歪，更不需要知道「一格有多高」这个数。
 * 整枚刚挂上（刷新页面、切会话、上下文占用的第一帧）与位数变了新长出来的那一位也照弹：没有上一个数字就
 * 只有新数字进场，这正是「换了会话，读数跳了一下」那一下。
 * 命中率胶囊、上下文占用的百分比、文件变更行行尾那两个 +n 与 -m 都用它；颜色不在这一截里，它不写 color，
 * 从调用方挂在外面那一层继承，段标记与段内位置也归调用方写
 */
import {useState} from "react"
import type {CSSProperties, ReactElement} from "react"
import {
	REEL_CELL_CLASS, REEL_FAST_CLASS, REEL_SLOT_CLASS, REEL_SPOKEN_CLASS, REEL_STAGGER_MS, REEL_STATIC_CLASS,
	REEL_TEXT_CLASS, REEL_WAS_CLASS,
} from "./reel-styles"

// 读数中间那一段的形状：一至六位整数，可带一位小数；首尾那两个不变的标记由调用方给
const READING_PATTERN = /^(\d{1,6})(?:\.(\d))?$/

// 这一枚收到的：读数、它首尾那两个不变的标记、滚动开着没有、用哪一档时长，以及要不要给读屏另留一份
export interface DigitReelProps {
	// 读数，97.3% 或 +96 这样
	text: string
	// 读数前面那个不变的标记，行尾统计是 + 或 -，不给时没有前缀
	prefix?: string
	// 读数后面那个不变的标记，不给时是命中率与占用那个 %
	suffix?: string
	// 关着时这一截就是一段静态读数
	rolling: boolean
	// 读数变化有多密：fast 用更短的一次弹动（REEL_TURN_FAST_MS）。高频那一处（文件变更行那两个数，
	// 每一两百毫秒一跳）必须走它：500 ms 那一档下旧数字还没退完就被下一跳换掉，一位上挂着一串残影；
	// 低频那两处不给这个字段，照走 500 ms
	cadence?: "fast" | undefined
	// 视觉块标 aria-hidden 并另给一份视觉隐藏的纯文本；页面上没有别的可读文本时才要
	spoken: boolean
}

// 这一截读数：开着时是数字位加首尾标记，关着时是一段纯文本
export function DigitReel(props: DigitReelProps): ReactElement {
	const {text, prefix = "", suffix = "%", rolling, cadence, spoken} = props
	const readingParts = splitReading(text, prefix, suffix)
	// 形状对不上（dsh 那边换了口径）或者读者关掉了这一项时，退回纯文本：这一截照旧是那个读数
	if (!rolling || readingParts === null) {
		return <span className={REEL_TEXT_CLASS}>{text}</span>
	}
	// 时长经自定义属性往下传，不写成内联 style：关键帧那一侧要用 var()，内联只写得了声明值
	const textClassName = cadence === "fast" ? REEL_TEXT_CLASS + " " + REEL_FAST_CLASS : REEL_TEXT_CLASS
	const digitCharList = readingParts.integer.split("")
	return (
		<>
			<span className={textClassName} aria-hidden>
				{/* 首尾两个标记不弹，与数字位并排；它们跟着调用方给的形状走 */}
				{prefix !== "" && <span className={REEL_STATIC_CLASS}>{prefix}</span>}
				{digitCharList.map((digit, index) => (
					<Digit key={digitCharList.length - 1 - index} digit={Number(digit)} place={index}/>
				))}
				{readingParts.decimal !== null && (
					<>
						<span className={REEL_STATIC_CLASS}>.</span>
						<Digit digit={Number(readingParts.decimal)} place={digitCharList.length}/>
					</>
				)}
				{suffix !== "" && <span className={REEL_STATIC_CLASS}>{suffix}</span>}
			</span>
			{spoken && <span className={REEL_SPOKEN_CLASS}>{text}</span>}
		</>
	)
}

// 一个数字位收到的：数字与次序
interface DigitProps {
	// 这一位该显示的数字
	digit: number
	// 这一位在一行里的次序，0 是最高位；低位起手更晚
	place: number
}

// 这一位现在的数字，以及正在退场的那个
interface ReelPair {
	shown: number
	// 上一个数字；首帧挂载时是 null
	previous: number | null
}

// 一个数字位：一个槽位，里头最多两个数字——现在的在文档流里，上一个压在它上面
function Digit({digit, place}: DigitProps): ReactElement {
	// 读数一变就把原来那个挪到「上一个」的位置，新数字接替它。key 用的是数字本身，所以没变的那一位
	// 不会重新挂载、也就不会播动画：读数一变就让每位都弹，看着像一直在抽
	const [reelPair, setReelPair] = useState<ReelPair>({shown: digit, previous: null})
	if (reelPair.shown !== digit) setReelPair({shown: digit, previous: reelPair.shown})
	const staggerStyle: CSSProperties = {animationDelay: String(place * REEL_STAGGER_MS) + "ms"}
	return (
		<span className={REEL_SLOT_CLASS}>
			{reelPair.previous !== null && (
				<span key={"was-" + String(reelPair.previous)} className={REEL_WAS_CLASS} style={staggerStyle}>
					{reelPair.previous}
				</span>
			)}
			<span key={"now-" + String(reelPair.shown)} className={REEL_CELL_CLASS} style={staggerStyle}>
				{digit}
			</span>
		</span>
	)
}

// 读数拆出来的两截数字
interface ReadingParts {
	// 整数部分，一位到六位
	integer: string
	// 那一位小数；读数不带小数位时是 null（上下文占用与行数统计都是整数）
	decimal: string | null
}

// 把读数拆成整数部分与那一位小数：先按调用方给的形状削掉首尾那两个不变的标记，再认中间那一段
// 两个标记都是空串时（行尾统计没有后缀）就是削掉零个字符，所以「有没有标记」这一层不必单独判
function splitReading(text: string, prefix: string, suffix: string): ReadingParts | null {
	if (!text.startsWith(prefix) || !text.endsWith(suffix)) return null
	const matchedReading = READING_PATTERN.exec(text.slice(prefix.length, text.length - suffix.length))
	if (matchedReading === null) return null
	const integerPart = matchedReading[1]
	if (integerPart === undefined) return null
	return {integer: integerPart, decimal: matchedReading[2] ?? null}
}
