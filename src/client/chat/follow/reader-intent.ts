/**
 * 读者接管滚动的意图。
 *
 * 判据只有一条：读者是不是自己动了手。落在输入区里不算，那是读者在打字；按键里只有会滚动视口的那几个算，
 * 其余是打字与编辑。
 * 它当年由三处共用，跟随那两块删掉之后只剩折叠收尾一处。判据仍留在这里，不并回调用点：它认的那组滚动键
 * 与 dsh 自己的一致，与谁在调无关
 */
import {COMPOSER_SELECTOR, SCROLL_KEYS} from "../../dom-contract"

// 落在输入区里、或是与滚动无关的按键时为假
export function isReaderScrollIntent(event: Event): boolean {
	if (event.target instanceof Element && event.target.closest(COMPOSER_SELECTOR) !== null) return false
	if (event.type !== "keydown") return true
	return event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key)
}
