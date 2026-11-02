/**
 * 等读者动手时弹一条系统通知。
 *
 * dsh 把「等读者动手」的请求交给输入区座位接管，三种形态各带一条语义属性：
 *
 *   [data-question-key]         提问；计划审阅在它里面再套一层 [data-plan-review-key]
 *   [data-approval-key]         工具审批
 *
 * 只认这些属性，不认 class 名：class 带构建期 hash。
 *
 * 观察器只盯输入区座位，不盯整棵文档。聊天流每吐一个字都在变，而座位里只有输入框与这几张面板；
 * 回调本身只置一个标记，真正的扫描合到下一帧做一次，那一帧里也只有两次座位内的 querySelector。
 * 失焦与聚焦各自补一次扫描——「仅在未聚焦时」这一档要的正是那一刻。
 */
import {noticeTag} from "./notice-tag"

// 三档：关掉、只在窗口没聚焦时弹、任何时候都弹。默认那一档在 settings-scope 里
export type AskNotifyMode = "off" | "unfocused" | "always"

// 输入区座位。dsh 把提问、计划审阅与审批的面板都渲染在它里面
const SEAT_SELECTOR = "[data-composer-seat]"

// 座位在会话内容里，切会话时整块可能重挂。盯它的父容器（只看直接子元素）就能重新定位，
// 而不必去看聊天流那一整棵树
const SCROLL_SELECTOR = "[data-conversation-scroll]"

// 三种请求各自的语义属性名
const QUESTION_ATTRIBUTE = "data-question-key"
const PLAN_REVIEW_ATTRIBUTE = "data-plan-review-key"
const APPROVAL_ATTRIBUTE = "data-approval-key"

// 正文截断：Windows 的通知卡片两行就折了，写更多也读不完
const BODY_LIMIT = 140

// 座位一开始还没渲染出来时用的探针上限，与纸那边同一个理由：静置之后没有别的时机再来问一次
const SEAT_PROBE_LIMIT = 180

// 「这一块在跑」的回执，挂在根元素上。与那两片样式表同一个用途：出问题时先看它在不在
const ROOT_ATTRIBUTE = "data-dsh-chat-ux-ask-notify"

// 手动重扫的口子，给排查用：document.dispatchEvent(new Event("dsh-chat-ux:notify-now"))
const RESCAN_EVENT = "dsh-chat-ux:notify-now"

interface PendingRequest {
    // dsh 给这张请求的 id，用来去重
    key: string
    title: string
    body: string
}

interface NoticeCopy {
    question: string
    plan: string
    approval: string
}

const ZH_COPY: NoticeCopy = {
    question: "DSH 正在等待你回答",
    plan: "DSH 正在等待你确认计划",
    approval: "DSH 正在等待你确认",
}

const EN_COPY: NoticeCopy = {
    question: "DSH is waiting for your answer",
    plan: "DSH is waiting for you to approve the plan",
    approval: "DSH is waiting for your approval",
}

export interface AskNotifyHandle {
    dispose: () => void
}

// 这一页的文案跟着浏览器语言走。dsh 的语言服务不在这里注入：通知只有三行标题，
// 为它拉一份必须依赖会让没有那个服务的部署整块不加载
function noticeCopy(): NoticeCopy {
    const language = typeof navigator === "undefined" ? "" : navigator.language
    return language.toLowerCase().split("-")[0] === "en" ? EN_COPY : ZH_COPY
}

// 把一段文案压成一行并截断。面板里拿到的 textContent 带着换行与缩进
function plainTextOf(element: Element | null, limit: number): string {
    if (element === null) return ""
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim()
    return text.length > limit ? text.slice(0, limit) + "…" : text
}

/**
 * 装上通知。
 *
 * @param readMode - 现读的档位。每次要弹之前读一次，所以插件管理页上改完不必重新安装
 * @returns 卸下这一块，把还开着的通知一起关掉
 */
export function installAskNotify(readMode: () => AskNotifyMode): AskNotifyHandle {
    // 这个环境没有通知能力（普通浏览器里被策略关掉），什么都不装
    if (typeof Notification === "undefined") return {dispose: () => undefined}
    const copy = noticeCopy()
    document.documentElement.setAttribute(ROOT_ATTRIBUTE, "")
    // 通知过的请求。同一个请求只弹一次：面板被收起又展开不该再弹一遍
    const notified = new Set<string>()
    // 还开着的通知，按请求 id。请求消失（读者答了）就关掉它
    const open = new Map<string, Notification>()

    let seat: HTMLElement | null = null
    let observer: MutationObserver | null = null
    let host: HTMLElement | null = null
    let hostObserver: MutationObserver | null = null
    let probeHandle = 0
    let probeFrames = 0
    let scheduled = false
    let disposed = false

    // 窗口此刻在不在读者眼前。最小化、切到别的应用、页面被隐藏都算不在
    const windowInSight = (): boolean =>
        document.hasFocus() && document.visibilityState === "visible"

    // 此刻座位里有哪些还在等读者的请求。只看座位内部，不扫整棵文档
    const pendingRequests = (): PendingRequest[] => {
        const root = seat
        if (root === null) return []
        const found: PendingRequest[] = []
        const question = root.querySelector<HTMLElement>("[" + QUESTION_ATTRIBUTE + "]")
        const plan = question === null ? null : question.querySelector("[" + PLAN_REVIEW_ATTRIBUTE + "]")
        if (question !== null) {
            const key = question.getAttribute(QUESTION_ATTRIBUTE) ?? ""
            // 计划审阅借用同一张请求：里面套了那一层就说明这次要读者点的是计划，不是答题
            if (key !== "") {
                found.push(plan === null
                    ? {key, title: copy.question, body: plainTextOf(question, BODY_LIMIT)}
                    : {key, title: copy.plan, body: plainTextOf(plan.querySelector("h3") ?? plan, BODY_LIMIT)})
            }
        }
        const approval = root.querySelector<HTMLElement>("[" + APPROVAL_ATTRIBUTE + "]")
        if (approval !== null) {
            const key = approval.getAttribute(APPROVAL_ATTRIBUTE) ?? ""
            if (key !== "") found.push({key, title: copy.approval, body: plainTextOf(approval, BODY_LIMIT)})
        }
        return found
    }

    const closeNotice = (key: string): void => {
        const notice = open.get(key)
        if (notice === undefined) return
        open.delete(key)
        notice.close()
    }

    // 一次扫描：没通知过的补一条，已经不在座位里的关掉。所有的判断都发生在这里，
    // 也就是一帧里的一次调用，不在每次 DOM 变更上
    const flush = (): void => {
        scheduled = false
        if (disposed) return
        // 座位被整块换下来（切会话、轨迹页切换）：重新定位并换观察器
        if (seat !== null && !seat.isConnected) {
            seat = null
            watchSeat()
        }
        const mode = readMode()
        if (mode === "off") {
            for (const key of [...open.keys()]) closeNotice(key)
            return
        }
        const requests = pendingRequests()
        const live = new Set(requests.map(request => request.key))
        for (const key of [...open.keys()]) {
            if (!live.has(key)) closeNotice(key)
        }
        if (mode === "unfocused" && windowInSight()) return
        for (const request of requests) {
            if (notified.has(request.key)) continue
            notified.add(request.key)
            try {
                // tag 走短哈希，不用 request.key：它带着 sessionId 与 callId，长度可能顶破系统那一侧
                // 通知标识的 64 字符上限，那条通知就会被静默丢弃。见 notice-tag
                const notice = new Notification(request.title, {
                    body: request.body,
                    tag: noticeTag("ask", request.key),
                    silent: false,
                })
                notice.onclick = () => {
                    window.focus()
                }
                open.set(request.key, notice)
            } catch (error) {
                // 系统通知被策略挡掉时只丢这一条，不要影响读者继续用页面
                notified.delete(request.key)
                console.warn("dsh-chat-ux: ask notification failed", error)
            }
        }
    }

    const schedule = (): void => {
        if (scheduled || disposed) return
        scheduled = true
        // 页面被隐藏（窗口最小化）时 rAF 不再跑，而那一刻正是「未聚焦时」要弹的时候。
        // 隐藏期间改用微任务，它不受渲染帧暂停的影响
        if (document.hidden) {
            queueMicrotask(flush)
            return
        }
        requestAnimationFrame(flush)
    }

    // 座位在这几次请求之外还会重挂（切会话、轨迹页来回切），所以定位与观察绑定在一起；
    // 已经挂在同一个座位上是空操作。父容器也一并盯住：它一变就再走一次这里
    const watchSeat = (): void => {
        const nextHost = document.querySelector<HTMLElement>(SCROLL_SELECTOR)
        if (nextHost !== host || hostObserver === null) {
            hostObserver?.disconnect()
            host = nextHost
            if (nextHost !== null) {
                hostObserver = new MutationObserver(() => watchSeat())
                hostObserver.observe(nextHost, {childList: true})
            }
        }
        const next = document.querySelector<HTMLElement>(SEAT_SELECTOR)
        if (next === null) {
            probe()
            return
        }
        if (next === seat && observer !== null) return
        observer?.disconnect()
        stopProbe()
        seat = next
        observer = new MutationObserver(schedule)
        observer.observe(next, {childList: true, subtree: true})
        schedule()
    }

    const stopProbe = (): void => {
        if (probeHandle !== 0) cancelAnimationFrame(probeHandle)
        probeHandle = 0
        probeFrames = 0
    }

    // 等座位渲染出来。每帧一次 querySelector，找到就退场，跑满上限也退场
    const probe = (): void => {
        if (probeHandle !== 0) return
        if (probeFrames > SEAT_PROBE_LIMIT) return
        probeHandle = requestAnimationFrame(() => {
            probeHandle = 0
            if (disposed) return
            probeFrames += 1
            watchSeat()
        })
    }

    // 窗口进出前台各补一次：提问出现时读者正在看，切走那一刻才该弹。
    // 顺带重新定位一次座位——探针跑满上限之后没有别的时机再来问
    const onWindowAttention = (): void => {
        watchSeat()
        schedule()
    }

    const onRescan = (): void => flush()
    window.addEventListener("focus", onWindowAttention)
    window.addEventListener("blur", onWindowAttention)
    document.addEventListener("visibilitychange", onWindowAttention)
    document.addEventListener(RESCAN_EVENT, onRescan)

    watchSeat()

    return {
        dispose: () => {
            if (disposed) return
            disposed = true
            observer?.disconnect()
            observer = null
            hostObserver?.disconnect()
            hostObserver = null
            seat = null
            host = null
            stopProbe()
            window.removeEventListener("focus", onWindowAttention)
            window.removeEventListener("blur", onWindowAttention)
            document.removeEventListener("visibilitychange", onWindowAttention)
            document.removeEventListener(RESCAN_EVENT, onRescan)
            for (const key of [...open.keys()]) closeNotice(key)
            document.documentElement.removeAttribute(ROOT_ATTRIBUTE)
        },
    }
}
