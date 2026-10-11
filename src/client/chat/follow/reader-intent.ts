/**
 * 读者接管滚动的意图。
 *
 * 判据只有一条：读者是不是自己动了手。它当年由三处共用（跟随守护让位、折叠收尾作废那次交还、
 * 组体跟随停止补齐），跟随那两块删掉之后只剩折叠收尾一处——但判据仍留在这里，不并回调用点：它认
 * 的那组滚动键与 dsh 自己的一致，与谁在调无关。
 *
 *   落在输入区不算  指针与按键落在 `[data-composer-seat]` 里，那是读者在打字，不是在接管滚动。
 *   滚动键才算按键  键盘有一半是打字与编辑，只有会滚动视口的那几个键与滚动有关——认的那一组
 *                   与 dsh 自己的一致。
 *
 * 监听哪些事件类型仍由各处自己定：三处认的集合不同（折叠那一处只认会带来显式位移的那几种，
 * 组体那一处还要 touchmove），那是各自的判断，不是这个契约的一部分。
 *
 * @module dsh-chat-ux/client/chat/follow/reader-intent
 */
import {COMPOSER_SELECTOR, SCROLL_KEYS} from '../../dom-contract'

/**
 * 一次事件是不是读者接管滚动的意图。
 * @param event - 页面上任意一处指针、触摸或按键事件。
 * @returns 落在输入区里、或是与滚动无关的按键时为假。
 */
export function isReaderScrollIntent(event: Event): boolean {
    if (event.target instanceof Element && event.target.closest(COMPOSER_SELECTOR) !== null) return false
    if (event.type !== 'keydown') return true
    return event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key)
}
