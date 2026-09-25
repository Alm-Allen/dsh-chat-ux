/**
 * 输入框的插入符动效：把浏览器画的那根换成自己画的，位移走过渡。
 *
 * 浏览器的插入符除了颜色和闪烁，没有任何可以动画的属性，所以「移动时有过渡」只有一条路：
 * 用 `caret-color: transparent` 把它按下去，自己画一根，位置靠折叠 Range 量出来。dsh 的输入框
 * 是 contenteditable，这件事因此比 textarea 省事——坐标是浏览器给的，不用搭镜像层。
 *
 * 三条事实决定了它怎么写，都在真实 Chromium 里量过：
 *
 *   挂哪儿   自绘的那根挂在 `[data-composer-input]` 的父元素上，也就是 dsh 的 `.grow`
 *            （`position: relative`）。它和输入框同在一个滚动内容里，输入框内部滚动时两者的视口
 *            坐标一起变、相对坐标恒定——所以滚动同步不需要任何监听。
 *   量得到   折叠 Range 在文本里、在装饰器两侧、在折行处都给得出精确到小数像素的矩形。
 *   量不到   光标贴着 `<br>` 时 Chromium 给 `0×0` 零矩形，而空段落正是这条路的常客。这时退回
 *            段落自己的矩形，把上一次量到的字体高度放回这一行里居中。
 *
 * 什么时候动、什么时候不动：
 *
 *   打字      动，和 VS Code 的 `on` 档一样（每一格都滑一下，代价是快速连打时插入符略微落后于
 *             新字符）。它默认的 `explicit` 档只在方向键、点击这类显式移动上放过渡，这里不做那个
 *             区分——要的是「凡是会挪窝的都给过渡」。
 *   刚露头    不动。从藏到露的那一帧先把位置写好，下一帧才把过渡接回来，否则它要从上次停的地方
 *             滑过来。
 *   合成中    照常，还是这一根。合成期间的每一次更新照样发 selectionchange、选区照样是折叠的
 *             （用 CDP 往真页面里注过输入法合成，逐帧量过），所以自绘的这根跟得住。早先这里
 *             是反过来做的——合成期间把原生插入符还回去——结果是打字的时候读者看到的是另一套
 *             光标：粗细不一样、渲染不一样，而且它不会动。候选框由浏览器自己定位，与这里无关。
 *
 * @module dsh-chat-ux/client/caret-motion
 */
import { COMPOSER_INPUT_SELECTOR } from './dom-contract'

/** 闪烁动画的名字。`caret-motion-styles.ts` 用它拼 keyframes，两处必须一字不差。 */
export const CARET_BLINK_NAME = 'dsh-chat-ux-caret-blink'

/** 挂在可编辑面上的标记：有它，原生插入符才让位。规则在 `caret-motion-styles.ts`。 */
export const CARET_ATTRIBUTE = 'data-chat-ux-caret'

/** 自绘插入符自己。 */
export const CARET_LAYER_ATTRIBUTE = 'data-chat-ux-caret-layer'

/** 自绘插入符此刻可见。 */
export const CARET_VISIBLE_ATTRIBUTE = 'data-chat-ux-caret-visible'

/**
 * 给整页装上插入符动效。
 * @returns disposer：摘掉监听，并把所有自绘插入符和标记一起撤掉。
 */
export function installCaretMotion(): () => void {
  /** 每个可编辑面一份自绘状态。同屏只有一个面拿着焦点，所以这里通常只有一项。 */
  const layers = new Map<HTMLElement, CaretLayer>()
  /** 一次同步已经排在下一帧。 */
  let queued = false

  const queue = (): void => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      sync()
    })
  }

  /** 光标贴着 `<br>` 时，从它所在的那一段上取位置。 */
  const nearestBlock = (node: Node, input: HTMLElement): HTMLElement | null => {
    let current: Node | null = node
    while (current !== null && current.parentNode !== input) current = current.parentNode
    return current instanceof HTMLElement ? current : null
  }

  const hide = (layer: CaretLayer): void => {
    layer.caret.removeAttribute(CARET_VISIBLE_ATTRIBUTE)
    layer.visible = false
  }

  /** 这个可编辑面上的自绘插入符；没有就建一根。 */
  const layerFor = (input: HTMLElement): CaretLayer | null => {
    const host = input.parentElement
    // 自绘的那根按容器的矩形定位，容器不是定位上下文时算出来的坐标就是错的：宁可不动手，
    // 让原生插入符留在原地。
    if (host === null || getComputedStyle(host).position === 'static') return null
    const known = layers.get(input)
    if (known !== undefined) {
      // React 重渲染会把挂上去的那根一起摘掉，重新挂回去，并当作刚露头重新就位。
      if (known.caret.isConnected) return known
      host.appendChild(known.caret)
      known.visible = false
      return known
    }
    const caret = document.createElement('div')
    caret.setAttribute(CARET_LAYER_ATTRIBUTE, '')
    host.appendChild(caret)
    // 自绘的这根就位之后，才让原生插入符让位：隐藏规则挂在下面这个标记上，脚本没跑起来时
    // 一条都不命中。
    input.setAttribute(CARET_ATTRIBUTE, '')
    const layer: CaretLayer = { caret, fontHeight: null, visible: false }
    layers.set(input, layer)
    return layer
  }

  /** 把自绘的光标放到这一处选区上。 */
  const place = (input: HTMLElement, layer: CaretLayer, range: Range): void => {
    const host = input.parentElement ?? input
    const hostRect = host.getBoundingClientRect()
    const rect = range.getBoundingClientRect()
    let left = 0
    let top = 0
    let height = 0
    if (rect.height > 0) {
      left = rect.left - hostRect.left
      top = rect.top - hostRect.top
      height = rect.height
      layer.fontHeight = rect.height
    } else {
      // 零矩形：光标贴着 `<br>`，空段落是这条路的常客。它只有一行，把上一次量到的字体高度
      // 放回这一行里居中。
      const block = nearestBlock(range.startContainer, input)
      if (block === null) return
      const blockRect = block.getBoundingClientRect()
      height = layer.fontHeight ?? blockRect.height
      left = blockRect.left - hostRect.left
      top = blockRect.top - hostRect.top + Math.max(0, (blockRect.height - height) / 2)
    }
    // 对齐到整像素。原生插入符就落在像素网格上，而落在分数位置的矩形会被抗锯齿抹开一圈灰边，
    // 看起来和它不是一套。代价是位置最多偏半像素，看不出来。
    left = Math.round(left)
    top = Math.round(top)

    // 刚露头的那一帧必须瞬时就位，下一帧再把过渡接回来。
    const fresh = !layer.visible
    if (fresh) layer.caret.style.transitionProperty = 'none'
    layer.caret.style.transform = 'translate(' + left + 'px, ' + top + 'px)'
    layer.caret.style.height = height + 'px'
    if (fresh) {
      requestAnimationFrame(() => { layer.caret.style.transitionProperty = '' })
      layer.visible = true
      layer.caret.setAttribute(CARET_VISIBLE_ATTRIBUTE, '')
    }
    // 每挪一次都让闪烁重新起拍：否则赶上「灭」的那半周期，读者会以为光标没跟上来。
    // 只认闪烁那一条。`getAnimations()` 里也有正在跑的位移过渡（它自己就是被这个方法读到的），
    // 把那条也拉回起点的话，连续打字就变成一格一格地卡——光标永远落在上一格的插值位置上。
    for (const animation of layer.caret.getAnimations()) {
      if (animation instanceof CSSAnimation && animation.animationName === CARET_BLINK_NAME) animation.currentTime = 0
    }
  }

  /** 这一帧的光标归谁。 */
  const sync = (): void => {
    const selection = document.getSelection()
    const active = document.activeElement
    // 光标只出现在**正拿着焦点**的那个可编辑面上：hero 态的输入框没有可编辑面，多会话时也
    // 只有一个面拿着焦点。
    const owner = active instanceof HTMLElement && active.matches(COMPOSER_INPUT_SELECTOR) && active.isContentEditable
      ? active
      : null
    // 该落在哪一处：没有焦点、或者选了字（合成中选中候选词也算），都不该有它。
    const range = owner !== null
      && selection !== null
      && selection.isCollapsed
      && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : null
    const target = range !== null && owner !== null && owner.contains(range.startContainer) ? owner : null
    for (const [input, layer] of layers) {
      // 切会话会把整个输入区换掉，跟着它走的那根一并撤掉。
      if (!input.isConnected) {
        layer.caret.remove()
        layers.delete(input)
        continue
      }
      if (input !== target) hide(layer)
    }
    if (target === null || range === null) return
    // 合成结束后把原生插入符重新按下去。
    target.setAttribute(CARET_ATTRIBUTE, '')
    const layer = layerFor(target)
    if (layer === null) return
    place(target, layer, range)
  }

  document.addEventListener('selectionchange', queue)
  document.addEventListener('focusin', queue)
  document.addEventListener('focusout', queue)
  window.addEventListener('resize', queue)
  // 自带的那两份字体是后到的，折行随之变化，光标要重新量一次。
  document.fonts.addEventListener('loadingdone', queue)

  return () => {
    document.removeEventListener('selectionchange', queue)
    document.removeEventListener('focusin', queue)
    document.removeEventListener('focusout', queue)
    window.removeEventListener('resize', queue)
    document.fonts.removeEventListener('loadingdone', queue)
    for (const [input, layer] of layers) {
      layer.caret.remove()
      input.removeAttribute(CARET_ATTRIBUTE)
    }
    layers.clear()
  }
}

/** 一个可编辑面上的自绘插入符。 */
interface CaretLayer {
  /** 自绘的那根。 */
  caret: HTMLElement
  /** 上一次量到的字体高度；折叠 Range 给不出矩形时用它。 */
  fontHeight: number | null
  /** 此刻可见。用来认出「刚露头」那一帧——它不能走过渡。 */
  visible: boolean
}
