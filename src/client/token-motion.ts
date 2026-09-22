/**
 * 流式回答的一次性 token 淡入。
 *
 * 流式消息里新出现的每个字符都先淡淡地到达，然后淡入到文字自己的颜色上，之后就停住。回答的
 * 两半都自动覆盖：思考和正文走的是同一个 Markdown 层，而在消息生长期间它俩都待在这一层标了
 * `data-streaming` 的那个容器里。
 *
 * 一个字符就是一个区间，而一个区间从头到尾只带一个 alpha：alpha 不在字符内部扫过一遍。同一批
 * 到达的字符按它们在流里的先后各错开一点相位（见 `staggerStepMs`），于是「整块一起变亮」摊成
 * 「亮度沿着新文字扫过去」——一次分片带几个字符是 API 的形状，不该是读者看到的东西。相位只由
 * 到达顺序决定，阅读顺序仍然来自 API 自己，而不是这个模块发明的什么顺序。
 *
 * 为什么用 CSS Custom Highlight API，而不是把 token 包进 <span>：聊天记录是 React 掌管的，
 * 而 Markdown 层（`@deepseek-ai/dsh-client-ui-primitives`）不暴露任何节点渲染钩子——它的
 * `MarkdownDelegate` 只管链接导航。改写文本节点会和 reconciliation 打架，而 highlight 区间
 * 能在不碰 DOM 的前提下标出字符段：React 继续拥有结构，这个模块只拥有文字的透明度。
 *
 * `::highlight()` 不接受 transition，所以淡入是采样出来的、而不是动画出来的：活着的区间按
 * 存活时长分档，大致一帧一档，一档一个 highlight 名字来承载 alpha（见 `styles.ts`，它从下面
 * 的 `REVEAL_STEPS` 推出自己的规则，并让 alpha 线性移动，于是文字以恒定速率变实）。
 *
 * 淡入用的颜色是区间自己的颜色——从它文字渲染所在的元素上读出来，发布到 `RUN_COLOR_VAR` 下——
 * 既不是 `currentColor`，也不是全页面共用一个值。`::highlight()` 会把 `currentColor` 塌缩成
 * 初始色，而不是解析到承载元素上，深色画布上表现为 highlight 撤销前闪一下黑（实测见
 * `styles.ts`），所以 alpha 只能挂在显式的 `color` 上。这个颜色也不能是同一个：一段回答里
 * 不只有正文，把链接、语法 token 或列表标记在淡入期间涂成正文色，读起来是高亮闪一下，
 * 而不是淡入。
 *
 * @module dsh-chat-ux/client/token-motion
 */

/**
 * 一个字符从极淡到停稳之间有多少档。
 *
 * 档数是对着设置允许的最慢渐变、以及最可能跑这个渐变的最快显示器定的：`MAX_REVEAL_MS` 600 ms
 * 在 144 Hz 上是 86 帧，所以 96 档在最坏情况下也能让每帧至少有一档。更快的渐变只是让大多数档位
 * 没被采样到，而那不花任何代价——眼睛积分的是每一绘制帧实际带着的 alpha，不是一帧跳过了几档。
 *
 * 之所以值得把档数调高，只是因为 `styles.ts` 把每一档的 alpha 写成小数。整数百分比只能表达
 * `TOKEN_MIN_OPACITY` 到 1 之间的那 81 个值，再多出来的档只会重复其中某一个，那个「更细」的
 * 渐变不过是同一段台阶换了个名字。
 */
export const REVEAL_STEPS = 96

/**
 * 一个字符开始淡入之前的不透明度。
 *
 * 淡入是文字自身透明度的变化，不是换成别的颜色：字符淡淡地到达、然后坐实，没有任何东西的颜色
 * 被替换成某个高亮色。`::highlight()` 不接受 `opacity`——它能用的属性集很小，并不包含它——
 * 所以 alpha 挂在 `color` 上，由 `styles.ts` 变成每档一条规则。
 *
 * 五分之一淡到两种主题下都读不出字来——`rgb(249, 250, 251)` 以 20% 压在 `rgb(21, 21, 23)` 上
 * 约合 `rgb(67, 68, 70)`——同时仍然看得见，读起来像文字正在到达，而不是什么都没渲染出来。
 */
export const TOKEN_MIN_OPACITY = 0.2

/** 设置读出来之前、以及设置不可用时使用的渐变时长。 */
export const DEFAULT_REVEAL_MS = 120

/**
 * 渐变时长的边界，与 host 侧的 schema 对齐。它们存在是因为 `styles.ts` 把颜色规则硬编码成
 * `REVEAL_STEPS` 条：更长的渐变会把这些档位摊得足够开、看成台阶，所以上限取「一档仍然约等于
 * 一显示帧」的那个点——600 ms 摊到 96 档是 6.25 ms，舒舒服服落在 144 Hz 的一帧里。
 */
export const MIN_REVEAL_MS = 30
export const MAX_REVEAL_MS = 600

/**
 * 把设置里存着的东西收拢成一个能用的渐变时长。
 * @param value - 存着的 `revealMs`，形状未知。
 * @returns 落在支持范围内的整毫秒数。
 */
export function clampRevealMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_REVEAL_MS
  return Math.min(MAX_REVEAL_MS, Math.max(MIN_REVEAL_MS, Math.round(value)))
}

/**
 * 同一批字符之间错开多少相位。
 *
 * 一次分片往往带着好几个字符，而它们是在同一毫秒里落进 DOM 的：不错峰的话，这十几个字符共享一个
 * 出生时间，整块从最淡一起走到本色——眼睛看到的是台阶，不是渐变。错峰让每个字符按自己在流里的
 * 位次晚一点开始，亮度于是沿着新文字扫过去。
 *
 * 步长与渐变时长成比例，所以把设置调快调慢都不会让错峰反客为主：它只占一次渐变的一小段。
 */
const STAGGER_DIVISOR = 50
/** 错峰步长的上下限：再小看不出扫动，再大就让最后到的字符显得迟滞。 */
const MIN_STAGGER_MS = 1
const MAX_STAGGER_MS = 8

/**
 * 一批 `count` 个字符在 `revealMs` 的渐变下的错峰步长。
 *
 * 整批摊开的总相位不超过一次渐变时长——否则一次插入几百个字符（长段落、粘贴、工具输出）会让尾巴
 * 在屏幕外等上好几秒。字符越多，每个字符让出的相位越小，扫动仍然连成一片。
 * @param count - 这一批新字符的数量。
 * @param revealMs - 此刻生效的渐变时长。
 * @returns 相邻字符之间错开的毫秒数；少于两个字符时是 0。
 */
export function staggerStepMs(count: number, revealMs: number): number {
  if (count <= 1) return 0
  const budget = clampRevealMs(revealMs)
  const step = Math.min(MAX_STAGGER_MS, Math.max(MIN_STAGGER_MS, budget / STAGGER_DIVISOR))
  return Math.min(step, budget / (count - 1))
}

/** 这个模块注册的每一个 highlight 名字的前缀。 */
export const HIGHLIGHT_PREFIX = 'dsh-chat-ux-tok-'

/**
 * 一个元素自己的颜色所发布到的自定义属性。
 *
 * `styles.ts` 在 `::highlight()` 里读它——在那个位置自定义属性确实会解析到区间所在的元素上：
 * 实测一个带着 `rgb(77, 155, 255)` 的元素，在第 0 档读出
 * `color(srgb 0.301961 0.607843 1 / 0.7)`。正是这一点让「每档一条规则」能覆盖一段回答里
 * 所有的颜色。
 */
export const RUN_COLOR_VAR = '--dsh-chat-ux-run-color'

/** Markdown 层在助手消息流式期间标记的那个容器。 */
const STREAMING_SELECTOR = '[data-streaming]'

/**
 * 一次折叠之后，它重排过的容器要被排除在淡入之外多久。
 *
 * 容器只要消息还在 `running` 就一直带着 `data-streaming`，而这段时间覆盖整轮——包括思考停下
 * 之后才到的正文。所以点一下思考行或工具行，会改写扫描仍然在看的那个容器。这个时长够长，能盖住
 * React 的重渲染和它产生的那批 mutation；又够短，让点击之后立刻续上的流仍然有动效。
 */
const FOLD_QUIET_MS = 400

/** 一个正在淡入的字符区间。 */
interface LiveRun {
  readonly container: Element
  /**
   * 区间里那些字符渲染所在的元素；`RUN_COLOR_VAR` 就写在它上面。
   *
   * 只有「没有父节点的文本节点」才会是 null，而它不可能出现在流式容器里——这里照样标出来，
   * 只是为了让这处查找只有一种形状。
   */
  readonly element: Element | null
  /** 在容器拼接文本里的字符偏移。 */
  readonly start: number
  /** 区间长度，单位是 UTF-16 码元。 */
  readonly length: number
  /** 这段区间开始淡入时的 `performance.now()` 时间戳。 */
  readonly bornAt: number
  /**
   * 相对同批第一个字符的相位偏移，单位毫秒。出生时间不动，淡入整体后移，所以一批字符不会挤在
   * 同一毫秒里一起变亮。
   */
  delay: number
}

/** 一个文本节点，以及它在容器拼接文本里的起始偏移。 */
interface TextNodeEntry {
  readonly node: Text
  readonly start: number
}

/** 一个容器的文本，以及里面每个文本节点的位置。 */
interface TextSnapshot {
  readonly text: string
  readonly entries: readonly TextNodeEntry[]
}

/** 浏览器的 highlight 注册表，放宽类型以免跟着 lib.dom 的版本漂移。 */
interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

/**
 * 给整页安装淡入效果。
 *
 * 引擎没有 Highlight API、或者读者开了「减少动态效果」时都能安全调用：这两种情况都返回一个
 * 什么都不做的 disposer。
 * @param readRevealMs - 读取此刻生效的渐变时长；每一绘制帧调用一次，所以在设置里改完，
 *   下一帧就生效。
 * @returns disposer：断开 observer，并清掉全部 highlight。
 */
export function installTokenMotion(readRevealMs: () => number = () => DEFAULT_REVEAL_MS): () => void {
  const registry = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistryLike } }).CSS?.highlights
  if (registry === undefined) return () => {}
  const HighlightCtor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
  if (HighlightCtor === undefined) return () => {}
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return () => {}

  /** 还没有停稳的字符区间。 */
  const liveRuns: LiveRun[] = []
  /** 每个流式容器当前的文本快照：扫描时写入，绘制帧直接复用。 */
  const latestText = new WeakMap<Element, TextSnapshot>()
  /** 读者刚刚折叠或展开过的容器，记到守卫过期为止。 */
  const foldedUntil = new WeakMap<Element, number>()
  /** 已经写到元素上的颜色，重复的那一遍就跳过样式读取。 */
  const writtenColors = new WeakMap<Element, string>()
  /** 排队中的绘制帧句柄；0 表示没有排队。 */
  let frameHandle = 0

  /** 清掉全部档位的 highlight。 */
  const clearHighlights = (): void => {
    for (let step = 0; step < REVEAL_STEPS; step += 1) registry.delete(HIGHLIGHT_PREFIX + step)
  }

  /**
   * 把一个元素自己的颜色发布到 `RUN_COLOR_VAR` 上。
   *
   * 读的是算出来的颜色，而不是记下来的颜色：要紧的是 Markdown 层实际画出来的那个颜色——
   * 链接的令牌、语法 token、列表标记——而不是本模块上一次写进去的东西。元素上仍然带着记给它的
   * 那个颜色时跳过这次读取，而这正是第一帧之后每一帧的常见情况。
   * @param element - 区间文字渲染所在的元素。
   */
  const publishRunColor = (element: Element | null): void => {
    if (element === null) return
    const color = window.getComputedStyle(element).color
    if (writtenColors.get(element) === color) return
    writtenColors.set(element, color)
    const styled = element as HTMLElement
    styled.style.setProperty(RUN_COLOR_VAR, color)
  }

  /**
   * 丢掉重排作废的那些区间，保住字符还在原位的那些。
   *
   * 重排一次就把整个容器里的区间杀光，会让正淡到一半的文字直接跳成实色——正是这个模块存在的
   * 意义所要避免的那种硬切；而重排偏偏发生在正在书写的那段文字末尾，也就是读者正盯着的地方。
   * @param container - 被重排的那个容器。
   * @param valid - 重排后仍然有效的那段公共前缀长度。
   */
  const keepRunsBefore = (container: Element, valid: number): void => {
    for (let index = liveRuns.length - 1; index >= 0; index -= 1) {
      const run = liveRuns[index]
      if (run === undefined) continue
      if (run.container === container && run.start + run.length > valid) liveRuns.splice(index, 1)
    }
  }

  /**
   * 记下折叠即将重排的那些容器。
   *
   * 点一下思考行并不是模型在吐字，但它切换的那一行就住在一个仍然带着 `data-streaming` 的容器里；
   * 当收起时的摘要恰好是展开后内容的前缀时，它产生的 mutation 看起来和一次追加一模一样。
   * 点击是区分二者的唯一信号，所以在 React 的处理函数跑之前就捕获它，把它能触达的容器从淡入里
   * 摘出去。
   * @param event - 页面上任意一处点击或按键。
   */
  const noteFold = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const until = performance.now() + FOLD_QUIET_MS
    const ownContainer = target.closest(STREAMING_SELECTOR)
    if (ownContainer !== null) foldedUntil.set(ownContainer, until)
    // 触发折叠的控件可能住在它要重排的那个容器之外，所以这里连子树一起扫，
    // 而不是只看目标自己的祖先。
    for (const container of target.querySelectorAll(STREAMING_SELECTOR)) foldedUntil.set(container, until)
  }

  document.addEventListener('click', noteFold, true)
  document.addEventListener('keydown', noteFold, true)

  /** 按当前年龄重画每一个还活着的区间，然后排下一帧。 */
  const paint = (now: number): void => {
    frameHandle = 0
    if (liveRuns.length === 0) {
      clearHighlights()
      return
    }
    const revealMs = clampRevealMs(readRevealMs())
    const buckets: Range[][] = []
    for (let step = 0; step < REVEAL_STEPS; step += 1) buckets.push([])
    for (let index = liveRuns.length - 1; index >= 0; index -= 1) {
      const run = liveRuns[index]
      if (run === undefined) continue
      const age = now - run.bornAt - run.delay
      // 到点就出列：它已经和别的文字一样实了，不再需要 highlight。
      if (age >= revealMs) {
        liveRuns.splice(index, 1)
        continue
      }
      // 排队这些区间的扫描顺手建好了快照，而之后的每一次 mutation 都会先经过一次新的扫描才轮到
      // 这一帧绘制，所以缓存里就是屏幕上那份文本。在这里重新走一遍容器，等于给每一帧都塞进一个
      // O(整条消息) 的 TreeWalker。
      const snapshot = latestText.get(run.container)
      if (snapshot === undefined) continue

      // 按快照里的偏移二分找出第一个能装下这段区间的文本节点：逐字符区间意味着每帧很多次查找，
      // 从消息开头逐个扫太慢。
      const end = run.start + run.length
      let low = 0
      let high = snapshot.entries.length - 1
      let firstIndex = -1
      while (low <= high) {
        const middle = (low + high) >> 1
        const entry = snapshot.entries[middle]
        if (entry === undefined) break
        if (entry.start + entry.node.data.length <= run.start) {
          low = middle + 1
          continue
        }
        firstIndex = middle
        high = middle - 1
      }
      // 这段区间已经不在 DOM 里了。
      const first = snapshot.entries[firstIndex]
      if (first === undefined) continue
      if (first.start >= end) continue
      const range = document.createRange()
      range.setStart(first.node, Math.max(0, run.start - first.start))
      let lastNode = first.node
      let lastEnd = Math.min(first.node.data.length, end - first.start)
      for (let next = firstIndex + 1; next < snapshot.entries.length; next += 1) {
        const entry = snapshot.entries[next]
        if (entry === undefined) break
        if (entry.start >= end) break
        lastNode = entry.node
        lastEnd = Math.min(entry.node.data.length, end - entry.start)
      }
      range.setEnd(lastNode, lastEnd)

      // 元素是从 range 反查的，不是扫描时看到的那个。Markdown 层在消息流式期间会重建节点
      // （重新解析 `**bold`、折叠某一行），区间所在的元素被换掉之后，旧元素上的颜色再也没人渲染，
      // 真正在渲染的新元素会回退到页面默认色——于是闪一下正文色，而不是淡入。
      // `publishRunColor` 在元素已经带着记给它的颜色时跳过样式读取，所以这里每帧每个区间
      // 只多一次 WeakMap 查找。
      publishRunColor(range.startContainer.parentElement)

      // 档位：0 是最淡，最后一档就是本色；按时间线性映射，所以颜色以恒定速率变实。
      // 上面的卫语句已经排除了 age >= revealMs，比值必然小于 1，档位必然落在范围内。
      const step = age <= 0 ? 0 : Math.floor((age / revealMs) * REVEAL_STEPS)
      const bucket = buckets[step]
      if (bucket === undefined) continue
      bucket.push(range)
    }
    for (let step = 0; step < REVEAL_STEPS; step += 1) {
      const ranges = buckets[step]
      if (ranges === undefined || ranges.length === 0) {
        registry.delete(HIGHLIGHT_PREFIX + step)
        continue
      }
      registry.set(HIGHLIGHT_PREFIX + step, new HighlightCtor(...ranges))
    }
    if (liveRuns.length > 0) frameHandle = requestAnimationFrame(paint)
  }

  /** 把每个流式容器与它上一次的快照对比，然后把新出现的那一段排成区间。 */
  const scan = (): void => {
    const containers = document.querySelectorAll(STREAMING_SELECTOR)
    if (containers.length === 0) return
    const now = performance.now()
    const revealMs = clampRevealMs(readRevealMs())
    /** 这一次扫描里新排出来的区间，用来按批分配错峰相位。 */
    const created: LiveRun[] = []
    for (const container of containers) {
      const batchStart = created.length
      // 先把容器下每一个文本节点拼起来，同时记住每个节点在拼接串里的偏移。
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
      const entries: TextNodeEntry[] = []
      let text = ''
      let node = walker.nextNode()
      while (node !== null) {
        const textNode = node as Text
        entries.push({ node: textNode, start: text.length })
        text += textNode.data
        node = walker.nextNode()
      }

      const previous = latestText.get(container)?.text
      latestText.set(container, { text, entries })
      // 第一次见到某个容器只是记个基线：历史消息不重播。
      if (previous === undefined || text.length === 0) continue

      // 只有纯粹的末尾追加才算新字符：旧文本必须是新文本的前缀。别的形状——变短、在中间岔开——
      // 都是在对已经读过的文字做重排，不产生动效。
      const quietUntil = foldedUntil.get(container)
      const underFoldGuard = quietUntil !== undefined && now <= quietUntil
      if (underFoldGuard || text.length <= previous.length || !text.startsWith(previous)) {
        // 重排：公共前缀之内仍然有效的区间继续自己的淡入，而不是被整片撤销——否则正读到一半的
        // 正文会突然跳成实色。
        let valid = 0
        const limit = Math.min(previous.length, text.length)
        while (valid < limit && previous.charCodeAt(valid) === text.charCodeAt(valid)) valid += 1
        keepRunsBefore(container, valid)
        continue
      }

      // 逐个文本节点走，而不是在拼接后的整串上走：每个区间都要带上它渲染所在的元素，而
      // `styles.ts` 正是从这个元素读淡入用的颜色，一个节点的文本总是渲染在一个元素里。
      // 同一个节点里的字符出生时间相同，相位在遍历完之后按位次统一分配——一到屏幕就整块变亮的
      // 台阶感，正是错峰要摊掉的东西。
      // 按码点迭代，所以代理对算作一个区间；空白不单独成区间，但仍然推进偏移。
      const from = previous.length
      const touchedElements = new Set<Element>()
      for (const entry of entries) {
        if (entry.start + entry.node.data.length <= from) continue
        const begin = Math.max(from, entry.start)
        const element = entry.node.parentElement
        let offset = begin
        for (const character of entry.node.data.slice(begin - entry.start)) {
          if (character.trim().length === 0) {
            offset += character.length
            continue
          }
          // 每个元素每次扫描只读一次样式：一批文本通常落在一两个节点里，
          // 所以哪怕整段一次到达也只有几次读取。
          if (element !== null && !touchedElements.has(element)) {
            touchedElements.add(element)
            publishRunColor(element)
          }
          const run: LiveRun = { container, element, start: offset, length: character.length, bornAt: now, delay: 0 }
          liveRuns.push(run)
          created.push(run)
          offset += character.length
        }
      }
      // 按这批字符在流里的位次错开：整批摊开的总相位不超过一次渐变，所以一次插入几百个字符也不会
      // 让尾巴等上好几秒。
      const step = staggerStepMs(created.length - batchStart, revealMs)
      for (let slot = batchStart; slot < created.length; slot += 1) {
        const run = created[slot]
        if (run === undefined || step === 0) continue
        run.delay = (slot - batchStart) * step
      }
    }
    // 新字符必须在同一帧就带上最淡的一档。排一次绘制帧是等下一个渲染步骤，而这一次扫描可能正好
    // 发生在本次渲染步骤的 rAF 阶段之后——那样新字会先以本色画一帧、下一帧才被压回最淡再淡入，
    // 也就是眼睛看到的「闪一下」。这里直接同步画一次：区间刚建好，立刻就有自己的 alpha。
    if (created.length === 0) return
    if (frameHandle !== 0) {
      cancelAnimationFrame(frameHandle)
      frameHandle = 0
    }
    paint(performance.now())
  }

  const observer = new MutationObserver(scan)
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  scan()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', noteFold, true)
    document.removeEventListener('keydown', noteFold, true)
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
    frameHandle = 0
    liveRuns.length = 0
    clearHighlights()
  }
}
