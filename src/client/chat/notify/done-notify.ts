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
import {noticeTag} from "./notice-tag"

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

// 手动弹一条的口子，参数与走完整条链路时完全一样：
//   dispatchEvent(new CustomEvent("dsh-chat-ux:done-notify-test", {detail: {title: "标题", body: "正文"}}))
// 它绕开「什么时候触发」与「判定滤没滤」，只验这一条调用本身画不画得出来
const PROBE_EVENT = "dsh-chat-ux:done-notify-test"

// 探针能单独覆盖的三项。不给就重放最近一条真实通知那一份；给了 sessionId 也就换了 tag
type ProbeDetail = { sessionId?: string, title?: string, body?: string }

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
    // 上一次见到的 running，用来从 sessions.list 的通知里认出「刚刚落回 false」
    const lastRunning = new Map<string, boolean>()
    // 排查用的一本账。挂在 window 上而不是只打控制台：console.debug 在 DevTools 里默认被滤掉，
    // 「什么都没看到」与「一次都没发生」长得一模一样。2026-11-02 就卡在这一步
    // installed / closed 两栏是给「弹出来了又被收走」这一类问题用的：
    // ctx.inject 在依赖服务变化时会卸下重装，而 dispose 会 close 掉所有还开着的通知。
    // 若那一瞬间正好弹了一条，页面上就是 shown 加一、屏幕什么都不出现
    // drawn / errors 两栏来自通知自己的 onshow 与 onerror。shown 只说明 new Notification 没抛错，
    // 系统那一侧画没画只有这两个事件知道——2026-11-02 的「shown 在涨、屏幕不画」就卡在这一层
    // lastTitle / lastBody / lastSessionId / lastTag 留着最近一条真实通知的原料，可以在控制台原样重放它
    // lastTag 也要留着：Windows 那条 tag 的上限是 64 个字符，而它由 origin 与 tag 拼出来，
    // 一条画不出来、把 tag 换成短的又能画的形状，就长在这里
    const tally = {
        listEvents: 0, statusEvents: 0, settles: 0, enqueued: 0, shown: 0, failures: 0,
        installed: 0, closed: 0, drawn: 0, errors: 0,
        lastTitle: "", lastBody: "", lastSessionId: "", lastTag: "", last: "",
    }
    tally.installed += 1
    const publishTally = (): void => {
        // 挂在 window 上方便控制台直接取；tsconfig 的 lib 里没有这个自定义字段，所以走断言。
        // 全局那份跨实例累积，所以 installed 涨到 2 就说明这一块被卸下重装过
        ;(window as unknown as Record<string, unknown>).__dshDoneNotify = tally
        document.documentElement.setAttribute(ROOT_ATTRIBUTE + "-tally",
            "list=" + tally.listEvents + " status=" + tally.statusEvents + " settle=" + tally.settles
            + " queue=" + tally.enqueued + " shown=" + tally.shown + " fail=" + tally.failures
            + " closed=" + tally.closed + " inst=" + tally.installed
            + " drawn=" + tally.drawn + " err=" + tally.errors
            + " taglen=" + tally.lastTag.length)
    }

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
        tally.enqueued += 1
        tally.last = "enqueue " + sessionId
        publishTally()
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
        // 最近一条真实通知的原料。控制台里可以原样重放它，用来分辨「内容画不出来」
        // 与「这一次画不出来」——probe 不带 detail 时用的就是这三项
        tally.lastSessionId = notice.sessionId
        tally.lastTitle = notice.title
        tally.lastBody = notice.body
        try {
            const tag = noticeTag("done", notice.sessionId)
            tally.lastTag = tag
            const notification = new Notification(notice.title, {
                body: notice.body,
                tag,
                silent: false,
            })
            notification.onclick = () => {
                window.focus()
            }
            notification.onclose = () => {
                open.delete(notification)
            }
            // 系统那一侧到底画没画。new Notification 不抛错只说明请求递出去了，画没画是另一回事。
            // 注意这两个事件不一定成对出现：tag 越界那一类拒绝会让宿主在生成阶段直接销毁通知，
            // 连 error 都不会派发——2026-11-02 就是靠 drawn 一直是 0 才把方向转到 tag 上的
            notification.onshow = () => {
                tally.drawn += 1
                tally.last = "drawn " + notice.sessionId
                publishTally()
            }
            notification.onerror = () => {
                tally.errors += 1
                tally.last = "error " + notice.sessionId
                publishTally()
            }
            open.add(notification)
            tally.shown += 1
            // 弹出去那一刻窗口在不在前台。Windows 对「前台窗口所在的应用」会抑制 toast 横幅，
            // 只把它收进通知中心；记下这一项，才知道「没看到」是系统没画，还是我们没弹
            tally.last = "shown " + notice.sessionId
                + " focused=" + (document.hasFocus() ? "1" : "0")
                + " visible=" + document.visibilityState
            publishTally()
        } catch (error) {
            tally.failures += 1
            tally.last = "failed: " + (error instanceof Error ? error.message : String(error))
            publishTally()
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
            tally.settles += 1
            tally.last = "settle " + sessionId
            publishTally()
            if (sessions.list.getSnapshot().byId[sessionId]?.running === true) return
            const since = runningSince.get(sessionId)
            runningSince.delete(sessionId)
            enqueue(sessionId, since)
            errored.delete(sessionId)
        }, SETTLE_MS)
        settleTimers.set(sessionId, timer)
    }

    // 次触发源：remote.$on 的 status 事件。它比 list 快（不经过合批），负责补齐起点与出错标记；
    // 收不到也不影响主路——两条一起喂同一套桶，重复的翻转由 lastRunning 去重
    const onSessionStatus = (sessionId: string, running: boolean): void => {
        if (disposed) return
        tally.statusEvents += 1
        if (running) {
            // 上一轮刚落回 false、还没到确认点就又起来了：撤掉那次确认，重记起点，
            // 否则第二轮会接着第一轮的起点算耗时
            const pending = settleTimers.get(sessionId)
            if (pending !== undefined) {
                window.clearTimeout(pending)
                settleTimers.delete(sessionId)
            }
            runningSince.set(sessionId, Date.now())
            lastRunning.set(sessionId, true)
            errored.delete(sessionId)
            publishTally()
            return
        }
        lastRunning.set(sessionId, false)
        settle(sessionId)
        publishTally()
    }

    // 只有正在跑的那一轮才记账：这条事件也会在后台激活失败时报一次，那时它不属于任何一轮
    const onSessionError = (sessionId: string): void => {
        if (disposed) return
        if (!runningSince.has(sessionId)) return
        errored.add(sessionId)
    }

    // 只验「这条调用画不画得出来」：走与真实通知完全相同的 show()。不带 detail 时重放
    // 最近一条真实通知的原文与 sessionId（tag 也跟着一样），于是它与真实那一条只差触发时机；
    // 带 detail 时用它给的标题正文，sessionId 固定成 probe，tag 与真实那一条不同
    const onProbe = (event: Event): void => {
        const detail = (event as CustomEvent<ProbeDetail | undefined>).detail
        const replay = tally.lastTitle !== ""
        show({
            sessionId: detail?.sessionId ?? (replay ? tally.lastSessionId : "probe"),
            title: detail?.title ?? (replay ? tally.lastTitle : copy.completed),
            body: detail?.body ?? (replay ? tally.lastBody : "probe"),
        })
    }

    // 排查用：把还在等着确认的那几条立即确认掉，并放行队列。
    // 先看根属性上的 -tally 那一条：list= 是列表通知的次数，它一直是 0 就说明这条订阅也没在工作
    const onRescan = (): void => {
        tally.last = "rescan"
        publishTally()
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

    // 主触发源：sessions.list 的订阅。它走客户端自己的 Notifier（microtask 合批），
    // 不依赖 remote.$on 那条通道——那条要求连接是 interactions=answer，桌面端未必满足。
    // 这里只认「上一次是 true、这一次是 false」那一次翻转，别的一概不管
    const onListChange = (): void => {
        if (disposed) return
        tally.listEvents += 1
        const byId = sessions.list.getSnapshot().byId
        for (const [sessionId, summary] of Object.entries(byId)) {
            const running = summary?.running === true
            const previous = lastRunning.get(sessionId)
            lastRunning.set(sessionId, running)
            if (previous !== true || running) continue
            if (!runningSince.has(sessionId)) runningSince.set(sessionId, Date.now())
            settle(sessionId)
        }
        if (queue.length > 0) pump()
        publishTally()
    }
    // 起点：装上那一刻正在跑的会话按现在算
    const baseline = Date.now()
    for (const [sessionId, summary] of Object.entries(sessions.list.getSnapshot().byId)) {
        const running = summary?.running === true
        lastRunning.set(sessionId, running)
        if (running) runningSince.set(sessionId, baseline)
    }

    // 主路先接上。列表订阅不需要任何前提，它一定在
    const unsubscribeList = sessions.list.subscribe(onListChange)
    document.addEventListener(RESCAN_EVENT, onRescan)
    document.addEventListener(PROBE_EVENT, onProbe)
    // 次路（status 与 error 事件）挂不上就算了：连接不是 interactions=answer 时 $on 会抛，
    // 那时只走列表那条路，起点记不精确、出错认不出，但完成通知照常。
    // 2026-11-02 排查到的形状正是「标记在、弹窗不来」——那时 $on 是唯一的路，而它没接上
    const unsubscribers: Array<() => void> = [unsubscribeList]
    try {
        unsubscribers.push(remote.$on("api-session/status", onSessionStatus))
        unsubscribers.push(remote.$on("api-session/error", onSessionError))
    } catch (error) {
        tally.last = "events unavailable: " + (error instanceof Error ? error.message : String(error))
        console.warn("dsh-chat-ux: done notify falls back to the session list", error)
    }
    publishTally()
    document.documentElement.setAttribute(ROOT_ATTRIBUTE, "")

    return {
        dispose: () => {
            if (disposed) return
            disposed = true
            for (const unsubscribe of unsubscribers) unsubscribe()
            document.removeEventListener(RESCAN_EVENT, onRescan)
            document.removeEventListener(PROBE_EVENT, onProbe)
            if (pumpTimer !== 0) window.clearTimeout(pumpTimer)
            pumpTimer = 0
            for (const timer of settleTimers.values()) window.clearTimeout(timer)
            settleTimers.clear()
            queue.length = 0
            tally.closed += open.size
            if (open.size > 0) tally.last = "dispose closed " + open.size
            publishTally()
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
    readonly list: {
        getSnapshot(): SessionListSnapshotLike

        subscribe(listener: () => void): () => void
    }

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
