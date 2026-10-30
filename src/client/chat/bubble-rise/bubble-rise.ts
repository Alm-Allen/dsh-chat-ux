/**
 * 发送气泡的冒头：读者按下发送以后，那一条从输入框里探出来，微微沉一下，再升到它该在的位置。
 *
 * 整段只有一条曲线：八个控制点的七次贝塞尔，横轴是时间进度、纵轴是行程。行程 0 时整个气泡还在
 * 输入区后面，1 是落点，越过 1 就是冲过落点再落回来——起点那一口探出、中间那一下沉、末尾那点过冲，
 * 全都是这一条曲线的形状。尺寸绑在同一个行程上，从 emergeScale 长到 1，落定那一帧正好是一倍，
 * 清掉 transform 不会跳
 *
 * 参数每次播之前读一遍，所以插件管理页上拖完滑杆，下一次发送就按新的走，不必刷新
 *
 * 动的是真实那一行里的气泡，不是替身：行本身仍在布局里占着那个位置，冒头期间落点是空的。
 * 判据全用 dsh 的语义属性：[data-submission-echo] 是提交后本地的回声，
 * [data-chat-flow-kind="user"] 与 [data-chat-flow-kind="steering"] 是 Host 接住之后的那一行（正常提交与插话）。
 * 「提交了」这通通知有两条路：回声那边挂的一条 1 ms 探针动画，以及提交动作本身（回车、点发送之后输入面被清空）。
 * 会话闲着的时候回声可能压根不渲染（durable 行与它同一帧到齐，被 dsh 抑制），只剩后一条路可用。
 * 真实行出现靠 MutationObserver 认，它的回调在绘制之前
 *
 * 侧栏里的子智能体会话各有各的滚动器与输入区，所以这一整套都从那一行自己往上找，不用 document
 */
import {
	CHAT_FLOW_SELECTOR, COMPOSER_INPUT_SELECTOR, COMPOSER_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_SELECTOR,
	MOTION_ROW_SELECTOR,
} from "../../dom-contract"
import type {BubbleRiseTuning} from "../../settings/settings-scope"
import {createTravelCurve} from "../../settings/bubble-curve"
import {
	PENDING_STEERING_ATTRIBUTE, RISE_ATTRIBUTE, RISE_ECHO_HELD_ATTRIBUTE, RISE_ECHO_PROBE_NAME, SUBMISSION_ECHO_ATTRIBUTE,
} from "./bubble-rise-styles"

// 普通提交之后等 user 行这么久：正常几百毫秒就到，超时就把回声放出来
const USER_WAIT_MS = 1200

// 插话要等运行中那一轮走到下一个 Step 才落进 transcript，可能好几分钟
const STEERING_WAIT_MS = 15 * 60 * 1000

// 点了输入区里的按钮之后隔这么久再看输入面空没空：发送按钮与停止按钮都住在那里面
const SEND_CLICK_PROBE_MS = 120

// 气泡右缘能超出聊天列多少：那个滚动器的左右各有 16px 内边距，再往外就被裁了
const SIDE_CLEARANCE_PX = 16

// 判定「聊天列的底就是输入区的顶」时的容差
const CLIP_TOLERANCE_PX = 2

// 气泡那一层；行里除了它还有时间与复制那一行
const BUBBLE_SELECTOR = "[data-message-bubble]"

// 行上的种类：正常提交是 user，跑着的时候插话是 steering
const FLOW_KIND_ATTRIBUTE = "data-chat-flow-kind"

// 读者自己发的那一行，两种都要冒头
const ROW_SELECTOR = `[${FLOW_KIND_ATTRIBUTE}="user"], [${FLOW_KIND_ATTRIBUTE}="steering"]`

/**
 * 装上这一处：挂门控属性、接上回声的探针，返回卸下的把手
 * @param readTuning 现读一份冒头参数；每次播放之前调一次，卡片上改完下一次就生效
 */
export function installBubbleRise(readTuning: () => BubbleRiseTuning): () => void {
	const gate = typeof document === "undefined" ? null : document.documentElement
	if (gate === null) return () => undefined
	gate.setAttribute(RISE_ATTRIBUTE, "")
	const active = new Set<() => void>()
	// 播过的行不再播：几条通知路线可能同时盯上同一条
	const played = new WeakSet<HTMLElement>()
	let observer: MutationObserver | null = null
	let observedScroller: HTMLElement | null = null
	// 两种期待各自的截止时刻：普通提交等 user 行，插话等 steering 行
	let userUntil = 0
	let steeringUntil = 0
	let closeTimer = 0

	// 收掉等待窗口：观察器与超时一起断
	const closeWindow = (): void => {
		observer?.disconnect()
		observer = null
		observedScroller = null
		userUntil = 0
		steeringUntil = 0
		if (closeTimer !== 0) window.clearTimeout(closeTimer)
		closeTimer = 0
	}

	// 把回声放出来：等待超时，或者这一条接不上动画时，读者至少看得见自己发的内容
	const revealEchoes = (scope: ParentNode): void => {
		for (const echo of scope.querySelectorAll<HTMLElement>(`[${SUBMISSION_ECHO_ATTRIBUTE}]`)) {
			echo.setAttribute(RISE_ECHO_HELD_ATTRIBUTE, "")
		}
	}

	// 最后一个期待过期时把观察器收掉：插话那一路可能等很久，不能全靠一个短窗
	const scheduleClose = (): void => {
		if (closeTimer !== 0) window.clearTimeout(closeTimer)
		closeTimer = 0
		const left = Math.max(userUntil, steeringUntil) - Date.now()
		if (!(left > 0)) {
			closeWindow()
			return
		}
		closeTimer = window.setTimeout(() => {
			closeTimer = 0
			// 这一段时间里可能又开了一路，等最后那一路也过期
			if (Date.now() < Math.max(userUntil, steeringUntil)) {
				scheduleClose()
				return
			}
			const scroller = observedScroller
			if (scroller !== null) revealEchoes(scroller)
			closeWindow()
		}, left + 20)
	}

	// 新增的这一批里有没有正等着的那一行：认到就播，这一路不再等
	const claimRow = (nodes: NodeList, scroller: HTMLElement): boolean => {
		const now = Date.now()
		for (const node of nodes) {
			if (!(node instanceof HTMLElement)) continue
			const found = node.matches(ROW_SELECTOR)
				? [node]
				: [...node.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
			// 整块替换时取最后一条，最旧的那些不会因此重新冒头
			for (const row of found.reverse()) {
				if (played.has(row)) continue
				const steering = row.getAttribute(FLOW_KIND_ATTRIBUTE) === "steering"
				if (now > (steering ? steeringUntil : userUntil)) continue
				played.add(row)
				if (steering) steeringUntil = 0
				else userUntil = 0
				if (!playRise(row, active, readTuning())) revealEchoes(scroller)
				scheduleClose()
				return true
			}
		}
		return false
	}

	// 开一路等待：普通提交只等几百毫秒，插话要等运行中那一轮走到下一个 Step
	const expectRow = (scroller: HTMLElement, steering: boolean): void => {
		if (observedScroller !== scroller || observer === null) {
			closeWindow()
			observedScroller = scroller
			observer = new MutationObserver((records) => {
				for (const record of records) {
					if (claimRow(record.addedNodes, scroller)) return
				}
			})
			observer.observe(scroller, {childList: true, subtree: true})
		}
		if (steering) steeringUntil = Date.now() + STEERING_WAIT_MS
		else userUntil = Date.now() + USER_WAIT_MS
		scheduleClose()
	}

	// 事件落在哪个滚动器上：侧栏子智能体会话各有各的输入区与聊天列
	const scrollerOf = (target: EventTarget | null): HTMLElement | null => {
		if (!(target instanceof Element)) return null
		const seat = target.closest<HTMLElement>(COMPOSER_SELECTOR)
		return seat?.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR) ?? null
	}

	const onEchoAppear = (event: Event): void => {
		if (!(event instanceof AnimationEvent) || event.animationName !== RISE_ECHO_PROBE_NAME) return
		const echo = event.target
		if (!(echo instanceof Element) || !echo.hasAttribute(SUBMISSION_ECHO_ATTRIBUTE)) return
		const scroller = echo.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
		if (scroller === null) return
		// 插话的回声会一直等在运行指示后面，直到那一轮走到下一个 Step 才转正
		expectRow(scroller, echo.hasAttribute(PENDING_STEERING_ATTRIBUTE))
	}

	// 回声没渲染出来时探针不会响：会话闲着、durable 行与回声同一帧到齐，回声被 dsh 抑制掉。
	// 所以提交这个动作本身也当通知用——回车，以及点了输入区里的按钮之后输入面被清空
	const onComposerKey = (event: KeyboardEvent): void => {
		if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
		// 提问卡片的作答框也是回车换行，不算提交
		if (event.target instanceof HTMLTextAreaElement) return
		const scroller = scrollerOf(event.target)
		if (scroller !== null) expectRow(scroller, false)
	}

	const onComposerClick = (event: MouseEvent): void => {
		const target = event.target
		if (!(target instanceof Element) || target.closest("button") === null) return
		const scroller = scrollerOf(target)
		if (scroller === null) return
		// 点的是不是发送得看结果：停一拍，输入面空了才算提交，加号、模型选择那些不会清空
		window.setTimeout(() => {
			if (readComposerText(scroller) !== "") return
			expectRow(scroller, false)
		}, SEND_CLICK_PROBE_MS)
	}

	document.addEventListener("animationstart", onEchoAppear, true)
	document.addEventListener("keydown", onComposerKey, true)
	document.addEventListener("click", onComposerClick, true)

	return () => {
		document.removeEventListener("animationstart", onEchoAppear, true)
		document.removeEventListener("keydown", onComposerKey, true)
		document.removeEventListener("click", onComposerClick, true)
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
 * @param tuning 这一次用的四个旋钮与那一条曲线
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
	// 跟随关着的时候没有 data-chat-following-tail，照样播：只是少一层纵向裁剪，气泡仍落在它该在的位置
	if (scroller === null || bubble === null || seat === null || column === null) return false
	const bubbleRect = bubble.getBoundingClientRect()
	const seatRect = seat.getBoundingClientRect()
	const columnRect = column.getBoundingClientRect()
	const rootRect = chatRoot?.getBoundingClientRect() ?? null
	if (bubbleRect.height === 0 || seatRect.height === 0) return false

	const {travelAt, totalMs} = createTimeline(tuning)

	// 聊天列的底就是输入区的顶时，它自己的纵向裁剪正好把气泡切在那一格，这是要的遮挡。
	// 内容还没铺满一屏的会话里这条线远在上方，气泡会整块画不出来，这时把裁剪让开，
	// 交由输入区座位那 36px 的渐变去遮
	const croppedAtSeat = rootRect !== null && Math.abs(rootRect.bottom - seatRect.top) <= CLIP_TOLERANCE_PX
	const previousOverflowY = chatRoot?.style.overflowY ?? ""
	if (chatRoot !== null && !croppedAtSeat) chatRoot.style.overflowY = "visible"

	// 落点是气泡自己的矩形，不含下面那一行时间与复制
	const startScrollTop = scroller.scrollTop
	const endRight = bubbleRect.right
	const endBottom = bubbleRect.bottom
	const bubbleHeight = bubbleRect.height
	const columnRight = columnRect.right

	/**
	 * 行程走到多少时气泡正好露出 reveal 那么一截
	 * 露出量随行程是线性的：起手时底边在输入区上沿往下 emergeScale 个气泡高的地方，气泡整个被挡着；
	 * 尺寸又同时从 emergeScale 长到 1，于是每多走一成行程，露出来的高度都是同一个数
	 */
	const emergeAt = (travel: number, startBottom: number, endBottomNow: number): number => {
		const span = endBottomNow - startBottom
		const perUnit = bubbleHeight * (1 - tuning.emergeScale) - span
		if (!(perUnit > 0) || !(tuning.reveal > 0)) return 1
		return clamp01(travel / Math.min(0.9, tuning.reveal / perUnit))
	}

	const draw = (elapsed: number): void => {
		// 行程允许冲过 1：曲线末尾那点过冲就靠它，钳掉就看不见了
		const travel = travelAt(elapsed)
		const scale = tuning.emergeScale + (1 - tuning.emergeScale) * travel
		// 起手底边钉在输入区上沿往下 emergeScale 个气泡高的地方
		const seatTop = seat.getBoundingClientRect().top
		const startBottom = seatTop + bubbleHeight * tuning.emergeScale
		// 落点跟着滚动走：起手点钉在输入区，落点在聊天流里
		const endBottomNow = endBottom - (scroller.scrollTop - startScrollTop)
		// 冒出那一下的横向外探只给到「露出一整截」为止，之后横向只往落点收
		const emerged = emergeAt(travel, startBottom, endBottomNow)
		const startRight = columnRight + Math.min(tuning.outdent, SIDE_CLEARANCE_PX) * emerged
		const right = startRight + (endRight - startRight) * travel
		const bottom = startBottom + (endBottomNow - startBottom) * travel
		// 缩放圆心在右下角（transform-origin 写在下面），所以右下角就是这两个点
		const dx = right - endRight
		const dy = bottom - endBottomNow
		bubble.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`
	}

	bubble.style.transformOrigin = "100% 100%"
	bubble.style.willChange = "transform"
	draw(0)

	let startedAt: number | null = null
	let frameId = 0
	let finished = false

	const finish = (): void => {
		if (finished) return
		finished = true
		if (frameId !== 0) view.cancelAnimationFrame(frameId)
		bubble.style.transform = ""
		bubble.style.transformOrigin = ""
		bubble.style.willChange = ""
		if (chatRoot !== null) chatRoot.style.overflowY = previousOverflowY
		active.delete(finish)
	}

	const tick = (now: number): void => {
		if (!bubble.isConnected) {
			finish()
			return
		}
		if (startedAt === null) startedAt = now
		const elapsed = now - startedAt
		// 行程在这一刻正好回到 1：末一帧按整段时长画，清掉 transform 不会跳
		if (elapsed >= totalMs) {
			draw(totalMs)
			finish()
			return
		}
		draw(elapsed)
		frameId = view.requestAnimationFrame(tick)
	}

	active.add(finish)
	frameId = view.requestAnimationFrame(tick)
	return true
}

// 一段时间轴：某一刻的行程，以及整段多长
interface Timeline {
	// 从播放到这一刻走了多久，换成行程；末尾冲过 1 的那点过冲也在这里
	readonly travelAt: (elapsed: number) => number
	readonly totalMs: number
}

// 按一份参数封出一段时间轴：整段多长与那条曲线都只算一次
function createTimeline(tuning: BubbleRiseTuning): Timeline {
	// 卡片上的总时长可以调到 0，而 0 会让每一帧的进度都变成 NaN，所以这里兜到至少 1 ms
	const totalMs = Math.max(1, tuning.totalMs)
	const travel = createTravelCurve(tuning.curveX, tuning.curveY)
	return {travelAt: elapsed => travel.at(elapsed / totalMs), totalMs}
}

// 输入面现在写着什么：提交之后它一定被清空，点按钮与按回车最后都落到这一步
function readComposerText(scroller: HTMLElement): string {
	return (scroller.querySelector<HTMLElement>(COMPOSER_INPUT_SELECTOR)?.textContent ?? "").trim()
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value))
}
