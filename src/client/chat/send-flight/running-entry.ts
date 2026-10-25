/**
 * 「深度求索中」那一行的零高入场。
 *
 * 插入后的微任务里把 height 和 margin-top 压成零，再逐帧长回自然值，避免 dsh 的跟随把气泡
 * 与历史一帧顶上去。先停在起手格，隔两拍再起跑，躲开提交那一记长任务。
 */

/** 那一行自己。与样式表里的选择器必须一字不差。 */
const RUNNING_ROW_SELECTOR = '[data-chat-running]'

/** 占位时长（毫秒）。 */
const ENTRY_MS = 180

/**
 * 占位的缓动。**不能像气泡落地那样抢跑**：原先那条 0.22/1/0.36/1 在前四分之一时长就走完七成半，
 * 三十几像素的位移挤进前四十毫秒，读起来还是一次「顶」。换成缓入缓出——同一时刻大约走一半，剩下的
 * 摊在整段里。占位这件事本身是「空间被填出来」，不该有回弹。
 */
const ENTRY_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

/** 兜底清理在动画时长之后再多等多久（毫秒）。 */
const CLEANUP_GRACE_MS = 80

/**
 * 起播前先等几帧——与 `send-flight.ts` 的 `WARMUP_FRAMES` 同一个理由（见模块头）。这一行的插入
 * 几乎总在提交那一记长任务里，动画若同时起跑，长任务结束时第一帧就是满高。
 */
const WARMUP_FRAMES = 2

/** 预热折算的毫秒数；兜底定时器要把它一起算进去。 */
const WARMUP_MS = WARMUP_FRAMES * (1000 / 60)

/**
 * 起播后第一帧，动画比墙钟快多少（毫秒）才值得把时间轴退回去。
 *
 * 与替身那一处同值（`send-morph.ts` 的 `ALIGN_TOLERANCE_MS`）：一帧半以内是 rAF 与动画时间轴的
 * 正常相位差，回拨反而会顿一下。
 */
const ALIGN_TOLERANCE_MS = 24

/**
 * 装上占位动画。
 */
export function installRunningEntry(): () => void {
    const grown = new WeakSet<Element>()
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue
                const rows = node.matches(RUNNING_ROW_SELECTOR)
                    ? [node]
                    : Array.from(node.querySelectorAll(RUNNING_ROW_SELECTOR))
                for (const row of rows) growFromZero(row, grown)
            }
        }
    })
    observer.observe(document.body, {childList: true, subtree: true})
    return () => observer.disconnect()
}

/**
 * 把这一行的首帧高度与行前 gap 一起压成零，再动画回它们自己的值。
 */
function growFromZero(row: Element, grown: WeakSet<Element>): void {
    if (!(row instanceof HTMLElement) || grown.has(row)) return
    grown.add(row)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // 两个值都必须在写内联之前读完：getComputedStyle 返回的是活对象，写一个会改掉另一个的读数。
    // 关键帧里的 height 是 content-box 的高度，元素还没布局时 computed 是 auto，退回矩形高度。
    const computed = getComputedStyle(row)
    const measured = Number.parseFloat(computed.height)
    const natural = Number.isFinite(measured) && measured > 0 ? measured : row.getBoundingClientRect().height
    if (natural <= 0) return
    const gap = Number.parseFloat(computed.marginTop)
    const settledGap = Number.isFinite(gap) && gap > 0 ? gap : 0
    row.style.height = '0px'
    row.style.marginTop = '0px'
    const growth = row.animate(
        [
            {height: '0px', marginTop: '0px'},
            {height: natural + 'px', marginTop: settledGap + 'px'},
        ],
        // fill 必须 forwards：不填的话动画一结束元素就回落到内联的那个零高，而 onfinish 到清理
        // 之间只要隔着一帧，读者就会看见这一行闪一下。填住之后末值一直挂着，直到 remove 接上。
        {duration: ENTRY_MS, easing: ENTRY_EASING, fill: 'forwards'},
    )
    // 先停在起手那一格，等两拍 rAF 再起跑（见 `WARMUP_FRAMES`）。停着的时候它就是零高——
    // 读者看不见它，dsh 的跟随也一步都不走，所以这两帧不花任何视觉上的代价。
    growth.pause()
    growth.currentTime = 0
    let rescue = 0
    const cleanup = (): void => {
        window.clearTimeout(rescue)
        // cancel 与两个 removeProperty 在同一段同步代码里：样式只重算一次，中间没有可画的帧。
        growth.cancel()
        row.style.removeProperty('height')
        row.style.removeProperty('margin-top')
    }
    const rescueIn = (delay: number): void => {
        window.clearTimeout(rescue)
        rescue = window.setTimeout(cleanup, delay)
    }
    growth.onfinish = cleanup
    // 兜底：onfinish 在无头环境里实测有不触发的情形，而失败模式是这一行永远零高。脚本幂等。
    // 从创建这一刻起算，起跑若被推迟（后台页签里 rAF 会停）也有一道保底。
    rescueIn(WARMUP_MS + ENTRY_MS + CLEANUP_GRACE_MS)
    const play = (): void => {
        if (!row.isConnected) {
            cleanup()
            return
        }
        const startedAt = performance.now()
        growth.play()
        // 起跑时刻显式钉在「现在」：等 pending 自己定的话，主线程一忙这一格就晚出几十毫秒。
        const now = document.timeline.currentTime
        if (typeof now === 'number') growth.startTime = now
        rescueIn(ENTRY_MS + CLEANUP_GRACE_MS)
        // 起播后第一帧核一次时间轴：动画若跑在墙钟前面（超过一帧半），把起点后移，让这一格退回
        // 起手。rAF 在绘制之前，回拨不可见；主线程被长任务吞掉时两边差值为负，不会误触发。
        requestAnimationFrame(() => {
            const reached = growth.currentTime
            if (typeof reached !== 'number' || reached <= 0 || reached >= ENTRY_MS) return
            const ahead = reached - (performance.now() - startedAt)
            if (ahead <= ALIGN_TOLERANCE_MS) return
            const start = growth.startTime
            if (typeof start === 'number') growth.startTime = start + ahead
        })
    }
    requestAnimationFrame(() => requestAnimationFrame(play))
}
