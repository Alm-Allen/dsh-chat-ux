/**
 * 思考进行时自动展开思考行，思考结束后再收起。
 *
 * 行仍归读者所有：读者在某阶段碰过它，本阶段内不再自动切换；阶段变化后规则重新接管。
 * 只认 data-variant、data-state 与 data-expanded 这些语义属性。
 */

import {RUNNING_STATE, THINK_ROW_SELECTOR} from '../../dom-contract'
import {beginProgrammaticToggle, endProgrammaticToggle, isProgrammaticToggle} from './programmatic-toggle'

/**
 * 给整页安装思考行展开。
 */
export function installReasoningFold(): () => void {
    /** 读者最后一次碰某一行时，那一行处在哪个阶段。 */
    const touchedIn = new WeakMap<Element, string>()
    /** 某一行最后一次被尝试切换时处在哪个阶段，所以没引起变化的点击不会被反复重试。 */
    const attemptedIn = new WeakMap<Element, string>()
    /** 是否已经排了一次扫描。 */
    let scanQueued = false

    /**
     * 把给到的这些行拉到它们当前阶段该有的样子。
     *
     * 控件是哪种，取决于 dsh 怎么配置这个展开区：`expandOnRowClick` 为真时整行就是按钮，否则是
     * 左侧那个 chevron。「第一个像按钮的后代」这一条同时覆盖两种，而不必依赖这一次构建选了哪一种。
     */
    const syncRows = (rows: Iterable<HTMLElement>): void => {
        for (const row of rows) {
            // 收集与收敛之间隔着一帧，这中间行可能已经被摘掉——对不在文档里的元素点一下没有意义。
            if (!row.isConnected) continue
            const phase = row.getAttribute('data-state') ?? ''
            if (phase === '') continue
            // 这个阶段里读者已经决定过这一行的状态，别碰它。
            if (touchedIn.get(row) === phase) continue
            if (row.hasAttribute('data-expanded') === (phase === RUNNING_STATE)) continue
            // 一次没引起变化的点击，下一次也不会引起变化。
            if (attemptedIn.get(row) === phase) continue
            attemptedIn.set(row, phase)
            const control = row.querySelector('[role="button"], button')
            if (!(control instanceof HTMLElement)) continue
            // 下面那个捕获阶段的监听同样会看到这次点击，所以这一段要声明出去：那不是读者要求的。
            beginProgrammaticToggle()
            try {
                control.click()
            } finally {
                endProgrammaticToggle()
            }
        }
    }

    /** 装好之后先全量收敛一遍：页面里躺着的那些行也要归位。 */
    const syncEveryRow = (): void => {
        syncRows(document.querySelectorAll<HTMLElement>(THINK_ROW_SELECTOR))
    }

    /** 记住是读者、而不是本模块刚刚决定了一行的状态。 */
    const rememberReaderTouched = (event: Event): void => {
        if (isProgrammaticToggle()) return
        const target = event.target
        if (!(target instanceof Element)) return
        const row = target.closest(THINK_ROW_SELECTOR)
        if (row === null) return
        touchedIn.set(row, row.getAttribute('data-state') ?? '')
    }

    /**
     * 这一批变化涉及哪些行。
     *
     * 从 records 里拿引用，而不是回头去查文档：`record.target` 是浏览器直接递过来的元素，顺着它
     * 往上找一行只是几层祖先的事；`querySelectorAll` 则要遍历整篇文档——同样的活差着一个量级。
     */
    const touchedRows = new Set<HTMLElement>()

    // 流式输出改 DOM 的速度远快于这件事需要跑的速度，所以每帧最多扫一次。
    const observer = new MutationObserver((records) => {
        const known = touchedRows.size
        for (const record of records) {
            // 两条路都要走。`record.target` 是变化发生的那个节点——属性变化时它就是那一行或行内的某个
            // 元素，子节点增删时它是父容器，两条都能顺着祖先链找到行；`addedNodes` 则覆盖「新挂上来一行」，
            // 那时行自己就在新增的子树里。
            const target = record.target
            if (target instanceof Element) {
                const row = target.closest<HTMLElement>(THINK_ROW_SELECTOR)
                if (row !== null) touchedRows.add(row)
            }
            for (const node of record.addedNodes) {
                if (!(node instanceof HTMLElement)) continue
                if (node.matches(THINK_ROW_SELECTOR)) touchedRows.add(node)
                for (const row of node.querySelectorAll<HTMLElement>(THINK_ROW_SELECTOR)) touchedRows.add(row)
            }
        }
        // 跟思考行无关的变化（工具行翻状态、插件管理页刷新……）不值得排一帧。
        if (touchedRows.size === known) return
        if (scanQueued) return
        scanQueued = true
        requestAnimationFrame(() => {
            scanQueued = false
            const rows = [...touchedRows]
            touchedRows.clear()
            syncRows(rows)
        })
    })
    observer.observe(document.body ?? document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-state', 'data-expanded'],
    })
    document.addEventListener('click', rememberReaderTouched, true)
    document.addEventListener('keydown', rememberReaderTouched, true)
    syncEveryRow()

    return () => {
        observer.disconnect()
        document.removeEventListener('click', rememberReaderTouched, true)
        document.removeEventListener('keydown', rememberReaderTouched, true)
    }
}
