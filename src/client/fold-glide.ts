/**
 * 折叠时把下方内容推开。
 *
 * dsh 的 DisclosureRow 在收起时把展开体整个卸掉（`{open && children}`），所以 CSS 没有可过渡的
 * 旧值——高度动画在聊天区做不到。这一处改用 FLIP：读者点开合控件的那一刻先记下视口内每个流块的
 * 视口坐标，等 DOM 变化后用 `transform` 把它们拉回旧位置，再播放到新位置。布局是一步到位的，
 * 动的是合成层，所以滚动跟随（use-scroll-follow 只读 clientHeight/scrollHeight/scrollTop）看不到
 * 我们，两边不会互相追。
 *
 * 锚点是 dsh 自己发的 `data-chat-flow-key`——每个流块一个，组内成员也有，是 `data-row-key`
 * 在聊天区的对应物，不带构建期 hash。
 *
 * 只认点击。快照靠 click 捕获阶段记录，而 MutationObserver 在变化之后才触发，所以流式追加、
 * 分页加载历史、以及本插件的自动开合都不会有动画——那些场合内容本来就该自然生长。
 *
 * 两处必须小心的地方：
 *   - 流块是嵌套的（过程组里还有成员）。祖先的 transform 会叠到后代身上，所以后代只能补
 *     `自己的绝对位移 − 最近流块祖先的绝对位移`，否则位移会被算两遍。
 *   - 快照只在视口内取。视口外的块读者看不见，也就没有动画的必要，顺带把每次点击的成本
 *     压到十几到几十个元素。
 *
 * @module dsh-chat-ux/client/fold-glide
 */

/** 推开与收回的时长，取侧栏 AnimatedRows 的同档值。 */
const GLIDE_MS = 200
/** 超过这个年纪的快照不再可信（点击后没有发生布局变化，或变化来自别处）。 */
const SNAPSHOT_TTL_MS = 500
/** dsh 给每个流块发的语义锚点。 */
const FLOW_BLOCK_SELECTOR = '[data-chat-flow-key]'
/** 读者用来开合的控件：DisclosureRow 的行，以及所有带展开状态的按钮。 */
const TOGGLE_SELECTOR = '[aria-expanded], [data-disclosure-row]'

/**
 * 装上折叠位移。只有读者点击引起的变化会补动画。
 * @returns 卸载函数。
 */
export function installFoldGlide(): () => void {
  if (typeof document === 'undefined' || document.body === null) return () => {}

  let snapshot: Map<HTMLElement, number> | null = null
  let takenAt = 0
  const running = new WeakMap<HTMLElement, Animation>()

  const inViewport = (rect: DOMRect): boolean =>
    rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth

  const takeSnapshot = (): void => {
    const next = new Map<HTMLElement, number>()
    for (const element of document.querySelectorAll<HTMLElement>(FLOW_BLOCK_SELECTOR)) {
      const rect = element.getBoundingClientRect()
      if (!inViewport(rect)) continue
      next.set(element, rect.top)
    }
    snapshot = next
    takenAt = Date.now()
  }

  const glide = (element: HTMLElement, distance: number): void => {
    running.get(element)?.cancel()
    const animation = element.animate(
      [{ transform: `translateY(${String(distance)}px)` }, { transform: 'translateY(0)' }],
      { duration: GLIDE_MS, easing: 'ease-out' },
    )
    running.set(element, animation)
    animation.onfinish = () => {
      if (running.get(element) === animation) running.delete(element)
    }
  }

  const flush = (): void => {
    const previous = snapshot
    snapshot = null
    if (previous === null || previous.size === 0) return
    if (Date.now() - takenAt > SNAPSHOT_TTL_MS) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // 第一趟只读：每块的绝对位移。读写交错会让浏览器反复重排，所以先量完再动。
    const absolute = new Map<HTMLElement, number>()
    for (const [element, top] of previous) {
      if (!element.isConnected) continue
      absolute.set(element, top - element.getBoundingClientRect().top)
    }
    // 第二趟只写：祖先的位移已经叠在后代身上，后代只补自己相对祖先的那一段。
    for (const [element, distance] of absolute) {
      const ancestor = element.parentElement?.closest<HTMLElement>(FLOW_BLOCK_SELECTOR) ?? null
      const inherited = ancestor === null ? 0 : absolute.get(ancestor) ?? 0
      const own = distance - inherited
      if (own === 0) continue
      glide(element, own)
    }
  }

  const onClick = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(TOGGLE_SELECTOR) === null) return
    takeSnapshot()
  }

  const observer = new MutationObserver(flush)
  document.addEventListener('click', onClick, true)
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    document.removeEventListener('click', onClick, true)
    observer.disconnect()
  }
}
