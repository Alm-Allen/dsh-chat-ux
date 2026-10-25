/**
 * 把聊天区的滚动位置交还给 dsh 的跟随。
 *
 * 先钉到底；没有产生滚动事件时再看五眼 following-tail 属性，仍关着才点 dsh 的「回到底部」。
 * 折叠收尾调用它，调用方可用 stillWanted 在读者接管滚动后立刻作废。
 */

import {CHAT_FLOW_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_SELECTOR} from '../../dom-contract'

/** 折叠收尾之后盯几眼。dsh 关掉跟随常常比折叠晚一步——它要等采样结算。 */
export const FOLLOW_LOOK_ROUNDS = 5

/** 两眼之间隔多久；五眼正好盖过它那个五百毫秒的采样窗口。 */
export const FOLLOW_LOOK_INTERVAL_MS = 100

/** 看满几眼用掉的时间，给调用方算自己那份监听的生命周期。 */
export const FOLLOW_LOOK_TOTAL_MS = FOLLOW_LOOK_ROUNDS * FOLLOW_LOOK_INTERVAL_MS

/**
 * 一次交还的边界。
 */
export interface FollowEnsure {
    /**
     * 每一眼之前问一次：这一次交还还作不作数。
     *
     * 交还通常晚于触发它的事件几百毫秒，这中间读者随时可能自己接管滚动，而他的意图只能从事件上
     * 看出来（折叠那一侧就是这么盯的）。返回假就立刻作罢，剩下的眼不再看。
     */
    readonly stillWanted?: () => boolean
    /** 这一轮看完了（作罢、点过按钮、或者看满），用来撤掉调用方自己挂的监听。 */
    readonly onSettled?: () => void
}

/** 会话的滚动容器。dsh 的跟随与折叠动画都挂在它身上。 */
function conversationScroller(): HTMLElement | null {
    return document.querySelector<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
}

/**
 * 确保会话重新跟上底部，并在必要时把 dsh 的跟随一起点亮。
 */
export function ensureFollowTail(ensure: FollowEnsure = {}): void {
    const stillWanted = ensure.stillWanted ?? ((): boolean => true)
    const scroller = conversationScroller()
    if (scroller === null) {
        ensure.onSettled?.()
        return
    }
    // 先把位置钉到底：读者该在的地方先回到那里。这一步顺带处理掉「跟随还开着、只是没跟上」——
    // 那种情形下 dsh 的归属判定会把这一下认成读者到底，于是重新点亮跟随并清掉采样窗口。
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0.5) {
        scroller.scrollTop = scroller.scrollHeight
    }
    let rounds = 0
    const look = (): void => {
        if (!stillWanted() || rounds >= FOLLOW_LOOK_ROUNDS) {
            ensure.onSettled?.()
            return
        }
        rounds += 1
        // 位置钉住了不等于跟随也回来了：归属判定可能比这一次晚一步才把跟随关掉，而那之后它只认
        // 自己那个「回到底部」按钮。
        if (document.querySelector(FOLLOWING_TAIL_SELECTOR) === null) {
            // 跟随关掉时 `data-chat-following-tail` 已经没了，只能顺着列自己那三层往回找它的框
            // （从列到滚动框再到框架），按钮就挂在框架的下一个兄弟上。
            const column = document.querySelector<HTMLElement>(CHAT_FLOW_SELECTOR)
            const root = column?.parentElement?.parentElement ?? null
            const button = root?.nextElementSibling?.querySelector<HTMLElement>('button') ?? null
            if (button !== null) {
                button.click()
                ensure.onSettled?.()
                return
            }
        }
        window.setTimeout(look, FOLLOW_LOOK_INTERVAL_MS)
    }
    window.setTimeout(look, FOLLOW_LOOK_INTERVAL_MS)
}
