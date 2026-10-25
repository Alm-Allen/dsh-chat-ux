/**
 * 提交后的落点让位：先在聊天列上冻结视觉位移，再让补偿随气泡上升的同一段弹簧释放。
 *
 * 只改聊天列的 transform，不碰 scrollTop，否则 dsh 会把补偿认成读者滚动。
 * 释放动画在起飞时一次建好；读者一接管滚动就立即收尾。
 */
import {
    ACTIVE_CONTENT_PHASE, CHAT_FLOW_SELECTOR, CONTENT_PHASE_ATTRIBUTE, CONTENT_PHASE_SELECTOR,
    CONVERSATION_SCROLL_SELECTOR, FOLLOW_THRESHOLD_PX, MOTION_ATTRIBUTE,
} from '../../dom-contract'
import {isReaderScrollIntent} from '../follow/reader-intent'
import {FLIGHT_MS, RISE_DELAY, RISE_OMEGA, springProgress} from './send-morph'

/**
 * 起飞后多久开始释放让位，占整段飞行的比例。0.01 约等于一个平台。
 *
 * 平台本身不吸收滚动；它把释放和 dsh 的第二次自动滚动错开。位移不是匀速的，不能按时间来取
 * 「一半」，否则气泡视觉上快落定时聊天区才开始动。
 */
const REVEAL_HOLD = 0.01

/**
 * 让位收完时刻的兜底值，占整段飞行的比例。
 *
 * 调用方通常传气泡第一次到位的那一刻；不能拖到整段末尾，否则气泡已经停稳，内容还在动。
 */
const REVEAL_DONE = 0.3

/** 补偿的硬上限（像素）：多行长消息、或读者离底不远但一次滚很多时，落点会被推得太深。 */
const MAX_REVEAL_SHIFT_PX = 200

/** 列比这还高就不动它：一个超大的合成层不值得为一次 300 ms 的让位买单。 */
const MAX_REVEAL_COLUMN_PX = 20000

/**
 * 让位弹簧的阻尼比。曲线与气泡纵向那条同源，窗口收在气泡第一次到位时，所以这一段没有过冲。
 *
 * 0.7 在让位行程上留下约五到十像素的回弹；取 0.8 会更贴气泡，但收尾几乎看不见。
 */
const REVEAL_DAMPING = 0.7

/**
 * 弹簧采样的格数。续接时窗口会变，但格数固定，形状才稳定；过冲那一格另补。
 */
const REVEAL_SAMPLES = 24

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
 */
export function startReveal(anchor: RevealAnchor, until = REVEAL_DONE, delayMs = 0): Reveal | null {
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
    // 起点整体推后 `delayMs`：那是气泡预热的那几毫秒。之后每处 `elapsed` 都是负数，剩下的时长自己
    // 会长出来——平台仍收在气泡起跑后 3 ms，释放仍收在气泡落到落点那一刻。
    const startedAt = performance.now() + delayMs
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
        const holdOffset = holdLeft > 0 ? Math.min(1, holdLeft / remaining) : 0
        release = column.animate(
            springFrames(from, holdOffset, elapsed / FLIGHT_MS, doneAt),
            {duration: Math.max(30, remaining), fill: 'both'},
        )
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
 * 让位那一段的关键帧：平台 + 一条采样的弹簧。`travel` 是这一段要放掉的补偿量（像素，正值向下）。
 *
 * **每一格 linear，形状全在采样点里**——与气泡那条位移同一种写法（`send-morph.ts` 的 `mover`），
 * 浏览器不再插值第二次。整条关键帧里从头到尾只有 `transform`，这是它整段留在合成器上的前提。
 *
 * `from` 与 `to` 不是时长：进度按**绝对时间**取气泡那条弹簧上的值（见 `atRise`），所以窗口拉长
 * 之后形状不变、只是摊开——两条曲线因此同步，而不是各自压缩到自己的窗口里跑完。续接时窗口从
 * 此刻起算（`from` 就是此刻的进度），曲线接在半路上，不会从起点重跑一遍。
 */
function springFrames(travel: number, holdOffset: number, from: number, to: number): Keyframe[] {
    const start = springProgress(atRise(from), REVEAL_DAMPING, RISE_OMEGA)
    // 这段要放掉的进度：起点已经在弹簧上的某个位置，归一化要从它开始算。
    const span = springProgress(atRise(to), REVEAL_DAMPING, RISE_OMEGA) - start
    if (!(span > 0)) return [{transform: 'translateY(0px)'}]
    const frames: Keyframe[] = [{transform: 'translateY(' + travel + 'px)'}]
    if (holdOffset > 0) frames.push({transform: 'translateY(' + travel + 'px)', offset: holdOffset})
    for (const offset of springOffsets(holdOffset, from, to)) {
        // 位置与进度必须用同一个时间：offset 是动画内的比例，换算成绝对占比就是 from + offset·(to−from)。
        const reached = springProgress(atRise(from + offset * (to - from)), REVEAL_DAMPING, RISE_OMEGA)
        frames.push({
            transform: 'translateY(' + travel * (1 - (reached - start) / span) + 'px)',
            offset,
        })
    }
    return frames
}

/**
 * 窗口里的时间占比换算到气泡纵向弹簧上的占比：先扣掉起步那段水平滑行（`RISE_DELAY`）。
 *
 * 让位与气泡读的是同一条曲线的同一段——同一个 `springProgress`、同一个 `RISE_OMEGA`、同一段延迟，
 * 所以任意一帧上两者的进度都是同一个数（阻尼比各一套，那一点差别只落在收尾的过冲上）。
 */
function atRise(u: number): number {
    const shifted = (u - RISE_DELAY) / (1 - RISE_DELAY)
    return shifted > 0 ? shifted : 0
}

/**
 * 采样点：平台之后均分 `REVEAL_SAMPLES` 段，再把过冲峰值那一格单独补进去。
 *
 * 返回的就已经是**动画内的位置**，不是「平台之后的进度」：位置与进度共用一个时间刻度，
 * 两套刻度会把曲线画成另一个形状。
 */
function springOffsets(holdOffset: number, from: number, to: number): number[] {
    const points: number[] = []
    for (let index = 1; index <= REVEAL_SAMPLES; index += 1) {
        points.push(holdOffset + (1 - holdOffset) * (index / REVEAL_SAMPLES))
    }
    const peak = peakOffset()
    // 峰位算在弹簧坐标上；先加回起步延迟换成绝对占比，再折算成这段动画里的位置。落在窗外就不补。
    const absolute = RISE_DELAY + (1 - RISE_DELAY) * peak
    const inWindow = to > from ? (absolute - from) / (to - from) : 0
    if (peak > 0 && inWindow > holdOffset && inWindow < 1) points.push(inWindow)
    return points.sort((left, right) => left - right)
}

/**
 * 过冲峰值落在弹簧上的哪个位置：`π / ωd`。
 *
 * 少了这一格，采样会把回弹削平——峰只占一小段，二十几格未必落得上它。这是**弹簧坐标**上的位置
 * （已经扣掉起步延迟），换算回窗口由 `springOffsets` 负责。
 */
function peakOffset(): number {
    if (REVEAL_DAMPING >= 1) return 0
    const damped = RISE_OMEGA * Math.sqrt(1 - REVEAL_DAMPING * REVEAL_DAMPING)
    return damped > 0 ? Math.PI / damped : 0
}

/**
 * 从一条计算出来的 transform 里读纵向平移。
 *
 * 释放段是合成器动画，读不回「这一帧该有的值」以外的中间态；我们只用它把替身锁到最终落点，
 * 几十毫秒的采样误差看不见。
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
