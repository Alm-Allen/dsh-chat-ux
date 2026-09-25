/**
 * 跟随守护：在「思考结束」「出现工具调用」这些时刻，刻意把聊天区交还给 dsh 的跟随。
 *
 * dsh 的跟随偶尔会丢，而丢的那一刻几乎总是结构事件的时刻：思考行收起、工具行插入、过程组开合。
 * 它们同时做两件事——让滚动位置离开地线，又让内容成片到达，而这两件事落在同一个五百毫秒的采样
 * 窗口里，结算时位置早已离底，跟随就此关掉。读者一下都没碰过键鼠。交还本身怎么做、为什么是
 * 「先钉底、再点按钮」这两步，见 `follow-tail.ts`。
 *
 * 这一处只负责**挑时刻**：
 *
 *   结构时刻   新插入的流块（`[data-chat-flow-key]`）或工具调用行（`[data-chat-call-id]`）；
 *              思考行的 `data-state` 从 `running` 停下来。工具调用不一定自成流块——它住在
 *              assistant 节点内部——所以两族各有自己的锚点。
 *   守护        `data-chat-following-tail` **从有到无**。用转变而不是「当前没有」：切会话、
 *              恢复上次阅读位置时它本来就是关的，那一种是读者自己选的位置。
 *
 * 读者永远优先。他一旦用滚轮、触摸、指针或滚动键离开底部，此后直到他自己回到底部（或者自己点了
 * 「回到底部」）为止，这一处一概不动手——真正要修的本来就是「读者没碰过键鼠」的那一类丢失。
 * 交还的动作还要再让开折叠动画那两百毫秒，否则卷帘门正拉着，位置跟着动，看起来是抖。
 *
 * @module dsh-chat-ux/client/follow-guard
 */

import { isFoldGlideBusy } from './fold-glide'
import { conversationScroller, ensureFollowTail, isAtBottom } from './follow-tail'

/** 每个流块带一个。新块插进来，就是这一段流又往前走了。 */
const FLOW_BLOCK_SELECTOR = '[data-chat-flow-key]'

/** 工具调用行自己带一个；它住在 assistant 节点内部，不必是新流块。 */
const CALL_SELECTOR = '[data-chat-call-id]'

/** 上面两族合成一条，用来判断一批新增节点里有没有值得动手的东西。 */
const STRUCTURE_SELECTOR = FLOW_BLOCK_SELECTOR + ', ' + CALL_SELECTOR

/** 思考行；它的阶段看 `data-state`。 */
const THINK_ROW_SELECTOR = '[data-variant="think"]'

/** 模型还在思考时的阶段值。 */
const THINK_RUNNING = 'running'

/** 现在有内容正在流。有它，才有「跟随」可言。 */
const STREAMING_SELECTOR = '[data-streaming], [data-text-shimmer]'

/** 跟随开着时挂在聊天框架上的语义属性。 */
const FOLLOWING_ATTRIBUTE = 'data-chat-following-tail'

/** 输入区。落在它里面的指针与按键是读者在打字，不是在接管滚动。 */
const COMPOSER_SELECTOR = '[data-composer-seat]'

/** 会滚动视口的按键；其余的（打字、复制）与滚动无关。与 dsh 自己认的那一组一致。 */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/** 读者接管滚动的意图。与 dsh 自己的 `READING_INTENTS` 同源。 */
const INTENT_TYPES = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'beforematch'] as const

/** 两次交还之间至少隔这么久，免得一串工具调用把位置按在底部反复写。 */
const MIN_INTERVAL_MS = 200

/**
 * 刚刚还有结构变化，就算「正在执行」。
 *
 * 守护那一侧看的是 `data-chat-following-tail` 的消失，而它在会话切换、历史恢复里也会消失——
 * 那些场合页面上没有流式内容，也没有新鲜的结构变化。留一段宽限，让「刚插入的工具行」也算执行中，
 * 免得属性比流式标记早半步消失时错过。
 */
const ACTIVITY_GRACE_MS = 2000

/** 折叠动画在飞时等一等；等几轮还没完就放弃这一轮。 */
const FOLD_WAIT_MS = 150
const FOLD_WAIT_ATTEMPTS = 4

/**
 * 给整页安装跟随守护。
 * @param readEnabled - 读此刻生效的开关；关着时一次都不动手。
 * @returns disposer：断开 observer 并摘掉意图监听。
 */
export function installFollowGuard(readEnabled: () => boolean): () => void {
  /** 读者上一次接管滚动之后，有没有自己回到底部。 */
  let readerTookOver = false
  /** 上一次真正交还的时刻，用来节流。 */
  let lastEnsureAt = 0
  /** 最后一次见到结构变化的时刻。 */
  let lastActivityAt = 0
  let scanQueued = false
  /** 这一批变化里有结构事件 / 跟随被关掉。 */
  let structureSeen = false
  let guardSeen = false

  /**
   * 读者是不是正在上面看。
   *
   * 他只置位一次，之后靠位置自己解除：回到地线以内，就说明他看完了（或者自己点了按钮）。这样不
   * 需要一个「多久没动静就算放弃」的定时器——那一种会在读者慢慢读的时候把他拽回去。
   */
  const readerAway = (): boolean => {
    if (!readerTookOver) return false
    const scroller = conversationScroller()
    // 拿不到滚动容器时保守处理：当作他还在上面，这一轮不动手。
    if (scroller === null) return true
    if (!isAtBottom(scroller)) return true
    readerTookOver = false
    return false
  }

  /** 此刻算不算「正在执行」。 */
  const running = (): boolean =>
    document.querySelector(STREAMING_SELECTOR) !== null
    || performance.now() - lastActivityAt <= ACTIVITY_GRACE_MS

  /**
   * 把这一轮的跟随交还出去。位置、读者意图、折叠动画三道都放行才算数。
   * @param attempt - 已经因为折叠动画推迟过几次。
   */
  const ensure = (attempt = 0): void => {
    if (!readEnabled()) return
    if (readerAway()) return
    const scroller = conversationScroller()
    if (scroller === null) return
    // 离底超过一屏就不动手：那是读者自己在看上面，不是跟随丢了一步。
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > scroller.clientHeight) return
    // 折叠动画正把高度拉着走，位置此刻归它管；插进去只会让卷帘门抖一下。
    if (isFoldGlideBusy()) {
      if (attempt >= FOLD_WAIT_ATTEMPTS) return
      window.setTimeout(() => { ensure(attempt + 1) }, FOLD_WAIT_MS)
      return
    }
    const now = performance.now()
    if (now - lastEnsureAt < MIN_INTERVAL_MS) return
    lastEnsureAt = now
    ensureFollowTail({ stillWanted: () => !readerAway() })
  }

  /** 一批变化看完了，决定要不要动手。 */
  const settle = (): void => {
    const structure = structureSeen
    const guarded = guardSeen
    structureSeen = false
    guardSeen = false
    // 守护那一侧要多一道「正在执行」：属性消失本身也可能是会话切换或历史恢复。
    if (!structure && !(guarded && running())) return
    ensure()
  }

  const queue = (): void => {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(() => {
      scanQueued = false
      settle()
    })
  }

  /** 这一批新增的节点里有没有流块或工具调用行。 */
  const marksStructure = (node: Node): boolean => {
    if (!(node instanceof Element)) return false
    return node.matches(STRUCTURE_SELECTOR) || node.querySelector(STRUCTURE_SELECTOR) !== null
  }

  /**
   * 记下读者接管滚动的意图。
   *
   * 只有内容真的长出了滚动条才算：那之前读者怎么滚都滚不动，置位只会让守护白等一轮。落在输入区里
   * 的指针与按键也不算——那时他在打字。
   */
  const noteReaderIntent = (event: Event): void => {
    if (event.target instanceof Element && event.target.closest(COMPOSER_SELECTOR) !== null) return
    if (event.type === 'keydown' && !(event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key))) return
    const scroller = conversationScroller()
    if (scroller === null || scroller.scrollHeight - scroller.clientHeight <= 0) return
    readerTookOver = true
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        // 跟随从有到无：dsh 刚刚把它关掉。
        if (record.attributeName === FOLLOWING_ATTRIBUTE) {
          if (record.target instanceof Element && !record.target.hasAttribute(FOLLOWING_ATTRIBUTE)) guardSeen = true
          continue
        }
        // 思考行从「正在思考」停下来：这一段过程的分界点。
        if (record.oldValue === THINK_RUNNING
          && record.target instanceof Element
          && record.target.matches(THINK_ROW_SELECTOR)
          && record.target.getAttribute('data-state') !== THINK_RUNNING) {
          lastActivityAt = performance.now()
          structureSeen = true
        }
        continue
      }
      for (const node of record.addedNodes) {
        if (!marksStructure(node)) continue
        lastActivityAt = performance.now()
        structureSeen = true
      }
    }
    if (structureSeen || guardSeen) queue()
  })

  for (const type of INTENT_TYPES) {
    document.addEventListener(type, noteReaderIntent, { capture: true, passive: true })
  }
  observer.observe(document.body ?? document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-state', FOLLOWING_ATTRIBUTE],
    attributeOldValue: true,
  })

  return () => {
    observer.disconnect()
    for (const type of INTENT_TYPES) document.removeEventListener(type, noteReaderIntent, true)
  }
}
