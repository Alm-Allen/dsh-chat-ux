/**
 * 发送气泡的冒头：读者按下发送以后，那一条从输入框里探出来，微顿，再升到它该在的位置。
 *
 * 两段加两条弹簧：第一段 easeInOut 从 emergeScale 长到 oversize，中间微顿并先往外送 holdDrift，
 * 第二段用欠阻尼弹簧回到 1。弹簧的角频率按「回落穿过终点落在这一段末尾」反算，尺寸那条用同一个
 * 穿越时刻，所以落定那一帧尺寸正好是 1，清掉 transform 不会跳
 *
 * 参数每次播之前读一遍，所以插件管理页上拖完滑杆，下一次发送就按新的走，不必刷新
 *
 * 动的是真实那一行里的气泡，不是替身：行本身仍在布局里占着那个位置，冒头期间落点是空的。
 * 判据全用 dsh 的语义属性：[data-submission-echo] 是提交后本地的回声，[data-chat-flow-kind="user"]
 * 是 Host 接住之后那一行。两者之间没有别的事件可用，所以回声那边挂一条 1 ms 的探针动画，
 * animationstart 就是「提交了」这通通知；真实行出现靠 MutationObserver 认，它回调在绘制之前
 *
 * 侧栏里的子智能体会话各有各的滚动器与输入区，所以这一整套都从那一行自己往上找，不用 document
 */
import {
	CHAT_FLOW_SELECTOR, COMPOSER_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_SELECTOR, MOTION_ROW_SELECTOR,
} from "../../dom-contract"
import type {BubbleRiseTuning} from "../../settings/settings-scope"
import {
	PENDING_STEERING_ATTRIBUTE, RISE_ATTRIBUTE, RISE_ECHO_HELD_ATTRIBUTE, RISE_ECHO_PROBE_NAME,
	SUBMISSION_ECHO_ATTRIBUTE,
} from "./bubble-rise-styles"

// 尺寸与位置在同一次穿越里收尾；让尺寸先到，落定那一帧还会差一点
const SIZE_SPEED = 1

// 弹簧尾巴不再等：超过这一段还没判到落定，就直接收
const SETTLE_SLACK_MS = 200

// 回声出现之后最多等这么久，超时就把回声放出来，别让读者以为没发出去
const ECHO_WAIT_MS = 1200

// 气泡右缘能超出聊天列多少：那个滚动器的左右各有 16px 内边距，再往外就被裁了
const SIDE_CLEARANCE_PX = 16

// 判定「聊天列的底就是输入区的顶」时的容差
const CLIP_TOLERANCE_PX = 2

// 气泡那一层；行里除了它还有时间与复制那一行
const BUBBLE_SELECTOR = "[data-message-bubble]"

// 真实那一行
const USER_ROW_SELECTOR = '[data-chat-flow-kind="user"]'

/**
 * 装上这一处：挂门控属性、接上回声的探针，返回卸下的把手
 * @param readTuning 现读一份冒头参数；每次播放之前调一次，卡片上改完下一次就生效
 */
export function installBubbleRise(readTuning: () => BubbleRiseTuning): () => void {
	const gate = typeof document === "undefined" ? null : document.documentElement
	if (gate === null) return () => undefined
	gate.setAttribute(RISE_ATTRIBUTE, "")
	const active = new Set<() => void>()
	let observer: MutationObserver | null = null
	let waitTimer = 0

	// 收掉等待窗口：观察器与超时一起断
	const closeWindow = (): void => {
		observer?.disconnect()
		observer = null
		if (waitTimer !== 0) window.clearTimeout(waitTimer)
		waitTimer = 0
	}

	// 把回声放出来：等待超时，或者这一条接不上动画时，读者至少看得见自己发的内容
	const revealEchoes = (scope: ParentNode): void => {
		for (const echo of scope.querySelectorAll<HTMLElement>(`[${SUBMISSION_ECHO_ATTRIBUTE}]`)) {
			echo.setAttribute(RISE_ECHO_HELD_ATTRIBUTE, "")
		}
	}

	// 新增的这一批里有没有真实那一行；认到就关窗口，不再往后看
	const claimFirstRow = (nodes: NodeList, scroller: HTMLElement): boolean => {
		for (const node of nodes) {
			if (!(node instanceof HTMLElement)) continue
			// 新增的通常就是那一行自己；整块替换时取最后一条，最旧的那些不会因此重新冒头
			const row = node.matches(USER_ROW_SELECTOR)
				? node
				: [...node.querySelectorAll<HTMLElement>(USER_ROW_SELECTOR)].at(-1) ?? null
			if (row === null) continue
			closeWindow()
			if (!playRise(row, active, readTuning())) revealEchoes(scroller)
			return true
		}
		return false
	}

	// 回声到了，真实行还会在几百毫秒内到：只在这一小段里看新增节点
	const watchRows = (echo: Element): void => {
		closeWindow()
		const scroller = echo.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
		if (scroller === null) return
		observer = new MutationObserver((records) => {
			for (const record of records) {
				if (claimFirstRow(record.addedNodes, scroller)) return
			}
		})
		observer.observe(scroller, {childList: true, subtree: true})
		waitTimer = window.setTimeout(() => {
			revealEchoes(scroller)
			closeWindow()
		}, ECHO_WAIT_MS)
	}

	const onEchoAppear = (event: Event): void => {
		if (!(event instanceof AnimationEvent) || event.animationName !== RISE_ECHO_PROBE_NAME) return
		const echo = event.target
		if (!(echo instanceof Element)) return
		if (!echo.hasAttribute(SUBMISSION_ECHO_ATTRIBUTE) || echo.hasAttribute(PENDING_STEERING_ATTRIBUTE)) return
		watchRows(echo)
	}

	document.addEventListener("animationstart", onEchoAppear, true)

	return () => {
		document.removeEventListener("animationstart", onEchoAppear, true)
		closeWindow()
		for (const finish of [...active]) finish()
		gate.removeAttribute(RISE_ATTRIBUTE)
		for (const echo of document.querySelectorAll(`[${RISE_ECHO_HELD_ATTRIBUTE}]`)) {
			echo.removeAttribute(RISE_ECHO_HELD_ATTRIBUTE)
		}
	}
}

/**
 * 这一条气泡从输入框里冒出来再落回去
 * @param row 真实那一行
 * @param active 正在跑的清理函数，卸载时一并收掉
 * @param tuning 这一次用的十个参数
 * @returns 播没播；没播时调用方要把回声放出来
 */
function playRise(row: HTMLElement, active: Set<() => void>, tuning: BubbleRiseTuning): boolean {
	const view = row.ownerDocument.defaultView
	if (view === null) return false
	if (typeof view.matchMedia === "function" && view.matchMedia("(prefers-reduced-motion: reduce)").matches) return false
	// 折叠动效正在动这一行：同一行上叠两套位移只会互相追
	if (row.closest(MOTION_ROW_SELECTOR) !== null) return false
	const scroller = row.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
	const bubble = row.querySelector<HTMLElement>(BUBBLE_SELECTOR)
	const seat = scroller?.querySelector<HTMLElement>(COMPOSER_SELECTOR) ?? null
	const column = row.closest<HTMLElement>(CHAT_FLOW_SELECTOR)
	// 跟随开着才有 data-chat-following-tail，那个元素也正是纵向裁剪气泡的那一层
	const chatRoot = row.closest<HTMLElement>(FOLLOWING_TAIL_SELECTOR)
	if (scroller === null || bubble === null || seat === null || column === null || chatRoot === null) return false
	const bubbleRect = bubble.getBoundingClientRect()
	const seatRect = seat.getBoundingClientRect()
	const columnRect = column.getBoundingClientRect()
	const rootRect = chatRoot.getBoundingClientRect()
	if (bubbleRect.height === 0 || seatRect.height === 0) return false

	const {poseAt, stageEnd, totalMs} = createTimeline(tuning)

	// 聊天列的底就是输入区的顶时，它自己的纵向裁剪正好把气泡切在那一格，这是要的遮挡。
	// 内容还没铺满一屏的会话里这条线远在上方，气泡会整块画不出来，这时把裁剪让开，
	// 交由输入区座位那 36px 的渐变去遮
	const croppedAtSeat = Math.abs(rootRect.bottom - seatRect.top) <= CLIP_TOLERANCE_PX
	const previousOverflowY = chatRoot.style.overflowY
	if (!croppedAtSeat) chatRoot.style.overflowY = "visible"

	// 落点是气泡自己的矩形，不含下面那一行时间与复制
	const startScrollTop = scroller.scrollTop
	const endRight = bubbleRect.right
	const endBottom = bubbleRect.bottom
	const bubbleHeight = bubbleRect.height
	const columnRight = columnRect.right

	const draw = (elapsed: number): void => {
		const pose = poseAt(elapsed)
		const emerged = clamp01(pose.emerge)
		const travel = clamp01(pose.travel)
		// 冒出阶段只露一截：底边被输入区挡住，露出多少由这一段的进度决定，不靠尺寸顺带露出
		const seatTop = seat.getBoundingClientRect().top
		const startRight = columnRight + Math.min(tuning.outdent, SIDE_CLEARANCE_PX) * emerged
		const startBottom = seatTop + bubbleHeight * pose.scale - tuning.reveal * emerged
		// 落点跟着滚动走，起手点钉在输入区上
		const endBottomNow = endBottom - (scroller.scrollTop - startScrollTop)
		const right = startRight + (endRight - startRight) * travel
		const bottom = startBottom + (endBottomNow - startBottom) * travel
		// 缩放圆心在右下角（transform-origin 写在下面），所以右下角就是这两个点
		const dx = right - endRight
		const dy = bottom - endBottomNow
		bubble.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${pose.scale.toFixed(4)})`
	}

	bubble.style.transformOrigin = "100% 100%"
	bubble.style.willChange = "transform"
	draw(0)

	let startedAt: number | null = null
	let frameId = 0
	let overshot = false
	let finished = false

	const finish = (): void => {
		if (finished) return
		finished = true
		if (frameId !== 0) view.cancelAnimationFrame(frameId)
		bubble.style.transform = ""
		bubble.style.transformOrigin = ""
		bubble.style.willChange = ""
		chatRoot.style.overflowY = previousOverflowY
		active.delete(finish)
	}

	const tick = (now: number): void => {
		if (!bubble.isConnected) {
			finish()
			return
		}
		if (startedAt === null) startedAt = now
		const elapsed = now - startedAt
		draw(elapsed)
		const pose = poseAt(elapsed)
		// 判据挂在行程上：尺寸那一条这时候已经收敛到 1 了，行程还在动
		if (elapsed > stageEnd && pose.travel > 1.001) overshot = true
		if ((overshot && pose.travel <= 1) || elapsed >= totalMs + SETTLE_SLACK_MS) {
			finish()
			return
		}
		frameId = view.requestAnimationFrame(tick)
	}

	active.add(finish)
	frameId = view.requestAnimationFrame(tick)
	return true
}

// 一段时间轴：某一刻的姿态、两段的分界、以及整段多长
interface Timeline {
	readonly poseAt: (elapsed: number) => {emerge: number; scale: number; travel: number}
	readonly stageEnd: number
	readonly totalMs: number
}

// 按一份参数封出一段时间轴：两条弹簧的角频率与两段的分界都只算一次
function createTimeline(tuning: BubbleRiseTuning): Timeline {
	// 卡片上的段长可以调到 0，而 0 会让每一帧的进度都变成 NaN，所以这里兜到至少 1 ms
	const emergeMs = Math.max(1, tuning.emergeMs)
	const riseMs = Math.max(1, tuning.riseMs)
	// 阻尼比贴着 1 时那条根式退化成 0，角频率会除零
	const riseDamping = Math.min(tuning.riseDamping, 0.999)
	const sizeDamping = Math.min(tuning.sizeDamping, 0.999)
	const stageEnd = emergeMs + tuning.hold
	const totalMs = stageEnd + riseMs
	const riseOmega = omegaFor(riseMs, riseDamping)
	const sizeOmega = omegaFor(riseMs / SIZE_SPEED, sizeDamping)
	const ease = cubicBezierEase(
		tuning.emergeBezierX1,
		tuning.emergeBezierY1,
		tuning.emergeBezierX2,
		tuning.emergeBezierY2,
	)
	const poseAt = (elapsed: number): {emerge: number; scale: number; travel: number} => {
		const emerge = ease(elapsed / emergeMs)
		const holdAt = tuning.hold <= 0 ? 1 : (elapsed - emergeMs) / tuning.hold
		const drift = tuning.holdDrift * smoothstep(holdAt)
		const riseAt = Math.max(0, elapsed - stageEnd) / 1000
		const rise = spring(riseAt, riseOmega, riseDamping)
		const size = spring(riseAt, sizeOmega, sizeDamping)
		const grow = tuning.emergeScale + (tuning.oversize - tuning.emergeScale) * emerge
		const scale = elapsed < emergeMs ? grow : 1 + (tuning.oversize - 1) * (1 - size)
		return {emerge, scale, travel: drift + (1 - drift) * rise}
	}
	return {poseAt, stageEnd, totalMs}
}

// 欠阻尼弹簧的阶跃响应：起步速度为 0，冲过 1 再落回来
function spring(seconds: number, omega: number, damping: number): number {
	if (seconds <= 0) return 0
	const dampedOmega = omega * Math.sqrt(1 - damping * damping)
	const decay = Math.exp(-damping * omega * seconds)
	return 1 - decay * (Math.cos(dampedOmega * seconds) + (damping * omega / dampedOmega) * Math.sin(dampedOmega * seconds))
}

/**
 * 把「冲过终点、回落穿过终点」这一刻钉在这一段末尾
 * @param ms 这一段多长
 * @param damping 阻尼比；越小过冲越多
 * @returns 角频率，段长与过冲因此互相牵住，尾巴不留到总时长之后
 */
function omegaFor(ms: number, damping: number): number {
	const dampedRatio = Math.sqrt(1 - damping * damping)
	const cross = 2 * Math.PI - Math.atan(dampedRatio / damping)
	return cross / ((ms / 1000) * dampedRatio)
}

/**
 * 三次贝塞尔缓动：两个控制点的横坐标限制在 0 到 1，纵坐标可以出界，于是曲线能先退后进或先冲过头。
 * 先用牛顿法从横坐标反解参数，解不出来再退回二分——与浏览器画 cubic-bezier() 用的那套相同
 * @param x1 第一控制点横坐标，0 到 1
 * @param y1 第一控制点纵坐标，可以出界
 * @param x2 第二控制点横坐标，0 到 1
 * @param y2 第二控制点纵坐标，可以出界
 * @returns 把 0 到 1 的进度映射成曲线上的值
 */
function cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (progress: number) => number {
	const ax = 3 * x1 - 3 * x2 + 1
	const bx = 3 * x2 - 6 * x1
	const cx = 3 * x1
	const ay = 3 * y1 - 3 * y2 + 1
	const by = 3 * y2 - 6 * y1
	const cy = 3 * y1
	const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t
	const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t
	const slopeX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx
	return (progress: number): number => {
		const target = clamp01(progress)
		if (target <= 0) return 0
		if (target >= 1) return 1
		let t = target
		for (let step = 0; step < 8; step++) {
			const diff = sampleX(t) - target
			if (Math.abs(diff) < 1e-6) return sampleY(t)
			const slope = slopeX(t)
			if (Math.abs(slope) < 1e-6) break
			t -= diff / slope
			if (t < 0 || t > 1) break
		}
		let low = 0
		let high = 1
		t = target
		for (let step = 0; step < 24; step++) {
			const value = sampleX(t)
			if (Math.abs(value - target) < 1e-6) break
			if (value < target) low = t
			else high = t
			t = (low + high) / 2
		}
		return sampleY(t)
	}
}

function smoothstep(value: number): number {
	const x = clamp01(value)
	return x * x * (3 - 2 * x)
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value))
}
