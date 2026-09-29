/**
 * 发送气泡的起飞。
 *
 * 提交之后 dsh 会立刻挂一条「即发即显」的回显气泡（`[data-submission-echo]`），真实消息一到就把
 * 它换成正式的那一行。本机实测：回显只活 **159 ms**，而正式那一行要 **1 秒多**才到——动画挂在这两条
 * 节点上必死（挂回显，半路连节点都没了；等正式行，读者先看到一秒多的空档）。
 *
 * 所以这里自己画一个替身：输入卡片原样浮起来一份，一边飞一边收成那条气泡。替身怎么搭、形变怎么
 * 算，全在 `send-morph.ts`；这个模块管什么时候起飞、飞向哪一行、什么时候落定：
 *
 *   抓起点    提交的捕获阶段把整张输入卡片抓下来（克隆、几何、外观），全都早于 React 清空草稿。
 *   认信号    回显行一挂上来就认——认它的是 MutationObserver，不是每帧轮询。
 *   立替身    替身挂到页面上、整段动画交给合成器；真实的那一行挂属性藏起来（保留布局盒，终点每帧都
 *             量得到）。
 *   逐帧补    **这一帧里只有一件事**：终点跟着页面动了多少（dsh 滚到底、回显换正式行），补到替身的
 *             最外层上。形状、颜色、位置、字的重排都在合成器上，dsh 解析响应占住主线程那几十毫秒时
 *             照样在走。
 *   落定      摘属性、扔掉替身——真实那一行本来就在终点上，交接不需要搬任何东西。
 *
 * 五条边界（前两条是实测踩出来的）：
 *
 *   同帧就得藏    用 MutationObserver 而不是每帧轮询找回显：它在本帧渲染**之前**回调，所以真实
 *                 那一行一帧都不会露出来。晚一帧的话读者会先看到一个正常气泡闪一下、随即被抹掉。
 *   认行不在帧里  「当场」不等于「每帧」。回显被正式那一行换掉，同一个 observer 会在本帧渲染之前
 *                 同步认出来；帧里再查一遍是白花的——长会话里光那两句全文档查询就够吃掉半帧。
 *   抓不到就不做    起点抓不到（快捷键、程序化提交）时这一次不动手，读者看到的还是 dsh 原来的样子。
 *   藏起来必须还    真实行被藏着的这会儿，读者看不见那条消息。所以除了正常落定，还有一条定时器
 *                 兜底：后台标签页里 rAF 会停，替身停了，属性不能一直挂着。
 *   只飞同一屏    起终点有一头已经在屏外，替身会消失在屏幕边上、读者只看到消息凭空出现——那就不飞。
 *
 * @module dsh-chat-ux/client/send-flight
 */
import { CHAT_FLOW_SELECTOR, COMPOSER_CARD_SELECTOR, COMPOSER_INPUT_SELECTOR, SUBMISSION_ECHO_SELECTOR } from './dom-contract'
import { alphaOf, FLIGHT_MS, snapshotComposer, startMorph } from './send-morph'
import type { ComposerSnapshot, Morph } from './send-morph'

/** 挂在真实行上的标记：有它，那一行就先藏着。规则在 `send-flight-styles.ts`，两边必须一字不差。 */
export const FLYING_ATTRIBUTE = 'data-chat-ux-send-flight'

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
 * @param readEnabled - 现读开关；关着时一次都不动手。闸门放在抓起点那一步：开关关着的这段时间里，
 * 页面上连一次测量都不会发生，看到的完全是 dsh 原来的样子。
 * @returns 卸载入口：摘掉监听，收掉还在等的那一轮与正在飞的那一段（包括把藏着的消息放出来）。
 */
export function installSendFlight(readEnabled: () => boolean): () => void {
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
    current.bubble = findBubble(row)
    followTarget(current)
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
    // **先让替身从文档里消失，再取消动画**，不能反过来。取消会让光晕回到「还没动过」的尺寸（整张
    // 输入卡片那么大），而光晕那条把 scale 与 opacity 合在一起，是**可合成**的动画——取消要经合成器，
    // 节点移除也要经合成器，两者顺序一错就会多画一帧：读者看到的是「宽度被瞬间拉长又闪回」。
    // 节点一离开文档，它身上的动画随之失效，下面那次 cancel 只是显式清掉引用。
    current.morph.wrapper.remove()
    for (const animation of current.morph.animations) animation.cancel()
  }

  /**
   * 帧里两件事：写一次位移，补一次终点的移动。认行交给上面那个 observer——它不是每帧都有新答案的事。
   *
   * **位移必须在这里写，而且必须跟着形状那条动画的进度走**，两条都不能省。
   *
   * 交给合成器不行：形变是主线程上的动画，dsh 解析响应占住主线程那几十到一百多毫秒里它一步都不走，
   * 而位移照样冲到底——替身就变成「还没收窄的整张卡片落在终点」，右边缘甩出消息列。
   * 按墙上时钟每帧算也不行：动画在起手那一两帧还 pending、按 offset 0 画着整张卡片，墙上时钟却已经
   * 往前走了，位移于是领先，右边缘照样出列。读动画自己的时间，两边就永远在同一格上。
   */
  const tick = (): void => {
    const current = flight
    if (current === null) return
    const u = current.morph.progress()
    if (u >= 1) {
      settle()
      return
    }
    current.morph.applyProgress(u)
    followTarget(current)
    requestAnimationFrame(tick)
  }

  /** 起一段飞行：立替身、藏真实行。全部同步做完——晚一帧读者就会看到真实气泡闪一下。 */
  const startFlight = (echo: HTMLElement, draft: DraftOrigin): void => {
    // 上一段还在飞就先收掉它。不收的话旧替身会永远留在页面上（连发一次多一个幽灵），旧的那条真实行
    // 也永远带着「先藏起来」的标记——读者再也看不见那条消息。读者连发时「最后一段说了算」，这一步就是它。
    settle()
    const bubble = findBubble(echo)
    if (bubble === null) return
    const box = bubble.getBoundingClientRect()
    const card = draft.snapshot.box
    if (!sameScreen(card.left, box.left, window.innerWidth)) return
    if (!sameScreen(card.top, box.top, window.innerHeight)) return
    const morph = startMorph(draft.snapshot, bubble, box)
    if (morph === null) return
    morph.applyProgress(0)
    echo.setAttribute(FLYING_ATTRIBUTE, '')
    flight = {
      morph,
      targetAt: { left: box.left, top: box.top },
      shiftedX: 0,
      shiftedY: 0,
      previous: lastUserRow(),
      hidden: echo,
      bubble,
    }
    rowWatcher.observe(document.body, { childList: true, subtree: true })
    rescue = window.setTimeout(settle, FLIGHT_MS + RESCUE_MARGIN_MS)
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
    if (!readEnabled()) return
    const input = document.querySelector(COMPOSER_INPUT_SELECTOR)
    if (!(input instanceof HTMLElement)) return
    const card = input.closest(COMPOSER_CARD_SELECTOR)
    if (!(card instanceof HTMLElement)) return
    // 空草稿不会提交出一条消息；量它只是白花一次克隆。
    if ((input.textContent ?? '').trim() === '') return
    const snapshot = snapshotComposer(input, card)
    if (snapshot === null) return
    origin = { capturedAt: performance.now(), snapshot }
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

/** 草稿起飞前的那一刻：整张输入卡片的快照。 */
interface DraftOrigin {
  readonly capturedAt: number
  readonly snapshot: ComposerSnapshot
}

/** 一段正在飞的动画。`hidden` 会在回显被换掉时改指新来的那一行。 */
interface Flight {
  /** 替身与它身上跑着的全部合成动画。 */
  readonly morph: Morph
  /** 起飞那一刻量到的终点位置。终点之后每动一下，差值都从这里算。 */
  readonly targetAt: { readonly left: number; readonly top: number }
  /** 已经补到外层上的差值；没变就不写样式。 */
  shiftedX: number
  shiftedY: number
  /** 起飞之前聊天流里最后一条用户消息。靠它认出新来的那一行。 */
  readonly previous: HTMLElement | null
  hidden: HTMLElement | null
  /** 终点那条气泡。跟着 `hidden` 一起换；量不到时留 null，这一帧就不补。 */
  bubble: HTMLElement | null
}

/**
 * 把终点动了多少补到替身的最外层上。
 *
 * 这是每帧唯一的 JS：一次矩形读、至多一次样式写。飞行期间终点通常只动几十像素（提交后 dsh 自己会
 * 滚到底、回显会被正式行换掉），所以「整体补差」与「每帧按曲线重算位置」看起来是同一件事。
 */
function followTarget(value: Flight): void {
  const bubble = value.bubble
  if (bubble === null) return
  const box = bubble.getBoundingClientRect()
  // 行被摘走、新的还没挂上时，量到的是一个已经不在文档里的盒子（全 0）。停住不补，
  // 比把替身甩到左上角强——下一帧 observer 认到新行就接上了。
  if (box.width === 0) return
  const shiftX = box.left - value.targetAt.left
  const shiftY = box.top - value.targetAt.top
  if (shiftX === value.shiftedX && shiftY === value.shiftedY) return
  value.shiftedX = shiftX
  value.shiftedY = shiftY
  value.morph.wrapper.style.transform = 'translate(' + shiftX + 'px, ' + shiftY + 'px)'
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
