/**
 * 发送气泡的起飞与落地。
 *
 * 提交那一刻抓下输入卡片、挂上与它逐像素重合的替身；等 dsh 的即发即显行出现后起飞；落定时移除替身、
 * 把回显行放出来。起点抓不到、起终点跨屏或用户关闭开关时一次都不动手。
 *
 * **输入卡片自始至终不藏。** 它一直在读者眼皮底下，气泡是从它上面升起来的；藏了它，读者会以为
 * 输入框连同草稿一起没了。替身挂着等回显时几乎透明（见 `SLAB_HOLD_OPACITY`），起飞那一刻才显形。
 *
 * 回显行必须在起飞那一帧绘制前藏住；后台标签页 rAF 会停，所以另设兜底定时器保证消息一定被放出来。
 */
import {CHAT_FLOW_SELECTOR, COMPOSER_CARD_SELECTOR, COMPOSER_INPUT_SELECTOR, SUBMISSION_ECHO_SELECTOR} from '../../dom-contract'
import {alphaOf, FLIGHT_MS, mountGhost, mountSlab, snapshotComposer, snapshotSlab} from './send-morph'
import type {HoldFrame, Morph} from './send-morph'

/** 挂在回显行上的标记：有它，那一行就先藏着。规则在 `send-flight-styles.ts`，两边必须一字不差。 */
export const FLYING_ATTRIBUTE = 'data-chat-ux-send-flight'

/**
 * 替身挂上之后等回显的上限（毫秒）。
 *
 * 超过就把替身撤掉、把卡片还给读者。正常提交到回显是 79 到 116 ms，留到 500 是给网络与一次重排的
 * 余量；排队那种「这条消息压根不会出现在聊天流里」的提交，最坏就是卡片消失这 500 ms。
 */
const HOLD_MS = 500

/**
 * 位移上限的兜底值：一屏比它窄时按它算（见 `sameScreen`）。
 *
 * 聊天列的横向距离天生接近 900px，纵向又随窗口高度增长，不能用一个固定的像素上限判断要不要飞。
 */
const FLIGHT_LIMIT_FLOOR_PX = 900

/** 兜底比飞行本身多留一点：定时器在后台被节流，也要赶在读者切回来之前把消息放出来。 */
const RESCUE_MARGIN_MS = 400

/** 只认聊天流里的回显：排队的那条落在队列坞里，飞过去是另一种转场，本期不做。 */
const ECHO_SELECTOR = CHAT_FLOW_SELECTOR + ' ' + SUBMISSION_ECHO_SELECTOR

/** 已经落定的用户行。它和回显行是同一个组件的两副面孔，结构差一层。 */
const USER_ROW_SELECTOR = CHAT_FLOW_SELECTOR + ' [data-chat-flow-kind="user"]'

/** 飞行期间要认的两种行，合成一句查：正式的用户行，以及它前面那条回显。 */
const ROW_SELECTOR = USER_ROW_SELECTOR + ', ' + ECHO_SELECTOR

/**
 * 给整页装上发送气泡的起飞。
 */
export function installSendFlight(readEnabled: () => boolean): () => void {
    // 读者的系统偏好说了先。dsh 自己在滚动那一侧也是这么办的（`use-scroll-follow.ts` 的 `toBottom`）。
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {
    }

    /** 最近一次抓到的草稿起点。 */
    let origin: DraftOrigin | null = null
    /** 已经认过的回显行。安装时先把页面里躺着的那些认下来——恢复会话时它们也在。 */
    const handled = new WeakSet<Element>()
    /** 正在飞的那一段。读者连发时，最后一段说了算。 */
    let flight: Flight | null = null
    /** 定时器兜底。 */
    let rescue = 0
    /** 替身挂着等回显的超时。 */
    let holdTimer = 0

    for (const echo of document.querySelectorAll(ECHO_SELECTOR)) handled.add(echo)

    /**
     * 飞行期间盯行：回显被正式那一行换掉，是唯一一件要当场知道的事。
     *
     * 它在本帧渲染**之前**回调，所以同步认一次就够；但只在真有行进出时才认——预筛只看增删节点
     * **自己**，两个属性都挂在行元素身上，认行不必往下找子树。
     */
    const rowWatcher = new MutationObserver((records) => {
        const activeFlight = flight
        if (activeFlight === null || !touchesUserRow(records)) return
        const row = currentRow(activeFlight.previous)
        if (row === null || row === activeFlight.hidden) return
        activeFlight.hidden?.removeAttribute(FLYING_ATTRIBUTE)
        row.setAttribute(FLYING_ATTRIBUTE, '')
        activeFlight.hidden = row
        activeFlight.bubble = findBubble(row)
        followTarget(activeFlight)
    })

    /** 落定：先把真实行放出来，再扔掉替身。顺序反了会闪一下空白。 */
    const settle = (): void => {
        const activeFlight = flight
        if (activeFlight === null) return
        flight = null
        reportFlight(activeFlight.probe)
        rowWatcher.disconnect()
        window.clearTimeout(rescue)
        rescue = 0
        activeFlight.hidden?.removeAttribute(FLYING_ATTRIBUTE)
        // **先让替身从文档里消失，再取消动画**，不能反过来。取消会让光晕回到「还没动过」的尺寸（整张
        // 输入卡片那么大），而光晕那条把 scale 与 opacity 合在一起，是**可合成**的动画——取消要经合成器，
        // 节点移除也要经合成器，两者顺序一错就会多画一帧：读者看到的是「宽度被瞬间拉长又闪回」。
        // 节点一离开文档，它身上的动画随之失效，下面那次 cancel 只是显式清掉引用。
        activeFlight.morph.wrapper.remove()
        for (const animation of activeFlight.morph.animations) animation.cancel()
    }

    /** 这一下飞不起来：把替身拆掉。输入卡片一直没藏过，不用还。 */
    const dropHold = (draft: DraftOrigin): void => {
        draft.frame.wrapper.remove()
    }

    /**
     * 撤回还挂着的替身。
     *
     * 没等到回显（超时、认不到、跨屏、或者上一段还挂着又来了一次）时走这里。**先移除替身再放出卡片**，
     * 反过来会让两份内容在同一帧里同时画着。
     */
    const releaseHold = (): void => {
        const draft = origin
        if (draft === null) return
        origin = null
        window.clearTimeout(holdTimer)
        holdTimer = 0
        echoWatcher.disconnect()
        dropHold(draft)
    }

    /**
     * 帧里三件事：认出「形变段走完了」并把壳归一、补一次终点的移动、约下一帧。
     * 认行交给上面那个 observer——它不是每帧都有新答案的事。
     *
     * **位移与形状都不在这里写**：两条关键帧同一条时间轴，dsh 占住主线程时它们照样一起走，右边缘
     * 始终在起点和终点之间。若把形状留在主线程，卡顿时未收窄的卡片会先飞到终点。
     *
     * 帧里剩下的两件都是主线程的事：`compact` 是一次性的样式写、`followTarget` 读的是当前布局。
     */
    const tick = (): void => {
        const activeFlight = flight
        if (activeFlight === null) return
        // 起播后第一帧核对一次时间轴（见 `Morph.alignStart`）。
        activeFlight.morph.alignStart()
        const u = activeFlight.morph.progress()
        if (u >= 1) {
            // 走完了：把壳按最后一格归一，然后停掉这条链。**落定不在这里做**——动画自己的 `finished`
            // 比这一帧早知道结果，主线程被长任务占住时也不会让替身停在终态上多停一格（见 `startFlight`）。
            activeFlight.morph.compact(1)
            return
        }
        activeFlight.morph.compact(u)
        recordFlightFrame(activeFlight.probe, performance.now(), u)
        followTarget(activeFlight)
        requestAnimationFrame(tick)
    }

    /** 起一段飞行：把落点、采样、字层与动画补上，然后起跑。 */
    const startFlight = (echo: HTMLElement, draft: DraftOrigin): void => {
        // 上一段还在飞就先收掉它。不收的话旧替身会永远留在页面上（连发一次多一个幽灵），旧的那条真实行
        // 也永远带着「先藏起来」的标记——读者再也看不见那条消息。读者连发时「最后一段说了算」，这一步就是它。
        settle()
        const bubble = findBubble(echo)
        if (bubble === null) {
            dropHold(draft)
            return
        }
        const box = bubble.getBoundingClientRect()
        // 起点是替身挂上那一刻卡片的位置：它已经在屏幕上停在那了，这里只判它还能不能飞到终点。
        const startAt = draft.frame.origin
        const onSameScreen = sameScreen(startAt.left, box.left, window.innerWidth)
            && sameScreen(startAt.top, box.top, window.innerHeight)
        if (!onSameScreen) {
            dropHold(draft)
            return
        }
        const buildStart = performance.now()
        const morph = draft.frame.launch(bubble, box)
        if (morph === null) {
            dropHold(draft)
            return
        }
        const probe = createFlightProbe(draft.capturedAt, performance.now() - buildStart, morph)
        // **只藏回显行。** 输入卡片不藏：它一直在读者眼皮底下，气泡就是从它上面升起来的。
        echo.setAttribute(FLYING_ATTRIBUTE, '')
        flight = {
            morph,
            probe,
            targetAt: {left: box.left, top: box.top},
            shiftedX: 0,
            shiftedY: 0,
            previous: lastUserRow(),
            hidden: echo,
            bubble,
        }
        rowWatcher.observe(document.body, {childList: true, subtree: true})
        rescue = window.setTimeout(settle, FLIGHT_MS + RESCUE_MARGIN_MS)
        requestAnimationFrame(tick)
        // 落定交给位移那条动画自己。连发时 `flight` 已经换成新的一段，旧的那一轮比对不上、自然不落。
        morph.finished.then(() => {
            if (flight?.morph === morph) settle()
        })
        probe.playedAt = Math.round(performance.now() - probe.at)
        // 起跑：只放开动画，起点由浏览器在下一次渲染更新时定（见 `Morph.play`）。
        morph.play()
    }

    /**
     * 等这一次提交的回显。
     *
     * 替身已经挂在页面上了（见 `captureOrigin`），这里只认新冒出来的回显；超时由挂替身时设的那个
     * 定时器兜底，不再在这里判时间。
     */
    const echoWatcher = new MutationObserver(() => {
        const draft = origin
        if (draft === null) {
            echoWatcher.disconnect()
            return
        }
        const echo = takeFreshEcho(handled)
        if (echo === null) return
        origin = null
        window.clearTimeout(holdTimer)
        holdTimer = 0
        echoWatcher.disconnect()
        startFlight(echo, draft)
    })

    /**
     * 挂上这一次的替身：色块（默认），或者整张卡片的克隆。
     *
     * 色块那条只量两次矩形、读几次样式，不克隆任何东西——提交那一帧主线程本来就被 dsh 占着，
     * 一次整卡克隆加一次子树布局量在这里是要还的（见 `SlabSnapshot`）。
     */
    const mountDraft = (input: HTMLElement, card: HTMLElement): HoldFrame | null => {
        if (readSlab()) {
            const slab = snapshotSlab(input, card)
            return slab === null ? null : mountSlab(slab, slab.box)
        }
        const snapshot = snapshotComposer(input, card)
        return snapshot === null ? null : mountGhost(snapshot, snapshot.box)
    }

    /** 抓一次草稿起点：挂上替身。抓不到就当这一下不是提交——不动手永远安全。 */
    const captureOrigin = (): void => {
        if (!readEnabled()) return
        const input = document.querySelector(COMPOSER_INPUT_SELECTOR)
        if (!(input instanceof HTMLElement)) return
        const card = input.closest(COMPOSER_CARD_SELECTOR)
        if (!(card instanceof HTMLElement)) return
        // 空草稿不会提交出一条消息；量它只是白花一次快照。
        if ((input.textContent ?? '').trim() === '') return
        // 上一段还挂着（连按两次回车，或者上一次没等到回显）：先收掉再挂新的。**要在量快照之前**：
        // 收掉的那一份正盖在卡片上，留着它量到的是叠了两层的样子。
        releaseHold()
        const frame = mountDraft(input, card)
        if (frame === null) return
        // 卡片不藏、也不动：替身挂着的时候几乎透明，读者看到的还是原来那张输入框。
        origin = {capturedAt: performance.now(), frame}
        holdTimer = window.setTimeout(releaseHold, HOLD_MS)
        echoWatcher.observe(document.body, {childList: true, subtree: true})
    }

    /**
     * 提交的两条手动路径：回车，和点输入卡片里的按钮。两个都早于 React 清空草稿，所以起点量得到。
     * 点了没提交也不亏——没有回显就没有动画。
     */
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
        if (event.isComposing) return
        captureOrigin()
    }

    const onClick = (event: MouseEvent): void => {
        if (!(event.target instanceof Element)) return
        if (event.target.closest(COMPOSER_CARD_SELECTOR) === null) return
        captureOrigin()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('click', onClick, true)

    return () => {
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('click', onClick, true)
        releaseHold()
        rowWatcher.disconnect()
        settle()
    }
}

/** 提交那一刻：替身已经挂在页面上、停在起手格。 */
interface DraftOrigin {
    readonly capturedAt: number
    /** 已经挂好的替身。 */
    readonly frame: HoldFrame
}

/** 一段正在飞的动画。`hidden` 会在回显被换掉时改指新来的那一行。 */
interface Flight {
    /** 替身与它身上跑着的全部合成动画。 */
    readonly morph: Morph
    /** 这一段飞行的帧率与长任务记录（临时诊断）。 */
    readonly probe: FlightProbe
    /** 起飞那一刻量到的终点位置。终点之后每动一下，差值都从这里算。 */
    readonly targetAt: { readonly left: number; readonly top: number }
    /** 已经补到外层上的差值；没变就不写样式。 */
    shiftedX: number
    shiftedY: number
    /** 起飞之前聊天流里最后一条用户消息。靠它认出新来的那一行。 */
    readonly previous: HTMLElement | null
    hidden: HTMLElement | null
    /** 终点那条气泡。跟着 `hidden` 一起换；量不到时留 null，这一帧就不补。 */
    bubble: HTMLElement | null
}

/**
 * 掉帧诊断（临时，查完就删）。
 *
 * 起飞时记下替身的规模（克隆元素数、will-change 层数、玻璃有没有生效、动画条数），逐帧只做一次
 * 数组 push；落定时打一张汇总：帧间隔的分位、超过一帧与两帧的帧、以及长动画帧（LoAF）。
 * 判断口径：LoAF 多且阻塞时长大，是主线程被占；LoAF 干净但帧间隔大，问题在合成器与光栅化。
 */
interface FlightProbe {
    /** 起飞时刻。 */
    readonly at: number
    /** 抓起点到起飞的间隔。 */
    readonly captureGap: number
    /** 建替身与建动画花了多久，主线程。 */
    readonly buildMs: number
    /** 每帧：距起飞多少毫秒、与上一帧隔了多久、形变进度。 */
    readonly frames: {readonly t: number; readonly dt: number; readonly u: number}[]
    /** 上一帧的时刻。 */
    last: number
    /** 动画真正起跑的时刻（距起飞多少毫秒）；没起跑时为 null。 */
    playedAt: number | null
    /** 长动画帧：总时长、阻塞时长、渲染时长、样式与布局时长。 */
    readonly loaf: {readonly duration: number; readonly block: number; readonly render: number; readonly layout: number}[]
    /** 浏览器支持才有的观察器，收尾时断开。 */
    observer: PerformanceObserver | null
}

/** 建一次诊断：打印起飞时替身的规模，再挂上长动画帧的观察器。 */
function createFlightProbe(capturedAt: number, buildMs: number, morph: Morph): FlightProbe {
    const at = performance.now()
    const probe: FlightProbe = {
        at,
        captureGap: Math.round(at - capturedAt),
        buildMs,
        frames: [],
        last: at,
        playedAt: null,
        loaf: [],
        observer: null,
    }
    const card = morph.wrapper.querySelector<HTMLElement>('[data-composer-card]')
    const info = {
        抓起点到起飞ms: probe.captureGap,
        建替身ms: Math.round(buildMs * 10) / 10,
        克隆元素: morph.wrapper.querySelectorAll('*').length,
        合成层标记: morph.wrapper.querySelectorAll('[style*="will-change"]').length,
        动画条数: morph.animations.length,
        玻璃: card === null ? '找不到卡片' : getComputedStyle(card, '::before').backdropFilter,
    }
    console.log('[dsh-chat-ux/send-flight] 起飞 ' + JSON.stringify(info))
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                const loaf = entry as PerformanceEntry & {
                    blockingDuration?: number
                    renderStart?: number
                    styleAndLayoutStart?: number
                }
                const end = loaf.startTime + loaf.duration
                probe.loaf.push({
                    duration: Math.round(loaf.duration),
                    block: Math.round(loaf.blockingDuration ?? 0),
                    render: loaf.renderStart === undefined ? 0 : Math.round(end - loaf.renderStart),
                    layout: loaf.styleAndLayoutStart === undefined ? 0 : Math.round(end - loaf.styleAndLayoutStart),
                })
            }
        })
        observer.observe({type: 'long-animation-frame'})
        probe.observer = observer
    } catch {
        // 没有 LoAF 的浏览器：只留帧间隔那一半
    }
    return probe
}

/** 记一帧。 */
function recordFlightFrame(probe: FlightProbe, now: number, u: number): void {
    probe.frames.push({t: Math.round(now - probe.at), dt: Math.round(now - probe.last), u: Math.round(u * 100) / 100})
    probe.last = now
}

/** 落定时打一张汇总。 */
function reportFlight(probe: FlightProbe): void {
    probe.observer?.disconnect()
    const gaps = probe.frames.map(frame => frame.dt).sort((left, right) => left - right)
    const at = (share: number): number => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * share))] ?? 0
    const slow = probe.frames.filter(frame => frame.dt > 25)
    const summary = {
        帧数: probe.frames.length,
        间隔p50: at(0.5),
        间隔p90: at(0.9),
        间隔max: gaps.at(-1) ?? 0,
        超过25ms: slow.length,
        超过40ms: probe.frames.filter(frame => frame.dt > 40).length,
        抓起点到起飞ms: probe.captureGap,
        建替身ms: Math.round(probe.buildMs * 10) / 10,
        起跑ms: probe.playedAt,
        整段ms: Math.round(performance.now() - probe.at),
        长动画帧: probe.loaf.length,
        阻塞合计ms: probe.loaf.reduce((sum, loaf) => sum + loaf.block, 0),
    }
    console.log('[dsh-chat-ux/send-flight] 汇总 ' + JSON.stringify(summary))
    if (slow.length > 0) console.table(slow.slice(0, 16))
    if (probe.loaf.length > 0) console.table(probe.loaf.slice(0, 16))
}

/**
 * 把终点动了多少补到替身的最外层上。
 *
 * 这是每帧唯一的 JS：一次矩形读、至多一次样式写。飞行期间终点通常只动几十像素（提交后 dsh 自己会
 * 滚到底、回显会被正式行换掉），所以「整体补差」与「每帧按曲线重算位置」看起来是同一件事。
 *
 * 真实行的 rect 带着 `[data-chat-flow]` 的 `translateY`，但这一版不做落点让位，那一项恒为 0。
 */
function followTarget(value: Flight): void {
    const bubble = value.bubble
    if (bubble === null) return
    const box = bubble.getBoundingClientRect()
    // 行被摘走、新的还没挂上时，量到的是一个已经不在文档里的盒子（全 0）。停住不补，
    // 比把替身甩到左上角强——下一帧 observer 认到新行就接上了。
    if (box.width === 0) return
    const shiftX = box.left - value.targetAt.left
    const shiftY = box.top - value.targetAt.top
    if (shiftX === value.shiftedX && shiftY === value.shiftedY) return
    value.shiftedX = shiftX
    value.shiftedY = shiftY
    value.morph.wrapper.style.transform = 'translate(' + shiftX + 'px, ' + shiftY + 'px)'
}

/**
 * 取一条还没认过的回显行。
 *
 * 一批里只认最新的一条（`querySelectorAll` 是文档序），其余的也一并记下——否则它们会在后面的帧
 * 里被当成新的，跟着再飞一次。
 */
function takeFreshEcho(handled: WeakSet<Element>): HTMLElement | null {
    const fresh: Element[] = []
    for (const echo of document.querySelectorAll(ECHO_SELECTOR)) {
        if (!handled.has(echo)) fresh.push(echo)
    }
    if (fresh.length === 0) return null
    for (const echo of fresh) handled.add(echo)
    const latest = fresh.at(-1)
    return latest instanceof HTMLElement ? latest : null
}

/** 此刻该藏的那一条：回显还在就是它，回显被换掉之后就是正式那一行。 */
function currentRow(previous: HTMLElement | null): HTMLElement | null {
    const echo = document.querySelector(ECHO_SELECTOR)
    if (echo instanceof HTMLElement && echo !== previous) return echo
    const row = lastUserRow()
    return row === previous ? null : row
}

/** 聊天流里最后一条用户行。 */
function lastUserRow(): HTMLElement | null {
    const rows = document.querySelectorAll(USER_ROW_SELECTOR)
    const last = rows.item(rows.length - 1)
    return last instanceof HTMLElement ? last : null
}

/**
 * 一行用户消息里真正画了底色的那一个元素，也就是气泡。
 *
 * 不能认死层数：回显行自己就是气泡那一行（`data-submission-echo` 挂在 `.userRow` 上），而正式行
 * 外面还套着一层流块容器——两边的深度差一层。所以从这一行往下按层找，谁先画了底色就是谁；附件行
 * 与引用摘要都没有底色，会被跳过。
 */
function findBubble(row: HTMLElement): HTMLElement | null {
    const queue: Element[] = Array.from(row.children)
    while (queue.length > 0) {
        const node = queue.shift()
        if (node === undefined) break
        if (node instanceof HTMLElement && alphaOf(getComputedStyle(node).backgroundColor) > 0) return node
        for (const child of node.children) queue.push(child)
    }
    return null
}

/**
 * 这一批 DOM 变化里有没有碰用户行或回显行。
 *
 * 只看增删节点**自己**：两个属性都挂在行元素身上，认行不必往下找子树——长会话里往下找一次
 * 就是几千个节点。
 */
function touchesUserRow(records: MutationRecord[]): boolean {
    for (const record of records) {
        for (const node of record.addedNodes) {
            if (isRowNode(node)) return true
        }
        for (const node of record.removedNodes) {
            if (isRowNode(node)) return true
        }
    }
    return false
}

/** 一个节点自己、或者它带进来的那棵子树里，有没有用户行或回显行。 */
function isRowNode(node: Node): boolean {
    return node instanceof HTMLElement
        && (node.matches(ROW_SELECTOR) || node.querySelector(ROW_SELECTOR) !== null)
}

/** 色块替身的开关键：值为 `0` 时退回克隆整张卡片。 */
const SLAB_KEY = 'dsh-chat-ux:send-slab'

/** 色块替身开着没有。读不到 localStorage（隐私模式会抛）时按开着算。 */
function readSlab(): boolean {
    try {
        return window.localStorage.getItem(SLAB_KEY) !== '0'
    } catch {
        return true
    }
}

/**
 * 起终点还在同一屏里吗。
 *
 * 一屏的尺度现读视口的那一维（兜底见 `FLIGHT_LIMIT_FLOOR_PX`）：两个盒子还落在同一屏里，这段飞行
 * 就看得见；有一头已经飞出屏外，替身会消失在屏幕边上、读者只看到消息凭空出现——那就不飞。
 */
function sameScreen(start: number, end: number, viewportExtent: number): boolean {
    return Math.abs(start - end) <= Math.max(FLIGHT_LIMIT_FLOOR_PX, viewportExtent)
}
