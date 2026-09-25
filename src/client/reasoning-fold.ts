/**
 * 模型还在思考时让思考行开着，思考一停就把它收回去。
 *
 * dsh 发出来的思考行一律是收起的——它自己的 README 就是这么写的，而 `ReasoningRow` 用一个朴素的
 * `useState(false)` 把它固定在那儿。没有任何设置项暴露这件事，所以这一行自己的展开控件就是插件
 * 唯一能扳的杆。好在这根杆至少是稳定的：这一行带着 `data-variant="think"`、`data-state`（模型
 * 还在思考时是 `running`，停下来之后是 `ok`）和 `data-expanded`——都是语义属性，不像它们周围
 * 那些跟着 dsh 每次构建变化的带 hash 类名。
 *
 * 这一行仍然归读者所有。在行内点一下或按一下键，会记下当时所处的阶段，本模块在这个阶段之内不再
 * 动它：思考到一半把行折起来就让它折着，把已经停稳的行展开就让它开着。这个让位刻意按阶段算、
 * 而不是按行算——读者在模型还在思考时把行折起来又展开，并没有要求「等思考完了也一直开着」，所以
 * `ok` 到来时该收还是收。
 *
 * @module dsh-chat-ux/client/reasoning-fold
 */

import { RUNNING_STATE, THINK_ROW_SELECTOR } from './dom-contract'
import { beginProgrammaticToggle, endProgrammaticToggle, isProgrammaticToggle } from './programmatic-toggle'

/**
 * 给整页安装思考行展开。
 * @returns disposer：断开 observer 并摘掉两个监听。
 */
export function installReasoningFold(): () => void {
  /** 读者最后一次碰某一行时，那一行处在哪个阶段。 */
  const touchedIn = new WeakMap<Element, string>()
  /** 某一行最后一次被尝试切换时处在哪个阶段，所以没引起变化的点击不会被反复重试。 */
  const attemptedIn = new WeakMap<Element, string>()
  /** 是否已经排了一次扫描。 */
  let scanQueued = false

  /**
   * 把每一行拉到它当前阶段该有的样子。
   *
   * 控件是哪种，取决于 dsh 怎么配置这个展开区：`expandOnRowClick` 为真时整行就是按钮，否则是
   * 左侧那个 chevron。「第一个像按钮的后代」这一条同时覆盖两种，而不必依赖这一次构建选了哪一种。
   */
  const syncEveryRow = (): void => {
    for (const row of document.querySelectorAll(THINK_ROW_SELECTOR)) {
      const phase = row.getAttribute('data-state') ?? ''
      if (phase === '') continue
      // 这个阶段里读者已经决定过这一行的状态，别碰它。
      if (touchedIn.get(row) === phase) continue
      if (row.hasAttribute('data-expanded') === (phase === RUNNING_STATE)) continue
      // 一次没引起变化的点击，下一次也不会引起变化。
      if (attemptedIn.get(row) === phase) continue
      attemptedIn.set(row, phase)
      const control = row.querySelector('[role="button"], button')
      if (!(control instanceof HTMLElement)) continue
      // 下面那个捕获阶段的监听同样会看到这次点击，所以这一段要声明出去：那不是读者要求的。
      // token-motion 的折叠守卫在同一趟事件里也会看到它——否则自动收起会把刚开头的正文
      // 静默掉 400 ms。
      beginProgrammaticToggle()
      try {
        control.click()
      } finally {
        endProgrammaticToggle()
      }
    }
  }

  /** 记住是读者、而不是本模块刚刚决定了一行的状态。 */
  const rememberReaderTouched = (event: Event): void => {
    if (isProgrammaticToggle()) return
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest(THINK_ROW_SELECTOR)
    if (row === null) return
    touchedIn.set(row, row.getAttribute('data-state') ?? '')
  }

  // 流式输出改 DOM 的速度远快于这件事需要跑的速度，所以每帧最多扫一次。
  const observer = new MutationObserver(() => {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(() => {
      scanQueued = false
      syncEveryRow()
    })
  })
  observer.observe(document.body ?? document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['data-state', 'data-expanded'],
  })
  document.addEventListener('click', rememberReaderTouched, true)
  document.addEventListener('keydown', rememberReaderTouched, true)
  syncEveryRow()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', rememberReaderTouched, true)
    document.removeEventListener('keydown', rememberReaderTouched, true)
  }
}

