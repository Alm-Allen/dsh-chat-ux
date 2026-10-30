/**
 * 发送气泡的起飞与落地。
 *
 * 提交时抓下输入卡片，等 dsh 的即发即显行出现后挂上替身并藏起真实行；落定时摘属性、移除替身。
 * 起点抓不到、起终点跨屏或用户关闭开关时一次都不动手。
 *
 * 真实行必须在本帧绘制前藏住；后台标签页 rAF 会停，所以另设兜底定时器保证消息一定被放出来。
 */
import {CHAT_FLOW_SELECTOR, COMPOSER_CARD_SELECTOR, COMPOSER_INPUT_SELECTOR, SUBMISSION_ECHO_SELECTOR} from '../../dom-contract'
import {alphaOf, FLIGHT_MS, snapshotComposer, startMorph} from './send-morph'
import type {ComposerSnapshot, Morph} from './send-morph'

/** 挂在真实行上的标记：有它，那一行就先藏着。规则在 `send-flight-styles.ts`，两边必须一字不差。 */
export const FLYING_ATTRIBUTE = 'data-chat-ux-send-flight'

/** 起点只认这么久。抓完超过它才出现的回显，不算这一次提交的。 */
const ORIGIN_TTL_MS = 1500

/**
 * 位移上限的兜底值：一屏比它窄时按它算（见 `sameScreen`）。
 *
 * 聊天列的横向距离天生接近 900px，纵向又随窗口高度增长，不能用一个固定的像素上限判断要不要飞。
 */
const FLIGHT_LIMIT_FLOOR_PX = 900

/** 兜底比飞行本身多留一点：定时器在后台被节流，也要赶在读者切回来之前把消息放出来。 */
const RESCUE_MARGIN_MS = 400

/**
 * 起播前先等几帧，让新子树完成第一次 raster。
 *
 * 否则合成器时间轴照走、屏幕还没有像素，读者第一眼就会看到替身已经在半路。预热期间替身停在
 * 与真卡片重合的起手格，看不出停顿。
 */
const WARMUP_FRAMES = 2

/** 预热折算的时长（毫秒）。按六十帧算，误差不到一帧；兜底定时器要把它一起算进去。 */
const WARMUP_MS = WARMUP_FRAMES * (1000 / 60)

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
        rowWatcher.disconnect()
        window.clearTimeout(rescue)
        rescue = 0
        activeFlight.hidden?.removeAttribute(FLYING_ATTRIBUTE)
        activeFlight.card.removeAttribute(FLYING_ATTRIBUTE)
        // 兜底：卡片若在这一段里被换过节点，标记跟着旧节点一起走了，新的那一张按选择器再摘一次
        for (const stale of document.querySelectorAll('[' + FLYING_ATTRIBUTE + ']')) {
            if (stale.matches(COMPOSER_CARD_SELECTOR)) stale.removeAttribute(FLYING_ATTRIBUTE)
        }
        // **先让替身从文档里消失，再取消动画**，不能反过来。取消会让光晕回到「还没动过」的尺寸（整张
        // 输入卡片那么大），而光晕那条把 scale 与 opacity 合在一起，是**可合成**的动画——取消要经合成器，
        // 节点移除也要经合成器，两者顺序一错就会多画一帧：读者看到的是「宽度被瞬间拉长又闪回」。
        // 节点一离开文档，它身上的动画随之失效，下面那次 cancel 只是显式清掉引用。
        activeFlight.morph.wrapper.remove()
        for (const animation of activeFlight.morph.animations) animation.cancel()
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
        // 起播后第一帧核对一次时间轴：预热之后才起跑，这一格还没画出来（见 `Morph.alignStart`）。
        activeFlight.morph.alignStart()
        const u = activeFlight.morph.progress()
        if (u >= 1) {
            settle()
            return
        }
        activeFlight.morph.compact(u)
        followTarget(activeFlight)
        requestAnimationFrame(tick)
    }

    /** 起一段飞行：立替身、藏真实行。全部同步做完——晚一帧读者就会看到真实气泡闪一下。 */
    const startFlight = (echo: HTMLElement, draft: DraftOrigin): void => {
        // 上一段还在飞就先收掉它。不收的话旧替身会永远留在页面上（连发一次多一个幽灵），旧的那条真实行
        // 也永远带着「先藏起来」的标记——读者再也看不见那条消息。读者连发时「最后一段说了算」，这一步就是它。
        settle()
        const bubble = findBubble(echo)
        if (bubble === null) return
        const box = bubble.getBoundingClientRect()
        const startBox = draft.snapshot.box
        const onSameScreen = sameScreen(startBox.left, box.left, window.innerWidth)
            && sameScreen(startBox.top, box.top, window.innerHeight)
        if (!onSameScreen) return
        const morph = startMorph(draft.snapshot, bubble, box)
        if (morph === null) return
        echo.setAttribute(FLYING_ATTRIBUTE, '')
        // 真输入卡片一起藏起来：提交之后它已经换成会话态停在底部，而替身是从提交那一刻它还在的位置起的
        // 飞——两份内容一样的东西同时画着，就是工具栏、字、发送按钮各两套。只藏可见性，盒子仍在布局里，
        // 下一段提交量起点照样准。
        draft.card.setAttribute(FLYING_ATTRIBUTE, '')
        flight = {
            morph,
            targetAt: {left: box.left, top: box.top},
            shiftedX: 0,
            shiftedY: 0,
            previous: lastUserRow(),
            hidden: echo,
            bubble,
            card: draft.card,
        }
        rowWatcher.observe(document.body, {childList: true, subtree: true})
        rescue = window.setTimeout(settle, FLIGHT_MS + RESCUE_MARGIN_MS + WARMUP_MS)
        requestAnimationFrame(tick)
        // 预热：替身先在屏幕上静止这两帧，等它被光栅化过再放开动画。中途连发时 `flight` 已经换成新的
        // 一段，旧的那一轮在这里自然停掉（新的一段自己有自己的预热）。
        const warmUp = (left: number): void => {
            if (flight?.morph !== morph) return
            if (left > 0) {
                requestAnimationFrame(() => warmUp(left - 1))
                return
            }
            morph.play()
        }
        requestAnimationFrame(() => warmUp(WARMUP_FRAMES))
    }

    /**
     * 等这一次提交的回显。
     *
     * 只在抓过起点之后才挂上（平时一次回调都不会有），认到、超时或者被放弃时立刻摘掉。
     */
    const echoWatcher = new MutationObserver(() => {
        const draft = origin
        if (draft === null) {
            echoWatcher.disconnect()
            return
        }
        if (performance.now() - draft.capturedAt > ORIGIN_TTL_MS) {
            origin = null
            echoWatcher.disconnect()
            return
        }
        const echo = takeFreshEcho(handled)
        if (echo === null) return
        origin = null
        echoWatcher.disconnect()
        startFlight(echo, draft)
    })

    /** 抓一次草稿起点。抓不到就当这一下不是提交——不动手永远安全。 */
    const captureOrigin = (): void => {
        if (!readEnabled()) return
        const input = document.querySelector(COMPOSER_INPUT_SELECTOR)
        if (!(input instanceof HTMLElement)) return
        const card = input.closest(COMPOSER_CARD_SELECTOR)
        if (!(card instanceof HTMLElement)) return
        // 空草稿不会提交出一条消息；量它只是白花一次克隆。
        if ((input.textContent ?? '').trim() === '') return
        const snapshot = snapshotComposer(input, card)
        if (snapshot === null) return
        origin = {
            capturedAt: performance.now(),
            snapshot,
            card,
        }
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
        echoWatcher.disconnect()
        rowWatcher.disconnect()
        origin = null
        settle()
    }
}

/** 草稿起飞前的那一刻：整张输入卡片的快照。 */
interface DraftOrigin {
    readonly capturedAt: number
    readonly snapshot: ComposerSnapshot
    /** 提交时那张输入卡片：飞行期间要跟着一起藏。 */
    readonly card: HTMLElement
}

/** 一段正在飞的动画。`hidden` 会在回显被换掉时改指新来的那一行。 */
interface Flight {
    /** 替身与它身上跑着的全部合成动画。 */
    readonly morph: Morph
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
    /** 真输入卡片：飞行期间一起藏着，落定时放出来。 */
    readonly card: HTMLElement
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

/**
 * 起终点还在同一屏里吗。
 *
 * 一屏的尺度现读视口的那一维（兜底见 `FLIGHT_LIMIT_FLOOR_PX`）：两个盒子还落在同一屏里，这段飞行
 * 就看得见；有一头已经飞出屏外，替身会消失在屏幕边上、读者只看到消息凭空出现——那就不飞。
 */
function sameScreen(start: number, end: number, viewportExtent: number): boolean {
    return Math.abs(start - end) <= Math.max(FLIGHT_LIMIT_FLOOR_PX, viewportExtent)
}
