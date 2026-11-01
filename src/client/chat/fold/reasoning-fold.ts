/**
 * 模型还在思考时让思考行开着，思考一停就收回去。dsh 发出来的思考行一律是收起的（ReasoningRow 用的是
 * useState(false)），也没有任何设置项暴露它，所以只能去点它自己的展开控件
 *
 * 认的都是语义属性：data-variant="think"、data-state（思考中是 running，停稳是 ok）和 data-expanded，
 * 不碰那些跟着 dsh 每次构建变化的带 hash 类名
 *
 * 读者在某个阶段碰过的行，这个阶段之内不再动它；阶段一变（思考结束）该收还是收
 *
 * 哪一行变了由 fold-observers 一处盯着，与过程组共用同一个观察者；这一份只负责把这些行拉回该有的样子
 */

import {RUNNING_STATE, THINK_ROW_SELECTOR} from "../../dom-contract"
import {beginProgrammaticToggle, endProgrammaticToggle, isProgrammaticToggle} from "./programmatic-toggle"

/**
 * 给整页安装思考行展开。sync 把给到的这些行拉回该有的样子，由共用的观察者每帧调一次；
 * dispose 撤掉这一块的监听与收敛
 */
export function installReasoningFold(): {
    sync: (rows: readonly HTMLElement[]) => void
    dispose: () => void
} {
    // 读者最后一次碰某一行时，那一行处在哪个阶段
    const touchedPhaseMap = new WeakMap<Element, string>()
    // 某一行最后一次被尝试切换时处在哪个阶段，所以没引起变化的点击不会被反复重试
    const attemptedPhaseMap = new WeakMap<Element, string>()

    // 把给到的这些行拉到它们当前阶段该有的样子
    const syncRows = (rows: Iterable<HTMLElement>): void => {
        for (const row of rows) {
            // 收集与收敛之间隔着一帧，这中间行可能已经被摘掉，对不在文档里的元素点一下没有意义
            if (!row.isConnected) continue
            const phase = row.getAttribute("data-state") ?? ""
            if (phase === "") continue
            // 这个阶段里读者已经决定过这一行的状态，别碰它
            if (touchedPhaseMap.get(row) === phase) continue
            if (row.hasAttribute("data-expanded") === (phase === RUNNING_STATE)) continue
            // 一次没引起变化的点击，下一次也不会引起变化
            if (attemptedPhaseMap.get(row) === phase) continue
            attemptedPhaseMap.set(row, phase)
            // 控件是哪种取决于 dsh 怎么配置这个展开区：expandOnRowClick 为真时整行就是按钮，否则是左侧那个
            // chevron。「第一个像按钮的后代」同时覆盖两种，不必依赖这一次构建选了哪一种
            const control = row.querySelector(`[role="button"], button`)
            if (!(control instanceof HTMLElement)) continue
            // 下面那个捕获阶段的监听同样会看到这次点击，所以这一段要声明出去：那不是读者要求的
            beginProgrammaticToggle()
            try {
                control.click()
            } finally {
                endProgrammaticToggle()
            }
        }
    }

    // 记住是读者、而不是本模块刚刚决定了一行的状态
    const rememberReaderTouched = (event: Event): void => {
        if (isProgrammaticToggle()) return
        const target = event.target
        if (!(target instanceof Element)) return
        const row = target.closest(THINK_ROW_SELECTOR)
        if (row === null) return
        touchedPhaseMap.set(row, row.getAttribute("data-state") ?? "")
    }

    document.addEventListener("click", rememberReaderTouched, true)
    document.addEventListener("keydown", rememberReaderTouched, true)
    // 装好之后先全量收敛一遍：页面里躺着的那些行也要归位
    syncRows(document.querySelectorAll<HTMLElement>(THINK_ROW_SELECTOR))

    return {
        sync: syncRows,
        dispose: () => {
            document.removeEventListener("click", rememberReaderTouched, true)
            document.removeEventListener("keydown", rememberReaderTouched, true)
        },
    }
}
