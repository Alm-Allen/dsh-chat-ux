/**
 * 输入框玻璃的几何：把卡片相对座位的上下边写进座位上的两个自定义属性，外加认下卡片里那几枚圆形按钮。
 *
 * 玻璃只盖输入卡片那个矩形，铺底的座位必须在卡片处让开一块洞，而 CSS 挖不出「位置由某个子元素决定」的洞，
 * 所以这一处去量它。只在读者打开这个开关时安装（见 index.tsx 的 syncGlass），要量的只有两个盒子：
 * 座位与卡片各挂一个 ResizeObserver，另有一个 MutationObserver 认座位出现与消失（切会话时整棵子树会重建）
 */
import {
	GLASS_ADD_ATTRIBUTE, GLASS_BOTTOM_VARIABLE, GLASS_PRIMARY_ATTRIBUTE, GLASS_STOP_ATTRIBUTE,
	GLASS_TOP_VARIABLE,
} from "./composer-glass-styles"

// 座位与卡片的选择器，两个都是 dsh 自己的语义属性
const SEAT_SELECTOR = "[data-composer-seat]"
const CARD_SELECTOR = "[data-composer-card]"

// 左下角那枚加号的判据：dsh 只在这一枚按钮上声明 aria-haspopup="listbox"，卡片里另外几枚各自开的是别的
// 口子——模型选择、权限预设与加号旁边那些都是 menu，统计胶囊是 dialog（2026-10 核对过桌面版 app.asar）
// 它同时带 aria-expanded，但那个属性别人也有，不能当判据
const ADD_SELECTOR = `button[aria-haspopup="listbox"]`

// 装上这一处，返回卸下观察者与清掉写过属性的把手
export function installComposerGlass(): () => void {
	const observedSeatSet = new Set<HTMLElement>()
	let reconcileScheduled = false
	let disposed = false

	// 量一次座位：卡片在就写两条边并认一次那几枚按钮，不在就清掉（缺口回退成零高，也就是整块底）
	const measureSeat = (seat: HTMLElement): void => {
		const card = seat.querySelector<HTMLElement>(CARD_SELECTOR)
		if (card === null) {
			seat.style.removeProperty(GLASS_TOP_VARIABLE)
			seat.style.removeProperty(GLASS_BOTTOM_VARIABLE)
			return
		}
		markPrimaryButton(card)
		// 左下角那枚加号：认不出就什么都不做，它回到 dsh 原来的样子，不报错、也不牵连玻璃与主按钮
		const addButton = card.querySelector<HTMLElement>(ADD_SELECTOR)
		for (const markedAdd of card.querySelectorAll<HTMLElement>(`[${GLASS_ADD_ATTRIBUTE}]`)) {
			if (markedAdd !== addButton) markedAdd.removeAttribute(GLASS_ADD_ATTRIBUTE)
		}
		if (addButton !== null && !addButton.hasAttribute(GLASS_ADD_ATTRIBUTE)) addButton.setAttribute(GLASS_ADD_ATTRIBUTE, "")
		const seatBox = seat.getBoundingClientRect()
		const cardBox = card.getBoundingClientRect()
		// 值没变就不写：写一次就是一次样式失效，而折叠、流式这些时刻一帧里会量好几次
		const gapTop = `${Math.round(cardBox.top - seatBox.top)}px`
		const gapBottom = `${Math.round(cardBox.bottom - seatBox.top)}px`
		if (seat.style.getPropertyValue(GLASS_TOP_VARIABLE) !== gapTop) seat.style.setProperty(GLASS_TOP_VARIABLE, gapTop)
		if (seat.style.getPropertyValue(GLASS_BOTTOM_VARIABLE) !== gapBottom) seat.style.setProperty(GLASS_BOTTOM_VARIABLE, gapBottom)
	}

	const resizeObserver = new ResizeObserver((entries) => {
		for (const entry of entries) measureSeat(entry.target as HTMLElement)
	})

	// 对账：新座位挂上观察者，消失的座位摘掉，两边都各量一次
	const reconcileSeats = (): void => {
		if (disposed) return
		for (const seat of document.querySelectorAll<HTMLElement>(SEAT_SELECTOR)) {
			if (!observedSeatSet.has(seat)) {
				observedSeatSet.add(seat)
				resizeObserver.observe(seat)
			}
			// 卡片可能是刚换上的新节点，所以每次都重新认一次；observe 对同一个元素是幂等的
			const card = seat.querySelector<HTMLElement>(CARD_SELECTOR)
			if (card !== null) resizeObserver.observe(card)
			measureSeat(seat)
		}
		for (const seat of observedSeatSet) {
			if (seat.isConnected) continue
			resizeObserver.unobserve(seat)
			observedSeatSet.delete(seat)
		}
	}

	// 对账排到下一帧、一帧最多一次：这一处在折叠与流式这些 DOM 高频变动的时刻被叫醒，别让它一帧里查好几遍文档
	const scheduleReconcile = (): void => {
		if (reconcileScheduled || disposed) return
		reconcileScheduled = true
		requestAnimationFrame(() => {
			reconcileScheduled = false
			reconcileSeats()
		})
	}

	const mutationObserver = new MutationObserver((records) => {
		for (const record of records) {
			if (![...record.addedNodes, ...record.removedNodes].some(touchesGlass)) continue
			scheduleReconcile()
			return
		}
	})

	reconcileSeats()
	mutationObserver.observe(document.body, {childList: true, subtree: true})
	return () => {
		disposed = true
		mutationObserver.disconnect()
		resizeObserver.disconnect()
		for (const seat of observedSeatSet) {
			seat.style.removeProperty(GLASS_TOP_VARIABLE)
			seat.style.removeProperty(GLASS_BOTTOM_VARIABLE)
		}
		observedSeatSet.clear()
		for (const glassAttribute of [GLASS_PRIMARY_ATTRIBUTE, GLASS_STOP_ATTRIBUTE, GLASS_ADD_ATTRIBUTE]) {
			for (const markedButton of document.querySelectorAll(`[${glassAttribute}]`)) markedButton.removeAttribute(glassAttribute)
		}
	}
}

// 认一次卡片里那两枚圆形按钮，把属性打在它们身上：右下角的主操作按钮（发送或停止），以及它旁边可能在的那枚
// 独立停止圆。主按钮的判据只有一条——卡片里最后一个 button，dsh 把它排在工具栏最右，加号、模式、附件那些
// 都在它前面；它既不带语义属性、class 名又带构建期 hash，只能由这里认出来、自己打一个
// 这一处跑在 measureSeat 里，不新增触发源：卡片里流式与打字引起的高频变动不会因为它再被叫醒
function markPrimaryButton(card: HTMLElement): void {
	const buttonList = card.querySelectorAll<HTMLButtonElement>("button")
	const primaryButton = buttonList.item(buttonList.length - 1)
	const stopButton = findIndependentStop(buttonList, primaryButton)
	for (const button of buttonList) {
		applyGlassMark(button, GLASS_PRIMARY_ATTRIBUTE, button === primaryButton)
		applyGlassMark(button, GLASS_STOP_ATTRIBUTE, button === stopButton)
	}
}

// 独立停止圆：紧邻主按钮、且 class 与主按钮逐字相同的那一枚。dsh 只在可继续的子智能体在跑时渲染它
// （InputBar 的 interruptible），主按钮那时仍是发送或排队，停止被单独摆成一枚放在它前面，两枚共用同一个 class
// 两条缺一不可：只按位置会把 activity、模型选择那些认进来，只按 class 会认到更远处碰巧同名的东西
function findIndependentStop(
	buttonList: NodeListOf<HTMLButtonElement>,
	primaryButton: HTMLButtonElement | null,
): HTMLButtonElement | null {
	if (primaryButton === null || primaryButton.className === "") return null
	const siblingButton = buttonList.item(buttonList.length - 2)
	if (siblingButton === null || siblingButton === primaryButton) return null
	if (siblingButton.className !== primaryButton.className) return null
	return siblingButton
}

// 按需给一枚按钮补上或摘掉这个属性；属性已经在、又该在时不动它，少一次属性写入
function applyGlassMark(button: HTMLButtonElement, attribute: string, shouldMark: boolean): void {
	if (button.hasAttribute(attribute) === shouldMark) return
	if (shouldMark) button.setAttribute(attribute, "")
	else button.removeAttribute(attribute)
}

// 这一次变动有没有碰到座位或卡片：流式输出每批都会送来一堆新节点，先过这一道筛，绝大多数批次直接跳过
function touchesGlass(changedNode: Node): boolean {
	if (!(changedNode instanceof Element)) return false
	if (changedNode.matches(SEAT_SELECTOR) || changedNode.matches(CARD_SELECTOR)) return true
	return changedNode.querySelector(`:is(${SEAT_SELECTOR}, ${CARD_SELECTOR})`) !== null
}
