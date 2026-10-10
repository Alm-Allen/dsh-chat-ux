/**
 * 老版坞（dsh 0.2.0-rc.2 及更早）里 dsh 自己画的那一枚用量胶囊：让位给插件这一枚。
 *
 * 新版从 `0.2.1-alpha.1` 起把坞拆成两个座位条目（`activity` order 0、`usage` order 1），插件按
 * `usage` 注册、靠 priority 更低遮蔽内置那一枚，所以内置的那个**根本不会渲染**。老版只有一个条目
 * `stats`，整行都是 dsh 的：按 id 遮蔽不了，插件这一枚只会**多出来一枚**（命中率并列两个读数）。
 * 这一处就在 DOM 上把内置那一枚收起来，让老版上看到的也是「速度 + 插件这一枚」。
 *
 * 判据是「统计数据行里的直接子元素中、读数带百分号的那个」：简洁档里那一行是两个 `span.pill`（速度、
 * 命中率），详细档里是两个 `span.anchor`（时间、用量），两种形态里只有用量那一枚带百分号。
 *
 * 收起来只是 `display: none`——内置那一枚仍在 DOM 里、仍按 dsh 自己的口径算，插件卸下时属性一撤就
 * 回来。这一枚不在场时**必须**不收起它（否则整行会空掉，见 `cache-hit-pill` 里那道闸门）。
 *
 * @module dsh-chat-ux/client/chat/cache-hit/legacy-usage-pill
 */
import {COMPOSER_STATS_ROW_SELECTOR} from '../../dom-contract'
import {CACHE_HIT_SHADOWED_ATTRIBUTE} from './cache-hit-styles'

/** 用量那一枚的读数形状：命中率总带百分号，速度那枚不带。 */
const USAGE_READING_PATTERN = /\d+(?:\.\d+)?%/

/**
 * 把内置那一枚用量胶囊收起来。
 * @returns 卸下观察者，并把写过的属性撤干净。
 */
export function hideLegacyUsagePill(): () => void {
    let frame = 0

    /** 对账：统计行里带百分号的那一枚挂上收起标记。 */
    const sync = (): void => {
        for (const row of document.querySelectorAll(COMPOSER_STATS_ROW_SELECTOR)) {
            for (const candidate of row.children) {
                if (!(candidate instanceof HTMLElement)) continue
                if (!USAGE_READING_PATTERN.test(candidate.textContent ?? '')) continue
                if (candidate.hasAttribute(CACHE_HIT_SHADOWED_ATTRIBUTE)) continue
                candidate.setAttribute(CACHE_HIT_SHADOWED_ATTRIBUTE, '')
            }
        }
    }

    sync()
    const observer = new MutationObserver(() => {
        // 流式期间每一段字符变化都会叫到这里，所以只登记一帧：一帧最多认一次。
        if (frame !== 0) return
        frame = requestAnimationFrame(() => {
            frame = 0
            sync()
        })
    })
    observer.observe(document.body, {subtree: true, childList: true, characterData: true})

    return () => {
        observer.disconnect()
        if (frame !== 0) cancelAnimationFrame(frame)
        for (const shaded of document.querySelectorAll('[' + CACHE_HIT_SHADOWED_ATTRIBUTE + ']')) {
            shaded.removeAttribute(CACHE_HIT_SHADOWED_ATTRIBUTE)
        }
    }
}
