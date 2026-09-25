/**
 * 折叠时把下方内容推开，展开体自己像卷帘门一样拉下来。
 *
 * dsh 的 DisclosureRow 在收起时把展开体整个卸掉（`{open && children}`），所以 CSS 拿不到可过渡的
 * 旧值——高度动画在聊天区做不到，纯 CSS 的路是死的。这一处在 DOM 之外接管，办法是**把点击拦下来**：
 * 捕获阶段 `stopPropagation()`，React 这一下收不到，真身留在原位、还是展开态，于是可以像展开方向
 * 那样直接动它，动画跑完再把点击原样交还。动真身意味着没有克隆体，也就没有克隆体那一串麻烦
 * （继承链、坐标、滚动、节点上限）。
 *
 * 三条路：
 *
 *   压高度 + 裁剪  DisclosureRow 的行：展开体是「行之后那一个兄弟」，普通块级、没有内部滚动。
 *                  高度逐帧长出来负责让位，再叠一层裁剪负责视觉（见下「门只走看得见的那一段」）。
 *                  展开方向等 React 插进来之后动手（观察回调仍在绘制之前）；收起方向拦点击、
 *                  动真身，压到 0 再放行。
 *   裁剪          过程组头：组体自己带滚动条，压高度会被 dsh 的跟随逻辑滚走，所以改裁不改压——
 *                  clip-path 只影响绘制，内容一动不动，门升起或落下而已。裁剪不腾空间，所以两个
 *                  方向都要另外补位：展开靠 glideFlow，收起靠把组体之后的流块 translateY 顶上来，
 *                  卷完放行时同一帧归零。这条只认组头：组体里的成员行各自是普通的 DisclosureRow，
 *                  它们住在组里，却不控制组体。
 *   不参与        轮次头（那个「用时 X 秒」的按钮）与轮次触发通知：它们开合的是整轮内容
 *                  （含过程组与嵌套滚动），压不得也裁不干净，留 dsh 原本的瞬时开合反而最稳。
 *   其余控件       没有展开体的那些，只补下方位移。
 *
 * 卷帘门的意思是「内容一直在那儿，只是被无形的门挡着」——所以任何一条路上，被挡住的内容都
 * 不能有位移。裁剪（clip-path）不改布局，是唯一能保证这一点的做法；压高度会让内部重排。
 *
 * 门只走看得见的那一段。高度必须从 0 走到全高，布局才会真的让开，可高度动画的行程就是全高：
 * 八千像素的思考内容会在 200ms 里被一次性跑完，看起来是直接弹出。所以再叠一层裁剪，把「读者
 * 此刻看得见的那一段」单独按同样的节奏走一遍——两道用同一条缓动曲线，裁剪露出的量恒小于高度，
 * 读者看到的就只有裁剪，行程正好是可见段。裁剪的参照也是 border box，和高度那只盒子对齐。
 *
 * 快照只在**读者**点击时取，且只取视口内的流块。流式追加与分页加载历史没有点击，因此不会有
 * 动画；本插件的自动开合派发的是真正的 click、走的是同一条捕获路径，所以它另外被
 * `isProgrammaticToggle()` 认出来放过——那些场合内容本来就该自然生长。
 *
 * 流块是**嵌套**的（过程组里还有成员），祖先的 `transform` 会叠到后代身上，所以补位时后代只补
 * `自己的绝对位移 − 最近流块祖先的绝对位移`，否则位移会被算两遍。
 *
 * @module dsh-chat-ux/client/fold-glide
 */

import { CHAT_FLOW_SELECTOR, COMPOSER_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FLOW_BLOCK_SELECTOR, FOLLOW_THRESHOLD_PX, PROCESS_BODY_SELECTOR, PROCESS_GROUP_SELECTOR, SCROLL_KEYS, THINK_ROW_SELECTOR } from './dom-contract'
import { ensureFollowTail, FOLLOW_LOOK_TOTAL_MS } from './follow-tail'
import { isProgrammaticToggle } from './programmatic-toggle'

/** 卷帘门与下方补位共用的时长，取侧栏 AnimatedRows 的同档值。 */
const ROLL_MS = 200

/**
 * 可见段占整个卷帘门时长的多少；剩下那一小段留给视口外的那一截高度。
 *
 * 不能不留：门的分段就以「读者看得见的那一段」为界，收尾那一下若是瞬间跳变，下方内容会跟着瞬移。
 */
const VISIBLE_SHARE = 0.9

/** 超过这个年纪的意图不再可信（点击后没有发生布局变化，或变化来自别处）。 */
const INTENT_TTL_MS = 500

/** DisclosureRow 的行。展开体是它的下一个兄弟。 */
const DISCLOSURE_SELECTOR = '[data-disclosure-row]'
/** 其余可开合的控件（过程组头等）。 */
const TOGGLE_SELECTOR = '[aria-expanded]'
/** 弹出层控件（菜单、对话框、列表）。它们开的不是折叠体，本模块整块跳过。 */
const POPUP_SELECTOR = '[aria-haspopup]'
/** 整块跳过的控件：轮次头（那个「用时 X 秒」的按钮）与轮次触发通知——它们开合的是整轮内容。 */
const SKIPPED_CONTROL_SELECTOR = '[data-turn-process], [data-turn-trigger]'

/** 撤掉收起动画之前最多等 React 几帧：一个 `requestAnimationFrame` 来回通常就够。 */
const SHUT_CONFIRM_FRAMES = 3

/**
 * 这一轮折叠的意图监听活多久。
 *
 * 它要盖住三段：等 React 收下那次点击（`INTENT_TTL_MS`）、等卷帘门跑完（`ROLL_MS`）、以及收尾
 * 之后看跟随属性的那几眼（`FOLLOW_LOOK_TOTAL_MS`）。短了会在最后几眼里把监听撤掉，读者那一
 * 下动手就没人看见了。
 */
const FOLD_WATCH_TTL_MS = INTENT_TTL_MS + ROLL_MS + FOLLOW_LOOK_TOTAL_MS

/** 卷帘门跑完之后再多算一会儿「位置归动画管」，免得收尾那一帧跟跟随守护撞上。 */
const FOLD_BUSY_GRACE_MS = 50

/** 裁剪式收回要的五样东西：卷掉多高、裁哪一层、补位时跳过谁、卷完把点击交还给谁、交给谁收尾。 */
interface ClipShut {
  /** 展开体；它的高度就是要卷掉的量。 */
  readonly body: HTMLElement
  /** 裁剪目标：组体本身（组头留着）。 */
  readonly clipTarget: HTMLElement
  /** 补位时跳过的范围：组根——组内成员跟着组体一起走，不该补。 */
  readonly exclude: HTMLElement
  readonly control: HTMLElement
  readonly watch: FoldWatch
}

/**
 * 一次折叠的收尾凭证。
 *
 * 收尾时要把滚动位置交还给 dsh 的跟随，但那只对「本来就贴着底、这中间也没自己出过手」的读者
 * 成立：收尾通常晚于点击两百毫秒，这段时间里读者随时可能接管滚动，而他的意图只能从事件上看
 * 出来——认的那一组与 dsh 自己的 `READING_INTENTS` 同源。
 */
interface FoldWatch {
  /** 折叠开始那一刻读者是不是贴着底部；贴底时下方补位要跳过。 */
  readonly atBottom: boolean
  /** 这中间读者有没有为滚动出过手。 */
  readonly moved: () => boolean
  /** 撤掉意图监听。 */
  readonly stop: () => void
}

interface FoldIntent {
  /** 展开方向被点的开合控件：DisclosureRow 的行，或过程组头的按钮。 */
  readonly control: HTMLElement
  /** 展开方向的过程组体；不是过程组时为 null。 */
  readonly groupBody: HTMLElement | null
  readonly tops: Map<HTMLElement, number>
  readonly watch: FoldWatch
  readonly takenAt: number
}

/** 元素坐标里的一段区间：`from` 到 `to` 就是读者此刻看得见的那部分。 */
interface VisibleSpan {
  readonly from: number
  readonly to: number
}

/** 卷帘门排到哪一刻为止；这一段时间里位置归动画管。 */
let foldBusyUntil = 0

/**
 * 卷帘门与下方补位正在跑。
 *
 * 位置在这一段里归动画管：跟随守护要是这时把滚动位置拽到底，正被拉着的高度会跟它一起动，看起来
 * 是抖。所以它自己会等这一段过去。
 * @returns 上一次动画排到的时刻还没过时为真。
 */
export function isFoldGlideBusy(): boolean {
  return performance.now() < foldBusyUntil
}

/** 排一段「位置归动画管」的时间。 */
const markFoldBusy = (): void => {
  foldBusyUntil = performance.now() + ROLL_MS + FOLD_BUSY_GRACE_MS
}

/**
 * 装上折叠位移。只有读者点击引起的变化会补动画。
 * @returns 卸载函数。
 */
export function installFoldGlide(): () => void {
  if (typeof document === 'undefined' || document.body === null) return () => {}

  let intent: FoldIntent | null = null
  const running = new WeakMap<HTMLElement, Animation>()
  /** 收起动画正在跑：这 200ms 不接受新的点击，免得两次折叠叠在一起。 */
  let shutting = false
  /** 正在把拦下来的那次点击原样交还给 React——那一次不该再被拦。 */
  let replaying = false

  const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const inViewport = (rect: DOMRect): boolean =>
    rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth

  /**
   * 元素此刻真正露在读者眼前的那一段，用元素自己的坐标表示（从元素顶边算起）。
   *
   * 内容比窗口长的时候，元素自己占着完整高度，读者只看得到其中一段——过程组体（`max-height:
   * min(400px, 50vh)`）是那层窗口，视口是最外面那层。卷帘门的行程按这一段算，门才只走读者
   * 看得见的地方；照全高走的话，八千像素的内容会在 200ms 里被一次性跑完，看起来就是直接弹出。
   * @param element - 要量的展开体。
   * @returns 可见段的起止偏移；`to` 不大于 `from` 时说明一点都看不见。
   */
  const visibleSpanOf = (element: HTMLElement): VisibleSpan => {
    const rect = element.getBoundingClientRect()
    let top = Math.max(rect.top, 0)
    let bottom = Math.min(rect.bottom, window.innerHeight)
    // 每一层裁剪祖先都可能把可见范围收得更窄，所以整条链都要过一遍；overflow 是 visible 的
    // 祖先不裁东西，跳过。getComputedStyle 在这里不算浪费——元素刚插进来，样式本来就要算。
    for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const box = ancestor.getBoundingClientRect()
      top = Math.max(top, box.top)
      bottom = Math.min(bottom, box.bottom)
    }
    return {
      from: Math.max(0, Math.min(rect.height, top - rect.top)),
      to: Math.max(0, Math.min(rect.height, bottom - rect.top)),
    }
  }

  /**
   * 读者此刻看得见的那一段有多长，也就是门要走的那段路。
   *
   * 门的分段就是围绕它来的：读者看到的部分占 `VISIBLE_SHARE` 的时长，视口外的那一截用剩下的时间
   * 一口气走完。这样不管展开体是两百像素还是两万像素，门在读者眼前的移动速度都一样。
   * @param element - 要量的展开体。
   * @returns 可见长度，单位像素。
   */
  const rollTravelOf = (element: HTMLElement): number => {
    const span = visibleSpanOf(element)
    return Math.max(0, Math.min(element.getBoundingClientRect().height, span.to))
  }

  /**
   * 元素坐标里的一个偏移，换算成裁剪要的「从底边裁掉多少」的百分比。
   *
   * 必须是百分比：`inset()` 的百分比相对的是元素**当前**的 border box，而高度动画正在同时把
   * 这个盒子从 0 拉到全高。用固定的像素值，盒子越矮、裁掉的像素相对越多——展开的前大半个
   * 动画里元素会被整个裁没，读者什么都看不到。
   * @param offset - 从元素顶边算起的偏移。
   * @param height - 元素的完整高度。
   * @returns 形如 `95%` 的裁剪量。
   */
  const bottomCutOf = (offset: number, height: number): string =>
    `${String(Number((((height - offset) / height) * 100).toFixed(3)))}%`

  /**
   * 控件的展开体。控件自己发 `aria-controls` 时以它为准（那个 id 由 `useId` 生成、带冒号，
   * 只能走 `getElementById`）；否则按卸载式那一族的形状取「控件之后那一个兄弟」。返回 null
   * 就说明这个控件当前是收起的。
   *
   * 过程组头到不了这里——它先被 `processBodyOf` 认走，那条路动的是组体，不是高度。
   */
  const expandedBodyOf = (control: HTMLElement): HTMLElement | null => {
    const controls = control.getAttribute('aria-controls')
    if (controls !== null) {
      const target = document.getElementById(controls)
      return target instanceof HTMLElement ? target : null
    }
    const last = control.parentElement?.lastElementChild
    return last instanceof HTMLElement && last !== control ? last : null
  }

  /**
   * 控件控制的过程组体。
   *
   * 只有组头拿 `aria-controls` 指着组体（`ChatGroupSeat` 里的 `ProcessGroupHeader`），组里的成员
   * 行不发这个属性——它们的展开体是自己的下一个兄弟。所以**「控件住在过程组里」不等于「控件是组
   * 头」**：组体里的每一个工具行、思考行都住在 `[data-step-process]` 里。只看 `closest` 的话，点
   * 一行工具调用会被当成展开整个过程组——展开方向对整个组体重放一次裁剪，收起方向更把整块组体裁
   * 掉，组体下方的内容被当空位补一遍。
   * @param control - 被点的开合控件。
   * @returns 它控制的过程组体；不是组头时为 null。
   */
  const processBodyOf = (control: HTMLElement): HTMLElement | null => {
    const controls = control.getAttribute('aria-controls')
    if (controls === null) return null
    const target = document.getElementById(controls)
    return target instanceof HTMLElement && target.matches(PROCESS_BODY_SELECTOR) ? target : null
  }

  /**
   * 读者此刻是不是贴着会话底部。
   *
   * 贴底时 dsh 自己会补掉这次高度变化——`use-chat-reading` 在 `ResizeObserver` 回调里发现跟着
   * 尾巴走就瞬时滚到底，视口位置本来就不动。那种情况下再补一次位就成了双重补偿：读者看到的是
   * 内容先跳一下、再被缓缓推回来。
   * 这一份从被点的控件往上找滚动容器——与 `follow-tail.ts` 那份同名判据的入口不同，判据相同。
   * @param control - 被点的开合控件。
   * @returns 滚动位置落在底部阈值之内时为真。
   */
  const controlAtBottom = (control: HTMLElement): boolean => {
    const scroller = control.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
    // 找不到滚动容器时按「不在底部」处理：退回补位那套旧行为，而不是把补位整个丢掉。
    if (scroller === null) return false
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= FOLLOW_THRESHOLD_PX
  }

  /**
   * 挂上一份「读者有没有自己接管滚动」的监听，只活到这一轮折叠收尾为止。
   *
   * 收尾要把滚动位置交还给 dsh 的跟随，而那只对本来就贴着底的读者成立：收尾晚于点击两百毫秒，
   * 读者随时可能在中间接管滚动，接管的判据只能从事件上取。落在输入区里的指针与按键不算——那时
   * 读者在打字，不是在滚动。
   * @param atBottom - 折叠开始那一刻读者是不是贴着底部。
   * @returns 这一轮折叠的收尾凭证。
   */
  const watchFold = (atBottom: boolean): FoldWatch => {
    let moved = false
    const note = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest(COMPOSER_SELECTOR) !== null) return
      if (event.type === 'keydown' && !(event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key))) return
      moved = true
    }
    const types = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    for (const type of types) document.addEventListener(type, note, true)
    const stop = (): void => {
      for (const type of types) document.removeEventListener(type, note, true)
    }
    window.setTimeout(stop, FOLD_WATCH_TTL_MS)
    return { atBottom, moved: () => moved, stop }
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

  /**
   * 下方内容按各自相对最近流块祖先的那一段位移滑走。
   *
   * `inside` 里的块不算：它们是那个组体自己的成员，位置变化是跟着组体一起出现或消失的，
   * 给它们补位只会让内容从上方滑进来——读者报过「像从上面掉下来」。
   */
  const glideFlow = (tops: Map<HTMLElement, number>, inside: HTMLElement | null): void => {
    // 第一趟只读：读写交错会让浏览器反复重排。
    const absolute = new Map<HTMLElement, number>()
    for (const [element, top] of tops) {
      if (!element.isConnected) continue
      if (inside !== null && inside.contains(element)) continue
      absolute.set(element, top - element.getBoundingClientRect().top)
    }
    for (const [element, distance] of absolute) {
      const ancestor = element.parentElement?.closest<HTMLElement>(FLOW_BLOCK_SELECTOR) ?? null
      const own = distance - (ancestor === null ? 0 : absolute.get(ancestor) ?? 0)
      if (own === 0) continue
      glide(element, own)
    }
  }

  /**
   * 卷帘门拉开：高度逐帧长出来，露出多少就占多少。
   *
   * 只有高度这一道，但它分两段跑：可见段占 `VISIBLE_SHARE` 的时长，视口外的那一截用剩下的时间补完。
   * 曾经在这里叠过一层按可见段走的裁剪，那是错的——裁剪只影响绘制，而高度已经先长出来了，两道进度
   * 相同、行程不同，差值就是一片空白。
   *
   * `rect` 量到的是 border-box 高度，而 CSS 的 height 默认按 content-box 解释——不换成
   * border-box，动画就会多跑出上下 padding 那一段，收尾 cancel 时再缩回去，看起来像「内间距
   * 在动」。
   */
  const rollOpen = (body: HTMLElement): void => {
    markFoldBusy()
    const height = body.getBoundingClientRect().height
    if (height === 0) return
    const travel = rollTravelOf(body)
    const previousOverflow = body.style.overflow
    const previousBoxSizing = body.style.boxSizing
    body.style.overflow = 'hidden'
    body.style.boxSizing = 'border-box'
    const growing = body.animate(
      travel >= height
        ? [{ height: '0px' }, { height: `${String(height)}px` }]
        : [
          { height: '0px', offset: 0, easing: 'ease-out' },
          { height: `${String(travel)}px`, offset: VISIBLE_SHARE, easing: 'linear' },
          { height: `${String(height)}px`, offset: 1 },
        ],
      { duration: ROLL_MS, easing: 'ease-out' },
    )
    growing.onfinish = () => {
      growing.cancel()
      body.style.overflow = previousOverflow
      body.style.boxSizing = previousBoxSizing
    }
  }

  /**
   * 裁剪式拉开：只裁不压。裁剪不参与布局，内容从头到尾一动不动，门升起来就露出更多；
   * 下方内容靠 glideFlow 补位。
   *
   * 行程同样只走读者看得见的那一段：组体自己虽然有 `max-height`，它也可能只有一部分在
   * 视口里。
   */
  const openByClip = (clipTarget: HTMLElement): void => {
    markFoldBusy()
    const height = clipTarget.getBoundingClientRect().height
    const span = visibleSpanOf(clipTarget)
    if (height === 0 || span.to <= span.from) return
    const animation = clipTarget.animate(
      [
        { clipPath: `inset(0 0 ${bottomCutOf(span.from, height)} 0)` },
        { clipPath: `inset(0 0 ${bottomCutOf(span.to, height)} 0)` },
      ],
      { duration: ROLL_MS, easing: 'ease-out' },
    )
    animation.onfinish = () => { animation.cancel() }
  }

  /** 把拦下来的那次点击原样交给 React。重放期间不再拦，也不再起收起动画。 */
  const replay = (control: HTMLElement): void => {
    shutting = false
    replaying = true
    try {
      control.click()
    } finally {
      replaying = false
    }
  }

  /**
   * 折叠收尾：折叠开始那一刻贴着底部的读者，收尾时把滚动位置交还给 dsh 的跟随。
   *
   * 折叠是一次量级很大的高度变化，而 dsh 的跟随会被一次「像读者移动、又没到底」的滚动关掉——
   * 它自己那个「回到底部」按钮是唯一的重开入口。这一处只判断这一次交还算不算数；怎么交还
   * （先钉底、属性没回来才点按钮）在 `follow-tail.ts` 里，跟随守护走的是同一条路。
   *
   * 判据是「折叠开始那一刻读者贴着底」：他本来就在上面看的话，这一次交还与他无关。
   * @param watch - 这一轮折叠的收尾凭证。
   */
  const handBackFollow = (watch: FoldWatch): void => {
    if (!watch.atBottom) {
      watch.stop()
      return
    }
    ensureFollowTail({
      // 读者中途自己动了手，这一次交还就作废。
      stillWanted: () => !watch.moved(),
      onSettled: () => { watch.stop() },
    })
  }

  /**
   * 折叠收尾的入口：动画走完再看一眼跟随。
   *
   * 收起方向的重放、展开方向的取消都落在动画末尾，滚动位置也是那时才定下来，所以统一等
   * `ROLL_MS`——它正好是两条动画的时长。
   * @param watch - 这一轮折叠的收尾凭证。
   */
  const settleAfterFold = (watch: FoldWatch): void => {
    window.setTimeout(() => { handBackFollow(watch) }, ROLL_MS)
  }

  /**
   * 等 React 把真身卸掉，再去动它的动画与内联样式。
   *
   * 收起方向的高度动画带着 `fill: 'forwards'`，把真身锁在 0 高。真身若还在（这一次点击没被
   * React 收下），`cancel()` 就会把高度整块还给 CSS——一次从 0 弹回全高的跳变，足够把 dsh 的
   * 跟随甩出去。所以卸载确认了才撤；等够几帧仍然没卸载，那说明这次点击确实没有折叠，只好撤回原样。
   * @param body - 压着高度的展开体。
   * @param done - 可以撤掉动画与内联样式了。
   * @param attempt - 已经等了几帧。
   */
  const confirmUnmounted = (body: HTMLElement, done: () => void, attempt = 0): void => {
    if (!body.isConnected || attempt >= SHUT_CONFIRM_FRAMES) {
      done()
      return
    }
    requestAnimationFrame(() => { confirmUnmounted(body, done, attempt + 1) })
  }

  /**
   * 卷帘门收回（DisclosureRow）：**动真身，不克隆**。
   *
   * 这次点击已经在捕获阶段被拦下，React 还没折叠——真身留在原位、还是展开态，于是可以像展开
   * 方向那样压它的高度：布局逐帧收缩，下方内容是真的被让开，不需要克隆、也不需要 FLIP。压到 0
   * 的那一刻再放行点击：React 卸掉真身，而它此时不占任何空间，收起态那套 contain: size + 24px
   * 接上来时不会跳。
   *
   * 和展开方向一样只有高度这一道，也分两段跑，只是方向相反：视口外的那一截先收掉，可见段用
   * `VISIBLE_SHARE` 的时长卷上去。
   */
  const rollShutInPlace = (body: HTMLElement, control: HTMLElement, watch: FoldWatch): void => {
    markFoldBusy()
    const height = body.getBoundingClientRect().height
    // 兜底：动画因为任何原因没收到 onfinish 时，别把点击一直锁着。
    const release = window.setTimeout(() => { shutting = false }, ROLL_MS + 200)
    if (height === 0) {
      window.clearTimeout(release)
      replay(control)
      settleAfterFold(watch)
      return
    }
    const travel = rollTravelOf(body)
    const previousOverflow = body.style.overflow
    const previousBoxSizing = body.style.boxSizing
    body.style.overflow = 'hidden'
    body.style.boxSizing = 'border-box'
    const shrinking = body.animate(
      travel >= height
        ? [{ height: `${String(height)}px` }, { height: '0px' }]
        : [
          { height: `${String(height)}px`, offset: 0, easing: 'linear' },
          { height: `${String(travel)}px`, offset: 1 - VISIBLE_SHARE, easing: 'ease-out' },
          { height: '0px', offset: 1 },
        ],
      { duration: ROLL_MS, easing: 'ease-out', fill: 'forwards' },
    )
    shrinking.onfinish = () => {
      window.clearTimeout(release)
      replay(control)
      // 真身该已经卸掉了；没卸掉就不能撤动画，见 confirmUnmounted。
      confirmUnmounted(body, () => {
        shrinking.cancel()
        body.style.overflow = previousOverflow
        body.style.boxSizing = previousBoxSizing
      })
      settleAfterFold(watch)
    }
  }

  /**
   * 裁剪式收回：门落下来遮住组体那一段，真身一个像素都不动——组体自己带滚动条，压高度会被
   * dsh 的跟随逻辑滚走，所以这一条只能裁不能压。
   *
   * 裁剪不腾空间，所以展开体让出来的那一段得另外补：`exclude` 之后、又不在它里面的流块在动画里
   * 被 translateY 往上一段，卷完放行点击时 React 收起、布局真的上移同一段，同一帧里把 transform
   * 归零，两边正好抵消，看不出接缝。
   */
  const shutByClip = (fold: ClipShut): void => {
    markFoldBusy()
    const release = window.setTimeout(() => { shutting = false }, ROLL_MS + 200)
    const lift = fold.body.getBoundingClientRect().height
    if (lift === 0) {
      window.clearTimeout(release)
      replay(fold.control)
      settleAfterFold(fold.watch)
      return
    }
    const rising: Animation[] = []
    for (const element of takeTops().keys()) {
      if (element === fold.exclude || fold.exclude.contains(element)) continue
      if ((fold.exclude.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) continue
      rising.push(element.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(${String(-lift)}px)` }],
        { duration: ROLL_MS, easing: 'ease-out', fill: 'forwards' },
      ))
    }
    const clip = fold.clipTarget.animate(
      [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: `inset(0 0 ${String(lift)}px 0)` }],
      { duration: ROLL_MS, easing: 'ease-out', fill: 'forwards' },
    )
    clip.onfinish = () => {
      window.clearTimeout(release)
      // 先归零再放行，两步落在同一帧里：读者只会看到最终位置。
      for (const animation of rising) animation.cancel()
      clip.cancel()
      replay(fold.control)
      settleAfterFold(fold.watch)
    }
  }

  const flush = (): void => {
    const current = intent
    intent = null
    if (current === null) return
    const watch = current.watch
    // 这三条路上都没有动画，收尾就是把监听撤掉。
    if (Date.now() - current.takenAt > INTENT_TTL_MS || reduceMotion()) {
      watch.stop()
      return
    }
    // 过程组：裁剪组体，下方内容靠 glideFlow 补位——读者贴着底部时除外，dsh 自己已经补过了。
    if (current.groupBody !== null) {
      if (current.groupBody.hasAttribute('hidden')) {
        watch.stop()
        return
      }
      openByClip(current.groupBody)
      if (!watch.atBottom) glideFlow(current.tops, current.groupBody)
      settleAfterFold(watch)
      return
    }
    const body = expandedBodyOf(current.control)
    if (body === null) {
      if (!watch.atBottom) glideFlow(current.tops, null)
      watch.stop()
      return
    }
    // DisclosureRow：展开体是普通块级，压高度就是「拉多少显示多少」。
    rollOpen(body)
    settleAfterFold(watch)
  }

  const onClick = (event: Event): void => {
    // 自己重放的那一次直接放行，交给 React。
    if (replaying) return
    const target = event.target
    if (!(target instanceof Element)) return
    // 本插件自己的自动开合派发的也是真正的 click，走的正是这条捕获路径。思考行要和读者的点击一样
    // 起动画：它自己展开、自己收起时若走瞬时切换，读者看到的是内容「啪」地出现和消失，而工具行
    // 那种只由读者点击的行一直是有卷帘门的。
    // 过程组不在此列：它一次扫描可能切换好几个组，而收起动画是全局互斥的（shutting），同时来的
    // 第二次点击会被吞掉，那一组就再也轮不到切换了。
    if (isProgrammaticToggle() && target.closest(THINK_ROW_SELECTOR) === null) return
    // 只接管聊天区。整页都在用 aria-expanded——模型选择器、设置页的下拉框、侧栏的行、任务面板——
    // 那些控件的开合与聊天流的位移无关，接管它们只会把菜单压扁、把一次点击推迟 200ms。
    if (target.closest<HTMLElement>(CHAT_FLOW_SELECTOR) === null) return
    // 弹出层开的不是折叠体：菜单与对话框不该带动聊天流。
    if (target.closest<HTMLElement>(POPUP_SELECTOR) !== null) return
    // 收起动画正在跑：这 200ms 里不接受新的点击，免得两次折叠叠在一起。
    if (shutting) {
      event.stopPropagation()
      event.preventDefault()
      return
    }
    // 上一轮展开方向的等待作废，它挂着的意图监听要跟着撤掉。
    intent?.watch.stop()
    intent = null
    // 开合控件：DisclosureRow 的行，或别的带 aria-expanded 的按钮（过程组头等）。
    const control = target.closest<HTMLElement>(DISCLOSURE_SELECTOR)
      ?? target.closest<HTMLElement>(TOGGLE_SELECTOR)
    if (control === null) return
    // 轮次头与轮次触发通知整块跳过：它们开合的是整轮内容，两条路都不适合，交给 dsh 自己瞬时开合。
    if (control.closest<HTMLElement>(SKIPPED_CONTROL_SELECTOR) !== null) return
    // 组头控制组体，成员行不控制——见 processBodyOf。认错了，点一行工具调用会被当成展开整个过程组。
    const groupBody = processBodyOf(control)
    const groupRoot = groupBody?.parentElement?.closest<HTMLElement>(PROCESS_GROUP_SELECTOR) ?? null
    const body = groupBody ?? expandedBodyOf(control)
    // 展开方向：等 React 把展开体插进来，再在观察回调里做动画。
    if (body === null || body.hasAttribute('hidden')) {
      intent = {
        control,
        groupBody,
        tops: takeTops(),
        watch: watchFold(controlAtBottom(control)),
        takenAt: Date.now(),
      }
      return
    }
    if (reduceMotion()) return
    // 收起方向：把这次点击拦下来，让真身自己卷上去，卷完再放行。
    event.stopPropagation()
    event.preventDefault()
    shutting = true
    const watch = watchFold(controlAtBottom(control))
    if (groupRoot !== null && groupBody !== null) {
      shutByClip({ body: groupBody, clipTarget: groupBody, exclude: groupRoot, control, watch })
      return
    }
    rollShutInPlace(body, control, watch)
  }

  const observer = new MutationObserver(flush)
  document.addEventListener('click', onClick, true)
  // hidden 也要观察：过程组的开合是 setAttribute('hidden', 'until-found')，只有属性变化，
  // 不带 attributeFilter 就收不到，那一处连下方补位都没有。别处的 hidden 切换多在 intent
  // 为 null 时到达，直接返回，成本可以忽略。
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })

  return () => {
    document.removeEventListener('click', onClick, true)
    observer.disconnect()
    intent?.watch.stop()
  }
}