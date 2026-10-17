/**
 * 工具行与思考行第一次出现在页面上时，把它们所在的滚动器交还给底部。
 *
 * dsh 的跟随在**结构时刻**最容易掉队：一行新内容插进来、高度跳一截，它那套平滑滚动要重排一轮，
 * 而重排的那一段时间里内容还在长。实测一次 run_code 执行（2026-10-18，标准档，33 次结构行到达）：
 * 20 次位置本来就到底，11 次落后二十到三十三像素，2 次落后一百四十像素上下——后面那两次就是读者
 * 说的「思考跑到视野外面」。全部发生在过程组的组体里，主滚动框一次都没掉队。
 *
 * 为什么不扫描：浏览器没有「元素出现了」这种原生事件，DOM 变化只有 MutationObserver，而它就是扫描。
 * 这里换一条路——给这两族行挂一条 1 ms 的探针动画（见 follow-probe-styles.ts），animationstart 就是
 * 元素第一次被渲染时的一次性通知。没有观察者、没有定时器、没有轮询，流式期间一个回调都不进，只在
 * 这两族行出现的那一刻响一次。
 *
 * 同一帧里到达的几次用一次 requestAnimationFrame 合并：一次插入可能带出整棵子调用子树，父行与每个
 * 子行都会各响一次，而它们需要的是同一脚。
 *
 * 代价只有一处：补位要读一次 scrollHeight，那是强制布局。位置本来就到底时（上面那 20 次）实测
 * 0.00 ms——本帧的布局早已结算过；真要补的那几次是 0.5～2.0 ms。
 *
 * @module dsh-chat-ux/client/chat/follow/call-appeared
 */
import {CONVERSATION_SCROLL_SELECTOR, PROCESS_BODY_SELECTOR} from '../../dom-contract'
import {isFoldGlideBusy} from '../fold/fold-glide'
import {APPEAR_ATTRIBUTE, APPEAR_PROBE_NAME} from './follow-probe-styles'
import {isReaderScrollIntent} from './reader-intent'

/** 离底不超过这么多像素就算已经贴到底，不再写一次位置；半像素的舍入不值得补一脚。 */
const BOTTOM_SLACK_PX = 2

/** 读者滚得动位置的那几种动作：来了就算接管，位置从此归他。 */
const MARK_EVENTS = ['wheel', 'keydown'] as const

/** 按下去本身不动位置的几种动作：只记下这一刻的位置，等下一次结构事件再判。 */
const PRESS_EVENTS = ['pointerdown', 'touchstart'] as const

/**
 * 装上这一处：探针属性挂上，两个事件通道接上；返回卸下的把手。
 * @returns 摘掉属性、撤掉监听、并作废还没落地的那一帧的函数。
 */
export function installCallAppearFollow(): () => void {
    const root = typeof document === 'undefined' ? null : document.documentElement
    if (root === null) return () => undefined
    /** 已经自己动过手的滚动器：回到它的底之前，我们不再替他补。 */
    const takenOver = new WeakSet<HTMLElement>()
    /** 按下去那一刻的位置，等下一次结构事件到来时看它有没有真的动过。 */
    const pressedAt = new WeakMap<HTMLElement, number>()
    /** 这一帧里要处理的滚动器。一次插入可能带出整棵子调用子树，它们要的是同一脚。 */
    const pending = new Set<HTMLElement>()
    let frame = 0

    /** 这一行住在哪个滚动器里：过程组体优先，其次会话滚动框（详细与完全展开两档没有组体）。 */
    const scrollerOf = (row: Element): HTMLElement | null =>
        row.closest<HTMLElement>(PROCESS_BODY_SELECTOR)
        ?? row.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)

    /** 补一次。位置本来就到底时这里什么都不写，读那一次 scrollHeight 就是全部代价。 */
    const follow = (scroller: HTMLElement): void => {
        if (!scroller.isConnected) return
        // 按下时记的位置到这一刻还没动过，说明读者只是点开了某一行看一眼，不算接管。
        const pressed = pressedAt.get(scroller)
        if (pressed !== undefined) {
            pressedAt.delete(scroller)
            if (Math.abs(scroller.scrollTop - pressed) > 0.5) takenOver.add(scroller)
        }
        const behind = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
        if (behind <= BOTTOM_SLACK_PX) {
            takenOver.delete(scroller)
            return
        }
        if (takenOver.has(scroller)) return
        // 折叠的卷帘门正在动高度，这一会儿位置归它管。
        if (isFoldGlideBusy()) return
        scroller.scrollTop = scroller.scrollHeight
    }

    const flush = (): void => {
        frame = 0
        for (const scroller of pending) follow(scroller)
        pending.clear()
    }

    const onAppear = (event: Event): void => {
        if (!(event instanceof AnimationEvent) || event.animationName !== APPEAR_PROBE_NAME) return
        const row = event.target
        if (!(row instanceof Element)) return
        const scroller = scrollerOf(row)
        if (scroller === null) return
        pending.add(scroller)
        if (frame !== 0) return
        frame = window.requestAnimationFrame(flush)
    }

    const onIntentMark = (event: Event): void => {
        if (!isReaderScrollIntent(event)) return
        const scroller = event.target instanceof Element ? scrollerOf(event.target) : null
        if (scroller === null) return
        takenOver.add(scroller)
        pressedAt.delete(scroller)
    }

    const onIntentPress = (event: Event): void => {
        if (!isReaderScrollIntent(event)) return
        const scroller = event.target instanceof Element ? scrollerOf(event.target) : null
        if (scroller === null) return
        pressedAt.set(scroller, scroller.scrollTop)
    }

    root.setAttribute(APPEAR_ATTRIBUTE, '')
    document.addEventListener('animationstart', onAppear, true)
    for (const type of MARK_EVENTS) document.addEventListener(type, onIntentMark, {capture: true, passive: true})
    for (const type of PRESS_EVENTS) document.addEventListener(type, onIntentPress, {capture: true, passive: true})

    return () => {
        if (frame !== 0) window.cancelAnimationFrame(frame)
        frame = 0
        pending.clear()
        document.removeEventListener('animationstart', onAppear, true)
        for (const type of MARK_EVENTS) document.removeEventListener(type, onIntentMark, true)
        for (const type of PRESS_EVENTS) document.removeEventListener(type, onIntentPress, true)
        root.removeAttribute(APPEAR_ATTRIBUTE)
    }
}
