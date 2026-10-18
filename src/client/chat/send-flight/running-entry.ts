/**
 * 「深度求索中，用时 N 秒」那一行的占位动画。
 *
 * 它是 dsh 插在聊天列末尾的一行：插进 DOM 的那一帧若是满高，dsh 会立刻瞬时跟到底，气泡与它
 * 上面的内容一帧被顶上去（2026-10-18 读者实拍）。这里让它在插入的那一帧是零高、零 gap，之后
 * 180 ms 里一帧跟一帧长到自己的高度——dsh 的 ResizeObserver 每帧量到一个高一点的列，跟随就
 * 一帧跟一帧，那一下「顶」变成连续的上移。
 *
 * **为什么要动两个属性**：这一行是 flex 列（[data-chat-flow]）里的 flex item，占位由它自己的
 * height 与它行前那道 gap 一起决定。只做 height 会剩下 12 px 的瞬移，而 gap 那段 CSS 压不住
 * ——dsh 给这一行的 margin-top 来自一条特异性 0,7,0 的规则，@starting-style 里的起始值实测被
 * 丢弃。内联样式在级联里最高，所以两条都写内联。min-height 与 overflow 由样式表常驻（见
 * send-flight-styles.ts），这里不重复。
 *
 * **时序是这一处的全部要点**：选择器命中的时候是 React 插入之后的**微任务**里，早于这一帧的
 * 样式计算与布局——把两个属性写成零，这一帧 dsh 量到的就是零，它不滚；之后一帧长一点，它的
 * 跟随就一帧跟一帧。晚一步（等到 animationstart 或 rAF）这一帧已经按自然高度画过，就白做了。
 *
 * **这是唯一路径，不是回退**：2026-10-18 之前这里只在浏览器不认 interpolate-size 时才装，其余
 * 情形交给样式表里那条 @starting-style 过渡；实测那条 CSS 路径在 flex 列里一次都没生效
 * （overflow: clip 不解 flex item 的自动最小尺寸，插进去就是满高，height 过渡全程没动），已经
 * 删掉，只剩这一条。
 *
 * 与 dsh 的关系：不动它的 DOM、不动 scrollTop、不动它的跟随状态，只在插入的那一小段里借这一行
 * 自己的 height 与 margin-top 用一下，收尾把两个内联属性摘干净。
 *
 * @module dsh-chat-ux/client/chat/send-flight/running-entry
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
 * 装上占位动画。
 * @returns 卸载函数。
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
 * @param row - 刚插进来的那一行（可能不是 HTMLElement，直接跳过）。
 * @param grown - 已经处理过的元素；同一次出现只做一遍。
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
    const cleanup = (): void => {
        // cancel 与两个 removeProperty 在同一段同步代码里：样式只重算一次，中间没有可画的帧。
        growth.cancel()
        row.style.removeProperty('height')
        row.style.removeProperty('margin-top')
    }
    growth.onfinish = cleanup
    // 兜底：onfinish 在无头环境里实测有不触发的情形，而失败模式是这一行永远零高。脚本幂等。
    setTimeout(cleanup, ENTRY_MS + CLEANUP_GRACE_MS)
}
