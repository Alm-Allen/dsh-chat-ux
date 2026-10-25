/**
 * 把数字轮挂进 dsh 自己渲染的那串读数旁边。
 *
 * 读数不是座位，只能从 DOM 上认；轮子必须挂在读数的父级，不能塞进读数节点，否则 React 重设
 * textContent 时会把它清掉。原读数保留给读屏。
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