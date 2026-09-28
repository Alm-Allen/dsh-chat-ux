/**
 * 跟随守护：在「思考结束」「出现工具调用」这些时刻，刻意把聊天区交还给 dsh 的跟随。
 *
 * dsh 的跟随偶尔会丢，而丢的那一刻几乎总是结构事件的时刻：思考行收起、工具行插入、过程组开合。
 * 它们同时做两件事——让滚动位置离开地线，又让内容成片到达，而这两件事落在同一个五百毫秒的采样
 * 窗口里，结算时位置早已离底，跟随就此关掉。读者一下都没碰过键鼠。交还本身怎么做、为什么是
 * 「先钉底、再点按钮」这两步，见 `follow-tail.ts`。
 *
 * 这一处有两层。
 *
 *   按住     跟随还开着的时候，把位置一直维持在地线上（`holdFloor`）。dsh 结算那个五百毫秒窗口时
 *            看到的就是「贴着底」，跟随根本不会关——这是预防。窗口里 dsh 的 `onResize` 直接返回、
 *            `processContent` 也不跟随，而内容在这五百毫秒里能长出一百多像素，结算那一刻的位置早
 *            不是触发时刻的位置，所以纯事后交还补不完这件事。
 *            闸门是 dsh 自己发的 `data-chat-following-tail`：它开着表示 dsh 认领了跟随，我们把位置
 *            维持在地线上正合它意；它关着（跳转/分页中，或读者在看上面）一步都不动，免得把 dsh 自己
 *            的程序化跳转踩掉。
 *
 *   挑时刻   下面这些时刻里跟随已经被关掉了，就把它交还回去。这是兜底，覆盖按住那层判断不成立的
 *            情形（列还没挂上、或属性比内容早半步消失）：
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

import { CHAT_FLOW_SELECTOR, FLOW_BLOCK_SELECTOR, FOLLOWING_TAIL_ATTRIBUTE, FOLLOWING_TAIL_SELECTOR, RUNNING_STATE, SHIMMER_SELECTOR, STREAMING_SELECTOR, THINK_ROW_SELECTOR } from './dom-contract'
import { isFoldGlideBusy } from './fold-glide'
import { conversationScroller, ensureFollowTail, isAtBottom } from './follow-tail'
import { isReaderScrollIntent } from './reader-intent'

/** 工具调用行自己带一个；它住在 assistant 节点内部，不必是新流块。 */
const CALL_SELECTOR = '[data-chat-call-id]'

/** 上面两族合成一条，用来判断一批新增节点里有没有值得动手的东西。 */
const STRUCTURE_SELECTOR = FLOW_BLOCK_SELECTOR + ', ' + CALL_SELECTOR

/** 现在有内容正在流：两个标记都由 dsh 发，有它，才有「跟随」可言。 */
const RUNNING_CONTENT_SELECTOR = STREAMING_SELECTOR + ', ' + SHIMMER_SELECTOR

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
 * 重新对一次「按住」那层观察目标的间隔。
 *
 * 会话切换会把整个聊天列换掉，所以不能只认一次；与 `process-follow.ts` 的 `SYNC_INTERVAL_MS`
 * 同一套做法。
 */
const HOLD_SYNC_INTERVAL_MS = 500

/**
 * 给整页安装跟随守护。
 * @param readEnabled - 读此刻生效的开关；关着时一次都不动手。
 * @returns disposer：断开 observer 并摘掉意图监听。
 */
export function installFollowGuard(readEnabled: () => boolean): () => void {
  /** 读者上一次接管滚动之后，有没有自己回到底部。 */
  let readerTookOver = false
  /** 上一次解析出来的滚动容器。会话切换会把整个框换掉，所以每次用之前核一次还在不在文档里。 */
  let scrollerCache: HTMLElement | null = null
  /** 上一次真正交还的时刻，用来节流。 */
  let lastEnsureAt = 0
  /** 最后一次见到结构变化的时刻。 */
  let lastActivityAt = 0
  let scanQueued = false
  /** 这一批变化里有结构事件 / 跟随被关掉。 */
  let structureSeen = false
  let guardSeen = false
  /** dsh 此刻有没有认领跟随。由 observer 维护，`syncHold` 每五百毫秒兜一次底。 */
  let followingNow = false
  /** 我们自己正在写位置：那一轮 scroll 事件不该被当成新情况再处理一遍。 */
  let holding = false
  /** 聊天列的生长观察者；它在「按住」那层里是唯一的触发源。 */
  let holdObserver: ResizeObserver | null = null
  /** 已观察的聊天列；换会话时它会被换掉，所以每轮核一次。 */
  let holdTarget: Element | null = null

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
    document.querySelector(RUNNING_CONTENT_SELECTOR) !== null
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
   * 只有内容真的长出了滚动条才算：那之前读者怎么滚都滚不动，置位只会让守护白等一轮。什么算读者的
   * 意图交给 `isReaderScrollIntent`——落在输入区里、以及与滚动无关的按键都不算。
   */
  const noteReaderIntent = (event: Event): void => {
    // 接管了就不必再判：这个函数唯一的作用就是置位，而它一旦置位，同一手势里后面那几十个
    // 事件的结果都改不了它。
    if (readerTookOver) return
    if (!isReaderScrollIntent(event)) return
    // 容器缓存下来：滚轮在触控板上能到每秒上百次，而这几次读（全文档查询 + 两个几何值）本来
    // 就落在读者正在滚、布局正被新内容写脏的时刻。
    if (scrollerCache === null || !scrollerCache.isConnected) scrollerCache = conversationScroller()
    const scroller = scrollerCache
    if (scroller === null || scroller.scrollHeight - scroller.clientHeight <= 0) return
    readerTookOver = true
  }

  /**
   * 把位置维持在地线上。
   *
   * 只在 dsh 认领跟随、读者没在接管、折叠动画没在跑、且位置真的离开地线时才写。绝大多数帧在第二、
   * 三个判断上就返回了，所以这个函数本身很轻。
   */
  const holdFloor = (): void => {
    if (holding || !readEnabled()) return
    if (!followingNow) return
    if (isFoldGlideBusy()) return
    if (readerAway()) return
    const scroller = conversationScroller()
    if (scroller === null) return
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 0.5) return
    holding = true
    try {
      scroller.scrollTop = scroller.scrollHeight
    } finally {
      holding = false
    }
  }

  /**
   * 盯住聊天列的生长，并顺手刷新一次跟随属性。
   *
   * 生长是上述窗口里位置离开地线的唯一来源，所以观察它就是按住那层的触发源。列被换掉时重新对表，
   * 否则新会话的位置再也不会被按住。
   */
  const syncHold = (): void => {
    followingNow = document.querySelector(FOLLOWING_TAIL_SELECTOR) !== null
    const column = document.querySelector(CHAT_FLOW_SELECTOR)
    if (column === holdTarget) return
    holdTarget = column
    holdObserver?.disconnect()
    holdObserver = null
    if (column === null || typeof ResizeObserver === 'undefined') return
    holdObserver = new ResizeObserver(() => { holdFloor() })
    holdObserver.observe(column)
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        // 跟随从有到无：dsh 刚刚把它关掉。
        if (record.attributeName === FOLLOWING_TAIL_ATTRIBUTE) {
          if (!(record.target instanceof Element)) continue
          // 属性回来了也记下来：按住那层靠它决定动不动手，而它也可能被 dsh 重新点亮（我们自己
          // 钉底、读者滚回底部、或点那个按钮都会），不能只在消失时更新。
          followingNow = record.target.hasAttribute(FOLLOWING_TAIL_ATTRIBUTE)
          if (!followingNow) guardSeen = true
          continue
        }
        // 思考行从「正在思考」停下来：这一段过程的分界点。
        if (record.oldValue === RUNNING_STATE
          && record.target instanceof Element
          && record.target.matches(THINK_ROW_SELECTOR)
          && record.target.getAttribute('data-state') !== RUNNING_STATE) {
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
  // 挂在 window 的捕获阶段：同一个滚动事件我们先于 dsh 挂在滚动元素上的冒泡监听收到。我们先把
  // 位置钉回地线，dsh 随后读到的几何就是贴底的，于是它走「读者到底」那一支，而不是把位置记成
  // 读者移动、挂出那个五百毫秒的采样窗口。
  //
  // 直接改滚动位置会派发滚动事件，忽略它之后就成回声，holding 就是那道闸。
  window.addEventListener('scroll', holdFloor, { capture: true, passive: true })
  const holdTimer = window.setInterval(syncHold, HOLD_SYNC_INTERVAL_MS)
  syncHold()
  observer.observe(document.body ?? document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-state', FOLLOWING_TAIL_ATTRIBUTE],
    attributeOldValue: true,
  })

  return () => {
    observer.disconnect()
    window.removeEventListener('scroll', holdFloor, true)
    window.clearInterval(holdTimer)
    holdObserver?.disconnect()
    for (const type of INTENT_TYPES) document.removeEventListener(type, noteReaderIntent, true)
  }
}
