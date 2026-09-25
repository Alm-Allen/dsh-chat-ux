/**
 * 读者接管滚动的意图。
 *
 * 三处都盯着同一件事——读者是不是自己动了手：跟随守护要因此让位，折叠收尾要因此作废那次交还，
 * 组体跟随要因此停止补齐。判据于是放在一处，免得三份在各自的改动里慢慢分叉。
 *
 * 判据只有两条，三条路都一样：
 *
 *   落在输入区不算  指针与按键落在 `[data-composer-seat]` 里，那是读者在打字，不是在接管滚动。
 *   滚动键才算按键  键盘有一半是打字与编辑，只有会滚动视口的那几个键与滚动有关——认的那一组
 *                   与 dsh 自己的一致。
 *
 * 监听哪些事件类型仍由各处自己定：三处认的集合不同（折叠那一处只认会带来显式位移的那几种，
 * 组体那一处还要 touchmove），那是各自的判断，不是这个契约的一部分。
 *
 * @module dsh-chat-ux/client/reader-intent
 */
import { COMPOSER_SELECTOR, SCROLL_KEYS } from './dom-contract'

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
