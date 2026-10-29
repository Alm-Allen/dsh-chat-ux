/**
 * 把数字滚动挂进 dsh 自己渲染的那串读数旁边。
 *
 * 上下文占用那串百分比不是座位——dsh 在 ContextMeter 里直接渲染一个 span，插件接不过来，所以这里认到
 * 那一截之后挂一棵只属于自己的 React 树，渲染同一枚 DigitReel，两处的滚动必然一致。
 * 挂的位置是读数那一截的父级，不是读数里面：dsh 重设 textContent 时会连带清掉塞进去的节点，塞在里面的
 * 写法每次读数更新都被抹掉一次，那一截的 textContent 还会读成 26%26%，判据随即认不出读数。
 * 读数原文本留在原处，视觉上由让开规则收起，读屏照旧读得到
 */
import {createRoot} from "react-dom/client"
import type {Root} from "react-dom/client"
import {DigitReel} from "./digit-reel"
import {REEL_HOST_CLASS, REEL_TAKEOVER_ATTRIBUTE} from "./reel-styles"

// 读数的形状；dsh 写的就是 26% 这样
const READING_PATTERN = /^(\d{1,3})%$/

// 每一处挂载：那棵树、它的容器，以及上一帧喂进去的读数；键是容器所在的元素
const hostMap = new WeakMap<Element, {root: Root; reelContainer: HTMLElement; renderedText: string}>()

// 在读数那一截旁边放上或更新数字滚动；读数形状对不上就什么都不做，返回 false，调用方照旧留着原文本
export function paintReel(host: HTMLElement, reading: HTMLElement, text: string): boolean {
	if (READING_PATTERN.exec(text) === null) return false
	reading.setAttribute(REEL_TAKEOVER_ATTRIBUTE, "")
	const knownHost = hostMap.get(host)
	if (knownHost !== undefined && knownHost.reelContainer.isConnected) {
		if (knownHost.renderedText === text) return true
		knownHost.renderedText = text
		knownHost.root.render(<DigitReel text={text} rolling spoken={false}/>)
		return true
	}
	// 上一棵已经不在这棵树里（dsh 把那个父级连同我们一起换掉了）：先卸掉再重挂
	if (knownHost !== undefined) knownHost.root.unmount()
	const reelContainer = document.createElement("span")
	reelContainer.className = REEL_HOST_CLASS
	host.appendChild(reelContainer)
	const reelRoot = createRoot(reelContainer)
	reelRoot.render(<DigitReel text={text} rolling spoken={false}/>)
	hostMap.set(host, {root: reelRoot, reelContainer, renderedText: text})
	return true
}

// 卸下这一处的数字滚动：原文本回到原样
export function releaseReel(reading: HTMLElement): void {
	const host = reading.parentElement
	const knownHost = host === null ? undefined : hostMap.get(host)
	if (host === null || knownHost === undefined) {
		reading.removeAttribute(REEL_TAKEOVER_ATTRIBUTE)
		return
	}
	knownHost.root.unmount()
	knownHost.reelContainer.remove()
	hostMap.delete(host)
	reading.removeAttribute(REEL_TAKEOVER_ATTRIBUTE)
}
