/**
 * 落点的让位：提交之后聊天区先定住一瞬，再在气泡上升的前两百来毫秒里让开，并在落定前收住。
 *
 * 读者在录屏里看到的是「落点已经让好了，气泡才起飞」。根因不在替身，而在 dsh：默认
 * `collapseTiming='completion'`，提交时 `useChatScroll` 的 ownInput 分支同步调
 * `followTail('instant')`，把 `scrollTop` 直接设到新 floor（`use-chat-scroll.ts` 第 80–84 行）。
 * 回显行在同一帧插入、内容高出「新行高度」，于是聊天区在替身出现之前就整体上移了。
 *
 * **这里只做视觉补偿，不碰 `scrollTop`。** 把 `scrollTop` 拉回去会被 dsh 归因成「读者自己
 * 滚上去了」：`ChatReading.onScroll` 会再 `followTail()` 拉回底部；就算绕过，500 ms 的采样会
 * 按 `nearBottom` 把 `followingTail` 判成 false——发送之后的流式内容不再跟随，还会写进会话的
 * 滚动记忆。补偿加在 `[data-chat-flow]` 上：它是一个纯 `transform`，不改布局、不改滚动状态，
 * dsh 完全不知道我们在做什么。
 *
 * **两段式，因为 dsh 的让位不是一次滚动。** 实测（视口 1536×863、注入 2000px 填充）：
 * 回显出现时 dsh 已经滚了 +86 px，之后 150 ms 左右又滚 +36 px。所以：
 *
 *   平台段（0 → 15 ms）   补偿量取「此刻的 `scrollTop` 减提交前那一个」，**每帧 + 每次 scroll
 *                        事件**都现算一次，把期间所有滚动都压住：视觉完全冻结。scroll 事件在
 *                        rAF 之后、绘制之前派发，所以即使某一帧的 rAF 被长任务吞掉，滚动带来的
 *                        那一截也会在画出来之前被补上。
 *   释放段（15 → 84 ms）  从平台末尾起一段**起飞那一刻就建好**的 WAAPI 动画（`translateY(D) → 0`，
 *                        ease-out）。整段都在合成器上，主线程被长任务占住时照样准点、照样平滑。
 *                        **收在「气泡底边越过输入框上沿」那一刻**（`send-flight` 的 `leaveAt` 按
 *                        几何算，这一版是 84 ms）：内容先让好，气泡随后才离开输入框——不做严丝
 *                        合缝的对接，与落定同帧收尾时最后几十毫秒内容还在微微挪（读者说像「空间站
 *                        对接」）。
 *                        **改成「到点再由主线程建动画」会被一次长任务整段吞掉**：2026-10-18 实测到
 *                        80 ms 的 rAF 空洞，聊天区在 266 ms 一帧瞬移 117 px。
 *
 * **dsh 在释放途中再滚时照旧吸收**：把那一截加回补偿，从**此刻画着的那一格**续一段动画。
 * 续接要读一次样式、要主线程，所以卡顿期间滚进来的那一截只能让位稍快，读不成瞬移。
 *
 * **起点不能按时间取一半。** 位移不是匀速的（见 `REVEAL_HOLD`）：150 ms 那一刻气泡在视觉上
 * 已经飞完九成，读者看到的就是「气泡先落定，聊天区才动」。终点同理（见 `REVEAL_DONE`）。
 *
 * **替身的落点锁在「最终位置」，不跟着补偿走。** 真实行的 rect 带着补偿，所以 `followTarget`
 * 把补偿量减掉再补差：气泡从输入卡片起飞、一路飞向输入框上方那一格；让位开始时，聊天区内容在它
 * 下面滑上去。若让替身跟着补偿走，它会先落到「输入框下方」——那是提交前的位置，读者看到的就是
 * 气泡生成在聊天框下面（2026-10-18 实拍）。落定那一帧补偿归零，两者本来就重合。
 *
 * 代价与边界：
 * - 读者一动手（滚轮、触摸、滚动键、指针按下）就 `finish()`：让位立刻到位，随后读者的滚动
 *   从底部正常开始。正在释放中途被接管时，这一下是剩余补偿量的瞬移（窗口 ≤240 ms）。
 * - 不满足条件的提交一次都不动：读者不在底部（`FOLLOW_THRESHOLD_PX` 以内）、内容阶段不是
 *   `active`、列上挂着 dsh 的折叠动效、这次跟随是平滑的、补偿超过 `MAX_REVEAL_SHIFT_PX`、
 *   列比 `MAX_REVEAL_COLUMN_PX` 还高。任何一条都退回今天的行为。
 *
 * @module dsh-chat-ux/client/chat/send-flight/send-reveal
 */
import {
    ACTIVE_CONTENT_PHASE, CHAT_FLOW_SELECTOR, CONTENT_PHASE_ATTRIBUTE, CONTENT_PHASE_SELECTOR,
    CONVERSATION_SCROLL_SELECTOR, FOLLOW_THRESHOLD_PX, MOTION_ATTRIBUTE,
} from '../../dom-contract'
import {isReaderScrollIntent} from '../follow/reader-intent'
import {FLIGHT_MS} from './send-morph'

/**
 * 起飞后多久开始让位（占飞行的比例）。
 *
 * 不能按时间取一半：位移不是匀速的。横向那条 33 ms 就过半、135 ms 走完；纵向那条（`RISE_DELAY`
 * 起步、`RISE_OMEGA` 收尾）97 ms 过半、147 ms 过九成、223 ms 才落定。取 0.5 时气泡在视觉上
 * 已经飞完九成，读起来就是「气泡先落定，聊天区才动」（2026-10-18 读者截图）。
 *
 * 取 0.05（15 ms）：比纵向弹簧起步（`RISE_DELAY` = 45 ms）早得多——气泡刚离开输入卡片，内容
 * 就开始让。前面这 15 ms 只为一件事——把 dsh 在起飞帧里那一下滚动吸收掉，不让它在第一帧闪过。
 */
const REVEAL_HOLD = 0.05

/**
 * 让位在飞行的哪个时间点收完（占飞行的比例）的兜底值。
 *
 * 实际值由调用方按几何算出来：**气泡底边越过输入框上沿那一刻**（见 `send-flight` 的 `leaveAt`）。
 * 气泡越高、纵向行程越短，那一刻来得越晚。算不出来时才用这个 0.3。
 *
 * **不能等于 1**：与落定同一帧收尾读起来像空间站对接——两者速度严丝合缝、同时接触，最后那几十
 * 毫秒内容还在微微挪（2026-10-18 读者的原话）。
 */
const REVEAL_DONE = 0.3

/** 补偿的硬上限（像素）：多行长消息、或读者离底不远但一次滚很多时，落点会被推得太深。 */
const MAX_REVEAL_SHIFT_PX = 200

/** 列比这还高就不动它：一个超大的合成层不值得为一次 300 ms 的让位买单。 */
const MAX_REVEAL_COLUMN_PX = 20000

/** 释放那一段的曲线：起步快、收尾慢，像滚动停下来的样子。 */
const RELEASE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

/** 读者接管滚动的意图事件；与 dsh 自己的 `READING_INTENTS` 是同一组。 */
const INTENT_TYPES = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

/** 提交前那一刻的滚动几何与阶段；捕获阶段读，读不到就不做。 */
export interface RevealAnchor {
    /** 滚动容器（`[data-conversation-scroll]`）。 */
    readonly scroller: HTMLElement
    /** 提交前的 `scrollTop`；补偿的零点。 */
    readonly scrollTop: number
    /** 提交前的可滚动距离。 */
    readonly floor: number
    /** 提交前是否贴着底部。 */
    readonly atBottom: boolean
    /** 内容阶段是不是 `active`。 */
    readonly active: boolean
    /** 列上没有 dsh 的折叠动效。 */
    readonly calm: boolean
}

/** 一次让位：每帧喂一次，落定时收掉。 */
export interface Reveal {
    /**
     * 推进一帧：前半段继续冻结，越过一半后改由合成器动画释放。
     *
     * 时间基准是**墙上时钟**（起飞那一刻起算），不是替身那条动画的 `currentTime`：实测主线程
     * 被长任务占住时，后者的读值会跟着停住——恢复后按它算出来的进度比真实时间晚将近一百毫秒，
     * 让位就会一直冻到飞行的后段才开始。墙钟只在 rAF 恢复后才被读到，但一读到就是真实进度。
     */
    apply(): void
    /** 此刻还挂在聊天列上的补偿量（像素，正值向下）。替身补差时要把这一截减掉。 */
    offset(): number
    /** 幂等：立刻把补偿归零并摘掉监听（落定、读者接管、卸载都走它）。 */
    finish(): void
}

/**
 * 捕获阶段读一次滚动几何与阶段。读不到返回 null——不动手永远安全。
 * @param card - 输入卡片（`[data-composer-card]`）。
 * @returns 这段会话的让位锚点，或 null。
 */
export function captureRevealAnchor(card: HTMLElement): RevealAnchor | null {
    const scroller = card.closest(CONVERSATION_SCROLL_SELECTOR)
    if (!(scroller instanceof HTMLElement)) return null
    const phaseRoot = scroller.closest(CONTENT_PHASE_SELECTOR)
    if (!(phaseRoot instanceof HTMLElement)) return null
    const column = scroller.querySelector(CHAT_FLOW_SELECTOR)
    if (!(column instanceof HTMLElement)) return null
    const floor = scrollFloor(scroller)
    return {
        scroller,
        scrollTop: scroller.scrollTop,
        floor,
        atBottom: floor - scroller.scrollTop <= FOLLOW_THRESHOLD_PX,
        active: phaseRoot.getAttribute(CONTENT_PHASE_ATTRIBUTE) === ACTIVE_CONTENT_PHASE,
        calm: !column.hasAttribute(MOTION_ATTRIBUTE),
    }
}

/**
 * 起飞那一刻开始冻结落点。必须在 `startMorph` 之后调：形变要量一大堆几何，先加补偿会污染它。
 * @param anchor - 捕获阶段留下的锚点。
 * @param until - 让位在飞行的哪个时间点收完（0 到 1）；调用方按「气泡底边越过输入框上沿」算。
 * @returns 让位句柄；不满足条件时为 null。
 */
export function startReveal(anchor: RevealAnchor, until = REVEAL_DONE): Reveal | null {
    if (!anchor.active || !anchor.atBottom || !anchor.calm) return null
    const scroller = anchor.scroller
    if (!scroller.isConnected) return null
    const column = scroller.querySelector(CHAT_FLOW_SELECTOR)
    if (!(column instanceof HTMLElement)) return null
    // 回显出现的那一刻 dsh 已经滚过一次；之后它还会再滚（见模块头）。这里只要求这次跟随即时到位。
    const shift = scroller.scrollTop - anchor.scrollTop
    if (shift <= 0 || shift > MAX_REVEAL_SHIFT_PX) return null
    if (Math.abs(scroller.scrollTop - scrollFloor(scroller)) > 1) return null
    if (column.getBoundingClientRect().height > MAX_REVEAL_COLUMN_PX) return null

    const frozenTop = anchor.scrollTop
    const startedAt = performance.now()
    /** 收完的时刻（占飞行的比例）：不能早于平台末尾，否则让位短到看不见。 */
    const doneAt = Number.isFinite(until) && until > REVEAL_HOLD ? Math.min(1, until) : REVEAL_DONE
    let lastShift = Number.NaN
    let currentOffset = 0
    let release: Animation | null = null
    let done = false

    /** 平台段：把此刻的滚动量写进行内 transform；量没变就不写。 */
    const hold = (shiftNow: number): void => {
        currentOffset = shiftNow
        if (shiftNow === lastShift) return
        lastShift = shiftNow
        column.style.transform = shiftNow === 0 ? '' : 'translateY(' + shiftNow + 'px)'
    }

    /** 把补偿归零、摘掉监听与动画；`done` 让落定与读者接管两条路都能安全地调。 */
    const finish = (): void => {
        if (done) return
        done = true
        currentOffset = 0
        for (const type of INTENT_TYPES) document.removeEventListener(type, onIntent, true)
        scroller.removeEventListener('scroll', onScroll)
        column.style.removeProperty('transform')
        column.style.removeProperty('will-change')
        release?.cancel()
        release = null
    }

    /**
     * 释放：从 `from` 起一段合成器动画，在飞行剩下的时间里收尾。
     *
     * 还没到平台末尾（`REVEAL_HOLD`）时先把平台补进去再释放——**第一次**建出来的动画因此覆盖
     * 整段（平台 + 释放），主线程被长任务吞掉也照原样播完，不必等它到点再回来动手。
     * 释放途中 dsh 又滚了一截也走这里：从**此刻真正画着的那一格**续一段（见 `apply`），
     * 所以每次续接都从画面上那个位置出发，不跳。
     */
    const releaseFrom = (from: number): void => {
        const elapsed = performance.now() - startedAt
        const remaining = doneAt * FLIGHT_MS - elapsed
        release?.cancel()
        release = null
        if (from <= 0 || remaining <= 0) {
            finish()
            return
        }
        currentOffset = from
        column.style.transform = 'translateY(' + from + 'px)'
        const holdLeft = REVEAL_HOLD * FLIGHT_MS - elapsed
        const frames: Keyframe[] = holdLeft > 0
            ? [
                {transform: 'translateY(' + from + 'px)'},
                {transform: 'translateY(' + from + 'px)', offset: Math.min(1, holdLeft / remaining), easing: RELEASE_EASING},
                {transform: 'translateY(0px)'},
            ]
            : [
                {transform: 'translateY(' + from + 'px)', easing: RELEASE_EASING},
                {transform: 'translateY(0px)'},
            ]
        release = column.animate(frames, {duration: Math.max(30, remaining), fill: 'both'})
        release.onfinish = finish
    }

    /**
     * 每帧读一次。推进由动画自己在合成器上走，这里只做两件事：吸收新滚进来的那一截，
     * 把当前补偿报给替身（见 `offset`）。
     */
    const apply = (): void => {
        if (done) return
        const shiftNow = scroller.scrollTop - frozenTop
        // 补偿越积越多，落点会被推得太深；这种会话本来就不该冻。
        if (shiftNow > MAX_REVEAL_SHIFT_PX) {
            finish()
            return
        }
        const sampled = translateYOf(getComputedStyle(column).transform)
        // dsh 又滚了一截：不压回去的话内容会瞬移一截，替身的落点也跟着跳。
        if (shiftNow !== lastShift) {
            const from = sampled + (shiftNow - lastShift)
            lastShift = shiftNow
            releaseFrom(from)
            return
        }
        currentOffset = sampled
    }

    /** 读者一动就让路：补偿继续挂着，读到的滚动会被它抵消，手感就不跟手了。 */
    const onIntent = (event: Event): void => {
        if (isReaderScrollIntent(event)) finish()
    }

    /**
     * dsh 的滚动落进来时立刻补一次。
     *
     * scroll 事件在 rAF 之后、绘制之前派发，所以长任务吞掉一帧时，这一截也不会被画出来。
     */
    const onScroll = (): void => {
        if (done) return
        // 量没变就不用算：释放段里读回动画当前值要一次强制样式计算，不值得每个 scroll 都付。
        if (scroller.scrollTop - frozenTop === lastShift) return
        apply()
    }

    column.style.willChange = 'transform'
    for (const type of INTENT_TYPES) document.addEventListener(type, onIntent, true)
    scroller.addEventListener('scroll', onScroll, {passive: true})
    // 平台与释放一开始就交给合成器：主线程卡住也不误点、不跳帧。
    hold(shift)
    releaseFrom(shift)
    return {
        apply,
        offset: () => currentOffset,
        finish,
    }
}

/** 滚动容器此刻还能滚多远。 */
function scrollFloor(scroller: HTMLElement): number {
    return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
}

/**
 * 从一条计算出来的 transform 里读纵向平移。
 *
 * 释放段是合成器动画，读不回「这一帧该有的值」以外的中间态；我们只用它把替身锁到最终落点，
 * 几十毫秒的采样误差看不见。
 * @param transform - `getComputedStyle(...).transform`。
 * @returns 纵向平移量（像素）；读不出来为 0。
 */
function translateYOf(transform: string): number {
    if (transform === 'none' || transform === '') return 0
    const matrix = /^matrix\((.+)\)$/.exec(transform)
    if (matrix !== null) {
        const values = (matrix[1] ?? '').split(',')
        const offset = Number(values[5])
        return Number.isFinite(offset) ? offset : 0
    }
    const matrix3d = /^matrix3d\((.+)\)$/.exec(transform)
    if (matrix3d !== null) {
        const values = (matrix3d[1] ?? '').split(',')
        const offset = Number(values[13])
        return Number.isFinite(offset) ? offset : 0
    }
    return 0
}
