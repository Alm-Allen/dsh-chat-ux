/**
 * 把聊天区的滚动位置交还给 dsh 的跟随。
 *
 * dsh 的跟随会被一次「像读者移动、又没到底」的滚动关掉，判据是位置比较而不是谁在滚，所以它自己的 focus()、
 * 浏览器的 clamp、任何程序化写入都会被记成读者移动。交还分两步：先把位置钉到底（dsh 的 onScroll 会走
 * 「读者到底」那一支，它不检查跟随当前是开是关），位置本来就在地线上时没有滚动事件、钉底成了空操作，
 * 才去点那枚「回到底部」按钮，它无条件点亮跟随、不需要任何位移。
 * 现在只剩折叠收尾在调它
 */

import {CHAT_FLOW_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_SELECTOR} from "../../dom-contract"

// 折叠收尾之后盯几眼。dsh 关掉跟随常常比折叠晚一步——它要等采样结算下来
export const FOLLOW_LOOK_ROUNDS = 5

// 两眼之间隔多久
export const FOLLOW_LOOK_INTERVAL_MS = 100

// 看满几眼用掉的时间，给调用方算自己那份监听的生命周期；五眼正好盖过它那五百毫秒的采样窗口
export const FOLLOW_LOOK_TOTAL_MS = FOLLOW_LOOK_ROUNDS * FOLLOW_LOOK_INTERVAL_MS

// 一次交还的边界
export interface FollowEnsure {
	// 每一眼之前问一次这一次交还还作不作数：交还通常晚于触发它的事件几百毫秒，这中间读者随时可能自己
	// 接管滚动，而他的意图只能从事件上看出来，返回假就立刻作罢，剩下的眼不再看
	readonly stillWanted?: () => boolean
	// 这一轮看完了（作罢、点过按钮、或者看满），用来撤掉调用方自己挂的监听
	readonly onSettled?: () => void
}

export function ensureFollowTail(handover: FollowEnsure = {}): void {
	const stillWanted = handover.stillWanted ?? ((): boolean => true)
	// 会话的滚动容器，dsh 的跟随与折叠动画都挂在它身上
	const scroller = document.querySelector<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
	if (scroller === null) {
		handover.onSettled?.()
		return
	}
	// 先把位置钉到底：读者该在的地方先回到那里。这一步顺带处理掉「跟随还开着、只是没跟上」——那种情形下
	// dsh 的归属判定会把这一下认成读者到底，于是重新点亮跟随并清掉采样窗口
	if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0.5) {
		scroller.scrollTop = scroller.scrollHeight
	}
	let lookCount = 0
	const lookOnce = (): void => {
		if (!stillWanted() || lookCount >= FOLLOW_LOOK_ROUNDS) {
			handover.onSettled?.()
			return
		}
		lookCount += 1
		// 位置钉住了不等于跟随也回来了：归属判定可能比这一次晚一步才把跟随关掉，那之后它只认自己那枚
		// 「回到底部」按钮
		if (document.querySelector(FOLLOWING_TAIL_SELECTOR) === null) {
			// 跟随关掉时 data-chat-following-tail 已经没了，只能顺着列自己那三层往回找它的框
			// （列、滚动框、框架），按钮挂在框架的下一个兄弟上
			const chatFlowColumn = document.querySelector<HTMLElement>(CHAT_FLOW_SELECTOR)
			const chatFrame = chatFlowColumn?.parentElement?.parentElement ?? null
			const backToBottomButton = chatFrame?.nextElementSibling?.querySelector<HTMLElement>("button") ?? null
			if (backToBottomButton !== null) {
				backToBottomButton.click()
				handover.onSettled?.()
				return
			}
		}
		window.setTimeout(lookOnce, FOLLOW_LOOK_INTERVAL_MS)
	}
	window.setTimeout(lookOnce, FOLLOW_LOOK_INTERVAL_MS)
}
