/**
 * 工具行与思考行第一次出现时，把所在滚动器补回底部。
 *
 * 用 1ms 探针动画的 animationstart 当出现信号，不装观察器也不轮询；同一帧多次到达合并成一次 rAF。
 * 读者开始滚动、卷帘门正在跑或已经到底时都不补。
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
