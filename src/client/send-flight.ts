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
 *   逐帧画    位置与形变各走各的曲线：横向三次 ease-out、纵向二次 ease-in，形变再把横向那条压进前
 *             一段里先收住。于是路径**始终在拐**、形状却早早定死——位置、尺寸、圆角、底色、内容的
 *             相对位置都是这几条曲线的函数。
 *   落定      摘属性、扔掉替身——真实那一行本来就在终点上，交接不需要搬任何东西。
 *
 * 四条边界（前两条是实测踩出来的）：
 *
 *   同帧就得藏    用 MutationObserver 而不是每帧轮询找回显：它在本帧渲染**之前**回调，所以真实
 *                 那一行一帧都不会露出来。晚一帧的话读者会先看到一个正常气泡闪一下、随即被抹掉。
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

/** 飞行时长。 */
const FLIGHT_MS = 200

/**
 * 三道缓动。
 *
 * **横向是三次 ease-out，纵向是二次 ease-in。** 两条导数互补：横向从三倍平均速度一路减到零，纵向
 * 从零一路加到两倍。于是路径的角度从起手的 -3° 平滑转到收尾的 -90°，**中间没有一段是平的**——
 * 哪一段平了，画出来就是一条直角折线，生硬就生硬在那儿（已经为这个返工过一次）。
 *
 * **形变走同一条曲线，但压进前 MORPH_END 段。** 于是它更早收住：六成时长处已经走完九成八，气泡
 * 还没离开输入框就长成了气泡的样子，剩下那段上升里形状不再有可见变化。
 *
 * 两者分家是有代价的：右边缘会先往左退最多 55 px，再随横向回来。气泡的横向位移本来就靠左边缘右移
 * 实现，宽度收得越早、左边缘到位就越早、路径就越像直角——两头不可兼得，这里选路径。
 */
const ACROSS_POWER = 3

/** 形变收尾的位置。比横向早，但不能早到把路径压成直角。 */
const MORPH_END = 0.85

/** 起点只认这么久。抓完超过它才出现的回显，不算这一次提交的。 */
const ORIGIN_TTL_MS = 1500

/** 位移超过这个距离就不飞：那看起来是「消息从屏幕外飞进来」，不是「我的字飞上去了」。 */
const MAX_FLIGHT_PX = 900

/** 兜底比飞行本身多留一点：定时器在后台被节流，也要赶在读者切回来之前把消息放出来。 */
const RESCUE_MS = FLIGHT_MS + 400

/** 只认聊天流里的回显：排队的那条落在队列坞里，飞过去是另一种转场，本期不做。 */
const ECHO_SELECTOR = CHAT_FLOW_SELECTOR + ' ' + SUBMISSION_ECHO_SELECTOR

/** 已经落定的用户行。它和回显行是同一个组件的两副面孔，结构差一层。 */
const USER_ROW_SELECTOR = CHAT_FLOW_SELECTOR + ' [data-chat-flow-kind="user"]'

/**
 * 给整页装上发送气泡的起飞。
 * @returns 卸载入口：摘掉监听，收掉还在等的那一轮与正在飞的那一段（包括把藏着的消息放出来）。
 */
export function installSendFlight(): () => void {
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

  /** 落定：先把真实行放出来，再扔掉替身。顺序反了会闪一下空白。 */
  const settle = (): void => {
    const current = flight
    if (current === null) return
    flight = null
    window.clearTimeout(rescue)
    rescue = 0
    current.hidden?.removeAttribute(FLYING_ATTRIBUTE)
    current.shell.remove()
  }

  const tick = (): void => {
    const current = flight
    if (current === null) return
    const elapsed = performance.now() - current.startedAt
    if (elapsed >= FLIGHT_MS) {
      settle()
      return
    }
    // 回显随时会被正式那一行换掉，所以每一帧认一遍此刻该藏哪一条。
    const row = currentRow(current.previous)
    if (row !== null && row !== current.hidden) {
      current.hidden?.removeAttribute(FLYING_ATTRIBUTE)
      row.setAttribute(FLYING_ATTRIBUTE, '')
      current.hidden = row
    }
    const bubble = current.hidden === null ? null : findBubble(current.hidden)
    if (bubble !== null) placeGhost(current, bubble, elapsed)
    requestAnimationFrame(tick)
  }

  /** 起一段飞行：立替身、藏真实行、把第一帧摆好。全部同步做完——晚一帧读者就会看到真实气泡闪一下。 */
  const startFlight = (echo: HTMLElement, draft: DraftOrigin): void => {
    const bubble = findBubble(echo)
    if (bubble === null) return
    const box = bubble.getBoundingClientRect()
    const card = draft.card.box
    if (Math.abs(card.left - box.left) > MAX_FLIGHT_PX || Math.abs(card.top - box.top) > MAX_FLIGHT_PX) return
    const ghost = createGhost(bubble)
    if (ghost === null) return
    echo.setAttribute(FLYING_ATTRIBUTE, '')
    flight = { draft, shell: ghost.shell, content: ghost.content, startedAt: performance.now(), previous: lastUserRow(), hidden: echo }
    placeGhost(flight, bubble, 0)
    rescue = window.setTimeout(settle, RESCUE_MS)
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
  /** 起飞之前聊天流里最后一条用户消息。靠它认出新来的那一行。 */
  readonly previous: HTMLElement | null
  hidden: HTMLElement | null
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
 * 立一个替身：壳 + 壳里的克隆气泡。
 *
 * 克隆而不是自绘：主题、字体、圆角、内边距全跟着它走，连暗色主题都自动对得上。两处必须写死——
 * 宽度（它原来靠一个靠右对齐的弹性上下文撑着，一挪到 body 上就会摊成整行）与 `box-sizing`
 * （`getBoundingClientRect` 量到的是 border-box 宽，不声明的话内边距会再叠一次）。底色摘掉交给壳，
 * 否则起点会看到「一个大输入框里贴着一小块气泡色」。
 */
function createGhost(bubble: HTMLElement): { shell: HTMLElement; content: HTMLElement } | null {
  const box = bubble.getBoundingClientRect()
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
 */
function placeGhost(value: Flight, bubble: HTMLElement, elapsed: number): void {
  const box = bubble.getBoundingClientRect()
  const style = getComputedStyle(bubble)
  const top = pixel(style.paddingTop)
  const left = pixel(style.paddingLeft)
  const card = value.draft.card
  const progressed = Math.min(1, elapsed / FLIGHT_MS)
  const rest = 1 - progressed
  const across = 1 - rest ** ACROSS_POWER
  const morphRest = 1 - Math.min(1, progressed / MORPH_END)
  const morph = 1 - morphRest ** ACROSS_POWER
  const rise = progressed * progressed
  const shell = value.shell
  const content = value.content
  const x = card.box.left + (box.left - card.box.left) * across
  const y = card.box.top + (box.top - card.box.top) * rise
  shell.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
  shell.style.width = (card.box.width + (box.width - card.box.width) * morph) + 'px'
  shell.style.height = (card.box.height + (box.height - card.box.height) * morph) + 'px'
  shell.style.borderRadius = (card.radius + (pixel(style.borderTopLeftRadius) - card.radius) * morph) + 'px'
  shell.style.backgroundColor = mixColor(card.background, style.backgroundColor, morph)
  content.style.transform = 'translate('
    + ((value.draft.box.left - card.box.left - left) * (1 - morph)) + 'px, '
    + ((value.draft.box.top - card.box.top - top) * (1 - morph)) + 'px)'
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
