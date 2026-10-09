/**
 * 把数字轮挂进 dsh 自己渲染的那串读数旁边。
 *
 * 上下文占用那串百分比不是座位——dsh 在 ContextMeter 里直接渲染 `<span>26%</span>`，插件接不过来，
 * 所以这里不走座位：认到那一截之后挂一棵只属于自己的 React 树，渲染同一枚 `DigitReel`，两处的翻动
 * 必然同款。
 *
 * 挂的位置是那一截读数的**父级**（那颗按钮），不是读数自己里面——这一处唯一脆的地方就在这里。dsh 用
 * React 渲染 `<span>{reading}</span>`，读数一变 React 走 `setTextContent`：它在「首尾是同一个文本
 * 节点」时才只改 nodeValue，否则整段 `textContent =` 重设，**连带清掉我们塞进去的节点**。塞在读数里
 * 的写法因此每次读数更新都被抹掉一次（挂上、被抹、再挂），流式期间几乎看不见；更糟的是那一截的
 * `textContent` 会读成 `26%26%`，判据随即认不出读数，连饼也不再重画。挂在父级上没有这两回事：React
 * 只管它自己那两个子节点（图标与读数），我们这一个它不感知。
 *
 * 读数那一截留给读屏：视觉上由各处的让位规则收起，读出来还是那个读数。
 *
 * @module dsh-chat-ux/chat/reel/reel-host
 */
import {createRoot} from 'react-dom/client'
import type {Root} from 'react-dom/client'
import {DigitReel} from './digit-reel'
import {REEL_HOST_CLASS, REEL_TAKEOVER_ATTRIBUTE} from './reel-styles'

/** 读数的形状；dsh 写的就是「26%」。 */
const READING_PATTERN = /^(\d{1,3})%$/

/** 每一处挂载：那棵树、它的容器，以及上一帧喂进去的读数；键是容器所在的元素。 */
const hosts = new WeakMap<Element, {root: Root; container: HTMLElement; text: string}>()

/**
 * 在读数那一截旁边放上（或更新）数字轮。
 *
 * 读数形状对不上就什么都不做：调用方照旧留着原文本。
 * @param host - 容器挂载的元素：读数那一截的父级，React 不管它的直接子节点。
 * @param reading - 读数那一截元素；只用来挂让位标记。
 * @param text - 当前读数，`26%` 这样。
 * @returns 这一帧接上了没有。
 */
export function paintReel(host: HTMLElement, reading: HTMLElement, text: string): boolean {
    if (READING_PATTERN.exec(text) === null) return false
    reading.setAttribute(REEL_TAKEOVER_ATTRIBUTE, '')
    const existing = hosts.get(host)
    if (existing !== undefined && existing.container.isConnected) {
        if (existing.text === text) return true
        existing.text = text
        existing.root.render(<DigitReel text={text} rolling spoken={false}/>)
        return true
    }
    // 上一棵已经不在这棵树里（dsh 把那个父级连同我们一起换掉了）：先卸掉再重挂。
    if (existing !== undefined) existing.root.unmount()
    const container = document.createElement('span')
    container.className = REEL_HOST_CLASS
    host.appendChild(container)
    const root = createRoot(container)
    root.render(<DigitReel text={text} rolling spoken={false}/>)
    hosts.set(host, {root, container, text})
    return true
}

/**
 * 卸下这一处的数字轮：原文本回到原样。
 * @param reading - 读数那一截元素；让位标记挂在它上面，容器在它的父级里。
 */
export function releaseReel(reading: HTMLElement): void {
    const host = reading.parentElement
    const existing = host === null ? undefined : hosts.get(host)
    if (host !== null && existing !== undefined) {
        existing.root.unmount()
        existing.container.remove()
        hosts.delete(host)
    }
    reading.removeAttribute(REEL_TAKEOVER_ATTRIBUTE)
}