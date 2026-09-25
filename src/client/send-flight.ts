/**
 * 发送气泡的起飞。
 *
 * 提交之后 dsh 会立刻挂一条「即发即显」的回显气泡（`[data-submission-echo]`），真实消息一到就把
 * 它换成正式的那一行。本机实测：回显只活 **159 ms**，而正式那一行要 **1 秒多**才到——动画挂在这两条
 * 节点上必死（挂回显，半路连节点都没了；等正式行，读者先看到一秒多的空档）。
 *
 * 所以这里自己画一个替身。它是**两层**：外面那层壳就是输入框的形状（尺寸、圆角、底色都从输入卡片
 * 现读），里面挂着克隆下来的那条气泡（底色摘掉，交给壳），于是同一个元素从「一条输入框」连续地
 * 长成「一条气泡」：
 *
 *   抓起点    提交的 capture 阶段量下三样东西：草稿的位置与颜色、输入卡片的矩形、卡片的底色与圆角。
 *             全都早于 React 清空草稿。
 *   认信号    回显行一挂上来就认——认它的是 MutationObserver，不是每帧轮询。
 *   立替身    壳摆到输入卡片的位置与原尺寸，真实的那一行挂属性藏起来（保留布局盒，终点每帧都量得到）。
 *   逐帧画    位置与形变各走各的曲线：横向一路减速、纵向一路加速，形变再把横向那条压进前一段里
 *             先收住。于是路径**始终在拐**、形状却早早定死——位置、尺寸、圆角、底色、内容的相对位置
 *             都是这几条曲线的函数。整段时长是插件管理页上的一个设置项，每一段起飞开始时现读一次；
 *             曲线的两个幂次不开放，它们是照着「方向一直在转」量出来的（见下面那一段）。
 *
 *             **这一帧里只有纯计算和几次样式写。** 认行、量外形都不在这儿——那是 DOM 事件的活儿
 *             （见下面那条边界）。这里是每秒六十次的地方，任何一次查询或计算样式，都会把整页的
 *             布局结算拖进每一帧里来。
 *   落定      摘属性、扔掉替身——真实那一行本来就在终点上，交接不需要搬任何东西。
 *
 * 五条边界（前两条是实测踩出来的）：
 *
 *   同帧就得藏    用 MutationObserver 而不是每帧轮询找回显：它在本帧渲染**之前**回调，所以真实
 *                 那一行一帧都不会露出来。晚一帧的话读者会先看到一个正常气泡闪一下、随即被抹掉。
 *   认行不在帧里  「当场」不等于「每帧」。回显被正式那一行换掉，同一个 observer 会在本帧渲染之前
 *                 同步认出来；帧里再查一遍是白花的——长会话里光那两句全文档查询就够吃掉半帧。
 *                 量外形也一样：内边距、圆角、底色都属于同一个气泡，跟着行换一次就够。
 *   宽度要写死      克隆出来的气泡离开原来的弹性上下文后会摊成整行，所以宽度取量到的那一份；而
 *                 `getBoundingClientRect` 给的是 border-box 宽，`box-sizing` 必须跟着写成 border-box，
 *                 否则内边距会再叠一次（右边胖出一截）。
 *   抓不到就不做    起点抓不到（快捷键、程序化提交）时这一次不动手，读者看到的还是 dsh 原来的样子。
 *   藏起来必须还    真实行被藏着的这会儿，读者看不见那条消息。所以除了正常落定，还有一条定时器
 *                 兜底：后台标签页里 rAF 会停，替身停了，属性不能一直挂着。
 *
 * @module dsh-chat-ux/client/send-flight
 */
import { CHAT_FLOW_SELECTOR, COMPOSER_CARD_SELECTOR, COMPOSER_INPUT_SELECTOR, SUBMISSION_ECHO_SELECTOR } from './dom-contract'

/** 挂在真实行上的标记：有它，那一行就先藏着。规则在 `send-flight-styles.ts`，两边必须一字不差。 */
export const FLYING_ATTRIBUTE = 'data-chat-ux-send-flight'

/** 挂在替身壳上的标记。它只是个排查用的把手，样式一条都不挂在它上面。 */
const GHOST_ATTRIBUTE = 'data-chat-ux-send-ghost'

/**
 * 三道缓动。
 *
 * **横向是三次 ease-out，纵向是二次 ease-in。** 两条导数互补：横向从三倍平均速度一路减到零，纵向
 * 从零一路加到两倍。于是路径的角度从起手的 -3° 平滑转到收尾的 -90°，**中间没有一段是平的**——
 * 哪一段平了，画出来就是一条直角折线，生硬就生硬在那儿（已经为这个返工过一次）。
 *
 * **形变走横向那条曲线，但压进前 MORPH_END 段。** 于是它更早收住：六成时长处已经走完九成八，气泡
 * 还没离开输入框就长成了气泡的样子，剩下那段上升里形状不再有可见变化。
 *
 * 两者分家是有代价的：右边缘会先往左退一截，再随横向回来。退多少不是常量——横向距离越近、气泡
 * 越窄，退得越多，实测在几十像素量级；横向距离够远时它根本不发生。气泡的横向位移本来就靠左边缘
 * 右移实现，宽度收得越早、左边缘到位就越早、路径就越像直角——两头不可兼得，这里选路径。
 *
 * 这两个幂次**不开放给读者调**：它们不是随手挑的，是照着「方向单调地转、中间没有平段」量出来的。
 * 换一组也画得出来——两个都取 1，路径就成了一条直线；横向取 4、纵向取 3，就成了先贴地冲出去、后段
 * 才抬起来——但那是另一种东西，不该由卡片上的一个开关决定。
 */
const ACROSS_POWER = 3

/** 纵向的幂次，见上面那一段。 */
const RISE_POWER = 2

/** 形变收尾的位置。比横向早，但不能早到把路径压成直角。 */
const MORPH_END = 0.85

/** 起点只认这么久。抓完超过它才出现的回显，不算这一次提交的。 */
const ORIGIN_TTL_MS = 1500

/**
 * 位移上限的兜底值：一屏比它窄时按它算（见 `sameScreen`）。
 *
 * 这里原来是一个固定的 900px 上限，宽屏上会误伤：dsh 的内容列宽封顶 920px，输入卡片又比列每边
 * 宽 16px，起终点的横向距离天生就压在 890 上下、贴着阈值走；纵向更随窗口高度一路涨——短对话里
 * 消息贴在列顶、输入框粘在底部，一屏拉开一千多像素是常态。两个方向都不该由屏幕多大来决定飞不飞。
 */
const FLIGHT_LIMIT_FLOOR_PX = 900

/** 兜底比飞行本身多留一点：定时器在后台被节流，也要赶在读者切回来之前把消息放出来。 */
const RESCUE_MARGIN_MS = 400

/** 只认聊天流里的回显：排队的那条落在队列坞里，飞过去是另一种转场，本期不做。 */
const ECHO_SELECTOR = CHAT_FLOW_SELECTOR + ' ' + SUBMISSION_ECHO_SELECTOR

/** 已经落定的用户行。它和回显行是同一个组件的两副面孔，结构差一层。 */
const USER_ROW_SELECTOR = CHAT_FLOW_SELECTOR + ' [data-chat-flow-kind="user"]'

/** 飞行期间要认的两种行，合成一句查：正式的用户行，以及它前面那条回显。 */
const ROW_SELECTOR = USER_ROW_SELECTOR + ', ' + ECHO_SELECTOR

/**
 * 给整页装上发送气泡的起飞。
 * @param readMs - 现读的整段时长（毫秒）。每一段起飞开始时读一次，所以运行期改设置只影响下一段，
 * 不会打断正在飞的那一段。
 * @returns 卸载入口：摘掉监听，收掉还在等的那一轮与正在飞的那一段（包括把藏着的消息放出来）。
 */
export function installSendFlight(readMs: () => number): () => void {
  // 读者的系统偏好说了先。dsh 自己在滚动那一侧也是这么办的（`use-scroll-follow.ts` 的 `toBottom`）。
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

  /** 最近一次抓到的草稿起点。 */
  let origin: DraftOrigin | null = null
  /** 已经认过的回显行。安装时先把页面里躺着的那些认下来——恢复会话时它们也在。 */
  const handled = new WeakSet<Element>()
  /** 正在飞的那一段。读者连发时，最后一段说了算。 */
  let flight: Flight | null = null
  /** 定时器兜底。 */
  let rescue = 0

  for (const echo of document.querySelectorAll(ECHO_SELECTOR)) handled.add(echo)

  /**
   * 飞行期间盯行：回显被正式那一行换掉，是唯一一件要当场知道的事。
   *
   * 它在本帧渲染**之前**回调，所以同步认一次就够；但只在真有行进出时才认——预筛只看增删节点
   * **自己**，两个属性都挂在行元素身上，认行不必往下找子树。
   */
  const rowWatcher = new MutationObserver((records) => {
    const current = flight
    if (current === null || !touchesUserRow(records)) return
    const row = currentRow(current.previous)
    if (row === null || row === current.hidden) return
    current.hidden?.removeAttribute(FLYING_ATTRIBUTE)
    row.setAttribute(FLYING_ATTRIBUTE, '')
    current.hidden = row
    current.target = measureTarget(row)
    placeGhost(current, performance.now() - current.startedAt)
  })

  /** 落定：先把真实行放出来，再扔掉替身。顺序反了会闪一下空白。 */
  const settle = (): void => {
    const current = flight
    if (current === null) return
    flight = null
    rowWatcher.disconnect()
    window.clearTimeout(rescue)
    rescue = 0
    current.hidden?.removeAttribute(FLYING_ATTRIBUTE)
    current.shell.remove()
  }

  /** 帧里只画。认行与量外形都交给上面那个 observer——它们不是每帧都有新答案的事。 */
  const tick = (): void => {
    const current = flight
    if (current === null) return
    const elapsed = performance.now() - current.startedAt
    if (elapsed >= current.ms) {
      settle()
      return
    }
    placeGhost(current, elapsed)
    requestAnimationFrame(tick)
  }

  /** 起一段飞行：立替身、藏真实行、把第一帧摆好。全部同步做完——晚一帧读者就会看到真实气泡闪一下。 */
  const startFlight = (echo: HTMLElement, draft: DraftOrigin): void => {
    const target = measureTarget(echo)
    if (target === null) return
    const box = target.bubble.getBoundingClientRect()
    const card = draft.card.box
    if (!sameScreen(card.left, box.left, window.innerWidth)) return
    if (!sameScreen(card.top, box.top, window.innerHeight)) return
    const ghost = createGhost(target.bubble, box)
    if (ghost === null) return
    const ms = readMs()
    echo.setAttribute(FLYING_ATTRIBUTE, '')
    flight = {
      draft,
      shell: ghost.shell,
      content: ghost.content,
      startedAt: performance.now(),
      ms,
      previous: lastUserRow(),
      hidden: echo,
      target,
    }
    placeGhost(flight, 0)
    rowWatcher.observe(document.body, { childList: true, subtree: true })
    rescue = window.setTimeout(settle, ms + RESCUE_MARGIN_MS)
    requestAnimationFrame(tick)
  }

  /**
   * 等这一次提交的回显。
   *
   * 只在抓过起点之后才挂上（平时一次回调都不会有），认到、超时或者被放弃时立刻摘掉。
   */
  const echoWatcher = new MutationObserver(() => {
    const draft = origin
    if (draft === null) {
      echoWatcher.disconnect()
      return
    }
    if (performance.now() - draft.capturedAt > ORIGIN_TTL_MS) {
      origin = null
      echoWatcher.disconnect()
      return
    }
    const echo = takeFreshEcho(handled)
    if (echo === null) return
    origin = null
    echoWatcher.disconnect()
    startFlight(echo, draft)
  })

  /** 抓一次草稿起点。抓不到就当这一下不是提交——不动手永远安全。 */
  const captureOrigin = (): void => {
    const input = document.querySelector(COMPOSER_INPUT_SELECTOR)
    if (!(input instanceof HTMLElement)) return
    const card = input.closest(COMPOSER_CARD_SELECTOR)
    if (!(card instanceof HTMLElement)) return
    const range = document.createRange()
    range.selectNodeContents(input)
    const box = range.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    const cardStyle = getComputedStyle(card)
    origin = {
      capturedAt: performance.now(),
      box,
      color: getComputedStyle(input).color,
      card: {
        box: card.getBoundingClientRect(),
        background: cardStyle.backgroundColor,
        radius: pixel(cardStyle.borderTopLeftRadius),
      },
    }
    echoWatcher.observe(document.body, { childList: true, subtree: true })
  }

  /**
   * 提交的两条手动路径：回车，和点输入卡片里的按钮。两个都早于 React 清空草稿，所以起点量得到。
   * 点了没提交也不亏——没有回显就没有动画。
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.isComposing) return
    captureOrigin()
  }

  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) return
    if (event.target.closest(COMPOSER_CARD_SELECTOR) === null) return
    captureOrigin()
  }

  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('click', onClick, true)

  return () => {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('click', onClick, true)
    echoWatcher.disconnect()
    rowWatcher.disconnect()
    origin = null
    settle()
  }
}

/** 草稿起飞前的那一刻：文字在哪儿、什么颜色，以及那条输入卡片长什么样。 */
interface DraftOrigin {
  readonly capturedAt: number
  readonly box: DOMRect
  readonly color: string
  readonly card: CardShape
}

/** 输入卡片的外形。壳的起点就是它。 */
interface CardShape {
  readonly box: DOMRect
  readonly background: string
  readonly radius: number
}

/** 一段正在飞的动画。`hidden` 会在回显被换掉时改指新来的那一行。 */
interface Flight {
  readonly draft: DraftOrigin
  /** 替身的壳：输入卡片的形状从这里长成气泡。 */
  readonly shell: HTMLElement
  /** 壳里挂着的那条克隆气泡（底色摘掉了，交给壳）。 */
  readonly content: HTMLElement
  readonly startedAt: number
  /** 这一段的整段时长。起飞那一刻定下来，飞行中改设置不改它。 */
  readonly ms: number
  /** 起飞之前聊天流里最后一条用户消息。靠它认出新来的那一行。 */
  readonly previous: HTMLElement | null
  hidden: HTMLElement | null
  /** 终点。跟着 `hidden` 一起换；量不到时留 null，这一帧就不画。 */
  target: FlightTarget | null
}

/**
 * 终点：气泡在哪儿，以及它长什么样。
 *
 * 位置每一帧都得重量（它会随滚动走），外形不用——内边距、圆角、底色都属于同一个气泡，飞行期间
 * 不会有第二个值。分成两半存就是为了这个：一半每帧读，一半只读一次。
 */
interface FlightTarget {
  /** 那一行里真正画了底色的元素，替身一路长成它。 */
  readonly bubble: HTMLElement
  readonly padding: { readonly top: number; readonly left: number }
  readonly radius: number
  readonly background: string
}

/**
 * 取一条还没认过的回显行。
 *
 * 一批里只认最新的一条（`querySelectorAll` 是文档序），其余的也一并记下——否则它们会在后面的帧
 * 里被当成新的，跟着再飞一次。
 */
function takeFreshEcho(handled: WeakSet<Element>): HTMLElement | null {
  const fresh: Element[] = []
  for (const echo of document.querySelectorAll(ECHO_SELECTOR)) {
    if (!handled.has(echo)) fresh.push(echo)
  }
  if (fresh.length === 0) return null
  for (const echo of fresh) handled.add(echo)
  const latest = fresh.at(-1)
  return latest instanceof HTMLElement ? latest : null
}

/** 此刻该藏的那一条：回显还在就是它，回显被换掉之后就是正式那一行。 */
function currentRow(previous: HTMLElement | null): HTMLElement | null {
  const echo = document.querySelector(ECHO_SELECTOR)
  if (echo instanceof HTMLElement && echo !== previous) return echo
  const row = lastUserRow()
  return row === previous ? null : row
}

/** 聊天流里最后一条用户行。 */
function lastUserRow(): HTMLElement | null {
  const rows = document.querySelectorAll(USER_ROW_SELECTOR)
  const last = rows.item(rows.length - 1)
  return last instanceof HTMLElement ? last : null
}

/**
 * 一行用户消息里真正画了底色的那一个元素，也就是气泡。
 *
 * 不能认死层数：回显行自己就是气泡那一行（`data-submission-echo` 挂在 `.userRow` 上），而正式行
 * 外面还套着一层流块容器——两边的深度差一层。所以从这一行往下按层找，谁先画了底色就是谁；附件行
 * 与引用摘要都没有底色，会被跳过。
 */
function findBubble(row: HTMLElement): HTMLElement | null {
  const queue: Element[] = Array.from(row.children)
  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    if (current instanceof HTMLElement && alphaOf(getComputedStyle(current).backgroundColor) > 0) return current
    for (const child of current.children) queue.push(child)
  }
  return null
}

/**
 * 量一次终点：气泡在哪儿（每帧现读）、长什么样（只读这一次）。
 * @param row - 此刻藏着的那一行。
 * @returns 终点；这一行里找不到画了底色的元素时为 null。
 */
function measureTarget(row: HTMLElement): FlightTarget | null {
  const bubble = findBubble(row)
  if (bubble === null) return null
  const style = getComputedStyle(bubble)
  return {
    bubble,
    padding: { top: pixel(style.paddingTop), left: pixel(style.paddingLeft) },
    radius: pixel(style.borderTopLeftRadius),
    background: style.backgroundColor,
  }
}

/**
 * 这一批 DOM 变化里有没有碰用户行或回显行。
 *
 * 只看增删节点**自己**：两个属性都挂在行元素身上，认行不必往下找子树——长会话里往下找一次
 * 就是几千个节点。
 * @param records - observer 交来的这一批变化。
 * @returns 值得认一次行时为真。
 */
function touchesUserRow(records: MutationRecord[]): boolean {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (isRowNode(node)) return true
    }
    for (const node of record.removedNodes) {
      if (isRowNode(node)) return true
    }
  }
  return false
}

/** 一个节点自己、或者它带进来的那棵子树里，有没有用户行或回显行。 */
function isRowNode(node: Node): boolean {
  return node instanceof HTMLElement
    && (node.matches(ROW_SELECTOR) || node.querySelector(ROW_SELECTOR) !== null)
}

/**
 * 起终点还在同一屏里吗。
 *
 * 一屏的尺度现读视口的那一维（兜底见 `FLIGHT_LIMIT_FLOOR_PX`）：两个盒子还落在同一屏里，这段飞行
 * 就看得见；有一头已经飞出屏外，替身会消失在屏幕边上、读者只看到消息凭空出现——那就不飞。
 */
function sameScreen(start: number, end: number, viewportExtent: number): boolean {
  return Math.abs(start - end) <= Math.max(FLIGHT_LIMIT_FLOOR_PX, viewportExtent)
}

/**
 * 立一个替身：壳 + 壳里的克隆气泡。
 *
 * 克隆而不是自绘：主题、字体、圆角、内边距全跟着它走，连暗色主题都自动对得上。两处必须写死——
 * 宽度（它原来靠一个靠右对齐的弹性上下文撑着，一挪到 body 上就会摊成整行）与 `box-sizing`
 * （`getBoundingClientRect` 量到的是 border-box 宽，不声明的话内边距会再叠一次）。底色摘掉交给壳，
 * 否则起点会看到「一个大输入框里贴着一小块气泡色」。
 * @param bubble - 克隆的源头。
 * @param box - 已经量好的气泡矩形。调用方本来就要它，这里不再重量一次。
 * @returns 壳与内容；气泡量不到尺寸时为 null。
 */
function createGhost(bubble: HTMLElement, box: DOMRect): { shell: HTMLElement; content: HTMLElement } | null {
  if (box.width === 0 || box.height === 0) return null
  const content = bubble.cloneNode(true) as HTMLElement
  content.removeAttribute('id')
  content.style.position = 'absolute'
  content.style.left = '0px'
  content.style.top = '0px'
  content.style.width = box.width + 'px'
  content.style.boxSizing = 'border-box'
  content.style.margin = '0px'
  content.style.backgroundColor = 'transparent'
  const shell = document.createElement('div')
  shell.setAttribute(GHOST_ATTRIBUTE, '')
  shell.setAttribute('aria-hidden', 'true')
  shell.style.position = 'fixed'
  shell.style.left = '0px'
  shell.style.top = '0px'
  shell.style.margin = '0px'
  shell.style.overflow = 'hidden'
  shell.style.pointerEvents = 'none'
  // 壳的尺寸每帧都在变。圈成一块独立的布局与绘制区域，那些变化就不会外溢到聊天区去。
  shell.style.contain = 'layout paint'
  // 比消息列上任何一层都高：它是从输入框一路飞过去的东西。
  shell.style.zIndex = '2147483000'
  shell.appendChild(content)
  document.body.appendChild(shell)
  return { shell, content }
}

/**
 * 把替身摆到进度处。
 *
 * 位置走 `across` 与 `rise` 两条互补的曲线，形变走 `morph`。壳负责位置、尺寸、圆角与底色；
 * 内容只负责自己的相对位置：起点时它落在原来那句话的位置上，随着壳收缩回到自己的角落。
 *
 * 外形从 `target` 里拿，不在这里读计算样式——这一帧只重量终点的位置，因为只有它会变。
 */
function placeGhost(value: Flight, elapsed: number): void {
  const target = value.target
  if (target === null) return
  const box = target.bubble.getBoundingClientRect()
  // 行被摘走、新的还没挂上时，量到的是一个已经不在文档里的盒子（全 0）。停住不画，
  // 比把替身甩到左上角强——下一帧 observer 认到新行就接上了。
  if (box.width === 0) return
  const card = value.draft.card
  const progressed = Math.min(1, elapsed / value.ms)
  const rest = 1 - progressed
  const across = 1 - rest ** ACROSS_POWER
  const morphRest = 1 - Math.min(1, progressed / MORPH_END)
  const morph = 1 - morphRest ** ACROSS_POWER
  const rise = progressed ** RISE_POWER
  const shell = value.shell
  const content = value.content
  const x = card.box.left + (box.left - card.box.left) * across
  const y = card.box.top + (box.top - card.box.top) * rise
  shell.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
  shell.style.width = (card.box.width + (box.width - card.box.width) * morph) + 'px'
  shell.style.height = (card.box.height + (box.height - card.box.height) * morph) + 'px'
  shell.style.borderRadius = (card.radius + (target.radius - card.radius) * morph) + 'px'
  shell.style.backgroundColor = mixColor(card.background, target.background, morph)
  content.style.transform = 'translate('
    + ((value.draft.box.left - card.box.left - target.padding.left) * (1 - morph)) + 'px, '
    + ((value.draft.box.top - card.box.top - target.padding.top) * (1 - morph)) + 'px)'
}

/** 两个颜色之间取一个中间色。任一头认不出来就用终点色——总比画错强。 */
function mixColor(from: string, to: string, progress: number): string {
  const start = colorParts(from)
  const end = colorParts(to)
  if (start === null || end === null) return to
  const channel = (index: number): number => Math.round(
    (start[index] ?? 0) + ((end[index] ?? 0) - (start[index] ?? 0)) * progress,
  )
  const alpha = (start[3] ?? 1) + ((end[3] ?? 1) - (start[3] ?? 1)) * progress
  return 'rgba(' + channel(0) + ', ' + channel(1) + ', ' + channel(2) + ', ' + alpha + ')'
}

/** 读一个长度值。读不出来当 0——位移偏一点点，也比整段不做要轻。 */
function pixel(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 一个计算后的颜色有多不透明。不认得的写法当 0：宁可不飞，也不画一块来路不明的色。 */
function alphaOf(color: string): number {
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
