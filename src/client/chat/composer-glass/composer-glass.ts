/**
 * 输入框那块玻璃的几何，外加卡片里几枚圆形按钮的认定：右下角那枚主操作按钮（发送 / 停止）、它旁边
 * 可能在的那枚独立停止圆，与左下角那枚加号（添加文件 / 调指令）。
 *
 * 玻璃只盖输入卡片那个矩形，而铺底的那一层（有会话内容时的座位）必须在卡片处让出一块洞来——CSS 挖不出
 * 「位置由某个子元素决定」的洞，所以这一处去量它：把卡片相对座位的上下边写进座位上的两个自定义属性，
 * 座位的两层背景拿它们让开那一段。
 *
 * 只在读者打开这个开关时安装（见 `index.tsx` 的 `syncGlass`）。要量的只有两个盒子，观察者也
 * 只有两个来源：座位与卡片各挂一个 `ResizeObserver`（卡片换行、加附件、上方卡片出现或消失，都会让
 * 这两个盒子的尺寸变），再加一个 `MutationObserver` 认座位出现与消失（切会话、进新会话页时整棵
 * 子树会重建）。
 *
 * @module dsh-chat-ux/client/chat/composer-glass/composer-glass
 */
import {
    GLASS_ADD_ATTRIBUTE, GLASS_BOTTOM_VARIABLE, GLASS_PRIMARY_ATTRIBUTE, GLASS_STOP_ATTRIBUTE,
    GLASS_TOP_VARIABLE,
} from './composer-glass-styles'

/** 座位与卡片的选择器，两个都是 dsh 自己的语义属性。 */
const SEAT_SELECTOR = '[data-composer-seat]'
const CARD_SELECTOR = '[data-composer-card]'

/**
 * 左下角那枚加号的判据：**dsh 只在这一枚按钮上声明 `aria-haspopup="listbox"`**。
 *
 * 卡片里另外几枚各自开的是别的口子——模型选择、权限预设与加号旁边那些都是 `menu`，统计胶囊是
 * `dialog`；核对过运行版产物（2026-10，桌面 App 那份 app.asar）。它同时带 `aria-expanded`，
 * 但那个属性别人也有，所以不拿它当判据。
 */
const ADD_SELECTOR = 'button[aria-haspopup="listbox"]'

/**
 * 装上这一处：量出每个座位里卡片的位置，写进座位的两个自定义属性；返回卸下的把手。
 *
 * @returns 卸下观察者、并把写过的属性都清干净的函数。
 */
export function installComposerGlass(): () => void {
    const bound = new Set<HTMLElement>()
    let scheduled = false
    let stopped = false

    /** 量一次座位：卡片在就写两条边并认一次主按钮，不在就清掉（缺口回退成零高，也就是整块底）。 */
    const measure = (seat: HTMLElement): void => {
        const card = seat.querySelector<HTMLElement>(CARD_SELECTOR)
        if (card === null) {
            seat.style.removeProperty(GLASS_TOP_VARIABLE)
            seat.style.removeProperty(GLASS_BOTTOM_VARIABLE)
            return
        }
        markPrimary(card)
        markAdd(card)
        const seatBox = seat.getBoundingClientRect()
        const cardBox = card.getBoundingClientRect()
        // 值没变就不写：写一次就是一次样式失效，而折叠、流式这些时刻一帧里会量好几次。
        const top = `${Math.round(cardBox.top - seatBox.top)}px`
        const bottom = `${Math.round(cardBox.bottom - seatBox.top)}px`
        if (seat.style.getPropertyValue(GLASS_TOP_VARIABLE) !== top) seat.style.setProperty(GLASS_TOP_VARIABLE, top)
        if (seat.style.getPropertyValue(GLASS_BOTTOM_VARIABLE) !== bottom) seat.style.setProperty(GLASS_BOTTOM_VARIABLE, bottom)
    }

    const resize = new ResizeObserver((entries) => {
        for (const entry of entries) measure(entry.target as HTMLElement)
    })

    /** 对账：新座位挂上观察者，消失的座位摘掉，两边都各量一次。 */
    const sync = (): void => {
        if (stopped) return
        for (const seat of document.querySelectorAll<HTMLElement>(SEAT_SELECTOR)) {
            if (!bound.has(seat)) {
                bound.add(seat)
                resize.observe(seat)
            }
            // 卡片可能是刚换上的新节点，所以每次都重新认一次；observe 对同一个元素是幂等的。
            const card = seat.querySelector<HTMLElement>(CARD_SELECTOR)
            if (card !== null) resize.observe(card)
            measure(seat)
        }
        for (const seat of bound) {
            if (seat.isConnected) continue
            resize.unobserve(seat)
            bound.delete(seat)
        }
    }

    /** 对账排到下一帧、一帧最多一次：这一处会在折叠与流式这些 DOM 高频变动的时刻被叫醒，别让它在一帧里
     查好几遍文档、量好几遍布局。 */
    const scheduleSync = (): void => {
        if (scheduled || stopped) return
        scheduled = true
        requestAnimationFrame(() => {
            scheduled = false
            sync()
        })
    }

    const mutations = new MutationObserver((records) => {
        for (const record of records) {
            if (![...record.addedNodes, ...record.removedNodes].some(touchesGlass)) continue
            scheduleSync()
            return
        }
    })

    sync()
    mutations.observe(document.body, {childList: true, subtree: true})
    return () => {
        stopped = true
        mutations.disconnect()
        resize.disconnect()
        for (const seat of bound) {
            seat.style.removeProperty(GLASS_TOP_VARIABLE)
            seat.style.removeProperty(GLASS_BOTTOM_VARIABLE)
        }
        bound.clear()
        for (const attribute of [GLASS_PRIMARY_ATTRIBUTE, GLASS_STOP_ATTRIBUTE, GLASS_ADD_ATTRIBUTE]) {
            for (const marked of document.querySelectorAll(`[${attribute}]`)) marked.removeAttribute(attribute)
        }
    }
}

/**
 * 认一次卡片里那两枚圆形按钮，把属性打在它们身上：右下角的主操作按钮（发送 / 停止），以及它旁边可能
 * 在的那枚**独立停止圆**。
 *
 * 主按钮的判据只有一条：**卡片里最后一个 `button`**——dsh 把它排在工具栏最右（`InputBar.tsx` 那个
 * trailing 行的末尾），加号、模式、附件那些按钮都在它前面。它既不带语义属性、class 名又带构建期
 * hash，所以只能由这里认出来、自己打一个。
 *
 * 独立那枚的判据是两个条件的**合**：紧邻主按钮的那一个 `button`，且 className 与主按钮逐字相同。
 * dsh 只在一种状态下渲染它——**可继续的子智能体在跑**时（`InputBar.tsx` 的 `interruptible`），
 * 主按钮那时仍是发送 / 排队，停止被单独摆成一枚放在它前面，两枚共用同一个 class。两条缺一不可：
 * 只按位置会把 activity、模型选择那些按钮认进来，只按 class 会认到更远处碰巧同名的东西。
 *
 * 两处都在 `measure` 里跑（resize 与对账），所以不新增任何触发源：卡片里流式与打字引起的高频变动
 * 不会因为这一处再被叫醒。反面是 dsh 哪天把独立那枚挪到别处、或给两枚换上不同的 class——那时它退回
 * dsh 原来的样子（与没有这一条时一样），不报错、也不牵连主按钮与玻璃。
 *
 * @param card - 输入卡片。
 */
function markPrimary(card: HTMLElement): void {
    const buttons = card.querySelectorAll<HTMLButtonElement>('button')
    const primary = buttons.item(buttons.length - 1)
    const stop = independentStop(buttons, primary)
    for (const button of buttons) {
        applyGlassMark(button, GLASS_PRIMARY_ATTRIBUTE, button === primary)
        applyGlassMark(button, GLASS_STOP_ATTRIBUTE, button === stop)
    }
}

/**
 * 主按钮旁边那枚独立的停止圆：紧邻它、且 className 与它逐字相同的那一个。
 *
 * @param buttons - 卡片里全部按钮，按文档序。
 * @param primary - 主按钮（最后一个）；认不出来时为 null。
 * @returns 要一并接管的那一枚；认不出来时为 null。
 */
function independentStop(
    buttons: NodeListOf<HTMLButtonElement>,
    primary: HTMLButtonElement | null,
): HTMLButtonElement | null {
    if (primary === null) return null
    if (primary.className === '') return null
    const before = buttons.item(buttons.length - 2)
    if (before === null || before === primary) return null
    return before.className === primary.className ? before : null
}

/**
 * 按需给一枚按钮补上或摘掉这个属性；属性已经在、又该在时不动它（少一次属性写入）。
 *
 * @param button - 目标按钮。
 * @param attribute - 属性名。
 * @param on - 这一枚是不是当前要标记的那一枚。
 */
function applyGlassMark(button: HTMLButtonElement, attribute: string, on: boolean): void {
    if (!on) {
        if (button.hasAttribute(attribute)) button.removeAttribute(attribute)
        return
    }
    if (!button.hasAttribute(attribute)) button.setAttribute(attribute, '')
}

/**
 * 认一次卡片里那枚加号，把属性打在它身上。
 *
 * 与主按钮同一个分寸：认不出就什么都不做（那枚按钮回到 dsh 原来的样子），不报错、也不牵连玻璃与
 * 主按钮——dsh 哪天把它换成别的口子（不再用 listbox），表现就只有这一处。
 * @param card - 输入卡片。
 */
function markAdd(card: HTMLElement): void {
    const target = card.querySelector<HTMLElement>(ADD_SELECTOR)
    for (const marked of card.querySelectorAll<HTMLElement>(`[${GLASS_ADD_ATTRIBUTE}]`)) {
        if (marked !== target) marked.removeAttribute(GLASS_ADD_ATTRIBUTE)
    }
    if (target === null || target.hasAttribute(GLASS_ADD_ATTRIBUTE)) return
    target.setAttribute(GLASS_ADD_ATTRIBUTE, '')
}

/**
 * 这一次变动有没有碰到座位或卡片。流式输出每批都会送来一堆新节点，先过这一道筛，绝大多数批次直接跳过。
 * @param node - 这次加上或去掉的节点。
 * @returns 它本身、或它的子树里有座位或卡片时为真。
 */
function touchesGlass(node: Node): boolean {
    if (!(node instanceof Element)) return false
    if (node.matches(SEAT_SELECTOR) || node.matches(CARD_SELECTOR)) return true
    return node.querySelector(`:is(${SEAT_SELECTOR}, ${CARD_SELECTOR})`) !== null
}
