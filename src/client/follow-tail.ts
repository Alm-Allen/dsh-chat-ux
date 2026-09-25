/**
 * 把聊天区的滚动位置交还给 dsh 的跟随。
 *
 * dsh 的跟随会被一次「像读者移动、又没到底」的滚动关掉：那种滚动把它挂进 500 ms 的采样窗口
 * （窗口里 `onResize` 直接返回，内容怎么长都不跟随），结算时位置离底超过它的阈值就关。判据本身
 * 是**位置比较**，不是「谁在滚」——所以 dsh 自己的 `focus()`、浏览器的 clamp、以及任何程序化
 * 写入，都会被记成「读者移动了」。一段执行里最容易撞上这一格的就是那些结构时刻：思考行收起、
 * 工具行插入、过程组开合，它们同时制造一次位置变化和一段成片到达的内容。
 *
 * dsh 自己留了一个重开入口：跟随关掉时才渲染的那个「回到底部」按钮，`onClick` 里是
 * `reading.followTail()`——清掉采样窗口、重新点亮跟随、立即到底。这一处把两条路都用上：
 *
 *   钉到底   `scrollTop = scrollHeight`（浏览器自己 clamp 到地线）。只要真的产生了位移，dsh 的
 *            `onScroll` 就会走「读者到底」那一支——**它不检查跟随当前是开是关**，于是重亮跟随
 *            并清掉采样窗口。位置本来就在地线上时，这一下什么都不发生。
 *   点按钮   没有位移就没有滚动事件，钉到底于是成了空操作。**一段执行刚开头、内容还没长出滚动条
 *            时正是这一格**：地线是 0、位置也是 0，写多少都是 0。这一格只有按钮有效——它调的
 *            `followTail()` 无条件把跟随点亮，不需要任何位移。
 *
 * 所以顺序是先钉底、再看几眼属性、属性没回来才点按钮。看几眼是必要的：dsh 关掉跟随常常比触发它
 * 的事件晚一步，它得等采样结算；五眼正好盖过它那五百毫秒的窗口。
 *
 * @module dsh-chat-ux/client/follow-tail
 */

import { CHAT_FLOW_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOW_THRESHOLD_PX } from './dom-contract'

/** dsh 的跟随开着时给聊天框架发的语义属性；它没了，就说明跟随已经被关掉了。 */
const FOLLOWING_TAIL_SELECTOR = '[data-chat-following-tail]'

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
export function conversationScroller(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
}

/**
 * 读者此刻是不是贴着会话底部，用的是 dsh 自己的那条线。
 * @param scroller - 会话的滚动容器。
 * @returns 离地线不超过 dsh 的阈值时为真。
 */
export function isAtBottom(scroller: HTMLElement): boolean {
  return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= FOLLOW_THRESHOLD_PX
}

/**
 * 确保会话重新跟上底部，并在必要时把 dsh 的跟随一起点亮。
 * @param ensure - 这一轮交还的边界；省略表示交给谁都不问，自己看完五眼。
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
      const button = toBottomButton()
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

/**
 * dsh 那个「回到底部」按钮。它只在跟随关掉时渲染，位置是聊天列所在那个框的下一个兄弟。
 * @returns 按钮；认不出来时为 null。
 */
function toBottomButton(): HTMLElement | null {
  // 跟随关掉时 `data-chat-following-tail` 已经没了，只能顺着列自己那三层往回找它的框
  // （列 → 滚动框 → 框架），按钮就挂在框架的下一个兄弟上。
  const column = document.querySelector<HTMLElement>(CHAT_FLOW_SELECTOR)
  const root = column?.parentElement?.parentElement ?? null
  return root?.nextElementSibling?.querySelector<HTMLElement>('button') ?? null
}
