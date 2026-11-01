/**
 * 「自动开合」那两块的观察者：思考行与过程组共用同一份。
 *
 * 两处原先各开一个观察整篇文档的 observer，同一批变化被遍历两遍、各排一帧。合成一处之后，
 * 一条 record 只跑一次 closest 就同时认出「这是哪一行」与「这是哪个组」，排帧也只有一个。
 *
 * 这里不替两块判断该不该动手，只回答「这一批变化碰到了谁」。认元素从 record 里拿引用、不回头查文档：
 * closest 只是几层祖先的事，querySelectorAll 要遍历整篇文档，同样的活差着一个量级
 */

import {
    MOTION_ATTRIBUTE,
    PROCESS_EXPANDED_MODE_ATTRIBUTE,
    PROCESS_GROUP_SELECTOR,
    SHIMMER_ATTRIBUTE,
    THINK_ROW_SELECTOR,
} from "../../dom-contract"

/**
 * 组根上的标记：这个组的组头此刻带着实时细节（标准或详细两档，且这一段过程还没结束）。
 * 观察者要知道它，因为组头文本的逐字变化只在这个标记还没写上时才有用
 */
export const LIVE_DETAIL_ATTRIBUTE = "data-chat-ux-live-detail"

/**
 * 装上两块共用的观察者。sync 每帧最多跑一次，拿到的是这一批变化碰到的行与组
 *
 * @param sync - 把给到的这些行与组各自拉到当前阶段该有的样子
 * @returns 卸载函数
 */
export function createFoldWatch(
    sync: (rows: readonly HTMLElement[], groups: readonly HTMLElement[]) => void,
): () => void {
    // 这一批变化碰到的行与组
    const touchedRows = new Set<HTMLElement>()
    const touchedGroups = new Set<HTMLElement>()
    // 这一帧里文字变过、但组头还没挂上替代标签的组。每帧清空：下一帧的第一次变化照样算数
    const labelPendingGroups = new Set<Element>()
    // 是否已经排了一次收敛
    let syncQueued = false
    // 卸下之后，已经排上的那一帧不必再跑
    let disposed = false

    const observer = new MutationObserver((records) => {
        const knownRowCount = touchedRows.size
        const knownGroupCount = touchedGroups.size
        for (const record of records) {
            // 本插件自己写上去的标记不算数：它们一变，两块的结论一分都不变
            const attributeName = record.attributeName
            if (attributeName !== null && attributeName.startsWith(OWN_ATTRIBUTE_PREFIX)) continue
            // 变化落在哪个节点上，就顺着它往上找一次，行与组一次问出来
            const target = record.target
            const changedElement = target instanceof Element ? target : target.parentElement
            const anchor = changedElement?.closest<HTMLElement>(ANCHOR_SELECTOR) ?? null
            const row = anchor !== null && anchor.matches(THINK_ROW_SELECTOR) ? anchor : null
            const group = anchor !== null && anchor.matches(PROCESS_GROUP_SELECTOR) ? anchor : null
            // 组头里的实时细节随流式逐字变，而 React 更新文本走的是 nodeValue，也就是 characterData。
            // 它只有一个用处：细节从空变成非空，而那一刻组根上还没有替代标签。标记写上之后，替不替文本
            // 由组体开不开决定，再变也不改结论；思考行的阶段看的是 data-state，与它里面正出的字无关。
            // 所以同一段逐字流式里，一个组只因为它排第一帧，后面的字不再各排一帧
            if (record.type === "characterData") {
                if (group === null || group.hasAttribute(LIVE_DETAIL_ATTRIBUTE)) continue
                if (labelPendingGroups.has(group)) continue
                labelPendingGroups.add(group)
                touchedGroups.add(group)
                continue
            }
            // 纯文本节点的增删翻不了任何一行：阶段与开合都是属性，而新挂上来的行与组在 addedNodes 里。
            // 流式逐字追加正好全是纯文本节点，这一条把它们整批挡在 closest 之外
            if (record.type === "childList" && !hasElement(record.addedNodes)) continue
            if (row !== null) touchedRows.add(row)
            if (group !== null) touchedGroups.add(group)
            for (const node of record.addedNodes) {
                if (!(node instanceof HTMLElement)) continue
                if (node.matches(PROCESS_GROUP_SELECTOR)) touchedGroups.add(node)
                if (node.matches(THINK_ROW_SELECTOR)) touchedRows.add(node)
                // 新挂上来的子树里可能连着行或组：组头是晚于组根挂上来的（dsh 先是 data 未到、渲染空），
                // 所以非锚点的节点也要往下看一眼
                for (const found of node.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR)) {
                    // 锚点选择器只有这两支，不是组就是行
                    if (found.matches(PROCESS_GROUP_SELECTOR)) touchedGroups.add(found)
                    else touchedRows.add(found)
                }
            }
        }
        // 跟这两块无关的变化（侧栏、插件管理页、组里的工具行出字……）不值得排一帧
        if (touchedRows.size === knownRowCount && touchedGroups.size === knownGroupCount) return
        if (syncQueued) return
        syncQueued = true
        requestAnimationFrame(() => {
            syncQueued = false
            if (disposed) return
            const rows = [...touchedRows]
            const groups = [...touchedGroups]
            touchedRows.clear()
            touchedGroups.clear()
            labelPendingGroups.clear()
            sync(rows, groups)
        })
    })
    observer.observe(document.body ?? document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        // 只盯会改变某一行或某个组阶段的那几个属性名
        attributeFilter: WATCHED_ATTRIBUTES,
        characterData: true,
    })

    return () => {
        disposed = true
        observer.disconnect()
        touchedRows.clear()
        touchedGroups.clear()
        labelPendingGroups.clear()
    }
}

// 认行与认组一次问出来：两块的锚点在同一条祖先链上，分两次 closest 就是两趟
const ANCHOR_SELECTOR = `${THINK_ROW_SELECTOR}, ${PROCESS_GROUP_SELECTOR}`

// 本插件自己写在页面上的属性。它们在 attributeFilter 之外、本来就不会产生 record，这条判据只是兜底
const OWN_ATTRIBUTE_PREFIX = "data-chat-ux-"

/**
 * 这两块认得的那几个属性名。dsh 的折叠动效在官方批量折叠期间会往行上写 data-chat-motion，
 * 那时这一行的开合归它管，摘掉之后还要再扫一遍，所以它也在这个范围里
 */
const WATCHED_ATTRIBUTES = [
    "data-state",
    "data-expanded",
    SHIMMER_ATTRIBUTE,
    // 组头那个控件上的活动名。它一变，组头的标签就整段换掉，而 React 换文本可能是替换整个文本节点，
    // 那条路不会走 characterData，也就绕过了下面那条「逐字变化只扫一次」的收敛
    "data-process-activity",
    "hidden",
    PROCESS_EXPANDED_MODE_ATTRIBUTE,
    MOTION_ATTRIBUTE,
]

// 这一批新挂上来的节点里有没有元素
function hasElement(nodes: NodeList): boolean {
    for (const node of nodes) if (node instanceof Element) return true
    return false
}
