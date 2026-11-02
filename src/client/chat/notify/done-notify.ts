/**
 * 任务结束时弹一条系统通知。
 *
 * 与 ask-notify 是两条独立通道。那一条读输入区座位上的三条语义属性——「有面板挂上来了」在 DOM 上
 * 有一个落点；「这一轮跑完了」没有，它只有会话的 running 落回 false。所以这一条不装观察器、不轮询，
 * 全部走 dsh 客户端本来就有的推送：
 *
 *   remote.$on('api-session/status')   agent 状态机，宿主 session-controller 直接转出来
 *   remote.$on('api-session/error')    agent 报错，同样由宿主转出来
 *   sessions.list                      会话标题，以及落回 false 时的二次确认
 *   sessions.binding(id).eventSource   这一轮怎么结束的：完成 / 出错 / 中断
 *   sessions.list.projectionsBySession 这一轮说了什么：turnOutline 的 response 预览
 *
 * 一条通知的来源可能不在当前窗口里：后台会话没有 window 里的事件，读不到 turn/end 的 reason，
 * 那时靠 api-session/error 这条并行的推送认出「出过错」，再认不出就按完成处理；
 * 没有 turnOutline 投影的会话，正文就退回成只有会话名与耗时。
 *
 * 几条同时到齐时排队，相邻两条之间至少隔 QUEUE_GAP_MS。
 */

// 三档：关掉、只在窗口没聚焦时弹、任何时候都弹
export type DoneNotifyMode = "off" | "unfocused" | "always"

// 相邻两条通知之间至少隔这么久。几条同时到齐时按这一档排队，不一起糊在屏幕上
const QUEUE_GAP_MS = 3000

// running 落回 false 之后再等这么久才确认。同一批状态里它可能已经被下一轮重新叫起来
const SETTLE_MS = 600

// 正文片段的截断长度。Windows 的通知卡片两行就折了
const BODY_LIMIT = 120

// 「这一块在跑」的回执，挂在根元素上。与那两片样式表同一个用途：出问题时先看它在不在
const ROOT_ATTRIBUTE = "data-dsh-chat-ux-done-notify"

// 手动补扫的口子，给排查用：document.dispatchEvent(new Event("dsh-chat-ux:done-notify-now"))
const RESCAN_EVENT = "dsh-chat-ux:done-notify-now"

// 这一轮是怎么结束的
type TurnOutcome = "completed" | "failed" | "interrupted"

interface DoneCopy {
    completed: string
    failed: string
    interrupted: string
    // 耗时那一截的模板，参数是已经算好的时长
    elapsed: (duration: string) => string
}

const ZH_COPY: DoneCopy = {
    completed: "DSH 完成了这一轮",
    failed: "DSH 这一轮出错了",
    interrupted: "DSH 这一轮被中断了",
    elapsed: (duration) => "耗时 " + duration,
}

const EN_COPY: DoneCopy = {
    completed: "DSH finished",
    failed: "DSH hit an error",
    interrupted: "DSH was interrupted",
    elapsed: (duration) => "took " + duration,
}

export interface DoneNotifyHandle {
    dispose: () => void
}

// 这一页的文案跟着浏览器语言走。dsh 的语言服务刻意没有注入：通知只有四行标题，
// 为它拉一份必须依赖会让没有那个服务的部署整块不加载
function doneCopy(): DoneCopy {
    const language = typeof navigator === "undefined" ? "" : navigator.language
    return language.toLowerCase().split("-")[0] === "en" ? EN_COPY : ZH_COPY
}

// 一分钟以内只报秒，一小时以内报分秒，再长报时分
function formatElapsed(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000))
    if (total < 60) return total + "s"
    const minutes = Math.floor(total / 60)
    if (minutes < 60) return minutes + "m " + (total % 60) + "s"
    return Math.floor(minutes / 60) + "h " + (minutes % 60) + "m"
}

/**
 * 装上完成通知。
 *
 * @param ctx - 客户端根 context，用来现读 remote 与 sessions 两个服务
 * @param readMode - 现读的档位。每一条要弹之前读一次，插件管理页上改完不必重新安装
 * @returns 卸下这一块，把还在排队的与已经弹出来的一起收掉
 */
export function installDoneNotify(ctx: NotifyContext, readMode: () => DoneNotifyMode): DoneNotifyHandle {
    // 这个环境没有通知能力（普通浏览器里被策略关掉），什么都不装
    if (typeof Notification === "undefined") return {dispose: () => undefined}
    // 调用方用 ctx.inject 等这两个服务就绪，所以这里一定读得到。真读不到时留一条 warn：
    // 这一块在 2026-11-02 静默失效过一次——装载那一刻服务还没提供，函数提前返回空句柄，
    // 之后没有任何时机再试，页面上就是「什么都不发生」而控制台一个字都没有
    const remote = ctx.reflect.get("remote") as RemoteLike | undefined
    const sessions = ctx.reflect.get("sessions") as SessionsLike | undefined
    if (remote === undefined || remote === null || sessions === undefined || sessions === null) {
        console.warn("dsh-chat-ux: done notify needs the remote and sessions services")
        return {dispose: () => undefined}
    }
    // 可选：这一轮结束时有没有面板正等着读者。拿不到就不做这条互斥
    const sessionStatus = (ctx.reflect.get("uiSession") as UiSessionLike | null | undefined)?.sessionStatus ?? null
    const copy = doneCopy()

    // 这一轮是什么时候开始的。装上那一刻已经在跑的那一轮按装上的时刻起算，比真实值短
    const runningSince = new Map<string, number>()
    // 这一轮里报过错。下一轮起来时清掉，于是错只算在出错的那一轮上
    const errored = new Set<string>()
    // 每个会话各自等一次确认。同一批 status 里可能有好几个会话一起落回 false
    const settleTimers = new Map<string, number>()
    // 还开着的通知，卸下时一起关掉
    const open = new Set<Notification>()
    // 等着弹的。几条同时到齐时按 QUEUE_GAP_MS 一条一条放
    const queue: Array<{ sessionId: string, title: string, body: string }> = []
    let lastShownAt = 0
    let pumpTimer = 0
    let disposed = false

    // 窗口此刻在不在读者眼前。最小化、切到别的应用、页面被隐藏都算不在
    const windowInSight = (): boolean =>
        document.hasFocus() && document.visibilityState === "visible"

    const sessionTitleOf = (sessionId: string): string =>
        sessions.list.getSnapshot().byId[sessionId]?.displayTitle ?? sessionId

    // 这一轮是怎么结束的。窗口里最后一条 turn/end 说了算；读不到就看这一轮报没报过错
    const outcomeOf = (sessionId: string): TurnOutcome => {
        const entries = sessions.binding(sessionId)?.eventSource.getSnapshot().entries ?? []
        for (let index = entries.length - 1; index >= 0; index -= 1) {
            const entry = entries[index]
            if (entry?.type !== "event") continue
            const event = entry.event
            if (event?.type !== "turn/end") continue
            const kind = event.data?.reason?.kind
            if (kind === "error") return "failed"
            if (kind === "aborted" || kind === "interrupted") return "interrupted"
            return "completed"
        }
        return errored.has(sessionId) ? "failed" : "completed"
    }

    // 这一轮它说了什么。turnOutline 只对连上来的会话持有，读不到就空着
    const snippetOf = (sessionId: string): string => {
        const outline = sessions.list.getSnapshot().projectionsBySession[sessionId]?.values.turnOutline
        if (!Array.isArray(outline) || outline.length === 0) return ""
        const last = outline[outline.length - 1] as TurnOutlineEntryLike | undefined
        const text = (last?.response ?? "").trim()
        if (text === "") return ""
        return text.length > BODY_LIMIT ? text.slice(0, BODY_LIMIT) + "…" : text
    }

    // 这一轮结束时还有面板在等读者：ask-notify 已经弹过那一条，这一条不再弹
    const waitingForReader = (sessionId: string): boolean =>
        sessionStatus?.getSnapshot().get(sessionId)?.pendingInteraction !== undefined

    // 把一条放进队列，并叫一次泵
    const enqueue = (sessionId: string, since: number | undefined): void => {
        if (disposed) return
        const mode = readMode()
        if (mode === "off") return
        if (mode === "unfocused" && windowInSight()) return
        if (waitingForReader(sessionId)) return
        console.debug("dsh-chat-ux: done notify enqueue", sessionId, mode)
        const outcome = outcomeOf(sessionId)
        const title = outcome === "failed"
            ? copy.failed
            : outcome === "interrupted" ? copy.interrupted : copy.completed
        const lines = [sessionTitleOf(sessionId)]
        if (since !== undefined) lines.push(copy.elapsed(formatElapsed(Date.now() - since)))
        const snippet = snippetOf(sessionId)
        if (snippet !== "") lines.push(snippet)
        queue.push({sessionId, title, body: lines.join("\n")})
        pump()
    }

    // 弹出队首那一条。失败只丢这一条，不要影响读者继续用页面
    const show = (notice: { sessionId: string, title: string, body: string }): void => {
        try {
            const notification = new Notification(notice.title, {
                body: notice.body,
                tag: "done:" + notice.sessionId,
                silent: false,
            })
            notification.onclick = () => {
                window.focus()
            }
            notification.onclose = () => {
                open.delete(notification)
            }
            open.add(notification)
        } catch (error) {
            console.warn("dsh-chat-ux: done notification failed", error)
        }
    }

    // 队列泵：第一条立即弹，之后每 QUEUE_GAP_MS 弹一条
    const pump = (): void => {
        if (disposed || queue.length === 0) return
        const wait = Math.max(0, lastShownAt + QUEUE_GAP_MS - Date.now())
        if (wait > 0) {
            if (pumpTimer !== 0) return
            pumpTimer = window.setTimeout(() => {
                pumpTimer = 0
                pump()
            }, wait)
            return
        }
        const next = queue.shift()
        if (next === undefined) return
        lastShownAt = Date.now()
        show(next)
        pump()
    }

    // running 落回 false：等 SETTLE_MS 再确认一次，期间又被叫起来就不算结束
    const settle = (sessionId: string): void => {
        const pending = settleTimers.get(sessionId)
        if (pending !== undefined) window.clearTimeout(pending)
        const timer = window.setTimeout(() => {
            settleTimers.delete(sessionId)
            if (disposed) return
            console.debug("dsh-chat-ux: done notify settle", sessionId,
                sessions.list.getSnapshot().byId[sessionId]?.running)
            if (sessions.list.getSnapshot().byId[sessionId]?.running === true) return
            const since = runningSince.get(sessionId)
            runningSince.delete(sessionId)
            enqueue(sessionId, since)
            errored.delete(sessionId)
        }, SETTLE_MS)
        settleTimers.set(sessionId, timer)
    }

    const onSessionStatus = (sessionId: string, running: boolean): void => {
        if (disposed) return
        // 收到事件的第一手证据。排查「弹窗不来」时看这条有没有出现，就能把「订阅没接上」
        // 与「判定把它们全滤掉了」分开
        console.debug("dsh-chat-ux: done notify status", sessionId, running)
        if (running) {
            // 上一轮刚落回 false、还没到确认点就又起来了：撤掉那次确认，重记起点，
            // 否则第二轮会接着第一轮的起点算耗时
            const pending = settleTimers.get(sessionId)
            if (pending !== undefined) {
                window.clearTimeout(pending)
                settleTimers.delete(sessionId)
            }
            runningSince.set(sessionId, Date.now())
            errored.delete(sessionId)
            return
        }
        settle(sessionId)
    }

    // 只有正在跑的那一轮才记账：这条事件也会在后台激活失败时报一次，那时它不属于任何一轮
    const onSessionError = (sessionId: string): void => {
        if (disposed) return
        if (!runningSince.has(sessionId)) return
        errored.add(sessionId)
    }

    // 排查用：把还在等着确认的那几条立即确认掉，并放行队列
    const onRescan = (): void => {
        // 排查时最要紧的一条：先确认订阅真的收到了事件。走到这里而桶里什么都没有，
        // 说明 status 事件压根没到这一侧（连接、权限、或者 $on 没接上）
        console.info("dsh-chat-ux: done notify rescan", {
            running: [...runningSince.keys()],
            settling: [...settleTimers.keys()],
            errored: [...errored],
            queued: queue.length,
        })
        for (const [sessionId, timer] of settleTimers) {
            window.clearTimeout(timer)
            settleTimers.delete(sessionId)
            const since = runningSince.get(sessionId)
            runningSince.delete(sessionId)
            enqueue(sessionId, since)
            errored.delete(sessionId)
        }
        pump()
    }

    // 装上那一刻就在跑的会话没有真实起点：按现在算，那一轮的耗时比真实值短。
    // 这一条只影响装上后的第一轮，之后每一条 status 都会自己记起点
    const baseline = Date.now()
    for (const [sessionId, summary] of Object.entries(sessions.list.getSnapshot().byId)) {
        if (summary?.running === true) runningSince.set(sessionId, baseline)
    }

    // 先订阅、后挂标记。反过来走的话，$on 抛错（例如这个连接不是 interactions=answer）时
    // 标记已经挂上了，页面上看是「装着」，实际一条事件都收不到——2026-11-02 排查时正是这个形状：
    // 标记 true、弹窗不来。顺序换过来之后，失败就在加载器那里报出来，不会静默
    const unsubscribeStatus = remote.$on("api-session/status", onSessionStatus)
    const unsubscribeError = remote.$on("api-session/error", onSessionError)
    document.addEventListener(RESCAN_EVENT, onRescan)
    document.documentElement.setAttribute(ROOT_ATTRIBUTE, "")

    return {
        dispose: () => {
            if (disposed) return
            disposed = true
            unsubscribeStatus()
            unsubscribeError()
            document.removeEventListener(RESCAN_EVENT, onRescan)
            if (pumpTimer !== 0) window.clearTimeout(pumpTimer)
            pumpTimer = 0
            for (const timer of settleTimers.values()) window.clearTimeout(timer)
            settleTimers.clear()
            queue.length = 0
            for (const notification of open) notification.close()
            open.clear()
            document.documentElement.removeAttribute(ROOT_ATTRIBUTE)
        },
    }
}

// ---------------------------------------------------------------------------
// dsh 客户端那几个服务被用到的形状。本模块只读，收窄到实际读到的成员：
// 平台包的完整类型不进这个 bundle（client 产物必须是单个自包含文件）
// ---------------------------------------------------------------------------

// 只要求能按名字现读服务。入口把 ctx.inject 交回来的那层子 context 直接传进来，
// 于是读到的 remote 与 sessions 一定是已经就绪的那两个
export interface NotifyContext {
    readonly reflect: { get(name: string): unknown }
}

interface RemoteLike {
    $on(event: "api-session/status", listener: (sessionId: string, running: boolean) => void): () => void

    $on(event: "api-session/error", listener: (sessionId: string) => void): () => void
}

interface SessionSummaryLike {
    readonly displayTitle?: string | undefined
    readonly running: boolean
}

interface ProjectionSnapshotLike {
    readonly values: Readonly<Record<string, unknown>>
}

interface SessionListSnapshotLike {
    readonly byId: Readonly<Record<string, SessionSummaryLike | undefined>>
    readonly projectionsBySession: Readonly<Record<string, ProjectionSnapshotLike | undefined>>
}

interface SessionsLike {
    readonly list: { getSnapshot(): SessionListSnapshotLike }

    binding(id: string): BindingLike | undefined
}

interface TurnOutlineEntryLike {
    readonly response: string
}

interface TurnEndDataLike {
    readonly reason?: { readonly kind?: string | undefined } | undefined
}

interface SessionEventLike {
    readonly type: string
    readonly data?: TurnEndDataLike | undefined
}

interface EventEntryLike {
    readonly type: string
    readonly event?: SessionEventLike | undefined
}

interface BindingLike {
    readonly eventSource: { getSnapshot(): { readonly entries: readonly EventEntryLike[] } }
}

interface SessionStatusLike {
    readonly pendingInteraction?: unknown
}

interface UiSessionLike {
    readonly sessionStatus: { getSnapshot(): ReadonlyMap<string, SessionStatusLike | undefined> }
}
