/**
 * 运行中的过程组默认展开，等这一段过程结束（最终正文该出来了）再收回去。
 *
 * dsh 把一轮里相邻的过程内容——思考、工具、命令、写文件——收进一个过程组，组的开合由它自己那个
 * 行内控件管。「简洁」与「详细」两档下组体一开始是收起的，读者得自己点开才看得见模型正在做什么；
 * 「完全展开」档下运行中的组体本来就开着、组头也不画，所以本模块在那一档什么都不会做。
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

import { beginProgrammaticToggle, endProgrammaticToggle, isProgrammaticToggle } from './token-motion'

/** dsh 给每一个过程组放的属性。 */
export const GROUP_SELECTOR = '[data-step-process]'

/** 组头那个开合控件。 */
const HEADER_SELECTOR = 'button[data-process-activity]'

/** 组体；收起时带 `hidden`。 */
const BODY_SELECTOR = '[data-step-process-body]'

/** 组头里的 shimmer：在，就说明这一段过程还没结束。 */
const RUNNING_SELECTOR = '[data-text-shimmer]'

/** 这一段过程还在跑。 */
const RUNNING = 'running'

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
    for (const group of document.querySelectorAll(GROUP_SELECTOR)) {
      const header = group.querySelector(HEADER_SELECTOR)
      const body = group.querySelector(BODY_SELECTOR)
      if (!(header instanceof HTMLElement) || body === null) continue
      const phase = header.querySelector(RUNNING_SELECTOR) === null ? CLOSED : RUNNING
      // 这个阶段里读者已经决定过这个组的开合，别碰它。
      if (touchedIn.get(group) === phase) continue
      if (body.hasAttribute('hidden') === (phase === CLOSED)) continue
      // 一次没引起变化的点击，下一次也不会引起变化。
      if (attemptedIn.get(group) === phase) continue
      attemptedIn.set(group, phase)
      // 这一次点击是本模块派的：折叠守卫与思考行那一侧都不该把它当成读者的意图。
      beginProgrammaticToggle()
      try {
        header.click()
      } finally {
        endProgrammaticToggle()
      }
    }
  }

  /** 记住是读者、而不是本模块刚刚决定了一个组的开合。 */
  const rememberReaderTouched = (event: Event): void => {
    if (isProgrammaticToggle()) return
    const target = event.target
    if (!(target instanceof Element)) return
    const group = target.closest(GROUP_SELECTOR)
    if (group === null) return
    const header = group.querySelector(HEADER_SELECTOR)
    touchedIn.set(group, header !== null && header.querySelector(RUNNING_SELECTOR) !== null ? RUNNING : CLOSED)
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
