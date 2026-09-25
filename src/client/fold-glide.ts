/**
 * 折叠时把下方内容推开，展开体自己像卷帘门一样拉下来。
 *
 * dsh 的 DisclosureRow 在收起时把展开体整个卸掉（{open && children}），所以 CSS 拿不到可过渡的
 * 旧值——高度动画在聊天区做不到，纯 CSS 的路是死的。这一处在 DOM 之外接管，办法是**把点击拦下来**：
 * 捕获阶段 stopPropagation()，React 这一下收不到，真身留在原位、还是展开态，于是可以直接压它的
 * 高度，压到底再把点击原样交还。动真身意味着没有克隆体，也就没有克隆体那一串麻烦（继承链、坐标、
 * 滚动、节点上限）。
 *
 * 只有一条路：**压真身的高度**。高度是布局的一部分，压下去多少，下方内容就真的让开多少——读者看到
 * 的位移不是补出来的假象，是文档流本身。
 *
 *   展开方向  等 React 把展开体插进来之后动手——观察回调仍在绘制之前，此时把高度压回起点，再动画到
 *             全高。布局逐帧长出来，下方内容是真的被推开，不需要 FLIP。
 *   收起方向  拦点击，真身留在原地、还是展开态，于是能像展开方向那样把高度压回终点，压到了再放行，
 *             React 这才卸掉真身——而它此时已经不占空间，收起态那套接上来时不会跳。
 *
 * 压谁的高度分两族：
 *
 *   DisclosureRow 的行  压展开体自己。它是普通块级，没有内部滚动。
 *   过程组头            压**组根**，不压组体。组体自己带滚动条，而 dsh 的 use-process-scroll 观察的
 *                       正是它：压它会让 follow.toBottom 把内容平滑滚到底，门在眼前变成一列往上跑
 *                       的字。组根只是外面那层盒子，组体住在里面、尺寸一个像素都不变，跟随逻辑收不到
 *                       任何 ResizeObserver 通知；而组根的高度是布局的一部分，压下去下方内容照样真的
 *                       让开。
 *   不参与              轮次头（那个「用时 X 秒」的按钮）与轮次触发通知：它们开合的是整轮内容（含过程
 *                       组与嵌套滚动），压不得，留 dsh 原本的瞬时开合反而最稳。
 *
 * 门只走看得见的那一段。高度必须从起点走到终点，布局才会真的让开，可高度动画的行程就是全高：八千像素
 * 的思考内容会在 200ms 里被一次性跑完，看起来是直接弹出。所以高度分两段跑，分界点就是 visibleReachOf
 * 量出来的可见段——读者看得见的那一段占 VISIBLE_SHARE 的时长，视口外的那一截用剩下的时间一口气走完。
 * 这样不管展开体是两百像素还是两万像素，读者眼前那道门的速度都一样，两段之间也是连续的动画而不是瞬间
 * 跳变。
 *
 * 快照只在**读者**点击时取，而且只取一个数：展开方向要的起点高度。流式追加与分页加载历史没有点击，
 * 因此不会有动画；本插件的自动开合派发的也是真正的 click、走的是同一条捕获路径，所以它另外被
 * isProgrammaticToggle() 认出来放过——那些场合内容本来就该自然生长。
 *
 * @module dsh-chat-ux/client/fold-glide
 */

import { CHAT_FLOW_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOW_THRESHOLD_PX, PROCESS_BODY_SELECTOR, PROCESS_GROUP_SELECTOR, THINK_ROW_SELECTOR } from './dom-contract'
import { ensureFollowTail, FOLLOW_LOOK_TOTAL_MS } from './follow-tail'
import { isProgrammaticToggle } from './programmatic-toggle'
import { isReaderScrollIntent } from './reader-intent'

/** 卷帘门的时长，取侧栏 AnimatedRows 的同档值。 */
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

/** 撤掉收起动画之前最多等 React 几帧：一个 requestAnimationFrame 来回通常就够。 */
const SHUT_CONFIRM_FRAMES = 3

/**
 * 这一轮折叠的意图监听活多久。
 *
 * 它要盖住三段：等 React 收下那次点击（INTENT_TTL_MS）、等卷帘门跑完（ROLL_MS）、以及收尾之后看
 * 跟随属性的那几眼（FOLLOW_LOOK_TOTAL_MS）。短了会在最后几眼里把监听撤掉，读者那一下动手就没
 * 人看见了。
 */
const FOLD_WATCH_TTL_MS = INTENT_TTL_MS + ROLL_MS + FOLLOW_LOOK_TOTAL_MS

/** 卷帘门跑完之后再多算一会儿「位置归动画管」，免得收尾那一帧跟跟随守护撞上。 */
const FOLD_BUSY_GRACE_MS = 50

/**
 * 一次「压高度」式收起要的五样东西。
 */
interface HeightShut {
  /** 要压的真身：展开体自己，或过程组的组根。 */
  readonly target: HTMLElement
  /** 收起的终点高度。展开体归 0；组根停在组头那一段，组体就藏在它下面。 */
  readonly floor: number
  /** React 把这次折叠落到 DOM 上了：展开体被卸掉，或组体带上 hidden。 */
  readonly collapsed: () => boolean
  readonly control: HTMLElement
  readonly watch: FoldWatch
}

/**
 * 一次折叠的收尾凭证。
 *
 * 收尾时要把滚动位置交还给 dsh 的跟随，但那只对「本来就贴着底、这中间也没自己出过手」的读者
 * 成立：收尾通常晚于点击两百毫秒，这段时间里读者随时可能接管滚动，而他的意图只能从事件上看
 * 出来——什么算读者的意图由 `isReaderScrollIntent` 判。
 */
interface FoldWatch {
  /** 折叠开始那一刻读者是不是贴着底部。 */
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
  /** 展开方向的过程组根；高度压在它身上。不是过程组时为 null。 */
  readonly groupRoot: HTMLElement | null
  /** 点击那一刻组根的高度——收起态的它正是展开动画的起点。 */
  readonly collapsedHeight: number
  readonly watch: FoldWatch
  readonly takenAt: number
}

/** 卷帘门排到哪一刻为止；这一段时间里位置归动画管。 */
let foldBusyUntil = 0

/**
 * 卷帘门正在跑。
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
  /** 收起动画正在跑：这 200ms 不接受新的点击，免得两次折叠叠在一起。 */
  let shutting = false
  /** 正在把拦下来的那次点击原样交还给 React——那一次不该再被拦。 */
  let replaying = false

  const reduceMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /**
   * 元素此刻露在读者眼里的那一段，它的终点距元素顶边有多远。
   *
   * 内容比窗口长的时候，元素自己占着完整高度，读者只看得到其中一段——过程组体（max-height:
   * min(400px, 50vh)）是那层窗口，视口是最外面那层。卷帘门的行程按这一段算，门才只走读者看得见的
   * 地方；照全高走的话，八千像素的内容会在 200ms 里被一次性跑完，看起来就是直接弹出。
   * @param element - 要量的真身。
   * @returns 终点偏移，单位像素；为 0 时说明它整个在视口外。
   */
  const visibleReachOf = (element: HTMLElement): number => {
    const rect = element.getBoundingClientRect()
    let bottom = Math.min(rect.bottom, window.innerHeight)
    // 每一层裁剪祖先都可能把可见范围收得更窄，所以整条链都要过一遍；overflow 是 visible 的
    // 祖先不裁东西，跳过。getComputedStyle 在这里不算浪费——元素刚插进来，样式本来就要算。
    for (let ancestor = element.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
      const style = window.getComputedStyle(ancestor)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      bottom = Math.min(bottom, ancestor.getBoundingClientRect().bottom)
    }
    return Math.max(0, Math.min(rect.height, bottom - rect.top))
  }

  /**
   * 控件的展开体。控件自己发 aria-controls 时以它为准（那个 id 由 useId 生成、带冒号，只能走
   * getElementById）；否则按卸载式那一族的形状取「控件之后那一个兄弟」。返回 null 就说明这个控件
   * 当前是收起的。
   *
   * 过程组头到不了这里——它先被 processBodyOf 认走，那条路动的是组根，不是展开体自己的高度。
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
   * 只有组头拿 aria-controls 指着组体（ChatGroupSeat 里的 ProcessGroupHeader），组里的成员行不发
   * 这个属性——它们的展开体是自己的下一个兄弟。所以**「控件住在过程组里」不等于「控件是组头」**：
   * 组体里的每一个工具行、思考行都住在 [data-step-process] 里。只看 closest 的话，点一行工具调用
   * 会被当成展开整个过程组，那个组的组根就会代替那一行被压扁。
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
   * 这一份从被点的控件往上找滚动容器——与 follow-tail.ts 那份同名判据的入口不同，判据相同。
   * @param control - 被点的开合控件。
   * @returns 滚动位置落在底部阈值之内时为真。
   */
  const controlAtBottom = (control: HTMLElement): boolean => {
    const scroller = control.closest<HTMLElement>(CONVERSATION_SCROLL_SELECTOR)
    // 找不到滚动容器时按「不在底部」处理。
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
      if (isReaderScrollIntent(event)) moved = true
    }
    // 认这四种：它们都会真的挪动位置。dsh 的 `READING_INTENTS` 里另有 beforematch，本处不认。
    const types = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    for (const type of types) document.addEventListener(type, note, true)
    const stop = (): void => {
      for (const type of types) document.removeEventListener(type, note, true)
    }
    window.setTimeout(stop, FOLD_WATCH_TTL_MS)
    return { atBottom, moved: () => moved, stop }
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
   * （先钉底、属性没回来才点按钮）在 follow-tail.ts 里，跟随守护走的是同一条路。
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
   * ROLL_MS——它正好是两条动画的时长。
   * @param watch - 这一轮折叠的收尾凭证。
   */
  const settleAfterFold = (watch: FoldWatch): void => {
    window.setTimeout(() => { handBackFollow(watch) }, ROLL_MS)
  }

  /**
   * 等 React 把这次折叠落到 DOM 上，再撤掉动画与内联样式。
   *
   * 收起方向的高度动画带着 fill: 'forwards'，把真身锁在终点高度上。React 若还没收下这次点击，
   * cancel() 就会把高度整块还给 CSS——一次从终点弹回全高的跳变，足够把 dsh 的跟随甩出去。所以
   * 等到 DOM 那边真的收拢了才撤；等够几帧仍然没收拢，那说明这次点击确实没有折叠，只好撤回原样。
   * @param settled - DOM 那边已经收拢了。
   * @param done - 可以撤掉动画与内联样式了。
   * @param attempt - 已经等了几帧。
   */
  const confirmCollapsed = (settled: () => boolean, done: () => void, attempt = 0): void => {
    if (settled() || attempt >= SHUT_CONFIRM_FRAMES) {
      done()
      return
    }
    requestAnimationFrame(() => { confirmCollapsed(settled, done, attempt + 1) })
  }

  /**
   * 卷帘门拉开：高度从起点逐帧长到全高，露出多少就占多少。
   *
   * 只有高度这一道，但它分两段跑：可见段占 VISIBLE_SHARE 的时长，视口外的那一截用剩下的时间补完。
   * 曾经在这里叠过一层按可见段走的裁剪，那是错的——裁剪只影响绘制，而高度已经先长出来了，两道进度
   * 相同、行程不同，差值就是一片空白。
   *
   * rect 量到的是 border-box 高度，而 CSS 的 height 默认按 content-box 解释——不换成 border-box，
   * 动画就会多跑出上下 padding 那一段，收尾 cancel 时再缩回去，看起来像「内间距在动」。
   * @param target - 要拉开的真身：展开体自己，或过程组的组根。
   * @param from - 起点高度。展开体从 0 长起；组根从「组头那一段」长起，组体就藏在它下面。
   */
  const rollOpen = (target: HTMLElement, from: number): void => {
    markFoldBusy()
    const height = target.getBoundingClientRect().height
    if (height <= from) return
    const travel = Math.max(from, visibleReachOf(target))
    const previousOverflow = target.style.overflow
    const previousBoxSizing = target.style.boxSizing
    target.style.overflow = 'hidden'
    target.style.boxSizing = 'border-box'
    const growing = target.animate(
      travel >= height
        ? [{ height: String(from) + 'px' }, { height: String(height) + 'px' }]
        : [
          { height: String(from) + 'px', offset: 0, easing: 'ease-out' },
          { height: String(travel) + 'px', offset: VISIBLE_SHARE, easing: 'linear' },
          { height: String(height) + 'px', offset: 1 },
        ],
      { duration: ROLL_MS, easing: 'ease-out' },
    )
    growing.onfinish = () => {
      growing.cancel()
      target.style.overflow = previousOverflow
      target.style.boxSizing = previousBoxSizing
    }
  }

  /**
   * 卷帘门收回：**动真身，不克隆**。
   *
   * 这次点击已经在捕获阶段被拦下，React 还没折叠——真身留在原位、还是展开态，于是可以像展开方向
   * 那样压它的高度：布局逐帧收缩，下方内容是真的被让开，不需要克隆、也不需要 FLIP。压到终点的那
   * 一刻再放行点击，React 这才收拢，而真身此时已经不占多余空间，接上来的时候不会跳。
   *
   * 和展开方向一样只有高度这一道，也分两段跑，只是方向相反：视口外的那一截先收掉，可见段用
   * VISIBLE_SHARE 的时长卷上去。
   * @param fold - 要压的真身、终点高度、以及「React 收拢了」的判据。
   */
  const rollShut = (fold: HeightShut): void => {
    markFoldBusy()
    const height = fold.target.getBoundingClientRect().height
    // 兜底：动画因为任何原因没收到 onfinish 时，别把点击一直锁着。
    const release = window.setTimeout(() => { shutting = false }, ROLL_MS + 200)
    if (height <= fold.floor) {
      window.clearTimeout(release)
      replay(fold.control)
      settleAfterFold(fold.watch)
      return
    }
    const travel = Math.max(fold.floor, visibleReachOf(fold.target))
    const previousOverflow = fold.target.style.overflow
    const previousBoxSizing = fold.target.style.boxSizing
    fold.target.style.overflow = 'hidden'
    fold.target.style.boxSizing = 'border-box'
    const shrinking = fold.target.animate(
      travel >= height
        ? [{ height: String(height) + 'px' }, { height: String(fold.floor) + 'px' }]
        : [
          { height: String(height) + 'px', offset: 0, easing: 'linear' },
          { height: String(travel) + 'px', offset: 1 - VISIBLE_SHARE, easing: 'ease-out' },
          { height: String(fold.floor) + 'px', offset: 1 },
        ],
      { duration: ROLL_MS, easing: 'ease-out', fill: 'forwards' },
    )
    shrinking.onfinish = () => {
      window.clearTimeout(release)
      replay(fold.control)
      // DOM 那边该已经收拢了；没收拢就不能撤动画，见 confirmCollapsed。
      confirmCollapsed(fold.collapsed, () => {
        shrinking.cancel()
        fold.target.style.overflow = previousOverflow
        fold.target.style.boxSizing = previousBoxSizing
      })
      settleAfterFold(fold.watch)
    }
  }

  const flush = (): void => {
    const current = intent
    intent = null
    if (current === null) return
    const watch = current.watch
    // 这一条路上没有动画，收尾就是把监听撤掉。
    if (Date.now() - current.takenAt > INTENT_TTL_MS || reduceMotion()) {
      watch.stop()
      return
    }
    // 过程组：压组根，不压组体——组体自己带滚动条，dsh 的跟随正盯着它。
    if (current.groupRoot !== null && current.groupBody !== null) {
      if (current.groupBody.hasAttribute('hidden')) {
        watch.stop()
        return
      }
      rollOpen(current.groupRoot, current.collapsedHeight)
      settleAfterFold(watch)
      return
    }
    const body = expandedBodyOf(current.control)
    if (body === null) {
      watch.stop()
      return
    }
    // DisclosureRow：展开体是普通块级，压高度就是「拉多少显示多少」。
    rollOpen(body, 0)
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
    // 组头控制组体，成员行不控制——见 processBodyOf。
    const groupBody = processBodyOf(control)
    const groupRoot = groupBody?.parentElement?.closest<HTMLElement>(PROCESS_GROUP_SELECTOR) ?? null
    const body = groupBody ?? expandedBodyOf(control)
    // 展开方向：等 React 把展开体插进来，再在观察回调里做动画。起点高度要在这一边量——此刻组根
    // 正是收起态，那就是门要拉出来的那一段。
    if (body === null || body.hasAttribute('hidden')) {
      intent = {
        control,
        groupBody,
        groupRoot,
        collapsedHeight: groupRoot?.getBoundingClientRect().height ?? 0,
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
    const collapsed = groupBody !== null
      ? (): boolean => groupBody.hasAttribute('hidden')
      : (): boolean => !body.isConnected
    rollShut({
      target: groupRoot ?? body,
      // 组根停在组头那一段：组体收起来之后，组根本来的高度就是这么多。
      floor: groupRoot === null
        ? 0
        : Math.max(0, groupRoot.getBoundingClientRect().height - body.getBoundingClientRect().height),
      collapsed,
      control,
      watch,
    })
  }

  const observer = new MutationObserver(flush)
  document.addEventListener('click', onClick, true)
  // hidden 也要观察：过程组的开合是 setAttribute('hidden', 'until-found')，只有属性变化，
  // 不带 attributeFilter 就收不到。别处的 hidden 切换多在 intent 为 null 时到达，直接返回，
  // 成本可以忽略。
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] })

  return () => {
    document.removeEventListener('click', onClick, true)
    observer.disconnect()
    intent?.watch.stop()
  }
}
