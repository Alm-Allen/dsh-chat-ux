/**
 * 折叠时用高度动画把下方内容推开。dsh 收起时把展开体整个卸掉，CSS 拿不到可过渡的旧值，只能拦下点击去压真身的高度：
 * 真身留在原位、还是展开态，压到底再把点击还给 React，收起态接上来时不会跳
 *
 * 过程组压组根、不压组体，组体自己带滚动条，dsh 的跟随正盯着它
 * 动画按读者看得见的那一段与视口外的那一截分两段跑，速度才不随内容长短变；主线程卡住的那几帧不算进动画时间
 */

import {
    CHAT_FLOW_SELECTOR,
    CONVERSATION_SCROLL_SELECTOR,
    DISCLOSURE_HEADER_SELECTOR,
    DISCLOSURE_ROW_SELECTOR,
    FOLLOW_THRESHOLD_PX,
    MOTION_ROW_SELECTOR,
    PROCESS_BODY_SELECTOR,
    PROCESS_GROUP_SELECTOR,
    THINK_ROW_SELECTOR,
} from "../../dom-contract"
import {ensureFollowTail, FOLLOW_LOOK_TOTAL_MS} from "../follow/follow-tail"
import {isProgrammaticToggle} from "./programmatic-toggle"
import {isReaderScrollIntent} from "../follow/reader-intent"

// 高度动画的时长，与侧栏 AnimatedRows 一致
const ROLL_MS = 200

// 可见段占整个动画时长的多少，剩下那一小段留给视口外的那一截高度。不留的话收尾那一下是瞬间跳变，下方内容会跟着瞬移
const VISIBLE_SHARE = 0.9

// 超过这个时长的意图不再可信：点击之后没有发生布局变化，或者那一次变化来自别处
const INTENT_TTL_MS = 500

// 其余可开合的控件（过程组头等）
const TOGGLE_SELECTOR = "[aria-expanded]"
// 弹出层控件：菜单、对话框、列表开的不是折叠体，本模块整块跳过
const POPUP_SELECTOR = "[aria-haspopup]"
// 整块跳过的控件：轮次头（那个「用时 X 秒」的按钮）与轮次触发通知，它们开合的是整轮内容
const SKIPPED_CONTROL_SELECTOR = "[data-turn-process], [data-turn-trigger]"

// 撤掉收起动画之前最多等 React 几帧，一次 requestAnimationFrame 来回通常就够
const SHUT_CONFIRM_FRAMES = 3

// 这一轮折叠的意图监听活多久：要盖住等 React 收下那次点击（INTENT_TTL_MS）、等动画跑完（ROLL_MS），
// 以及收尾之后看跟随属性的那几眼（FOLLOW_LOOK_TOTAL_MS）。短了会在最后几眼里把监听撤掉，读者那一下动手就没人看见
const FOLD_WATCH_TTL_MS = INTENT_TTL_MS + ROLL_MS + FOLLOW_LOOK_TOTAL_MS

// 动画跑完之后再多算一会儿「位置归动画管」，让收尾那一帧落在窗口之外
const FOLD_BUSY_GRACE_MS = 50

/**
 * 正在做高度动画的那个元素带着这个标记，fold-motion-styles.ts 见到它就让子元素一律 flex: none
 * 压住高度时，flex 不能把某一张卡片先挤没
 */
export const ROLLING_ATTRIBUTE = "data-chat-ux-rolling"

/**
 * 两帧的时间戳隔得超过这么久，就认为中间主线程被占住过。比卡住的时长本身要短：长任务之后的第一帧
 * 带的还是卡住之前排好的时间戳，跳变落在再下一帧上，实测四十毫秒的长任务只留下三十七毫秒的间隔
 */
const FRAME_GAP_LIMIT_MS = 25

// 还没量到这块屏幕的帧间隔时，按 60 Hz 的一帧算
const NOMINAL_FRAME_MS = 16.7

// 一次要靠压真身高度完成的收起
interface HeightShut {
    // 要压的真身：展开体自己，或过程组的组根
    readonly target: HTMLElement
    // 收起的终点高度。展开体归 0；组根停在组头那一段，组体藏在它下面
    readonly floor: number
    // React 把这次折叠落到 DOM 上了：展开体被卸掉，或组体带上 hidden
    readonly collapsed: () => boolean
    // 被点的控件，收尾时用它把点击重放给 React
    readonly control: HTMLElement
    readonly watch: FoldWatch
}

// 一次折叠的收尾凭证。收尾要把滚动位置交还给 dsh 的跟随，但那只对本来就贴着底、这中间也没自己出过手的读者成立，
// 而读者的意图只能从事件上看出来
interface FoldWatch {
    // 折叠开始那一刻读者是不是贴着底部
    readonly atBottom: boolean
    // 这中间读者有没有为滚动出过手
    readonly moved: () => boolean
    // 撤掉意图监听
    readonly stop: () => void
}

interface FoldIntent {
    // 被点的开合控件：DisclosureRow 的行，或过程组头的按钮
    readonly control: HTMLElement
    // 过程组体；不是过程组时为 null
    readonly groupBody: HTMLElement | null
    // 过程组根，高度压在它身上；不是过程组时为 null
    readonly groupRoot: HTMLElement | null
    // 点击那一刻组根的高度，收起态的它正是展开动画的起点
    readonly collapsedHeight: number
    readonly watch: FoldWatch
    // 取意图的时刻，用来判它是否已经过期
    readonly takenAt: number
}

// 高度动画排到哪一刻为止，这一段时间里滚动位置归动画管
let foldBusyUntil = 0

/**
 * 高度动画正在跑，位置在这一段里归动画管：这中间要是有人把滚动位置拽到底，正被拉着的高度会跟着动，看起来是抖
 * 2026-10-18 起 follow/call-appeared.ts 在补位之前会问它一句
 */
export function isFoldGlideBusy(): boolean {
    return performance.now() < foldBusyUntil
}

// 排一段「位置归动画管」的时间
const markFoldBusy = (): void => {
    foldBusyUntil = performance.now() + ROLL_MS + FOLD_BUSY_GRACE_MS
}

// 装上折叠时推开下方内容的高度动画，只有读者点击引起的变化会补；返回值是卸载函数
export function installFoldGlide(): () => void {
    if (typeof document === "undefined" || document.body === null) return () => {
    }

    let intent: FoldIntent | null = null
    // 收起动画正在跑：这两百毫秒里不接受新的点击，免得两次折叠叠在一起
    let shutting = false
    // 正在把拦下来的那次点击原样交还给 React，那一次不该再被拦
    let replaying = false

    const reduceMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches

    /**
     * 元素露在读者眼里的那一段有多高，也就是动画可见段的终点距元素顶边多远
     *
     * 内容比窗口长的时候，元素自己占着完整高度，读者只看得到其中一段：过程组体（max-height: min(400px, 50vh)）
     * 是那层窗口，视口是最外面那层。照全高做动画的话，八千像素的内容会在两百毫秒里跑完，看着就是直接弹出
     */
    const visibleReachOf = (element: HTMLElement): number => {
        const rect = element.getBoundingClientRect()
        let visibleBottom = Math.min(rect.bottom, window.innerHeight)
        // 每一层裁剪祖先都可能把可见范围收得更窄，整条链都要过一遍；overflow 是 visible 的祖先不裁东西，跳过。
        // getComputedStyle 在这里不算浪费：元素刚插进来，样式本来就要算
        for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
            const style = window.getComputedStyle(ancestor)
            if (style.overflowX === "visible" && style.overflowY === "visible") continue
            visibleBottom = Math.min(visibleBottom, ancestor.getBoundingClientRect().bottom)
        }
        return Math.max(0, Math.min(rect.height, visibleBottom - rect.top))
    }

    /**
     * 控件的展开体，null 说明这个控件当前是收起的
     *
     * 控件自己发 aria-controls 时以它为准：那个 id 由 useId 生成、带冒号，只能走 getElementById
     */
    const expandedBodyOf = (control: HTMLElement): HTMLElement | null => {
        const controls = control.getAttribute("aria-controls")
        if (controls !== null) {
            const controlledElement = document.getElementById(controls)
            return controlledElement instanceof HTMLElement ? controlledElement : null
        }
        // 展开体挂在 [data-disclosure-header] 的兄弟位置上，header 把被点行与 headerAccessory 槽位一起裹住。
        // 只认被点行的话，它的兄弟正好是 headerAccessory 那个空槽位，收起时会把那个按钮压扁
        const header = control.closest(DISCLOSURE_HEADER_SELECTOR)
        if (header === null) return null
        const bodyCandidate = header.parentElement?.lastElementChild
        return bodyCandidate instanceof HTMLElement && bodyCandidate !== header ? bodyCandidate : null
    }

    /**
     * 控件控制的过程组体，不是组头时为 null
     *
     * 「控件住在过程组里」不等于「控件是组头」：组体里的每一个工具行、思考行都住在 [data-step-process] 里，
     * 只有组头拿 aria-controls 指着组体。只看 closest 的话，点一行工具调用会被当成展开整个过程组
     */
    const processBodyOf = (control: HTMLElement): HTMLElement | null => {
        const controls = control.getAttribute("aria-controls")
        if (controls === null) return null
        const controlledElement = document.getElementById(controls)
        return controlledElement instanceof HTMLElement && controlledElement.matches(PROCESS_BODY_SELECTOR) ? controlledElement : null
    }

    // 读者此刻是不是贴着会话底部。判据与 follow-tail.ts 那份相同，入口不同：这一份从被点的控件往上找滚动容器
    const controlAtBottom = (control: HTMLElement): boolean => {
        const scroller = control.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
        if (scroller === null) return false
        return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= FOLLOW_THRESHOLD_PX
    }

    /**
     * 挂一份「读者有没有自己接管滚动」的监听，只活到这一轮折叠收尾为止
     *
     * 收尾晚于点击两百毫秒，读者随时可能在中间接管滚动，而接管的判据只能从事件上取。
     * 落在输入区里的指针与按键不算，那时读者在打字，不是在滚动
     */
    const watchFold = (atBottom: boolean): FoldWatch => {
        let moved = false
        const note = (event: Event): void => {
            if (isReaderScrollIntent(event)) moved = true
        }
        // 认这四种：它们都会真的挪动位置。dsh 的 READING_INTENTS 里另有 beforematch，本处不认
        const eventTypeList = ["wheel", "touchstart", "pointerdown", "keydown"]
        for (const type of eventTypeList) document.addEventListener(type, note, true)
        const stop = (): void => {
            for (const type of eventTypeList) document.removeEventListener(type, note, true)
        }
        window.setTimeout(stop, FOLD_WATCH_TTL_MS)
        return {atBottom, moved: () => moved, stop}
    }

    // 把拦下来的那次点击原样交给 React。重放期间不再拦，也不再起收起动画
    const replay = (control: HTMLElement): void => {
        shutting = false
        replaying = true
        try {
            control.click()
        } finally {
            replaying = false
        }
    }

    /**
     * 折叠收尾：开始那一刻贴着底部的读者，收尾时把滚动位置交还给 dsh 的跟随
     *
     * 折叠是一次量级很大的高度变化，dsh 的跟随会被一次「像读者移动、又没到底」的滚动关掉，
     * 它自己那个「回到底部」按钮是唯一的重开入口。这里只判这一次交还算不算数，怎么交还在 follow-tail.ts
     */
    const handBackFollow = (watch: FoldWatch): void => {
        if (!watch.atBottom) {
            watch.stop()
            return
        }
        ensureFollowTail({
            // 读者中途自己动了手，这一次交还就作废
            stillWanted: () => !watch.moved(),
            onSettled: () => {
                watch.stop()
            },
        })
    }

    /**
     * 折叠收尾的入口：动画走完再看一眼跟随
     *
     * 收起方向的重放、展开方向的取消都落在动画末尾，滚动位置也是那时才定下来。展开方向把那条动画带进来，
     * 等它真的走完：主线程卡住时它会被拉长，按固定时长等就会在动画还没跑完时去钉底
     */
    const settleAfterFold = (watch: FoldWatch, roll: Animation | null = null): void => {
        if (roll === null) {
            window.setTimeout(() => {
                handBackFollow(watch)
            }, ROLL_MS)
            return
        }
        const settle = (): void => {
            handBackFollow(watch)
        }
        roll.finished.then(settle, settle)
    }

    /**
     * 主线程被占住的那几帧不算进高度动画的时间
     *
     * WAAPI 按墙上时间算进度，卡完之后的第一帧会直接跳到本该到的地方，读者看到的是动画停住、再猛地一窜。
     * 这里每帧看一眼帧间隔，隔得太久就把当前时间拨回上一眼再往前一格，一格取最近一次正常的帧间隔。
     * 在隔离页面里量过，拨 currentTime 之后下一帧就从拨回去的位置接着走
     */
    const holdThroughStalls = (roll: Animation): void => {
        let lastFrameAt = 0
        let lastTime = 0
        let frameInterval = NOMINAL_FRAME_MS
        const readCurrentTime = (): number => {
            const rawTime = roll.currentTime
            return typeof rawTime === "number" ? rawTime : 0
        }
        const checkFrameGap = (now: number): void => {
            if (roll.playState !== "running") return
            const gap = lastFrameAt === 0 ? 0 : now - lastFrameAt
            if (gap > FRAME_GAP_LIMIT_MS) {
                const resumeAt = lastTime + frameInterval
                const skipped = readCurrentTime() - resumeAt
                if (skipped > 0) {
                    roll.currentTime = resumeAt
                    foldBusyUntil += skipped
                }
            } else if (gap > 0) {
                frameInterval = gap
            }
            lastFrameAt = now
            lastTime = readCurrentTime()
            requestAnimationFrame(checkFrameGap)
        }
        requestAnimationFrame(checkFrameGap)
    }

    /**
     * 等 React 把这次折叠落到 DOM 上，再撤掉动画与内联样式
     *
     * 收起方向的高度动画带着 fill: "forwards"，把真身锁在终点高度上。React 若还没收下这次点击，cancel()
     * 就会把高度整块还给 CSS，一次从终点弹回全高的跳变足够把 dsh 的跟随甩出去。等够几帧仍然没收拢，
     * 说明这次点击确实没有折叠，只好撤回原样
     */
    const confirmCollapsed = (settled: () => boolean, done: () => void, attempt = 0): void => {
        if (settled() || attempt >= SHUT_CONFIRM_FRAMES) {
            done()
            return
        }
        requestAnimationFrame(() => {
            confirmCollapsed(settled, done, attempt + 1)
        })
    }

    /**
     * 高度动画开工前的记账：关上裁剪、把 height 按 border-box 解释，再挂上「高度动画正在走」的标记，
     * 让子元素按自然高度排好、不被 flex 挤扁。展开与收起都要记账、也都要还回去，所以旧值与还原动作一起交回
     */
    const beginHeightClip = (target: HTMLElement): (() => void) => {
        const previousOverflow = target.style.overflow
        const previousBoxSizing = target.style.boxSizing
        target.style.overflow = "hidden"
        target.style.boxSizing = "border-box"
        target.setAttribute(ROLLING_ATTRIBUTE, "")
        return () => {
            target.style.overflow = previousOverflow
            target.style.boxSizing = previousBoxSizing
            target.removeAttribute(ROLLING_ATTRIBUTE)
        }
    }

    /**
     * 高度从起点逐帧长到全高，露出多少就占多少。只做高度这一道：曾经叠过一层按可见段走的裁剪，那是错的，
     * 裁剪只影响绘制、高度已经先长出来了，两道进度相同、行程不同，差值就是一片空白
     *
     * rect 量到的是 border-box 高度，而 CSS 的 height 默认按 content-box 解释，不换成 border-box 就会多跑出
     * 上下 padding 那一段，收尾 cancel 时再缩回去，看起来像内间距在动
     */
    const rollOpen = (target: HTMLElement, from: number): Animation | null => {
        markFoldBusy()
        const fullHeight = target.getBoundingClientRect().height
        if (fullHeight <= from) return null
        const travel = Math.max(from, visibleReachOf(target))
        const undoHeightClip = beginHeightClip(target)
        const growing = target.animate(
            travel >= fullHeight
                ? [{height: String(from) + "px"}, {height: String(fullHeight) + "px"}]
                : [
                    {height: String(from) + "px", offset: 0, easing: "ease-out"},
                    {height: String(travel) + "px", offset: VISIBLE_SHARE, easing: "linear"},
                    {height: String(fullHeight) + "px", offset: 1},
                ],
            {duration: ROLL_MS, easing: "ease-out"},
        )
        holdThroughStalls(growing)
        growing.onfinish = () => {
            growing.cancel()
            undoHeightClip()
        }
        return growing
    }

    /**
     * 把真身的高度压到终点
     *
     * 这次点击已经在捕获阶段被拦下，React 还没折叠，真身留在原位、还是展开态，于是可以像展开方向那样压
     * 它的高度：布局逐帧收缩，下方内容是真的被让开，不需要克隆、也不需要 FLIP。压到终点那一刻再放行点击
     */
    const rollShut = (fold: HeightShut): void => {
        markFoldBusy()
        const fullHeight = fold.target.getBoundingClientRect().height
        // 兜底：动画因为任何原因没收到 onfinish 时，别把点击一直锁着
        const releaseShutLock = window.setTimeout(() => {
            shutting = false
        }, ROLL_MS + 200)
        if (fullHeight <= fold.floor) {
            window.clearTimeout(releaseShutLock)
            replay(fold.control)
            settleAfterFold(fold.watch)
            return
        }
        const travel = Math.max(fold.floor, visibleReachOf(fold.target))
        const undoHeightClip = beginHeightClip(fold.target)
        const shrinking = fold.target.animate(
            travel >= fullHeight
                ? [{height: String(fullHeight) + "px"}, {height: String(fold.floor) + "px"}]
                : [
                    {height: String(fullHeight) + "px", offset: 0, easing: "linear"},
                    {height: String(travel) + "px", offset: 1 - VISIBLE_SHARE, easing: "ease-out"},
                    {height: String(fold.floor) + "px", offset: 1},
                ],
            {duration: ROLL_MS, easing: "ease-out", fill: "forwards"},
        )
        holdThroughStalls(shrinking)
        shrinking.onfinish = () => {
            window.clearTimeout(releaseShutLock)
            replay(fold.control)
            // DOM 那边该已经收拢了；没收拢就不能撤动画，见 confirmCollapsed
            confirmCollapsed(fold.collapsed, () => {
                shrinking.cancel()
                undoHeightClip()
            })
            settleAfterFold(fold.watch)
        }
    }

    // 把排到的那次展开意图落到动画上
    const applyPendingOpen = (): void => {
        const pendingIntent = intent
        intent = null
        if (pendingIntent === null) return
        const watch = pendingIntent.watch
        // 这一条路上没有动画，收尾就是把监听撤掉
        if (Date.now() - pendingIntent.takenAt > INTENT_TTL_MS || reduceMotion()) {
            watch.stop()
            return
        }
        // 过程组：压组根，不压组体，组体自己带滚动条，dsh 的跟随正盯着它
        if (pendingIntent.groupRoot !== null && pendingIntent.groupBody !== null) {
            if (pendingIntent.groupBody.hasAttribute("hidden")) {
                watch.stop()
                return
            }
            settleAfterFold(watch, rollOpen(pendingIntent.groupRoot, pendingIntent.collapsedHeight))
            return
        }
        const body = expandedBodyOf(pendingIntent.control)
        if (body === null) {
            watch.stop()
            return
        }
        // DisclosureRow：展开体是普通块级，压多少露出多少
        settleAfterFold(watch, rollOpen(body, 0))
    }

    const onClick = (event: Event): void => {
        // 自己重放的那一次直接放行，交给 React
        if (replaying) return
        const target = event.target
        if (!(target instanceof Element)) return
        // 本插件自己的自动开合派发的也是真正的 click，走的正是这条捕获路径。思考行要和读者的点击一样起动画：
        // 它自己展开、自己收起时若走瞬时切换，读者看到的是内容啪地出现和消失，而工具行那种只由读者点击的行一直是有动画的
        // 过程组不在此列：它一次扫描可能切换好几个组，而收起动画是全局互斥的，同时来的第二次点击会被吞掉
        if (isProgrammaticToggle() && target.closest(THINK_ROW_SELECTOR) === null) return
        // 只接管聊天区。整页都在用 aria-expanded：模型选择器、设置页的下拉框、侧栏的行、任务面板，
        // 接管它们只会把菜单压扁、把一次点击推迟两百毫秒
        if (target.closest<HTMLElement>(CHAT_FLOW_SELECTOR) === null) return
        // 弹出层开的不是折叠体，菜单与对话框不该带动聊天流
        if (target.closest<HTMLElement>(POPUP_SELECTOR) !== null) return
        // 收起动画正在跑：这两百毫秒里不接受新的点击
        if (shutting) {
            event.stopPropagation()
            event.preventDefault()
            return
        }
        // 上一轮展开方向的等待作废，它挂着的意图监听要跟着撤掉
        intent?.watch.stop()
        intent = null
        // 开合控件：DisclosureRow 的行，或别的带 aria-expanded 的按钮（过程组头等）
        const control = target.closest<HTMLElement>(DISCLOSURE_ROW_SELECTOR)
            ?? target.closest<HTMLElement>(TOGGLE_SELECTOR)
        if (control === null) return
        // dsh 的折叠动效正在驱动这一行，这一下归官方
        if (control.closest(MOTION_ROW_SELECTOR) !== null) return
        // 轮次头与轮次触发通知整块跳过：它们开合的是整轮内容，交给 dsh 自己瞬时开合
        if (control.closest<HTMLElement>(SKIPPED_CONTROL_SELECTOR) !== null) return
        // 组头控制组体，成员行不控制，见 processBodyOf
        const groupBody = processBodyOf(control)
        const groupRoot = groupBody?.parentElement?.closest<HTMLElement>(PROCESS_GROUP_SELECTOR) ?? null
        const body = groupBody ?? expandedBodyOf(control)
        // 展开方向：等 React 把展开体插进来，再在观察回调里做动画。起点高度要在这一边量，此刻组根正是收起态
        if (body === null || body.hasAttribute("hidden")) {
            intent = {
                control,
                groupBody,
                groupRoot,
                collapsedHeight: groupRoot?.getBoundingClientRect().height ?? 0,
                watch: watchFold(controlAtBottom(control)),
                takenAt: Date.now(),
            }
            return
        }
        if (reduceMotion()) return
        // 收起方向：把这次点击拦下来，把真身的高度压到终点，压到了再放行
        event.stopPropagation()
        event.preventDefault()
        shutting = true
        const watch = watchFold(controlAtBottom(control))
        const collapsed = groupBody !== null
            ? (): boolean => groupBody.hasAttribute("hidden")
            : (): boolean => !body.isConnected
        rollShut({
            target: groupRoot ?? body,
            // 组根停在组头那一段：组体收起来之后，组根本来的高度就是这么多
            floor: groupRoot === null
                ? 0
                : Math.max(0, groupRoot.getBoundingClientRect().height - body.getBoundingClientRect().height),
            collapsed,
            control,
            watch,
        })
    }

    const observer = new MutationObserver(applyPendingOpen)
    document.addEventListener("click", onClick, true)
    // hidden 也要观察：过程组的开合是 setAttribute("hidden", "until-found")，只有属性变化，
    // 不带 attributeFilter 就收不到。别处的 hidden 切换多在 intent 为 null 时到达，直接返回，成本可以忽略
    observer.observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"]})

    return () => {
        document.removeEventListener("click", onClick, true)
        observer.disconnect()
        intent?.watch.stop()
    }
}
