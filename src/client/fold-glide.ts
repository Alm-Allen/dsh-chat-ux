/**
 * 折叠时把下方内容推开，展开体自己像卷帘门一样拉下来。
 *
 * dsh 的 DisclosureRow 在收起时把展开体整个卸掉（`{open && children}`），所以 CSS 拿不到可过渡的
 * 旧值——高度动画在聊天区做不到，纯 CSS 的路是死的。这一处在 DOM 之外接管：
 *
 *   展开  点击后 React 刚把展开体插进来，MutationObserver 的回调还在绘制之前，于是先把它压回
 *         0 高、再动画到实际高度。布局逐帧变化，下方内容是真的被推开，不是补出来的位移。
 *   折叠  展开体在 React commit 那一刻就没了，来不及做退场。所以在**点击捕获阶段**先把它按原位
 *         克隆进一个 fixed 浮层，让 React 照常卸掉真身，再对这个残影做 h → 0。下方内容同时用
 *         FLIP 补位，两者时长一致，看起来就是卷帘门收上去。
 *
 * 只有 DisclosureRow 走这条路。过程组、回合触发节点那些的展开体不是「行的下一个兄弟」，找不到
 * 稳定锚点，而且过程组体自己还挂着滚动控制器，所以它们仍旧只补下方位移（FLIP）。
 *
 * 快照只在点击时取，且只取视口内的流块。流式追加、分页加载历史、以及本插件的自动开合都没有
 * 点击，因此不会有动画——那些场合内容本来就该自然生长。
 *
 * 流块是嵌套的（过程组里还有成员），祖先的 transform 会叠到后代身上，所以后代只补
 * `自己的绝对位移 − 最近流块祖先的绝对位移`，否则位移会被算两遍。
 *
 * @module dsh-chat-ux/client/fold-glide
 */

/** 卷帘门与下方补位共用的时长，取侧栏 AnimatedRows 的同档值。 */
const ROLL_MS = 200
/** 超过这个年纪的意图不再可信（点击后没有发生布局变化，或变化来自别处）。 */
const INTENT_TTL_MS = 500
/** 残影的节点上限：再大就不克隆了，退回成只补下方位移。 */
const GHOST_NODE_LIMIT = 2000
/** dsh 给每个流块发的语义锚点。 */
const FLOW_BLOCK_SELECTOR = '[data-chat-flow-key]'
/** DisclosureRow 的行。展开体是它的下一个兄弟。 */
const DISCLOSURE_SELECTOR = '[data-disclosure-row]'
/** 其余可开合的控件（过程组头、回合触发节点等）。 */
const TOGGLE_SELECTOR = '[aria-expanded]'

interface FoldIntent {
  /** 被点的 DisclosureRow；null 表示这一下不走卷帘门，只补下方位移。 */
  readonly row: HTMLElement | null
  /** 点击时展开体已经在，所以这一下是收起。 */
  readonly collapsing: boolean
  /** 收起方向的浮层残影；太大没克隆时为 null。 */
  readonly ghost: HTMLElement | null
  readonly tops: Map<HTMLElement, number>
  readonly takenAt: number
}

/**
 * 装上折叠位移。只有读者点击引起的变化会补动画。
 * @returns 卸载函数。
 */
export function installFoldGlide(): () => void {
  if (typeof document === 'undefined' || document.body === null) return () => {}

  let intent: FoldIntent | null = null
  const running = new WeakMap<HTMLElement, Animation>()
  let overlay: HTMLElement | null = null

  const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const inViewport = (rect: DOMRect): boolean =>
    rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth

  /** 展开体：row 之后那一个兄弟。返回 null 就说明这一行当前是收起的。 */
  const expandedBody = (row: HTMLElement): HTMLElement | null => {
    const last = row.parentElement?.lastElementChild
    return last instanceof HTMLElement && last !== row ? last : null
  }

  const ghostLayer = (): HTMLElement => {
    if (overlay !== null && overlay.isConnected) return overlay
    overlay = document.createElement('div')
    overlay.setAttribute('aria-hidden', 'true')
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    document.body.appendChild(overlay)
    return overlay
  }

  /**
   * 把展开体按原位钉一份到浮层上，好让 React 卸掉真身之后还有东西可卷。
   * 逐条设置内联样式而不是写 cssText，克隆体自己带的 CSS 变量要留着。
   */
  const takeGhost = (body: HTMLElement): HTMLElement | null => {
    if (body.querySelectorAll('*').length > GHOST_NODE_LIMIT) return null
    const rect = body.getBoundingClientRect()
    const ghost = body.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
    for (const element of ghost.querySelectorAll('[id]')) element.removeAttribute('id')
    Object.assign(ghost.style, {
      position: 'absolute', margin: '0', overflow: 'hidden', boxSizing: 'border-box',
      left: `${String(rect.left)}px`, top: `${String(rect.top)}px`,
      width: `${String(rect.width)}px`, height: `${String(rect.height)}px`,
    })
    ghostLayer().appendChild(ghost)
    return ghost
  }

  const takeTops = (): Map<HTMLElement, number> => {
    const tops = new Map<HTMLElement, number>()
    for (const element of document.querySelectorAll<HTMLElement>(FLOW_BLOCK_SELECTOR)) {
      const rect = element.getBoundingClientRect()
      if (!inViewport(rect)) continue
      tops.set(element, rect.top)
    }
    return tops
  }

  const glide = (element: HTMLElement, distance: number): void => {
    running.get(element)?.cancel()
    const animation = element.animate(
      [{ transform: `translateY(${String(distance)}px)` }, { transform: 'translateY(0)' }],
      { duration: ROLL_MS, easing: 'ease-out' },
    )
    running.set(element, animation)
    animation.onfinish = () => {
      if (running.get(element) === animation) running.delete(element)
    }
  }

  /** 下方内容按各自相对最近流块祖先的那一段位移滑走。 */
  const glideFlow = (tops: Map<HTMLElement, number>): void => {
    // 第一趟只读：读写交错会让浏览器反复重排。
    const absolute = new Map<HTMLElement, number>()
    for (const [element, top] of tops) {
      if (!element.isConnected) continue
      absolute.set(element, top - element.getBoundingClientRect().top)
    }
    for (const [element, distance] of absolute) {
      const ancestor = element.parentElement?.closest<HTMLElement>(FLOW_BLOCK_SELECTOR) ?? null
      const own = distance - (ancestor === null ? 0 : absolute.get(ancestor) ?? 0)
      if (own === 0) continue
      glide(element, own)
    }
  }

  /** 卷帘门拉开：压回 0 高再放到实际高度，布局逐帧长出来，下方内容跟着让位。 */
  const rollOpen = (row: HTMLElement): void => {
    const body = expandedBody(row)
    if (body === null) return
    const height = body.getBoundingClientRect().height
    if (height === 0) return
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    const animation = body.animate(
      [{ height: '0px' }, { height: `${String(height)}px` }],
      { duration: ROLL_MS, easing: 'ease-out' },
    )
    animation.onfinish = () => {
      animation.cancel()
      body.style.overflow = previousOverflow
    }
  }

  /** 卷帘门收回：卷的是浮层上的残影，真身早已被 React 卸掉。 */
  const rollShut = (ghost: HTMLElement): void => {
    const animation = ghost.animate(
      [{ height: `${String(ghost.getBoundingClientRect().height)}px` }, { height: '0px' }],
      { duration: ROLL_MS, easing: 'ease-out', fill: 'forwards' },
    )
    animation.onfinish = () => { ghost.remove() }
  }

  const flush = (): void => {
    const current = intent
    intent = null
    if (current === null) return
    if (Date.now() - current.takenAt > INTENT_TTL_MS || reduceMotion()) {
      current.ghost?.remove()
      return
    }
    if (current.row === null) {
      glideFlow(current.tops)
      return
    }
    if (current.collapsing) {
      // 展开体还在，说明这一下并没有折叠——残影作废。
      if (expandedBody(current.row) !== null) {
        current.ghost?.remove()
        return
      }
      if (current.ghost !== null) rollShut(current.ghost)
      glideFlow(current.tops)
      return
    }
    rollOpen(current.row)
  }

  const onClick = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest<HTMLElement>(DISCLOSURE_SELECTOR)
    const toggle = row ?? target.closest<HTMLElement>(TOGGLE_SELECTOR)
    if (toggle === null) return
    intent?.ghost?.remove()
    const body = row === null ? null : expandedBody(row)
    intent = {
      row,
      collapsing: body !== null,
      ghost: body === null ? null : takeGhost(body),
      tops: takeTops(),
      takenAt: Date.now(),
    }
  }

  const observer = new MutationObserver(flush)
  document.addEventListener('click', onClick, true)
  observer.observe(document.body, { childList: true, subtree: true })

  return () => {
    document.removeEventListener('click', onClick, true)
    observer.disconnect()
    overlay?.remove()
    overlay = null
  }
}
