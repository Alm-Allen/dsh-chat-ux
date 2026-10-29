/**
 * 工具行与思考行第一次出现在页面上时，把它们所在的滚动器补到底。
 *
 * dsh 的跟随在结构时刻最容易掉队：一行新内容插进来、高度跳一截，它那套平滑滚动还在重排而内容继续长，
 * 位置就落后了。实测一次 run_code 执行（标准档，33 次结构行到达）有两次落后一百四十像素上下，读者说的
 * 「思考跑到视野外面」就是这两次，且全部发生在过程组的组体里，主滚动框一次都没掉队。
 * 浏览器没有「元素出现了」这种事件，MutationObserver 又等于扫描，所以给这两族行挂一条 1 ms 的检测动画：
 * animationstart 就是元素第一次被渲染时的一次性通知，没有观察者、没有定时器，流式期间一个回调都不进
 */
import {CONVERSATION_SCROLL_SELECTOR, PROCESS_BODY_SELECTOR} from "../../dom-contract"
import {isFoldGlideBusy} from "../fold/fold-glide"
import {APPEAR_ATTRIBUTE, APPEAR_PROBE_NAME} from "./follow-probe-styles"
import {isReaderScrollIntent} from "./reader-intent"

// 离底不超过这么多像素就算已经贴到底，不再写一次位置；半像素的舍入不值得补一脚
const BOTTOM_SLACK_PX = 2

// 读者滚得动位置的那几种动作：来了就算接管，位置从此归他
const MARK_EVENTS = ["wheel", "keydown"] as const

// 按下去本身不动位置的几种动作：只记下这一刻的位置，等下一次结构事件再判
const PRESS_EVENTS = ["pointerdown", "touchstart"] as const

// 装上这一处：挂上检测属性、接上两个事件通道，返回卸下的把手
export function installCallAppearFollow(): () => void {
	const gateElement = typeof document === "undefined" ? null : document.documentElement
	if (gateElement === null) return () => undefined
	// 已经自己动过手的滚动器：在它回到自己的底之前，我们不再替它补
	const takenOverSet = new WeakSet<HTMLElement>()
	// 按下去那一刻的位置，等下一次结构事件到来时看它有没有真的动过
	const pressedTopMap = new WeakMap<HTMLElement, number>()
	// 这一帧里要处理的滚动器：一次插入可能带出整棵子调用子树，父行与每个子行各响一次，它们要的是同一脚
	const pendingScrollerSet = new Set<HTMLElement>()
	let flushFrameId = 0

	// 这一行住在哪个滚动器里：过程组体优先，其次会话滚动框（详细与完全展开两档没有组体）
	const scrollerOf = (row: Element): HTMLElement | null =>
		row.closest<HTMLElement>(PROCESS_BODY_SELECTOR)
		?? row.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)

	// 补一次底。位置本来就到底时这里什么都不写，读那一次 scrollHeight 就是全部代价（强制布局，
	// 本帧的布局早已结算过，实测 0.00 ms；真要补的那几次是 0.5～2.0 ms）
	const followToBottom = (scroller: HTMLElement): void => {
		if (!scroller.isConnected) return
		// 按下时记的位置到这一刻还没动过，说明读者只是点开某一行看一眼，不算接管
		const pressedTop = pressedTopMap.get(scroller)
		if (pressedTop !== undefined) {
			pressedTopMap.delete(scroller)
			if (Math.abs(scroller.scrollTop - pressedTop) > 0.5) takenOverSet.add(scroller)
		}
		const behind = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
		if (behind <= BOTTOM_SLACK_PX) {
			takenOverSet.delete(scroller)
			return
		}
		if (takenOverSet.has(scroller)) return
		// 折叠的高度动画正在动，这一会儿位置归它管
		if (isFoldGlideBusy()) return
		scroller.scrollTop = scroller.scrollHeight
	}

	const flushPendingScrollers = (): void => {
		flushFrameId = 0
		for (const scroller of pendingScrollerSet) followToBottom(scroller)
		pendingScrollerSet.clear()
	}

	const onAppear = (event: Event): void => {
		if (!(event instanceof AnimationEvent) || event.animationName !== APPEAR_PROBE_NAME) return
		const row = event.target
		if (!(row instanceof Element)) return
		const scroller = scrollerOf(row)
		if (scroller === null) return
		pendingScrollerSet.add(scroller)
		if (flushFrameId !== 0) return
		flushFrameId = window.requestAnimationFrame(flushPendingScrollers)
	}

	const onIntentMark = (event: Event): void => {
		if (!isReaderScrollIntent(event)) return
		const scroller = event.target instanceof Element ? scrollerOf(event.target) : null
		if (scroller === null) return
		takenOverSet.add(scroller)
		pressedTopMap.delete(scroller)
	}

	const onIntentPress = (event: Event): void => {
		if (!isReaderScrollIntent(event)) return
		const scroller = event.target instanceof Element ? scrollerOf(event.target) : null
		if (scroller === null) return
		pressedTopMap.set(scroller, scroller.scrollTop)
	}

	gateElement.setAttribute(APPEAR_ATTRIBUTE, "")
	document.addEventListener("animationstart", onAppear, true)
	for (const eventType of MARK_EVENTS) document.addEventListener(eventType, onIntentMark, {capture: true, passive: true})
	for (const eventType of PRESS_EVENTS) document.addEventListener(eventType, onIntentPress, {capture: true, passive: true})

	return () => {
		if (flushFrameId !== 0) window.cancelAnimationFrame(flushFrameId)
		flushFrameId = 0
		pendingScrollerSet.clear()
		document.removeEventListener("animationstart", onAppear, true)
		for (const eventType of MARK_EVENTS) document.removeEventListener(eventType, onIntentMark, true)
		for (const eventType of PRESS_EVENTS) document.removeEventListener(eventType, onIntentPress, true)
		gateElement.removeAttribute(APPEAR_ATTRIBUTE)
	}
}
