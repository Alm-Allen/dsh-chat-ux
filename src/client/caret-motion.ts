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
 *   量不到   光标贴着 `<br>` 时 Chromium 给 `0×0` 零矩形，而空段落与软换行正是这条路的常客。
 *            这时量那个换行符自己——它的矩形永远只有一行，高度还正好是字高。量不出来（附近没有
 *            换行符）就把原生插入符还回去：宁可不动手，也不能让读者看不见光标。
 *
 * 什么时候动、什么时候不动，由 {@link CaretMotionMode} 的三档决定：
 *
 *   打字时    动。与 VS Code 的 `on` 档同义：每一格都滑一下（代价是快速连打时插入符略微落后于
 *             新字符）。默认档。
 *   移动时    只在方向键、点击这类显式移动上放过渡，打字瞬时——VS Code 默认的 `explicit` 就是
 *             它。判据也一样：看这次挪窝是不是打字引起的。这里是听 `beforeinput`：它会先于
 *             `selectionchange` 到达，所以「这一帧有输入」比事后从位置上猜要准。
 *   关        根本不动手：不建自绘的那根、不给可编辑面写标记，浏览器自己的插入符一直在。这套动效
 *             唯一真正会伤人的失败方式是读者看不见光标（原生那根被按下去、自绘那根没画出来），
 *             所以「关」必须是彻底的——它同时是这条路的兜底。
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

/** 聚焦之后隔多久补看一次。切会话时，聚焦与「选区就绪」之间隔着几帧。 */
const FOCUS_SETTLE_MS = 120

/**
 * 这套动效的三档。host 侧的 schema 里有同一组字面量，改一处就要改另一处。
 *
 * - `off` —— 不动手，用浏览器自己的插入符。
 * - `move` —— 只在显式移动上放过渡，打字瞬时。
 * - `typing` —— 打字也放过渡。
 */
export type CaretMotionMode = 'off' | 'move' | 'typing'

/** 安装结果：一个卸载入口，外加一个「配置变了，重新同步一次」。 */
export interface CaretMotionHandle {
  /** 摘掉监听，并把所有自绘插入符和标记一起撤掉。 */
  dispose: () => void
  /** 按当前配置再同步一次（排在下一帧）。配置一变就该调它。 */
  resync: () => void
}

/**
 * 给整页装上插入符动效。
 * @param read - 现读的档位。每一帧同步时读一次，所以运行期改档不必重新安装。
 * @returns 卸载入口与重同步入口。
 */
export function installCaretMotion(read: () => CaretMotionMode): CaretMotionHandle {
  /** 每个可编辑面一份自绘状态。同屏只有一个面拿着焦点，所以这里通常只有一项。 */
  const layers = new Map<HTMLElement, CaretLayer>()
  /** 一次同步已经排在下一帧。 */
  let queued = false
  /** 这一帧里来过一次输入。`move` 档靠它把打字和显式移动分开。 */
  let typed = false

  const queue = (): void => {
    if (queued) return
    queued = true
    requestAnimationFrame(() => {
      queued = false
      const typing = typed
      typed = false
      sync(typing)
    })
  }

  const markTyped = (): void => {
    typed = true
  }

  /**
   * 可编辑面的内容、可编辑性或者身份变了。
   *
   * `selectionchange` 覆盖不了这些静默变化：清空草稿如果没顺带动选区，浏览器一个事件都不发；
   * 切会话时 Lexical 还在绑 editor，`contenteditable` 会短暂变成 false，浏览器随即把焦点收走，
   * 等它变回来又是一个事件都没有。这里补上那个缺口。
   */
  const contentObserver = new MutationObserver(() => {
    if (read() === 'off') return
    queue()
  })

  /** 盯住一个可编辑面。同一个面盯多次是幂等的，选项以最后一次为准。 */
  const observeComposer = (input: HTMLElement): void => {
    contentObserver.observe(input, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['contenteditable', 'data-composer-input'],
    })
  }

  /** 焦点在这个面上，却还没有自绘的那根——切会话留下的空窗就是它。 */
  const needsTakeover = (): boolean => {
    const active = document.activeElement
    if (!(active instanceof HTMLElement) || !active.matches(COMPOSER_INPUT_SELECTOR)) return false
    return !active.hasAttribute(CARET_ATTRIBUTE)
  }

  /**
   * 焦点换了之后再补看一次。
   *
   * 切会话时「焦点离开旧的」和「焦点落到新的」之间隔着几帧，中间不会有任何事件——浏览器迁移
   * 选区是静默的，有时连 focusin 都等不到（新元素刚建出来、editor 还没绑上）。两个方向都接，
   * 因为不知道哪一边才是这条路上最后一声。只在还没接管时才补，已经画好的那根不去打扰它，
   * 否则闪烁会被重新起拍。
   */
  const syncAfterFocusChange = (): void => {
    queue()
    window.setTimeout(() => {
      if (needsTakeover()) queue()
    }, FOCUS_SETTLE_MS)
  }

  /** 一个节点在它父节点里的下标；不是亲生的给 -1。 */
  const childIndex = (parent: Node, child: Node): number => {
    let index = 0
    for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
      if (node === child) return index
      index += 1
    }
    return -1
  }

  /**
   * 光标贴着的那个换行符。
   *
   * 量的是 `<br>` 自己，不是它所在的段落：段落可以有很多行，换行符的矩形却永远只有一行，高度还
   * 正好是字高。零矩形只发生在换行符旁边，所以这里找不到换行符就等于量不出来——调用方要把原生
   * 插入符还回去，不能拿一个猜出来的位置充数。
   */
  const nearestBreak = (range: Range): CaretAnchor | null => {
    const container = range.startContainer
    const offset = range.startOffset
    if (container instanceof HTMLBRElement) return { lineBreak: container, before: offset === 0 }
    if (container instanceof Text) {
      const parent = container.parentNode
      if (parent === null) return null
      const index = childIndex(parent, container)
      if (index < 0) return null
      if (offset === container.data.length) {
        const next = parent.childNodes[index + 1]
        if (next instanceof HTMLBRElement) return { lineBreak: next, before: true }
      }
      if (offset === 0) {
        const previous = parent.childNodes[index - 1]
        if (previous instanceof HTMLBRElement) return { lineBreak: previous, before: false }
      }
      return null
    }
    const next = container.childNodes[offset]
    if (next instanceof HTMLBRElement) return { lineBreak: next, before: true }
    const previous = container.childNodes[offset - 1]
    if (previous instanceof HTMLBRElement) return { lineBreak: previous, before: false }
    return null
  }

  /**
   * 输入框被清到连段落都没有时（切会话之后就是这样，DOM 是个空壳），量一根藏在页面角落里的
   * 同款 `<br>`。
   *
   * 内容盒的第一行开头就是光标该在的地方，但那一行有多高、字盒在行里怎么摆，得从别处问。
   * 探针每帧现建现删，而且**不碰 dsh 的任何容器**——往 `.grow` 里塞节点会惊动 React。
   * @returns 相对容器的左、上、高；量不出来给 null。
   */
  const emptyLineBox = (input: HTMLElement, host: HTMLElement): { left: number; top: number; height: number } | null => {
    const body = document.body
    if (body === null) return null
    const style = getComputedStyle(input)
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none'
    probe.style.padding = style.padding
    probe.style.whiteSpace = 'pre-wrap'
    probe.style.fontFamily = style.fontFamily
    probe.style.fontSize = style.fontSize
    probe.style.fontWeight = style.fontWeight
    probe.style.fontStyle = style.fontStyle
    probe.style.lineHeight = style.lineHeight
    probe.appendChild(document.createElement('br'))
    body.appendChild(probe)
    const probeRect = probe.getBoundingClientRect()
    const breakElement = probe.firstElementChild
    const breakRect = breakElement === null ? null : breakElement.getBoundingClientRect()
    probe.remove()
    if (breakRect === null) return null
    // 探针的 padding 与输入框一致，所以这两个差值就是「内容盒起头」到「字盒起头」的距离。
    const inputRect = input.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    return {
      left: inputRect.left + (breakRect.left - probeRect.left) - hostRect.left,
      top: inputRect.top + (breakRect.top - probeRect.top) - hostRect.top,
      height: breakRect.height,
    }
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
    observeComposer(input)
    const layer: CaretLayer = { caret, visible: false }
    layers.set(input, layer)
    return layer
  }

  /**
   * 把自绘的光标放到这一处选区上。
   * @param paused - 这一帧不播位移过渡：刚露头，或者 `move` 档下的一次打字。
   * @returns 放好了没有。没放好时调用方要把原生插入符还回去。
   */
  const place = (input: HTMLElement, layer: CaretLayer, range: Range, paused: boolean): boolean => {
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
    } else {
      // 零矩形：光标贴着换行符——空段落（`<p><br></p>`）与软换行都是这条路的常客。量那个换行符
      // 自己，不要量它所在的段落：段落可以是很多行，换行符的矩形却永远只有一行，高度还是字高。
      const anchor = nearestBreak(range)
      if (anchor === null) {
        // 输入框里连一个换行符都没有：没有东西可量，但内容盒的第一行开头就是光标的位置。
        // 里面有东西却找不到换行符，那是别的形状，不猜，把原生插入符还回去。
        if (input.firstChild !== null) return false
        const empty = emptyLineBox(input, host)
        if (empty === null) return false
        left = empty.left
        top = empty.top
        height = empty.height
      } else {
        const breakRect = anchor.lineBreak.getBoundingClientRect()
        height = breakRect.height
        top = breakRect.top - hostRect.top
        left = breakRect.left - hostRect.left
        if (!anchor.before) {
          // 换行符之后是下一行的行首：横向退到段落的内容左边界，纵向走一行。
          const block = anchor.lineBreak.parentElement
          if (block === null) return false
          const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight)
          left = block.getBoundingClientRect().left - hostRect.left
          top += Number.isFinite(lineHeight) ? lineHeight : breakRect.height
        }
      }
    }
    // 对齐到整像素。原生插入符就落在像素网格上，而落在分数位置的矩形会被抗锯齿抹开一圈灰边，
    // 看起来和它不是一套。代价是位置最多偏半像素，看不出来。
    left = Math.round(left)
    top = Math.round(top)

    // 不播过渡的那一帧必须瞬时就位，下一帧再把过渡接回来。
    const fresh = !layer.visible
    const instant = fresh || paused
    if (instant) layer.caret.style.transitionProperty = 'none'
    layer.caret.style.transform = 'translate(' + left + 'px, ' + top + 'px)'
    layer.caret.style.height = height + 'px'
    if (instant) requestAnimationFrame(() => { layer.caret.style.transitionProperty = '' })
    if (fresh) {
      layer.visible = true
      layer.caret.setAttribute(CARET_VISIBLE_ATTRIBUTE, '')
    }
    // 每挪一次都让闪烁重新起拍：否则赶上「灭」的那半周期，读者会以为光标没跟上来。
    // 只认闪烁那一条。`getAnimations()` 里也有正在跑的位移过渡（它自己就是被这个方法读到的），
    // 把那条也拉回起点的话，连续打字就变成一格一格地卡——光标永远落在上一格的插值位置上。
    for (const animation of layer.caret.getAnimations()) {
      if (animation instanceof CSSAnimation && animation.animationName === CARET_BLINK_NAME) animation.currentTime = 0
    }
    return true
  }

  /**
   * 这一帧的光标归谁。
   * @param typing - 这一帧里来过一次输入。
   */
  const sync = (typing: boolean): void => {
    const mode = read()
    // 「关」是彻底的：自绘的那根和让位标记一起撤掉，原生插入符回来。留着它们只会让读者看不见光标。
    if (mode === 'off') {
      for (const [input, layer] of layers) {
        layer.caret.remove()
        input.removeAttribute(CARET_ATTRIBUTE)
      }
      layers.clear()
      return
    }
    const selection = document.getSelection()
    const active = document.activeElement
    // 焦点落在 composer 面上就先盯住它，哪怕此刻还不可编辑：切会话时 contenteditable 会短暂
    // 变成 false，等它变回来的时候，只有盯着属性才等得到那一下。
    if (active instanceof HTMLElement && active.matches(COMPOSER_INPUT_SELECTOR)) observeComposer(active)
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
      if (input === target) continue
      // 光标不归它，或者干脆没有光标：自绘的那根藏起来，原生插入符还回去。让位标记只在
      // 「此刻真的有一根自绘的光标」时才存在，其余任何时候撤掉它都是安全的。
      hide(layer)
      input.removeAttribute(CARET_ATTRIBUTE)
    }
    if (target === null || range === null) return
    const layer = layerFor(target)
    if (layer === null) return
    // 让位标记只在真正画出一根之后才写。画不出来时把原生插入符还回去——「原生已透明、自绘没画」
    // 是这套动效唯一真正会伤到读者的失效方式，任何一次测量失败都必须退回原点，而不是维持现状。
    if (!place(target, layer, range, mode === 'move' && typing)) {
      target.removeAttribute(CARET_ATTRIBUTE)
      hide(layer)
      return
    }
    target.setAttribute(CARET_ATTRIBUTE, '')
  }

  document.addEventListener('selectionchange', queue)
  document.addEventListener('focusin', syncAfterFocusChange)
  document.addEventListener('focusout', syncAfterFocusChange)
  // `move` 档的判据。它先于 `selectionchange` 到达，所以这一帧的挪窝算不算打字，读它比猜位置准。
  document.addEventListener('beforeinput', markTyped)
  window.addEventListener('resize', queue)
  // 自带的那两份字体是后到的，折行随之变化，光标要重新量一次。
  document.fonts.addEventListener('loadingdone', queue)

  return {
    resync: queue,
    dispose: () => {
      document.removeEventListener('selectionchange', queue)
      document.removeEventListener('focusin', syncAfterFocusChange)
      document.removeEventListener('focusout', syncAfterFocusChange)
      document.removeEventListener('beforeinput', markTyped)
      window.removeEventListener('resize', queue)
      document.fonts.removeEventListener('loadingdone', queue)
      contentObserver.disconnect()
      for (const [input, layer] of layers) {
        layer.caret.remove()
        input.removeAttribute(CARET_ATTRIBUTE)
      }
      layers.clear()
    },
  }
}

/** 一个可编辑面上的自绘插入符。 */
interface CaretLayer {
  /** 自绘的那根。 */
  caret: HTMLElement
  /** 此刻可见。用来认出「刚露头」那一帧——它不能走过渡。 */
  visible: boolean
}

/** 光标贴着的那个换行符，以及光标在它的哪一侧。 */
interface CaretAnchor {
  /** 换行符自己。它的矩形就是那一行的插入符位置——高度是字高，不是行高。 */
  lineBreak: HTMLBRElement
  /** 光标在它之前（行尾）还是之后（下一行行首）。 */
  before: boolean
}
