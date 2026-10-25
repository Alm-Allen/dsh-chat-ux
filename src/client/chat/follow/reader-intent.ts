/**
 * 读者接管滚动的意图判据。
 *
 * 落在输入区里的指针和按键不算接管；键盘只认会滚动视口的键。事件类型由调用方决定。
 */
import {COMPOSER_SELECTOR, SCROLL_KEYS} from '../../dom-contract'

/**
 * 一次事件是不是读者接管滚动的意图。
 */
export function isReaderScrollIntent(event: Event): boolean {
    if (event.target instanceof Element && event.target.closest(COMPOSER_SELECTOR) !== null) return false
    if (event.type !== 'keydown') return true
    return event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key)
}
