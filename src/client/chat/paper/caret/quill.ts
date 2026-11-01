/**
 * 羽毛笔光标：一支由几何算出来的笔，笔尖压在插入点上，整支向右倾 35°
 *
 * 鎏金笔尖装在笔箍里，裸露的角质笔杆，两侧羽枝一窄一宽、各带分叉，笔尖上有一点光。没有位图。
 * 曲线、比例与每一段手画的路径都照搬 nocturne 的 core/quill.js；按「这是一根光标」重算的只有三样，
 * 各自在旁边写着理由：整支的缩放倍率（QUILL_HEIGHT_SCALE）、羽枝的根数、笔尖的横向落点
 *
 * **它不是独立的一根光标，而是 ../../caret/caret-motion 那根自绘插入符里面的一种画法。**
 * 位置、位移过渡、什么时候出现与藏起来、按掉原生插入符，全部仍归 caret-motion；这里只负责
 * 「按给定高度画成什么样」。不这么做的话就会有两套测量、两套事件、两套让位逻辑互相打架，
 * 而且纸感那一层是拿 [data-chat-ux-caret-layer] 的矩形去点灯的，多一根浮层会让它量到别处去
 *
 * 形状上有四处与 nocturne 不同，都是因为「这是光标，不是装饰」：
 * · 去掉 sway（3.4s 的左右微摆）。笔尖必须钉在插入点上，摆动等于光标位置在漂
 * · 去掉羽片上那道上下扫过的光。羽片本身只有几十像素宽，扫光几乎看不出来，却多一条一直在跑的动画
 * · 笔尖那一点光不再循环：nocturne 让它 2.8s 亮一次，那是「这根还活着」的信号；这支笔整体是静止的，
 *   那点光就留成一点固定的高光（写在 quill-styles 里），它只是不再随时间变
 * · 不去量光标后面那个字的字宽。nocturne 拿它把笔尖横向推进半格；本模块只管几何，笔尖就压在插入符
 *   左缘上，与那根 2px 的条同一列，两种画法互换时位置不跳
 *
 * 于是整支笔在屏幕上是不动的：不闪、不呼吸、笔尖的光不来回亮。会变的只有位置——
 * 读者挪光标时那一趟 80 ms 位移过渡归 caret-motion，不归这里
 *
 * 颜色不在这里，写在 quill-styles.ts，变量一律 --dsh-chat-ux-paper-quill-*：
 * 与纸感渲染色板（--dsh-chat-ux-paper-*）刻意不共用一套名字，换纸、换房间时羽毛只按墨色与纸色派生
 */

// 挂在 caret-motion 那根自绘插入符上的标记：有它，样式表就把那一根画成羽毛，而不是 2px 的条
export const QUILL_ATTRIBUTE = "data-chat-ux-paper-quill"

// 羽毛根元素的 class，与 quill-styles.ts 里的选择器同名
export const QUILL_ROOT_CLASS = "dsh-chat-ux-paper-quill"

// 羽毛在它自己坐标系里的可见范围。原点是笔尖：横向 -4 到 60，纵向 -74 到 4
const QUILL_VIEW = {left: 4, top: 74, width: 64, height: 78}

/**
 * 整支按插入符高度的多少倍画。
 *
 * 这一条是**改过 nocturne 的**：它用 1.15。放大有个上限，来自挂载位置——那根自绘插入符挂在
 * `.grow` 里，`.grow` 的父元素 `.scroll` 是 `overflow-y: auto`，**伸出去的部分会被裁掉**，
 * 而插入符离那一行顶端只有 `.input` 的 4px 上内边距加行内居中那一点点。
 *
 * 在真页面上量过（dsh 默认档：16px 字、26px 行高、字盒 22px、那一行上方留 6px）：
 * 1.15 时羽梢比插入符顶高 5.52px，**只剩 0.48px 余量**——读者把字号调大一档就会被切掉一片羽枝。
 * 1.0 时整支 22px、羽梢只高 2.39px，余量 3.6px，而且余量随字号等比增长
 * （上方空间与字盒都随字号线性放大），所以任何字号档下都还留得住。
 *
 * 降到 1.0 之后形状仍然认得出：羽片在 16px 字号下约 13×17px，羽枝之间的缝还有一两个像素。
 * 要整支都不被裁只有一条路：挂到 body 下用 position: fixed，那就得自己再量一遍视口坐标、
 * 再做一套视口裁剪，与「位置与位移仍然只由 caret-motion 负责」这条冲突——
 * 而正是这条让纸感那一层拿 [data-chat-ux-caret-layer] 的矩形去点灯时不会量错
 */
const QUILL_HEIGHT_SCALE = 1

// 笔尖落在字盒纵向的哪个位置，羽毛的笔尖就压在这个点上
const QUILL_NIB_Y = 0.84

// 整支右倾的角度
const QUILL_LEAN = 35

// 一个点，以及羽脊上某处的位置、切向与法向
type QuillPoint = readonly [number, number]
interface QuillCurve {
	at: QuillPoint
	tangent: QuillPoint
	normal: QuillPoint
}

// 取越界的邻居时用的空点
const ZERO_POINT: QuillPoint = [0, 0]

// 两位小数：路径与尺寸都按它收，字符串稳定，也不会冒出 0.30000000000000004 这种位数
const round2 = (value: number): number => Number(value.toFixed(2))

// 穿过一串点的样条：每个点的控制点取前后邻居差的三分之一（Catmull-Rom 转三次贝塞尔）
const curveThrough = (points: readonly QuillPoint[]): string => {
	let path = ""
	for (let index = 0; index < points.length - 1; index += 1) {
		const previous = points[Math.max(0, index - 1)] ?? ZERO_POINT
		const from = points[index] ?? ZERO_POINT
		const to = points[index + 1] ?? ZERO_POINT
		const next = points[Math.min(points.length - 1, index + 2)] ?? to
		const control1 = round2(from[0] + (to[0] - previous[0]) / 6) + " " + round2(from[1] + (to[1] - previous[1]) / 6)
		const control2 = round2(to[0] - (next[0] - from[0]) / 6) + " " + round2(to[1] - (next[1] - from[1]) / 6)
		path += " C" + control1 + " " + control2 + " " + to[0] + " " + to[1]
	}
	return path
}

const pathThrough = (points: readonly QuillPoint[]): string => {
	const first = points[0] ?? ZERO_POINT
	return "M" + first[0] + " " + first[1] + curveThrough(points)
}

// 羽脊：笔尖之上那段弯曲的脊，羽枝都长在它上面
const QUILL_RACHIS: readonly [QuillPoint, QuillPoint, QuillPoint, QuillPoint] = [[0, -24], [0.4, -46], [2.4, -70], [5.6, -90]]

// 羽脊上参数 t 处的位置与两根方向。法向朝一侧，羽枝沿它长出去
const alongRachis = (t: number): QuillCurve => {
	const [head, first, second, tail] = QUILL_RACHIS
	const rest = 1 - t
	const weight0 = rest * rest * rest
	const weight1 = 3 * rest * rest * t
	const weight2 = 3 * rest * t * t
	const weight3 = t * t * t
	const at: QuillPoint = [
		weight0 * head[0] + weight1 * first[0] + weight2 * second[0] + weight3 * tail[0],
		weight0 * head[1] + weight1 * first[1] + weight2 * second[1] + weight3 * tail[1],
	]
	const dx = 3 * rest * rest * (first[0] - head[0]) + 6 * rest * t * (second[0] - first[0]) + 3 * t * t * (tail[0] - second[0])
	const dy = 3 * rest * rest * (first[1] - head[1]) + 6 * rest * t * (second[1] - first[1]) + 3 * t * t * (tail[1] - second[1])
	const length = Math.hypot(dx, dy) || 1
	const tangent: QuillPoint = [dx / length, dy / length]
	return {at, tangent, normal: [-tangent[1], tangent[0]]}
}

// 羽枝从羽脊往外伸多远。两侧各一条曲线，各带一道缺口，那就是羽枝的分叉
const QUILL_VANE_FROM = 0.05
const gauss = (offset: number, center: number, width: number): number => Math.exp(-(((offset - center) / width) ** 2))
const trailingReach = (s: number): number =>
	8.4 * Math.sin(Math.PI * s ** 0.75) ** 0.85 * (1 - 0.3 * gauss(s, 0.42, 0.018) - 0.24 * gauss(s, 0.67, 0.016))
const leadingReach = (s: number): number =>
	3.4 * Math.sin(Math.PI * s ** 0.65) ** 0.9 * (1 - 0.32 * gauss(s, 0.56, 0.02))

/**
 * 羽片边缘上 s 处、某一侧的那一点
 *
 * side 是 1（宽的那一侧）或 -1（窄的一侧）；reach 按比例把羽枝缩短，
 * 羽枝的端点用它收到 0.94，才不伸出羽片轮廓
 */
const edgeOn = (s: number, side: 1 | -1, reach: number): QuillPoint => {
	const t = QUILL_VANE_FROM + (1 - QUILL_VANE_FROM) * s
	const curve = alongRachis(t)
	const width = (side > 0 ? trailingReach(s) : leadingReach(s)) * reach
	return [
		round2(curve.at[0] + curve.normal[0] * width * side + curve.tangent[0] * width * 0.38),
		round2(curve.at[1] + curve.normal[1] * width * side + curve.tangent[1] * width * 0.38),
	]
}

/**
 * 羽枝的根数。
 *
 * nocturne 画的是 30（宽侧）与 22（窄侧），那是给它的皮肤当装饰用的。这里整支笔只有二十来个像素高，
 * 五十多根羽枝挤在不到二十个像素里，线一叠就是一小片均匀的灰，读者看到的是一块污渍而不是羽毛。
 * 减到 14 与 10 之后，相邻两根之间隔开约两个像素，羽片才认得出是一根羽毛
 */
const QUILL_TRAILING_BARB_COUNT = 14
const QUILL_LEADING_BARB_COUNT = 10

// 羽脊整根取样的位置，0 到 1 均分
const QUILL_SAMPLES: readonly number[] = Array.from({length: 61}, (_, index) => index / 60)

// 羽片轮廓：窄的一侧从根到梢，宽的一侧从梢回根，首尾相接
const QUILL_VANE_PATH = (() => {
	const leading = QUILL_SAMPLES.map((s) => edgeOn(s, -1, 1))
	const trailing = QUILL_SAMPLES.slice().reverse().map((s) => edgeOn(s, 1, 1))
	return pathThrough(leading.concat(trailing.slice(1))) + " Z"
})()

// 羽枝：从羽脊上每隔一段伸出去一根，端点收进羽片轮廓里
const barbPaths = (side: 1 | -1, count: number): string => {
	let path = ""
	for (let index = 0; index < count; index += 1) {
		const s = 0.04 + (index / (count - 1)) * 0.9
		const curve = alongRachis(QUILL_VANE_FROM + (1 - QUILL_VANE_FROM) * s)
		const end = edgeOn(Math.min(1, s + 0.05), side, 0.94)
		const width = (side > 0 ? trailingReach(s) : leadingReach(s)) * 0.55
		const control: QuillPoint = [
			round2(curve.at[0] + curve.normal[0] * width * side),
			round2(curve.at[1] + curve.normal[1] * width * side),
		]
		path += "M" + round2(curve.at[0]) + " " + round2(curve.at[1]) + " Q" + control[0] + " " + control[1]
			+ " " + end[0] + " " + end[1] + " "
	}
	return path.trim()
}

const QUILL_TRAILING_BARBS = barbPaths(1, QUILL_TRAILING_BARB_COUNT)
const QUILL_LEADING_BARBS = barbPaths(-1, QUILL_LEADING_BARB_COUNT)

// 羽脊自己的实体：根粗梢细的一条带子，左边从根到梢、右边从梢回根
const QUILL_RACHIS_SHAPE = (() => {
	const steps = Array.from({length: 25}, (_, index) => (index / 24) * 0.98)
	const side = (sign: 1 | -1): QuillPoint[] => steps.map((t): QuillPoint => {
		const curve = alongRachis(t)
		const half = 0.62 * (1 - t) + 0.08
		return [round2(curve.at[0] + curve.normal[0] * half * sign), round2(curve.at[1] + curve.normal[1] * half * sign)]
	})
	return pathThrough(side(-1).concat(side(1).reverse())) + " Z"
})()

// 笔杆、笔箍、笔尖与它们的刻线。这几段是手画的定值，原样照搬
const QUILL_RACHIS_LINE = "M-0.15 -24 C0.25 -46 2.25 -70 5.6 -90"
const QUILL_CALAMUS_PATH = "M-1.15 -10.4 C-1.2 -15 -1.05 -20 -0.82 -24.6 L0.82 -24.6 C1.05 -20 1.2 -15 1.15 -10.4 Z"
const QUILL_DOWN_PATH = "M0 -25.2 q-2.6 0.5 -4.6 -1.4 M0 -26.6 q-3 -0.2 -4.8 -3.2 M0.1 -28 q-2.4 -0.9 -3.6 -4.2 "
	+ "M0.2 -25.4 q2.8 0.7 4.8 -0.8 M0.2 -27 q3.3 -0.1 5.2 -2.9 M0.3 -28.6 q2.7 -0.8 4 -4"
const QUILL_FERRULE_PATH = "M-1.55 -9 L1.55 -9 L1.4 -11.2 L-1.4 -11.2 Z"
const QUILL_NIB_PATH = "M0 0.3 C-0.6 -2 -1.9 -5.4 -1.7 -9.1 L1.7 -9.1 C1.9 -5.4 0.6 -2 0 0.3 Z"
const QUILL_SLIT_PATH = "M0 -0.2 L0 -5.4"
const QUILL_SHOULDERS_PATH = "M-1.5 -7.6 Q0 -8.3 1.5 -7.6"

// 渐变与裁剪共用的 id 前缀。同页只有这一份，不会被谁盖掉
// 样式表按它拼 fill: url(#…)，两处引用的是同一个 id
export const QUILL_ID = "dsh-chat-ux-paper-quill"

const QUILL_VIEW_BOX = -QUILL_VIEW.left + " " + -QUILL_VIEW.top + " " + QUILL_VIEW.width + " " + QUILL_VIEW.height

// 各部件身上的 class。下面写好、样式在 quill-styles.ts，两处必须一字不差
const PART = {
	vane: QUILL_ROOT_CLASS + "-vane",
	barbs: QUILL_ROOT_CLASS + "-barbs",
	rachis: QUILL_ROOT_CLASS + "-rachis",
	rachisLight: QUILL_ROOT_CLASS + "-rachis-light",
	down: QUILL_ROOT_CLASS + "-down",
	engraving: QUILL_ROOT_CLASS + "-engraving",
	hole: QUILL_ROOT_CLASS + "-hole",
	glint: QUILL_ROOT_CLASS + "-glint",
}

// 整支笔的标记。先在原点画好，再整体右倾 QUILL_LEAN 度
const QUILL_MARKUP = [
	'<svg viewBox="', QUILL_VIEW_BOX, '" aria-hidden="true">',
	"<defs>",
	'<linearGradient id="', QUILL_ID, '-vane" x1="0" x2="1" y1="0" y2="0">',
	'<stop offset="0" stop-color="var(--dsh-chat-ux-paper-quill-edge)"/>',
	'<stop offset="0.3" stop-color="var(--dsh-chat-ux-paper-quill-sheen)"/>',
	'<stop offset="0.5" stop-color="var(--dsh-chat-ux-paper-quill-body)"/>',
	'<stop offset="1" stop-color="var(--dsh-chat-ux-paper-quill-edge)"/>',
	"</linearGradient>",
	'<linearGradient id="', QUILL_ID, '-gilt" x1="0" x2="1" y1="0" y2="0">',
	'<stop offset="0" stop-color="var(--dsh-chat-ux-paper-quill-metal-lo)"/>',
	'<stop offset="0.35" stop-color="var(--dsh-chat-ux-paper-quill-metal-hi)"/>',
	'<stop offset="0.6" stop-color="var(--dsh-chat-ux-paper-quill-metal)"/>',
	'<stop offset="1" stop-color="var(--dsh-chat-ux-paper-quill-metal-lo)"/>',
	"</linearGradient>",
	'<linearGradient id="', QUILL_ID, '-horn" x1="0" x2="1" y1="0" y2="0">',
	'<stop offset="0" stop-color="var(--dsh-chat-ux-paper-quill-horn-lo)"/>',
	'<stop offset="0.35" stop-color="var(--dsh-chat-ux-paper-quill-horn-hi)"/>',
	'<stop offset="1" stop-color="var(--dsh-chat-ux-paper-quill-horn-lo)"/>',
	"</linearGradient>",
	'<clipPath id="', QUILL_ID, '-clip"><path d="', QUILL_VANE_PATH, '"/></clipPath>',
	"</defs>",
	'<g transform="rotate(', QUILL_LEAN, ')">',
	'<path d="', QUILL_DOWN_PATH, '" class="', PART.down, '"/>',
	'<path d="', QUILL_VANE_PATH, '" class="', PART.vane, '"/>',
	'<g clip-path="url(#', QUILL_ID, '-clip)">',
	'<path d="', QUILL_TRAILING_BARBS, '" class="', PART.barbs, '"/>',
	'<path d="', QUILL_LEADING_BARBS, '" class="', PART.barbs, '"/>',
	"</g>",
	'<path d="', QUILL_RACHIS_SHAPE, '" class="', PART.rachis, '"/>',
	'<path d="', QUILL_RACHIS_LINE, '" class="', PART.rachisLight, '"/>',
	'<path d="', QUILL_CALAMUS_PATH, '" fill="url(#', QUILL_ID, '-horn)"/>',
	'<path d="', QUILL_FERRULE_PATH, '" fill="url(#', QUILL_ID, '-gilt)"/>',
	'<path d="', QUILL_NIB_PATH, '" fill="url(#', QUILL_ID, '-gilt)"/>',
	'<path d="', QUILL_SHOULDERS_PATH, '" class="', PART.engraving, '"/>',
	'<path d="', QUILL_SLIT_PATH, '" class="', PART.engraving, '"/>',
	'<circle cx="0" cy="-6" r="0.5" class="', PART.hole, '"/>',
	'<circle class="', PART.glint, '" cx="0.4" cy="-1.8" r="0.9"/>',
	"</g></svg>",
].join("")

/**
 * 一支新的羽毛，返回它的根元素
 *
 * 调用方负责把它塞进 caret-motion 那根自绘插入符里。两件事的次序不能颠倒：
 * **先塞好、再打 QUILL_ATTRIBUTE**。属性一到，样式表就把那根的 2px 底色让掉；
 * 反过来写的话，让掉底色到笔挂上之间只要有一次强制回流，读者看到的就是一根空盒子。
 * 真颠倒了也不会永远空着——quill-styles 里那条 :not(:has(> …)) 会把 2px 条还回来
 */
export function buildQuillCaret(): HTMLElement {
	const element = document.createElement("div")
	element.className = QUILL_ROOT_CLASS
	element.setAttribute("aria-hidden", "true")
	element.innerHTML = QUILL_MARKUP
	return element
}

/**
 * 按插入符的高度把这支笔摆好
 *
 * 写的是相对那根 2px 条左上角的偏移：条的左上角就是插入符的左上角，所以这里的 left 与 top
 * 都可能是负数，羽枝朝右上伸出去，笔尖落在插入符左缘、纵向 QUILL_NIB_Y 处。
 * 尺寸写像素、不写 transform: scale：SVG 按 CSS 尺寸栅格化，0.28 倍缩放会把 0.28 单位的笔画糊成一片
 */
export function placeQuillCaret(element: HTMLElement, caretHeight: number): void {
	const height = caretHeight * QUILL_HEIGHT_SCALE
	const scale = height / QUILL_VIEW.height
	element.style.width = round2(QUILL_VIEW.width * scale) + "px"
	element.style.height = round2(height) + "px"
	element.style.left = round2(-QUILL_VIEW.left * scale) + "px"
	element.style.top = round2(caretHeight * QUILL_NIB_Y - QUILL_VIEW.top * scale) + "px"
}
