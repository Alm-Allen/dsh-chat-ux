/**
 * 输入框的插入符动效：把浏览器画的那根换成自己画的，位移走过渡。
 *
 * 浏览器的插入符除了颜色和闪烁，没有任何可以动画的属性，所以「移动时有过渡」只有一条路：
 * 用 `caret-color: transparent` 把它按下去，自己画一根。接管的是输入区座位里的两种面：
 *
 *   富文本面  dsh 的主输入框（`[data-composer-input]`），contenteditable。坐标是浏览器给的：
 *             折叠 Range 量出来就是。
 *   纯文本面  输入区里的 textarea——提问卡片的作答框、排队消息的行内编辑框（子智能体跑着时追加
 *             的那几条就在这里改）。textarea 的选区不进 DOM，Range 量不到，只能搭一层镜像：
 *             把样式抄到一个看不见的 div 上，文本从插入符处断开，量断点那一截的矩形。
 *
 * 几条事实决定了它怎么写，都在真实 Chromium 里量过：
 *
 *   挂哪儿   自绘的那根挂在可编辑面的父元素上（主输入框是 dsh 的 `.grow`）。富文本面和它同在一个
 *            滚动内容里，输入框内部滚动时两者的视口坐标一起变、相对坐标恒定——所以滚动同步不需要
 *            任何监听。父元素不是定位上下文时（作答框的 `.field`、排队行都是 static），给它挂一个
 *            标记，样式表把它变成 `position: relative`：它们都没有绝对定位的后代，这一下不改任何
 *            布局。textarea 自己是滚动容器，自绘的那根挂不进去，所以它内部滚动时要跟着重量一次，
 *            滚出可视区的那一截也要自己裁掉。
 *   量得到   折叠 Range 在文本里、在装饰器两侧、在折行处都给得出精确到小数像素的矩形。镜像那一截
 *            带着插入符后面的全部文本：软换行按整词走，只放前半截的话，正在打的那个词会留在上一行。
 *   量不到   光标贴着 `<br>` 时 Chromium 给 `0×0` 零矩形，而空段落与软换行正是这条路的常客。
 *            这时量那个换行符自己——它的矩形永远只有一行，高度还正好是字高。量不出来（附近没有
 *            换行符）就把原生插入符还回去：宁可不动手，也不能让读者看不见光标。
 *   颜色     每一种面的原生插入符颜色不一样（主输入框与作答框是品牌蓝，排队编辑框跟字色走），
 *            所以接管那一刻先读它自己算出来的 caret-color，自绘的那根照着画。
 *
 * 什么时候动、什么时候不动，由 {@link CaretMotionMode} 的三档决定：
 *
 *   无论何时  动。与 VS Code 的 `on` 档同义：每一格都滑一下（代价是快速连打时插入符略微落后于
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
import { COMPOSER_INPUT_SELECTOR, COMPOSER_TEXTAREA_SELECTOR } from './dom-contract'

/** 闪烁动画的名字。`caret-motion-styles.ts` 用它拼 keyframes，两处必须一字不差。 */
export const CARET_BLINK_NAME = 'dsh-chat-ux-caret-blink'

/** 挂在可编辑面上的标记：有它，原生插入符才让位。规则在 `caret-motion-styles.ts`。 */
export const CARET_ATTRIBUTE = 'data-chat-ux-caret'

/** 自绘插入符自己。 */
export const CARET_LAYER_ATTRIBUTE = 'data-chat-ux-caret-layer'

/** 自绘插入符此刻可见。 */
export const CARET_VISIBLE_ATTRIBUTE = 'data-chat-ux-caret-visible'

/** 挂在不是定位上下文的父元素上：样式表见到它就补一条 `position: relative`。 */
export const CARET_HOST_ATTRIBUTE = 'data-chat-ux-caret-host'

/** 自绘那根的颜色，写在它自己身上：接管那一刻从可编辑面的原生插入符上读下来。 */
export const CARET_COLOR_PROPERTY = '--dsh-chat-ux-caret-color'

/** 聚焦之后隔多久补看一次。切会话时，聚焦与「选区就绪」之间隔着几帧。 */
const FOCUS_SETTLE_MS = 120

/**
 * 镜像层要从 textarea 上抄的样式：凡是影响字形宽度与折行位置的都在这里。少抄一条，镜像里的折行
 * 就和 textarea 里的对不上，插入符会落在别的行上。
 */
const MIRRORED_PROPERTIES = [
  'direction', 'font-family', 'font-size', 'font-size-adjust', 'font-stretch', 'font-style',
  'font-variant', 'font-weight', 'font-feature-settings', 'font-variation-settings', 'font-kerning',
  'letter-spacing', 'word-spacing', 'line-height', 'text-align', 'text-indent', 'text-transform',
  'tab-size', 'white-space', 'word-break', 'overflow-wrap', 'hyphens',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
] as const

/**
 * 这套动效的三档。host 侧的 schema 里有同一组字面量，改一处就要改另一处。
 *
 * - `off` —— 不动手，用浏览器自己的插入符。
 * - `move` —— 只在显式移动上放过渡，打字瞬时。
 * - `typing` —— 打字也放过渡（界面上叫「无论何时」）。
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
  /** 已经排出去的那一帧；0 表示没有。卸载时要能把它连同回调一起取消。 */
  let frameHandle = 0
  /**
   * 卸载之后一律不做。
   *
   * 帧回调与 `syncAfterFocusChange` 里那两个定时器都可能还在路上：让它们跑完，`sync` 会重建
   * 自绘的那根、重新挂上观察者，而原生插入符的让位标记已经在卸载时摘掉了——读者看到的是
   * 「原生被按下去了、自绘的又不在」，也就是没有光标。
   */
  let disposed = false
  /** 这一帧里来过一次输入。`move` 档靠它把打字和显式移动分开。 */
  let typed = false
  /**
   * 上一次挪动插入符的是 End 键。
   *
   * 软换行处的同一个偏移有两个位置：上一行的行尾与下一行的行首。textarea 不交出「偏向哪一边」，
   * 而 Chromium 在 End 之后画在行尾、其余时候（打字、方向键、Home）画在行首——所以记住这一下。
   */
  let endKeyed = false

  const queue = (): void => {
    if (disposed || queued) return
    queued = true
    frameHandle = requestAnimationFrame(() => {
      frameHandle = 0
      queued = false
      if (disposed) return
      const typing = typed
      typed = false
      sync(typing)
    })
  }

  const markTyped = (): void => {
    typed = true
    endKeyed = false
  }

  /** 记下这一次挪窝是不是 End（带 Shift 的是在选字，没有插入符可画）。 */
  const noteKey = (event: KeyboardEvent): void => {
    if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Meta' || event.key === 'Alt') return
    endKeyed = event.key === 'End' && !event.shiftKey
  }

  /** 指针落下去的位置由浏览器自己定，不再沿用上一次 End 的偏向。 */
  const clearEndKey = (): void => {
    endKeyed = false
  }

  /**
   * 纯文本面自己滚了一下：自绘的那根不在它里面，不会跟着走，得重量。
   *
   * scroll 不冒泡，所以这是捕获阶段的监听，页面上每一次滚动都会路过这里——只认已经接管的面。
   */
  const followPlainScroll = (event: Event): void => {
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement) || !layers.has(target)) return
    queue()
  }

  /**
   * 可编辑面的内容、可编辑性或者身份变了。
   *
   * `selectionchange` 覆盖不了这些静默变化：清空草稿如果没顺带动选区，浏览器一个事件都不发；
   * 切会话时 Lexical 还在绑 editor，`contenteditable` 会短暂变成 false，浏览器随即把焦点收走，
   * 等它变回来又是一个事件都没有。这里补上那个缺口。纯文本面不走这条：它的内容不在 DOM 里。
   */
  const contentObserver = new MutationObserver(() => {
    if (read() === 'off') return
    queue()
  })

  /** 盯住一个富文本面。同一个面盯多次是幂等的，选项以最后一次为准。 */
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
    if (!(active instanceof HTMLElement) || surfaceOf(active) === null) return false
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
   * @returns 视口里的左、上、高；量不出来给 null。
   */
  const emptyLineBox = (input: HTMLElement): CaretBox | null => {
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
    return {
      left: inputRect.left + (breakRect.left - probeRect.left),
      top: inputRect.top + (breakRect.top - probeRect.top),
      height: breakRect.height,
    }
  }

  /**
   * 富文本面上这一处折叠选区的视口矩形。
   * @returns 量不出来时为 null：调用方要把原生插入符还回去。
   */
  const measureRich = (input: HTMLElement, range: Range): CaretBox | null => {
    const rect = range.getBoundingClientRect()
    if (rect.height > 0) return { left: rect.left, top: rect.top, height: rect.height }
    // 零矩形：光标贴着换行符——空段落（`<p><br></p>`）与软换行都是这条路的常客。量那个换行符
    // 自己，不要量它所在的段落：段落可以是很多行，换行符的矩形却永远只有一行，高度还是字高。
    const anchor = nearestBreak(range)
    if (anchor === null) {
      // 输入框里连一个换行符都没有：没有东西可量，但内容盒的第一行开头就是光标的位置。
      // 里面有东西却找不到换行符，那是别的形状，不猜，把原生插入符还回去。
      if (input.firstChild !== null) return null
      return emptyLineBox(input)
    }
    const breakRect = anchor.lineBreak.getBoundingClientRect()
    if (anchor.before) return { left: breakRect.left, top: breakRect.top, height: breakRect.height }
    // 换行符之后是下一行的行首：横向退到段落的内容左边界，纵向走一行。
    const block = anchor.lineBreak.parentElement
    if (block === null) return null
    const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight)
    return {
      left: block.getBoundingClientRect().left,
      top: breakRect.top + (Number.isFinite(lineHeight) ? lineHeight : breakRect.height),
      height: breakRect.height,
    }
  }

  /**
   * 纯文本面上插入符的视口矩形，靠一层镜像量出来。
   *
   * 镜像是一个看不见的 div：样式从 textarea 上抄，宽度取它的内容区（刨掉滚动条），文本在插入符处
   * 断开——前半截是裸文本，后半截整个包进一个 span。span 第一段行盒的左上角就是插入符。后半截
   * 必须整段带上：软换行按整词走，只放前半截的话，正在打的那个词会留在上一行。后半截是空的
   * （插入符在末尾）时放一个零宽空格占位，末尾那个换行符之后的空行才有行盒可量。
   *
   * 软换行处的偏移在镜像里天然落在下一行行首；`upstream` 为真（上一下是 End）时改量它前一个字符的
   * 右缘，也就是上一行的行尾——和原生那根在 End 之后画的位置一致。
   *
   * 镜像挂在 body 上、量完就摘，**不碰 dsh 的任何容器**。
   * @returns 量不出来时为 null：调用方要把原生插入符还回去。
   */
  const measurePlain = (input: HTMLTextAreaElement, upstream: boolean): CaretBox | null => {
    const body = document.body
    if (body === null) return null
    const style = getComputedStyle(input)
    const mirror = document.createElement('div')
    mirror.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;'
      + 'margin:0;border:0;box-sizing:content-box;height:auto;overflow:hidden'
    for (const name of MIRRORED_PROPERTIES) mirror.style.setProperty(name, style.getPropertyValue(name))
    const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
    mirror.style.width = String(Math.max(0, input.clientWidth - (Number.isFinite(paddingX) ? paddingX : 0))) + 'px'
    // 调用方只在选区折叠时才来，起点终点是同一处。
    const caretAt = input.selectionEnd
    const marker = document.createElement('span')
    mirror.textContent = input.value.slice(0, caretAt)
    marker.textContent = input.value.slice(caretAt) || '\u200b'
    mirror.appendChild(marker)
    body.appendChild(mirror)
    const mirrorRect = mirror.getBoundingClientRect()
    let spot = marker.getClientRects()[0]
    let edge = spot?.left
    const before = mirror.firstChild
    if (upstream && spot !== undefined && before instanceof Text && caretAt > 0 && input.value[caretAt - 1] !== '\n') {
      const previous = document.createRange()
      previous.setStart(before, caretAt - 1)
      previous.setEnd(before, caretAt)
      const rects = previous.getClientRects()
      const last = rects[rects.length - 1]
      // 前一个字符落在更上面的一行，才说明这里是软换行。
      if (last !== undefined && last.top < spot.top - 1) {
        spot = last
        edge = last.right
      }
    }
    mirror.remove()
    if (spot === undefined || edge === undefined) return null
    // 镜像没有边框，padding 与 textarea 一致，所以这两个差值就是插入符在 textarea 内边距盒里的
    // 位置；再扣掉 textarea 自己滚走的那一段。
    const inputRect = input.getBoundingClientRect()
    return {
      left: inputRect.left + input.clientLeft + (edge - mirrorRect.left) - input.scrollLeft,
      top: inputRect.top + input.clientTop + (spot.top - mirrorRect.top) - input.scrollTop,
      height: spot.height,
    }
  }

  /**
   * 把一个视口矩形裁进 textarea 露出来的那一段。自绘的那根不在 textarea 里面，textarea 的裁剪管
   * 不到它：内部滚动时插入符滚出可视区，原生那根跟着消失，这一根也得自己消失。
   * @returns 裁剩的矩形；整个被裁掉时为 null。
   */
  const clipToField = (input: HTMLTextAreaElement, box: CaretBox): CaretBox | null => {
    const inputRect = input.getBoundingClientRect()
    const clipTop = inputRect.top + input.clientTop
    const clipBottom = clipTop + input.clientHeight
    const top = Math.max(box.top, clipTop)
    const bottom = Math.min(box.top + box.height, clipBottom)
    if (bottom - top < 1) return null
    return { left: box.left, top, height: bottom - top }
  }

  const hide = (layer: CaretLayer): void => {
    layer.caret.removeAttribute(CARET_VISIBLE_ATTRIBUTE)
    layer.visible = false
  }

  /** 把一个面的自绘状态整个撤掉：那一根、让位标记、以及替它补过的定位上下文。 */
  const release = (input: HTMLElement, layer: CaretLayer): void => {
    layer.caret.remove()
    input.removeAttribute(CARET_ATTRIBUTE)
    if (layer.markedHost) layer.host.removeAttribute(CARET_HOST_ATTRIBUTE)
  }

  /** 这个可编辑面上的自绘插入符；没有就建一根。 */
  const layerFor = (input: HTMLElement): CaretLayer | null => {
    const host = input.parentElement
    if (host === null) return null
    const known = layers.get(input)
    if (known !== undefined && known.host === host) {
      // React 重渲染会把挂上去的那根一起摘掉，重新挂回去，并当作刚露头重新就位。
      if (known.caret.isConnected) return known
      host.appendChild(known.caret)
      known.visible = false
      return known
    }
    // 父元素换了人：旧的那一份整个撤掉，按新的父元素重建。
    if (known !== undefined) {
      release(input, known)
      layers.delete(input)
    }
    // 自绘的那根按容器的内边距盒定位，容器必须是定位上下文。不是的话补一个标记，由样式表把它
    // 变成 relative——作答框的 `.field` 与排队行都是这样。`display: contents` 的容器自己没有盒子，
    // 补了也没用：宁可不动手，让原生插入符留在原地。
    const hostStyle = getComputedStyle(host)
    if (hostStyle.display === 'contents') return null
    const markedHost = hostStyle.position === 'static'
    if (markedHost) host.setAttribute(CARET_HOST_ATTRIBUTE, '')
    const caret = document.createElement('div')
    caret.setAttribute(CARET_LAYER_ATTRIBUTE, '')
    host.appendChild(caret)
    if (input.isContentEditable) observeComposer(input)
    const layer: CaretLayer = { caret, visible: false, host, markedHost }
    layers.set(input, layer)
    return layer
  }

  /**
   * 接管那一刻读下原生插入符的颜色，自绘的那根照着画。
   *
   * 只在让位标记还没写上时读得到：写上之后算出来的就是 transparent 了。`auto` 的意思是跟字色走。
   */
  const adoptCaretColor = (input: HTMLElement, layer: CaretLayer): void => {
    const style = getComputedStyle(input)
    const color = style.caretColor === 'auto' ? style.color : style.caretColor
    layer.caret.style.setProperty(CARET_COLOR_PROPERTY, color)
  }

  /**
   * 把自绘的光标放到这个视口矩形上。
   * @param paused - 这一帧不播位移过渡：刚露头，或者 `move` 档下的一次打字。
   */
  const draw = (layer: CaretLayer, box: CaretBox, paused: boolean): void => {
    // 绝对定位按容器的内边距盒算，而且跟着容器自己的滚动走：矩形差值里扣掉边框、加回滚走的量。
    const hostRect = layer.host.getBoundingClientRect()
    // 对齐到整像素。原生插入符就落在像素网格上，而落在分数位置的矩形会被抗锯齿抹开一圈灰边，
    // 看起来和它不是一套。代价是位置最多偏半像素，看不出来。
    const left = Math.round(box.left - hostRect.left - layer.host.clientLeft + layer.host.scrollLeft)
    const top = Math.round(box.top - hostRect.top - layer.host.clientTop + layer.host.scrollTop)

    // 不播过渡的那一帧必须瞬时就位，下一帧再把过渡接回来。
    const fresh = !layer.visible
    const instant = fresh || paused
    if (instant) layer.caret.style.transitionProperty = 'none'
    layer.caret.style.transform = 'translate(' + left + 'px, ' + top + 'px)'
    layer.caret.style.height = box.height + 'px'
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
  }

  /**
   * 这一帧的光标归谁。
   * @param typing - 这一帧里来过一次输入。
   */
  const sync = (typing: boolean): void => {
    const mode = read()
    // 「关」是彻底的：自绘的那根和让位标记一起撤掉，原生插入符回来。留着它们只会让读者看不见光标。
    if (mode === 'off') {
      for (const [input, layer] of layers) release(input, layer)
      layers.clear()
      return
    }
    const selection = document.getSelection()
    const active = document.activeElement
    const kind = active instanceof HTMLElement ? surfaceOf(active) : null
    // 焦点落在富文本面上就先盯住它，哪怕此刻还不可编辑：切会话时 contenteditable 会短暂
    // 变成 false，等它变回来的时候，只有盯着属性才等得到那一下。
    if (kind === 'rich' && active instanceof HTMLElement) observeComposer(active)
    // 光标只出现在**正拿着焦点**的那个可编辑面上：hero 态的输入框没有可编辑面，多会话时也
    // 只有一个面拿着焦点。选了字（合成中选中候选词也算）时不该有它。
    let target: HTMLElement | null = null
    let range: Range | null = null
    if (kind === 'rich' && active instanceof HTMLElement && active.isContentEditable
      && selection !== null && selection.isCollapsed && selection.rangeCount > 0) {
      const candidate = selection.getRangeAt(0)
      if (active.contains(candidate.startContainer)) {
        target = active
        range = candidate
      }
    }
    if (kind === 'plain' && active instanceof HTMLTextAreaElement && active.selectionStart === active.selectionEnd) {
      target = active
    }
    for (const [input, layer] of layers) {
      // 切会话会把整个输入区换掉，提问卡片答完、排队行存完也会整块卸掉，跟着它走的那根一并撤掉。
      if (!input.isConnected) {
        release(input, layer)
        layers.delete(input)
        continue
      }
      if (input === target) continue
      // 光标不归它，或者干脆没有光标：自绘的那根藏起来，原生插入符还回去。让位标记只在
      // 「此刻真的有一根自绘的光标」时才存在，其余任何时候撤掉它都是安全的。
      hide(layer)
      input.removeAttribute(CARET_ATTRIBUTE)
    }
    if (target === null) return
    const layer = layerFor(target)
    if (layer === null) return
    const measured = target instanceof HTMLTextAreaElement
      ? measurePlain(target, endKeyed)
      : range === null ? null : measureRich(target, range)
    // 让位标记只在真正画出一根之后才写。画不出来时把原生插入符还回去——「原生已透明、自绘没画」
    // 是这套动效唯一真正会伤到读者的失效方式，任何一次测量失败都必须退回原点，而不是维持现状。
    if (measured === null) {
      target.removeAttribute(CARET_ATTRIBUTE)
      hide(layer)
      return
    }
    if (!target.hasAttribute(CARET_ATTRIBUTE)) adoptCaretColor(target, layer)
    // 纯文本面内部滚走的那一截不画。这不是测量失败——原生那根这时也看不见——所以标记照写。
    const box = target instanceof HTMLTextAreaElement ? clipToField(target, measured) : measured
    if (box === null) hide(layer)
    else draw(layer, box, mode === 'move' && typing)
    target.setAttribute(CARET_ATTRIBUTE, '')
  }

  document.addEventListener('selectionchange', queue)
  document.addEventListener('focusin', syncAfterFocusChange)
  document.addEventListener('focusout', syncAfterFocusChange)
  // `move` 档的判据。它先于 `selectionchange` 到达，所以这一帧的挪窝算不算打字，读它比猜位置准。
  document.addEventListener('beforeinput', markTyped)
  // 软换行处偏向哪一边的判据：上一下是不是 End。捕获阶段听，免得被谁拦在半路。
  document.addEventListener('keydown', noteKey, true)
  document.addEventListener('pointerdown', clearEndKey, true)
  document.addEventListener('scroll', followPlainScroll, { capture: true, passive: true })
  window.addEventListener('resize', queue)
  // 自带的那两份字体是后到的，折行随之变化，光标要重新量一次。
  document.fonts.addEventListener('loadingdone', queue)

  return {
    resync: queue,
    dispose: () => {
      disposed = true
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
      frameHandle = 0
      document.removeEventListener('selectionchange', queue)
      document.removeEventListener('focusin', syncAfterFocusChange)
      document.removeEventListener('focusout', syncAfterFocusChange)
      document.removeEventListener('beforeinput', markTyped)
      document.removeEventListener('keydown', noteKey, true)
      document.removeEventListener('pointerdown', clearEndKey, true)
      document.removeEventListener('scroll', followPlainScroll, true)
      window.removeEventListener('resize', queue)
      document.fonts.removeEventListener('loadingdone', queue)
      contentObserver.disconnect()
      for (const [input, layer] of layers) release(input, layer)
      layers.clear()
    },
  }
}

/**
 * 一个元素是不是本模块接管的可编辑面，是哪一种。
 * @param element - 通常是此刻拿着焦点的那个元素。
 * @returns `rich` 是主输入框，`plain` 是输入区里可编辑的 textarea，都不是时为 null。
 */
function surfaceOf(element: HTMLElement): SurfaceKind | null {
  if (element.matches(COMPOSER_INPUT_SELECTOR)) return 'rich'
  if (element instanceof HTMLTextAreaElement && element.matches(COMPOSER_TEXTAREA_SELECTOR)) {
    return element.disabled || element.readOnly ? null : 'plain'
  }
  return null
}

/** 可编辑面的两种：contenteditable 的主输入框，与 textarea。 */
type SurfaceKind = 'rich' | 'plain'

/** 插入符在视口里的矩形：左、上、高。宽度由样式表定。 */
interface CaretBox {
  left: number
  top: number
  height: number
}

/** 一个可编辑面上的自绘插入符。 */
interface CaretLayer {
  /** 自绘的那根。 */
  caret: HTMLElement
  /** 此刻可见。用来认出「刚露头」那一帧——它不能走过渡。 */
  visible: boolean
  /** 那根挂在谁身上：可编辑面的父元素。 */
  host: HTMLElement
  /** 父元素原本不是定位上下文、由这里补过标记；撤掉那根时标记要一起还回去。 */
  markedHost: boolean
}

/** 光标贴着的那个换行符，以及光标在它的哪一侧。 */
interface CaretAnchor {
  /** 换行符自己。它的矩形就是那一行的插入符位置——高度是字高，不是行高。 */
  lineBreak: HTMLBRElement
  /** 光标在它之前（行尾）还是之后（下一行行首）。 */
  before: boolean
}
