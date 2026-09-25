/**
 * 运行中的过程组默认展开，等这一段过程结束（最终正文该出来了）再收回去。
 *
 * dsh 把一轮里相邻的过程内容——思考、工具、命令、写文件——收进一个过程组，组的开合由它自己那个
 * 行内控件管。「简洁」与「标准」两档下组体一开始是收起的，读者得自己点开才看得见模型正在做什么。
 * 「详细」档只给已经结束的轮次画组头，运行中的组体本来就开着；「完全展开」档连组头都不画。后两档
 * 里没有可切换的组，本模块什么都不做。
 *
 * 判断一个组处在哪个阶段，看的是组头里的 shimmer：dsh 只在过程段还没结束时给它挂
 * `data-text-shimmer`。判断组体开合看它自己的 `hidden`——dsh 用可搜索的隐藏，收起时设
 * `hidden="until-found"`，展开时整个摘掉。两个都是语义属性，不像它们周围的类名那样跟着每次构建变。
 * 组内的命令卡片也用 shimmer，所以阶段只在组头里查，不在整组里查。
 *
 * 组仍然归读者所有：读者在某阶段里碰过某个组，本模块在这个阶段内不再动它。让位按阶段算——过程还
 * 在跑时读者把组折起来，说明他此刻不想看；这一段结束后收起本来也就没有意义了。
 *
 * @module dsh-chat-ux/client/process-fold
 */

import { CONVERSATION_SCROLL_SELECTOR, FOLLOW_THRESHOLD_PX, PROCESS_BODY_SELECTOR, PROCESS_GROUP_SELECTOR, RUNNING_STATE } from './dom-contract'
import { beginProgrammaticToggle, endProgrammaticToggle, isProgrammaticToggle } from './programmatic-toggle'

/** 组头那个开合控件。 */
const HEADER_SELECTOR = 'button[data-process-activity]'

/** 组头里的 shimmer：在，就说明这一段过程还没结束。 */
const RUNNING_SELECTOR = '[data-text-shimmer]'

/** dsh 把组头标签与实时细节接起来用的分隔符（`message.turnProcess.separator`，中英文都是它）。 */
const DETAIL_SEPARATOR = ' · '

/** 组根上的标记：这个组的组头此刻带着实时细节（标准或详细档，且这一段过程还没结束）。 */
const LIVE_DETAIL_ATTRIBUTE = 'data-chat-ux-live-detail'

/** 组根上的标记：这个组的组体此刻是展开的。 */
const OPEN_ATTRIBUTE = 'data-chat-ux-open'

/** 组头控件上的属性：标题里只含标签的那半截，供样式表在组体展开时替上。 */
const LABEL_ATTRIBUTE = 'data-chat-ux-label'

/**
 * 组头控件上的自定义属性：那半截标签的渐变半宽。
 * dsh 的 TextShimmer 按「字符数 × 8px」内联同一个量，样式表照着它把替代文本的流光铺成同样的宽窄。
 */
const LABEL_SPREAD_PROPERTY = '--dsh-chat-ux-label-spread'

/**
 * 组头控件的可访问名。替上来的文本是伪元素内容，不进可访问性树；原文本又整块让了位，
 * 所以这个名字只能由这里补。
 */
const LABEL_NAME_ATTRIBUTE = 'aria-label'

/** dsh 的 TextShimmer 给每个字符留的渐变半宽。 */
const SHIMMER_PIXELS_PER_CHARACTER = 8

/** 这一段过程已经结束，最终正文该出来了。 */
const CLOSED = 'closed'

/**
 * 给整页安装过程组的自动展开与收起。
 * @returns disposer：断开 observer 并摘掉两个监听。
 */
export function installProcessFold(): () => void {
  /** 读者最后一次碰某个组时，那个组处在哪个阶段。 */
  const touchedIn = new WeakMap<Element, string>()
  /** 某个组最后一次被尝试切换时处在哪个阶段，所以没引起变化的点击不会被反复重试。 */
  const attemptedIn = new WeakMap<Element, string>()
  /** 是否已经排了一次扫描。 */
  let scanQueued = false

  /** 把每个组拉到它当前阶段该有的样子。 */
  const syncEveryGroup = (): void => {
    for (const group of document.querySelectorAll(PROCESS_GROUP_SELECTOR)) {
      const header = group.querySelector(HEADER_SELECTOR)
      const body = group.querySelector(PROCESS_BODY_SELECTOR)
      if (!(header instanceof HTMLElement) || body === null) continue
      const phase = header.querySelector(RUNNING_SELECTOR) === null ? CLOSED : RUNNING_STATE
      // 带实时细节的档位把这一段的细节接在组头标签后面，而那一段正是组内思考行正在出的字——组体
      // 开着的时候两处一起出字。detail 与标签在同一个文本节点里，CSS 切不开，所以把标签那半截单独
      // 写到属性上，样式表在组体展开时用它替掉整段文本。
      const headerText = header.textContent ?? ''
      const separatorAt = headerText.indexOf(DETAIL_SEPARATOR)
      const detailed = separatorAt >= 0
      group.toggleAttribute(LIVE_DETAIL_ATTRIBUTE, detailed)
      group.toggleAttribute(OPEN_ATTRIBUTE, !body.hasAttribute('hidden'))
      if (detailed) {
        const label = headerText.slice(0, separatorAt)
        header.setAttribute(LABEL_ATTRIBUTE, label)
        header.setAttribute(LABEL_NAME_ATTRIBUTE, label)
        const spread = `${label.length * SHIMMER_PIXELS_PER_CHARACTER}px`
        // 这条路径每个扫描帧都会走到，值没变就别再写一次。
        if (header.style.getPropertyValue(LABEL_SPREAD_PROPERTY) !== spread) {
          header.style.setProperty(LABEL_SPREAD_PROPERTY, spread)
        }
      } else header.removeAttribute(LABEL_NAME_ATTRIBUTE)
      // 这个阶段里读者已经决定过这个组的开合，别碰它。
      if (touchedIn.get(group) === phase) continue
      if (body.hasAttribute('hidden') === (phase === CLOSED)) continue
      // 一次没引起变化的点击，下一次也不会引起变化。
      if (attemptedIn.get(group) === phase) continue
      attemptedIn.set(group, phase)
      // dsh 的组头 onClick 里有 focus()，那是给真实点击准备的。程序化点击不该把焦点从读者手里拿走，
      // 否则浏览器会给刚开合的组头画一圈焦点框，看着像有人按了 Tab。
      const previousFocus = document.activeElement
      // 同一个 focus() 还会把组头滚进视口，而那次 scroll 在 dsh 眼里和读者自己滚一下没有区别：跟随
      // 被挂起 500ms 采样（pending），这期间 onResize 直接返回不跟随，等它终于跑时内容已经长出去一截，
      // nearBottom 判否，跟随就此关掉——而读者一下都没碰过键鼠。所以这一段结束后把滚动位置放回去。
      const scroller = header.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
      const scrollTop = scroller === null ? null : scroller.scrollTop
      // 贴底与否要在点击之前量：这一下点击自己就会改布局。
      const wasAtBottom = scroller !== null
        && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= FOLLOW_THRESHOLD_PX
      // 这一次点击是本模块派的：折叠守卫与思考行那一侧都不该把它当成读者的意图。
      beginProgrammaticToggle()
      try {
        header.click()
      } finally {
        endProgrammaticToggle()
      }
      // 位置要放回去，但不能把贴底的读者放到离底一截的地方：这一次写同样是一次滚动，会被 dsh
      // 认成读者移动，跟随就此关掉。贴底时直接钉到底。
      if (scroller !== null && scrollTop !== null && scroller.scrollTop !== scrollTop) {
        scroller.scrollTop = wasAtBottom ? scroller.scrollHeight : scrollTop
      }
      // 读者本来就停在组头上时，这一句会把焦点放回原处，等于什么都没发生。
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
      if (document.activeElement === header) header.blur()
    }
  }

  /** 记住是读者、而不是本模块刚刚决定了一个组的开合。 */
  const rememberReaderTouched = (event: Event): void => {
    if (isProgrammaticToggle()) return
    const target = event.target
    if (!(target instanceof Element)) return
    const group = target.closest(PROCESS_GROUP_SELECTOR)
    if (group === null) return
    const header = group.querySelector(HEADER_SELECTOR)
    touchedIn.set(group, header !== null && header.querySelector(RUNNING_SELECTOR) !== null ? RUNNING_STATE : CLOSED)
  }

  // 流式输出改 DOM 的速度远快于这件事需要跑的速度，所以每帧最多扫一次。
  const observer = new MutationObserver(() => {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(() => {
      scanQueued = false
      syncEveryGroup()
    })
  })
  observer.observe(document.body ?? document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-text-shimmer', 'hidden'],
  })
  document.addEventListener('click', rememberReaderTouched, true)
  document.addEventListener('keydown', rememberReaderTouched, true)
  syncEveryGroup()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', rememberReaderTouched, true)
    document.removeEventListener('keydown', rememberReaderTouched, true)
  }
}
