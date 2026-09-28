/**
 * 发送气泡的形变：从「一整张输入卡片」连续地长成「一条气泡」，整段在起飞那一刻算好、交给合成器。
 *
 * 读者看到的是：提交的那一下，输入卡片原样浮起来一份——底色、圆角、描边与阴影、工具栏、草稿
 * 里的字一样不差；它一边飞，一边把多出来的东西收掉（工具栏两组各自贴着最近的那个角缩小、淡出，
 * 描边与阴影跟着形状缩、跟着淡），外形收成气泡，字跟着变窄的形状一行一行重新排，落地时正好就是
 * 那条真实的气泡。真实的输入框留在原地、已经清空，替身从它身上离开。
 *
 * **为什么全部预先算好。** 提交那一刻 dsh 的主线程很重（新会话从 hero 切到对话、空闲会话第一次
 * 挂消息，都是几十到一百多毫秒的长任务），这段动画要是有任何一件事留在主线程上，它就会在那里卡住。
 * 形状、位置、透明度都是合成器能跑的属性（在真实 Chromium 里量过：主线程被整块占住四百毫秒，
 * `clip-path: inset(... round)`、`transform`、`opacity` 照样逐帧在走，`width` 纹丝不动）。唯一绕不开
 * 布局的是「字跟着形状重新排」——但折行只在一串离散的宽度上变化，所以把它也提前做掉：
 *
 *   形状    一个壳，`clip-path` 的圆角矩形从卡片的尺寸收到气泡的尺寸，圆角跟着 `round` 一起插值，
 *           不会像缩放那样被压扁。底色是壳里两层实色（卡片的、气泡的）靠透明度交叉淡换——
 *           `clip-path` 与 `background-color` 写进同一段关键帧时两个都会掉回主线程，实测主线程一占住，
 *           形状与颜色一起定格。
 *   描边    `clip-path` 会连元素自己的阴影一起裁掉，所以卡片的阴影与那一圈发丝描边挂在壳后面一个
 *           单独的「光晕」上：透明的盒子、原样的 box-shadow，跟着壳的外框缩放，一路淡掉。
 *   工具栏  卡片整张克隆下来（去掉底色与阴影，交给壳和光晕），工具栏左右两组各自贴着壳上最近的
 *           那个角走，边缩小边淡出——右边那组跟着右下角往里收，左边那组跟着底边往上收。
 *   字      起飞前先把「气泡的正文」在形变沿途的每一个宽度上排一遍，折行一样的归成一段，每段一层
 *           预先排好的字；时间到了哪一段就亮哪一层（`opacity` 的阶跃，合成器上切换）。多行时行高也
 *           要从输入框的 24 走到气泡的 22，行高按半像素分档，同样归进层里。第一段用的是输入框里那份
 *           草稿自己的克隆（引用、技能那些小块在输入框里另有样式），形变过半才换成气泡的写法。最后
 *           一层就是气泡自己的排版，交接时一个像素都不跳。
 *
 * 主线程上每帧只剩一件事：终点跟着页面动了多少（dsh 滚到底、回显换正式行），写在最外层，见
 * `send-flight.ts`。
 *
 * @module dsh-chat-ux/client/send-morph
 */

/**
 * 起飞那一整段的时长（毫秒）。**不是一个设置项**——它曾经是卡片上的 `sendFlightMs`（80–1200 ms 可调），
 * 后来固定下来：这条动效自己标着 beta、默认关着，多一个旋钮不值得。
 *
 * **开发期要微调就是改这一个数**，改完 `npm run build`、刷新页面（Ctrl+F5）。
 * 注意 `文档/业务/发送动效.md` 里那张一帧对照表是按这个数算的，改了这个数那张表的时刻要跟着重算；
 * 兜底定时器按 `FLIGHT_MS + RESCUE_MARGIN_MS` 走，不用另改。
 */
export const FLIGHT_MS = 300

/**
 * 两道缓动，**都是阻尼弹簧**——iOS 那套动效的骨架就是它：从静止起手、中段最快、尾段收住，走过了头
 * 还会弹回来一点点。
 *
 * **形变一道，横向也走它。** 外框的左右两条边各自从卡片的边走到气泡的边：宽度收多少、往哪边收，都是
 * 这一条曲线的函数，两条边都单调，不会冲出消息列，也不会先往回退一截。
 *
 * 横向**不能**单独去走一条更快的曲线。上一版就是这么干的（`ACROSS_OMEGA = 16`，两成时间走掉八成三），
 * 结果是壳已经横着挪出去、宽度却还没收，右边缘被甩出消息列：实测在 46 ms 顶出去最多
 * `(W0 - W1) × 0.246`——短消息 182 px、中消息 123 px，五分之一个列宽，看得见。两条边共用这一条曲线时，
 * 右边缘是 `start.right + (end.right - start.right) × m`，恒在列内、还严格单调。
 *
 * **这一条同时定着屏幕上那条轨迹。** 横向进度是它，纵向是另一条（`RISE_OMEGA` 那条），两者在时间上的
 * 比值决定了替身是「先横着窜出去、再竖着升上来」（比值从一个较大的数降到 1），还是沿着对角线一路走到底
 * （比值接近常数）。7 的比值是 1.50 / 1.30 / 1.16 / 1.07 / 1.01，几乎不动，轨迹就是那条对角线——
 * 读者会直接说「曲线像直线了」。**11.5 是照着旧版标定的**：3.09 / 2.16 / 1.63 / 1.33 / 1.16，与旧版的
 * 2.98 / 2.11 / 1.61 / 1.32 / 1.15 逐格吻合，而形变仍占得住五十来毫秒。再往上（13）更弯，但看得见的
 * 形变时间就被压得太短了。
 *
 * 临界阻尼，不过冲：形状不该弹。
 *
 * **纵向压在整段上，并且刻意欠阻尼**：走到头冲过去约 **2.84%**（`exp(-πζ/√(1-ζ²))`，只由阻尼比定、
 * 与 ω 无关），峰值落在 190 ms，之后一路落回目标——落定那一下的弹性就是它。
 *
 * 这几个数**不开放给读者调**（逐帧对照见 `文档/业务/发送动效.md`）。
 */
const MORPH_OMEGA = 11.5

/**
 * 纵向弹簧的阻尼比，临界是 1。**落定那一下弹多少，全看这一个数**：过冲量是
 * `exp(-πζ/√(1-ζ²))`，所以越大越收敛，取 1 就完全不弹。
 */
const RISE_DAMPING = 0.75

/** 纵向弹簧的角频率，与整段时长同一把尺子：越大收得越早、回冲越靠前。 */
const RISE_OMEGA = 7.5

/**
 * 形变收尾的位置（占整段的比例）。
 *
 * 形变曾经每帧由主线程写，那时它必须早收（0.45）：位移在合成器上、形变在主线程，主线程一忙，
 * 位置就跑到形状前面、右边拖出一块底色。现在两者都在合成器上、同一条时间线，不会再错开，所以它
 * 按「看得清输入卡片是怎么收成气泡的」来取：工具栏收走、字重新排，都要占得住一段读者看得见的时间。
 * 配上 `MORPH_OMEGA`，六十毫秒走掉八成四、九十毫秒九成六，百来毫秒就定形，剩下那一段只有上升与落定。
 */
const MORPH_END = 0.7

/** 采样段数。弹簧与形变都是连续曲线，拿折线去逼近——段数够密就看不出折点，每段五毫秒。 */
const SAMPLES = 60

/** 工具栏在形变进度走到这里时收完、淡完（五十五毫秒上下）。比形状早：多出来的东西先走，剩下的才是气泡。 */
const CHROME_GONE_AT = 0.8

/** 工具栏收到最小时的缩放。不收到零：它是淡掉的，缩放只负责「往角里退」的那个方向感。 */
const CHROME_MIN_SCALE = 0.55

/** 光晕（卡片的阴影与描边）在形变进度走到这里时淡完。气泡没有阴影，比工具栏晚一点走。 */
const HALO_GONE_AT = 0.9

/** 输入框那份草稿克隆最晚亮到这里就换成气泡的写法：引用、技能那些小块在两边的样式不一样。 */
const DRAFT_HANDOFF_AT = 0.5

/** 行高分档的粒度。多行时行距从 24 走到 22，每半像素一档。 */
const LINE_HEIGHT_STEP = 0.5

/**
 * 字最多分几层。折行在一串离散的宽度上变化，一段很长的正文可能变上几十次，每一层都是一张合成层
 * 纹理；超过这个数就把最短的那些段并进前一段——少几次重排，读者看不出来。
 */
const MAX_TEXT_LAYERS = 14

/** 起飞之前在输入卡片上抓下来的一切。全部在 React 清空草稿之前拿到。 */
export interface ComposerSnapshot {
  /** 卡片的视口矩形：替身的起点。 */
  readonly box: DOMRect
  readonly background: string
  readonly radius: number
  readonly shadow: string
  /** 整张卡片的克隆：底色与阴影已经摘掉，草稿区的高度钉死。 */
  readonly clone: HTMLElement
  /** 克隆里那一块草稿滚动区——第一段字就是它。 */
  readonly draft: HTMLElement
  /** 草稿滚动区原来滚到哪儿。克隆要进了文档才能滚，所以先记下来。 */
  readonly draftScrollTop: number
  /** 克隆里要收走的那几块（工具栏左右两组，以及别的有面积的东西），带着它们在卡片里的位置。 */
  readonly chrome: readonly ChromePiece[]
  /** 草稿的内容区相对卡片的位置：左、上内边距，以及右边还剩多少。 */
  readonly text: TextFrame
  /** 卡片的祖先给它的继承环境：自定义属性与字体、颜色。克隆离开原来的树，要把这些带上。 */
  readonly context: readonly (readonly [string, string])[]
}

/** 一块要收走的装饰。 */
interface ChromePiece {
  readonly element: HTMLElement
  /** 在卡片里的矩形：左、上、宽、高。 */
  readonly rect: readonly [number, number, number, number]
}

/** 字的框：内容区离外框左、上、右各多远，行高多少。 */
interface TextFrame {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly lineHeight: number
}

/** 起好的形变：挂在页面上的最外层，以及它上面跑着的全部动画。 */
export interface Morph {
  /** 最外层：终点动了多少写在它身上（主线程）。里面的一切都跑在合成器上。 */
  readonly wrapper: HTMLElement
  /** 位移那一条：落定以它为准。 */
  readonly travel: Animation
  /** 全部动画，收尾时一起取消。 */
  readonly animations: readonly Animation[]
}

/** 从卡片祖先那里继承下来、克隆必须带上的普通属性。自定义属性另外按差值挑。 */
const INHERITED_PROPERTIES = [
  'color', 'font-family', 'font-weight', 'font-style', 'font-stretch', 'font-feature-settings',
  'font-variation-settings', 'font-kerning', 'letter-spacing', 'word-spacing', 'text-rendering',
  '-webkit-font-smoothing', 'direction',
] as const

/** 字层要从气泡身上抄的排字属性：少抄一条，折行或字形就会和真实气泡对不上。 */
const TEXT_PROPERTIES = [
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-feature-settings',
  'font-variation-settings', 'font-kerning', 'letter-spacing', 'word-spacing', 'text-rendering',
  '-webkit-font-smoothing', 'direction', 'text-align', 'text-transform', 'text-indent', 'tab-size',
  'white-space', 'word-break', 'overflow-wrap', 'line-break', 'hyphens',
] as const

/** 克隆里要摘掉的标记：它们是 dsh（和本插件）拿来找输入框的，替身不能被找成输入框。 */
const IDENTITY_ATTRIBUTES = [
  'id', 'contenteditable', 'data-composer-card', 'data-composer-input', 'data-input-scroll',
  'data-lexical-editor', 'data-chat-ux-caret', 'tabindex', 'autofocus',
] as const

/**
 * 抓一次输入卡片：几何、外观、以及整张克隆。
 *
 * 必须在提交的捕获阶段调——那时草稿还在。量的都是布局已经结算好的东西，克隆也只是一次
 * `cloneNode`，放在读者按下回车的那一刻不会让它等。
 * @param input - 草稿的可编辑面。
 * @param card - 输入卡片。
 * @returns 抓到的快照；卡片量不到尺寸、或者草稿区不在卡片里时为 null。
 */
export function snapshotComposer(input: HTMLElement, card: HTMLElement): ComposerSnapshot | null {
  const box = card.getBoundingClientRect()
  if (box.width === 0 || box.height === 0) return null
  const scroll = input.closest<HTMLElement>('[data-input-scroll]')
  if (scroll === null || scroll.parentElement !== card) return null
  const cardStyle = getComputedStyle(card)
  const inputStyle = getComputedStyle(input)
  const inputBox = input.getBoundingClientRect()
  const text: TextFrame = {
    left: inputBox.left - box.left + input.clientLeft + pixel(inputStyle.paddingLeft),
    top: inputBox.top - box.top + input.clientTop + pixel(inputStyle.paddingTop),
    right: box.right - (inputBox.right - pixel(inputStyle.borderRightWidth) - pixel(inputStyle.paddingRight)),
    lineHeight: pixel(inputStyle.lineHeight),
  }

  // 卡片里哪几块是要收走的：有面积、又不是草稿区。横跨整张卡片、里面分成好几组的那一块是工具栏，
  // 按组拆开——左右两组要各自贴着自己那一边的角走。`display: contents` 的座位自己没有盒子，往里找。
  const paths: { path: number[]; rect: [number, number, number, number] }[] = []
  const rectOf = (element: Element): [number, number, number, number] => {
    const r = element.getBoundingClientRect()
    return [r.left - box.left, r.top - box.top, r.width, r.height]
  }
  const collect = (element: Element, path: number[]): void => {
    const [, , width, height] = rectOf(element)
    if (width * height === 0) {
      if (getComputedStyle(element).display !== 'contents') return
      Array.from(element.children).forEach((child, index) => { collect(child, [...path, index]) })
      return
    }
    const groups = Array.from(element.children).filter((child) => {
      const [, , w, h] = rectOf(child)
      return w * h > 0
    })
    if (width >= box.width * 0.9 && groups.length >= 2) {
      Array.from(element.children).forEach((child, index) => {
        const rect = rectOf(child)
        if (rect[2] * rect[3] > 0) paths.push({ path: [...path, index], rect })
      })
      return
    }
    paths.push({ path, rect: rectOf(element) })
  }
  Array.from(card.children).forEach((child, index) => {
    if (child !== scroll) collect(child, [index])
  })

  // 继承环境：自定义属性只挑和 body 上不一样的（替身挂在 body 下，一样的本来就继承得到）。
  const bodyStyle = getComputedStyle(document.body)
  const context: [string, string][] = []
  for (let index = 0; index < cardStyle.length; index += 1) {
    const name = cardStyle[index]
    if (name === undefined || !name.startsWith('--')) continue
    const value = cardStyle.getPropertyValue(name)
    if (value !== bodyStyle.getPropertyValue(name)) context.push([name, value])
  }
  for (const name of INHERITED_PROPERTIES) context.push([name, cardStyle.getPropertyValue(name)])

  const clone = card.cloneNode(true) as HTMLElement
  scrub(clone)
  clone.style.position = 'absolute'
  clone.style.left = '0px'
  clone.style.top = '0px'
  clone.style.margin = '0px'
  clone.style.width = box.width + 'px'
  clone.style.maxWidth = 'none'
  clone.style.height = box.height + 'px'
  clone.style.boxSizing = 'border-box'
  clone.style.background = 'transparent'
  clone.style.boxShadow = 'none'
  const draft = clone.children[Array.from(card.children).indexOf(scroll)] as HTMLElement
  // 草稿区的高度钉死：hero 态的最小高度挂在 `.hero .input` 上，克隆离开 `.hero` 就会塌，
  // 工具栏会跟着往上跑。
  const scrollBox = scroll.getBoundingClientRect()
  draft.style.height = scrollBox.height + 'px'
  draft.style.minHeight = '0px'
  draft.style.maxHeight = 'none'
  const chrome: ChromePiece[] = []
  for (const { path, rect } of paths) {
    let element: Element | undefined = clone
    for (const index of path) element = element?.children[index]
    if (element instanceof HTMLElement) chrome.push({ element, rect })
  }
  return {
    box,
    background: cardStyle.backgroundColor,
    radius: pixel(cardStyle.borderTopLeftRadius),
    shadow: cardStyle.boxShadow,
    clone,
    draft,
    draftScrollTop: scroll.scrollTop,
    chrome,
    text,
    context,
  }
}

/**
 * 起一段形变：把替身挂到页面上、把全部动画交给合成器。
 * @param snapshot - 起飞前抓下来的输入卡片。
 * @param bubble - 终点那条气泡（此刻已经在布局里、被藏着）。
 * @param end - 气泡的视口矩形。
 * @returns 起好的形变；气泡量不到尺寸时为 null。
 */
export function startMorph(snapshot: ComposerSnapshot, bubble: HTMLElement, end: DOMRect): Morph | null {
  if (end.width === 0 || end.height === 0) return null
  const start = snapshot.box
  const style = getComputedStyle(bubble)
  const W0 = start.width
  const H0 = start.height
  const W1 = end.width
  const H1 = end.height
  const R0 = snapshot.radius
  const R1 = pixel(style.borderTopLeftRadius)
  const from = snapshot.text
  const to: TextFrame = {
    left: bubble.clientLeft + pixel(style.paddingLeft),
    top: bubble.clientTop + pixel(style.paddingTop),
    right: pixel(style.borderRightWidth) + pixel(style.paddingRight),
    lineHeight: pixel(style.lineHeight),
  }
  const boxWidth = Math.max(W0, W1)
  const boxHeight = Math.max(H0, H1)

  // 整段时间线：每个采样点上的形变进度，以及由它推出来的外框、内边距、行高、可排字的宽度。
  const samples: Sample[] = []
  for (let step = 0; step <= SAMPLES; step += 1) {
    const u = step / SAMPLES
    const m = morphProgress(u)
    const width = W0 + (W1 - W0) * m
    const left = from.left + (to.left - from.left) * m
    const right = from.right + (to.right - from.right) * m
    samples.push({
      u,
      m,
      width,
      height: H0 + (H1 - H0) * m,
      radius: R0 + (R1 - R0) * m,
      left,
      top: from.top + (to.top - from.top) * m,
      content: Math.max(1, width - left - right),
      lineHeight: from.lineHeight + (to.lineHeight - from.lineHeight) * m,
    })
  }

  const wrapper = document.createElement('div')
  wrapper.setAttribute(GHOST_ATTRIBUTE, '')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.inert = true
  wrapper.style.cssText = 'position:fixed;margin:0;width:0;height:0;pointer-events:none;z-index:2147483000'
  wrapper.style.left = start.left + 'px'
  wrapper.style.top = start.top + 'px'
  const mover = document.createElement('div')
  mover.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;will-change:transform'
  const halo = document.createElement('div')
  halo.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;background:transparent;will-change:transform,opacity'
  halo.style.width = W0 + 'px'
  halo.style.height = H0 + 'px'
  halo.style.borderRadius = R0 + 'px'
  halo.style.boxShadow = snapshot.shadow
  const shell = document.createElement('div')
  shell.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;will-change:transform'
  shell.style.width = boxWidth + 'px'
  shell.style.height = boxHeight + 'px'
  for (const [name, value] of snapshot.context) shell.style.setProperty(name, value)
  // 底色是两层实色叠着淡，不是 `background-color` 动画：它和 `clip-path` 写在同一段关键帧里时，两个都
  // 会掉回主线程（实测主线程一占住，形状与颜色一起定格，只有透明度还在走）；而透明度是合成器最老的
  // 那条路，旧一点的 Chromium 上也稳。两层不透明的实色按 α 叠，正好就是两色的线性插值。
  const bubbleFill = document.createElement('div')
  bubbleFill.style.cssText = 'position:absolute;inset:0'
  bubbleFill.style.backgroundColor = style.backgroundColor
  const cardFill = document.createElement('div')
  cardFill.style.cssText = 'position:absolute;inset:0;will-change:opacity'
  cardFill.style.backgroundColor = snapshot.background
  shell.append(bubbleFill, cardFill, snapshot.clone)

  // 字：先在沿途每个宽度上排一遍，再按「折行一样、行高一档」归段。第一段是克隆卡片里那份草稿
  // 自己，其余每段一层。
  const bottomPadding = pixel(style.paddingBottom) + pixel(style.borderBottomWidth)
  const [draftWindow, ...bubbleWindows] = textWindows(bubble, style, samples, to.lineHeight, bottomPadding)
  const layers = bubbleWindows.map((window) => {
    const layer = textLayer(bubble, style)
    layer.style.width = window.width + 'px'
    layer.style.lineHeight = window.lineHeight + 'px'
    shell.appendChild(layer)
    return { layer, window }
  })

  mover.appendChild(halo)
  mover.appendChild(shell)
  wrapper.appendChild(mover)
  document.body.appendChild(wrapper)
  // 克隆要进了文档才能滚到原来的位置。
  if (snapshot.draftScrollTop > 0) snapshot.draft.scrollTop = snapshot.draftScrollTop

  const timing: KeyframeAnimationOptions = { duration: FLIGHT_MS, easing: 'linear', fill: 'forwards' }
  const animations: Animation[] = []
  const run = (element: HTMLElement, frames: Keyframe[]): Animation => {
    const animation = element.animate(frames, timing)
    animations.push(animation)
    return animation
  }
  // 只在 [from, until] 里逐格采样，两头各补一帧定住。形变收尾之后那些属性不再变，一层字只在它亮着的
  // 那一段里才看得见——窗口外的关键帧只是让起飞那一帧多解析几百条（实测建动画占了建替身的一半）。
  const between = (from: number, until: number, frame: (sample: Sample) => Keyframe): Keyframe[] => {
    const frames: Keyframe[] = []
    for (const sample of samples) {
      if (sample.u < from || sample.u > until) continue
      frames.push({ ...frame(sample), offset: sample.u })
    }
    const first = frames[0]
    const last = frames.at(-1)
    if (first !== undefined && (first.offset ?? 0) > 0) frames.unshift({ ...first, offset: 0 })
    if (last !== undefined && (last.offset ?? 1) < 1) frames.push({ ...last, offset: 1 })
    return frames
  }

  const dx = end.left - start.left
  const dy = end.top - start.top
  // 横向走形变那条曲线：左边从卡片的左边走到气泡的左边，右边（左边加宽度）同理，两条边都单调。
  const travel = run(mover, samples.map(sample => ({
    offset: sample.u,
    transform: 'translate(' + dx * sample.m + 'px, ' + dy * springProgress(sample.u, RISE_DAMPING, RISE_OMEGA) + 'px)',
  })))
  // 形状这一条只放 `clip-path`：和别的属性合在一段关键帧里，它就不上合成器了。
  run(shell, between(0, MORPH_END, sample => ({
    clipPath: 'inset(0px ' + (boxWidth - sample.width) + 'px ' + (boxHeight - sample.height) + 'px 0px round '
      + sample.radius + 'px)',
  })))
  run(cardFill, between(0, MORPH_END, sample => ({ opacity: String(1 - sample.m) })))
  run(halo, between(0, MORPH_END, sample => ({
    transform: 'scale(' + sample.width / W0 + ', ' + sample.height / H0 + ')',
    opacity: String(Math.max(0, 1 - sample.m / HALO_GONE_AT)),
  })))
  for (const piece of snapshot.chrome) {
    const [x, y, width, height] = piece.rect
    // 贴着最近的那个角走：右半边的跟着右边，下半边的跟着底边，缩放也以那个角为原点。
    const anchorRight = x + width / 2 > W0 / 2
    const anchorBottom = y + height / 2 > H0 / 2
    piece.element.style.transformOrigin = (anchorRight ? '100%' : '0%') + ' ' + (anchorBottom ? '100%' : '0%')
    run(piece.element, between(0, MORPH_END, (sample) => {
      const gone = Math.min(1, sample.m / CHROME_GONE_AT)
      const shiftX = anchorRight ? sample.width - W0 : 0
      const shiftY = anchorBottom ? sample.height - H0 : 0
      return {
        transform: 'translate(' + shiftX + 'px, ' + shiftY + 'px) scale(' + (1 - (1 - CHROME_MIN_SCALE) * gone) + ')',
        opacity: String(1 - gone),
      }
    }))
  }

  // 第一段字是输入框里那份草稿自己：它在克隆的卡片里原地待着，跟着内容区的起点平移。
  const draftUntil = draftWindow === undefined ? 1 : draftWindow.until
  run(snapshot.draft, between(0, draftUntil, sample => ({
    transform: 'translate(' + (sample.left - from.left) + 'px, '
      + (sample.top - from.top + (sample.lineHeight - from.lineHeight) / 2) + 'px)',
  })))
  run(snapshot.draft, stepOpacity(0, draftUntil))
  for (const { layer, window } of layers) {
    run(layer, between(window.from, window.until, sample => ({
      transform: 'translate(' + sample.left + 'px, ' + (sample.top + (sample.lineHeight - window.lineHeight) / 2) + 'px)',
    })))
    run(layer, stepOpacity(window.from, window.until))
  }
  return { wrapper, travel, animations }
}

/** 替身最外层上的标记。它只是个排查用的把手，样式一条都不挂在它上面。 */
const GHOST_ATTRIBUTE = 'data-chat-ux-send-ghost'

/** 时间线上的一个采样点。 */
interface Sample {
  /** 时间占比，0 到 1。 */
  readonly u: number
  /** 形变进度，0 到 1。 */
  readonly m: number
  /** 壳的外框。高度可能被字撑高（见 `textWindows`），所以不是只读的。 */
  readonly width: number
  height: number
  readonly radius: number
  /** 字的内容区起点。 */
  readonly left: number
  readonly top: number
  /** 这一刻可排字的宽度。 */
  readonly content: number
  /** 这一刻的行高（连续值）。 */
  readonly lineHeight: number
}

/** 一段字：从哪一刻亮到哪一刻，按多宽排、行高多少。 */
interface TextWindow {
  from: number
  until: number
  readonly width: number
  readonly lineHeight: number
}

/**
 * 把形变沿途的每一个宽度都排一遍，折行一样（多行时再加上行高同档）的归成一段。
 *
 * 排的是气泡自己的正文，量的是每一行的行盒。探针挂在视口外、自成一块布局区域，改它的宽度只重排它
 * 自己。第一段让给输入框那份草稿克隆，但最晚在 `DRAFT_HANDOFF_AT` 交出去；最后一段就是气泡本身。
 * 顺带把字撑高的那几格的外框高度补上（`samples` 里的高度会被改写）。
 * @param bottomPadding - 气泡正文到底边的距离，字撑高外框时用。
 * @returns 按时间排好的段；第一段的内容由草稿克隆负责，这里只给它时间窗。
 */
function textWindows(
  bubble: HTMLElement,
  style: CSSStyleDeclaration,
  samples: readonly Sample[],
  finalLineHeight: number,
  bottomPadding: number,
): TextWindow[] {
  const probeHost = document.createElement('div')
  probeHost.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;contain:layout style;pointer-events:none'
  const probe = textLayer(bubble, style)
  probe.style.position = 'static'
  probeHost.appendChild(probe)
  document.body.appendChild(probeHost)
  const layouts = new Map<number, { signature: string; lines: number }>()
  const layoutAt = (width: number): { signature: string; lines: number } => {
    // 宽度原样用，不取整：气泡是按字的宽度收缩的，它的内容区就是最长那一行的宽度，往下舍哪怕
    // 零点几像素，最后那一行都会被挤到下一行去。
    const key = width
    const known = layouts.get(key)
    if (known !== undefined) return known
    probe.style.width = key + 'px'
    const range = document.createRange()
    range.selectNodeContents(probe)
    const tops = new Set<number>()
    const parts: string[] = []
    for (const rect of range.getClientRects()) {
      tops.add(Math.round(rect.top))
      parts.push(Math.round(rect.top) + ':' + Math.round(rect.right))
    }
    const layout = { signature: parts.join(','), lines: tops.size }
    layouts.set(key, layout)
    return layout
  }

  // 每一格按这一格里最窄的那一刻排：外框在这五毫秒里还在收，按起点排的话，字会在这一格的后半截
  // 顶进右边的内边距、甚至顶出外框（实测形变最快那一段，一格能收十几像素）。第一格按卡片自己的
  // 宽度排——它就是输入框里原样的折行，而弹簧起手的那一格几乎没动。
  const widths = samples.map((sample, index) => {
    const next = samples[index + 1]
    return index === 0 || next === undefined ? sample.content : Math.min(sample.content, next.content)
  })
  // 不必每一格都排：默认的折行是贪心的，两个宽度排出来一模一样，夹在中间的每一个宽度也一样
  // （每一行能放下的，至少是窄的那边放下的、至多是宽的那边放下的，两边相同就只能是它）。所以只在
  // 两头不一样的地方二分下去——一段长正文从四十来次排版降到十来次。
  const perSample: ({ signature: string; lines: number } | undefined)[] = new Array(widths.length)
  const fill = (from: number, to: number): void => {
    if (to - from <= 1) return
    const left = perSample[from]
    const right = perSample[to]
    if (left !== undefined && right !== undefined && left.signature === right.signature) {
      for (let index = from + 1; index < to; index += 1) perSample[index] = left
      return
    }
    const middle = (from + to) >> 1
    perSample[middle] = layoutAt(widths[middle] ?? 0)
    fill(from, middle)
    fill(middle, to)
  }
  const lastIndex = widths.length - 1
  perSample[0] = layoutAt(widths[0] ?? 0)
  perSample[lastIndex] = layoutAt(widths[lastIndex] ?? 0)
  fill(0, lastIndex)

  const windows: (TextWindow & { readonly key: string })[] = []
  samples.forEach((sample, index) => {
    const width = widths[index] ?? sample.content
    const layout = perSample[index] ?? layoutAt(width)
    // 窄下来之后行数变多，字要是比外框还高，外框跟着长——自适应高度的气泡本来就是这样。
    const needed = sample.top + layout.lines * sample.lineHeight + bottomPadding
    if (needed > sample.height) sample.height = needed
    // 单行时行高不影响字形的位置（上下的差由平移补上），不必为它分层。
    const lineHeight = layout.lines > 1
      ? Math.round(sample.lineHeight / LINE_HEIGHT_STEP) * LINE_HEIGHT_STEP
      : finalLineHeight
    const key = layout.signature + '|' + lineHeight
    const last = windows.at(-1)
    if (last !== undefined) last.until = sample.u
    if (last !== undefined && last.key === key) return
    windows.push({ key, from: sample.u, until: sample.u, width, lineHeight })
  })
  probeHost.remove()
  const lastWindow = windows.at(-1)
  if (lastWindow !== undefined) lastWindow.until = 1
  // 第一段由草稿克隆负责，但最晚在 DRAFT_HANDOFF_AT 交出去：那之后同样的折行改用气泡的写法。
  const handoff = samples.find(sample => sample.m >= DRAFT_HANDOFF_AT)?.u ?? 1
  const first = windows[0]
  if (first !== undefined && first.until > handoff) {
    windows.splice(1, 0, { key: first.key, from: handoff, until: first.until, width: first.width, lineHeight: first.lineHeight })
    first.until = handoff
  }
  // 太多段就把最短的那些并进**后一段**：后一段排得更窄，提前亮出来只是早折一行；并进前一段的话，
  // 更宽的那份排版会在外框已经收窄之后还亮着，字就顶出去了。前两段（草稿与它交出去的那一段）不参与。
  while (windows.length > MAX_TEXT_LAYERS) {
    let shortest = 2
    for (let index = 3; index < windows.length - 1; index += 1) {
      const window = windows[index]
      const best = windows[shortest]
      if (window === undefined || best === undefined) continue
      if (window.until - window.from < best.until - best.from) shortest = index
    }
    const removed = windows[shortest]
    const following = windows[shortest + 1]
    if (removed === undefined || following === undefined) break
    following.from = removed.from
    windows.splice(shortest, 1)
  }
  return windows
}

/**
 * 一层预先排好的正文：气泡里的内容原样克隆，排字属性从气泡上抄。
 * @param bubble - 终点那条气泡。
 * @param style - 它的计算样式。
 * @returns 还没定宽的字层。
 */
function textLayer(bubble: HTMLElement, style: CSSStyleDeclaration): HTMLElement {
  const layer = document.createElement('div')
  layer.style.cssText = 'position:absolute;left:0;top:0;margin:0;padding:0;border:0;box-sizing:content-box;will-change:transform,opacity'
  for (const name of TEXT_PROPERTIES) layer.style.setProperty(name, style.getPropertyValue(name))
  for (const node of bubble.childNodes) {
    const copy = node.cloneNode(true)
    if (copy instanceof Element) scrub(copy)
    layer.appendChild(copy)
  }
  return layer
}

/**
 * 一段只在 `[from, until)` 里亮着的透明度：两头是阶跃，合成器上切换。
 * @returns 关键帧；同一个 offset 出现两次，就是在那一刻跳变。
 */
function stepOpacity(from: number, until: number): Keyframe[] {
  const frames: Keyframe[] = []
  if (from > 0) frames.push({ offset: 0, opacity: '0' }, { offset: from, opacity: '0' })
  frames.push({ offset: from, opacity: '1' }, { offset: until, opacity: '1' })
  if (until < 1) frames.push({ offset: until, opacity: '0' }, { offset: 1, opacity: '0' })
  return frames
}

/** 把一棵克隆里的身份标记全部摘掉：替身不能被 dsh 或本插件找成输入框、也不能拿到焦点。 */
function scrub(root: Element): void {
  const all = [root, ...root.querySelectorAll('*')]
  for (const element of all) {
    for (const name of IDENTITY_ATTRIBUTES) element.removeAttribute(name)
  }
  for (const layer of root.querySelectorAll('[data-chat-ux-caret-layer]')) layer.remove()
}

/**
 * 形变进度：一条临界阻尼的弹簧，压进前 `MORPH_END` 段。弹簧在窗口末端还差一点点没到（ω=7 时差
 * 0.7%），整条按末端的值归一，终点严丝合缝、中间也不跳。
 */
function morphProgress(u: number): number {
  if (u >= MORPH_END) return 1
  return springProgress(u / MORPH_END, 1, MORPH_OMEGA) / springProgress(1, 1, MORPH_OMEGA)
}

/**
 * 一条阻尼弹簧的位移响应：从 0 走到 1，`u` 是已经走完的时间占比。
 *
 * 起手从零加速、中段最快、尾段收住；阻尼比小于 1 时它会冲过 1 一点再回来——落定那一下的弹性
 * 就是它。`u` 超出 1 的部分由调用方夹住。
 * @param u - 时间占比，0 到 1。
 * @param damping - 阻尼比；1 是临界阻尼，不会过冲。
 * @param omega - 角频率，与 `u` 同一把尺子：越大收得越早。
 * @returns 位移进度；阻尼比小于 1 时可能略大于 1。
 */
function springProgress(u: number, damping: number, omega: number): number {
  if (damping >= 1) return 1 - (1 + omega * u) * Math.exp(-omega * u)
  const damped = omega * Math.sqrt(1 - damping * damping)
  return 1 - Math.exp(-damping * omega * u)
    * (Math.cos(damped * u) + (damping * omega / damped) * Math.sin(damped * u))
}

/** 读一个长度值。读不出来当 0——位移偏一点点，也比整段不做要轻。 */
export function pixel(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 一个计算后的颜色有多不透明。不认得的写法当 0：宁可不飞，也不画一块来路不明的色。 */
export function alphaOf(color: string): number {
  const parts = colorParts(color)
  if (parts === null) return 0
  return parts[3] ?? 1
}

/** 拆 `rgb()` / `rgba()` 里的数。认不出来给 null。 */
function colorParts(color: string): number[] | null {
  const match = /^rgba?\(([^)]+)\)$/.exec(color.trim())
  if (match === null) return null
  const raw = match[1]
  if (raw === undefined) return null
  const parts = raw.split(',').map(part => Number.parseFloat(part))
  if (parts.length < 3 || parts.some(part => !Number.isFinite(part))) return null
  return parts
}
