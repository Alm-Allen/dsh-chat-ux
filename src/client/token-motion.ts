/**
 * 流式回答的一次性 token 淡入。
 *
 * 流式消息里新出现的每个字符都先淡淡地到达，然后淡入到文字自己的颜色上，之后就停住。回答的
 * 两半都自动覆盖：思考和正文走的是同一个 Markdown 层，而在消息生长期间它俩都待在这一层标了
 * `data-streaming` 的那个容器里。
 *
 * 一个字符就是一个区间，而一个区间从头到尾只带一个 alpha：alpha 不在字符内部扫过一遍。同一批
 * 到达的字符按它们在流里的先后各错开一点相位，于是「整块一起变亮」摊成
 * 「亮度沿着新文字扫过去」——一次分片带几个字符是 API 的形状，不该是读者看到的东西。相位只由
 * 到达顺序决定，阅读顺序仍然来自 API 自己，而不是这个模块发明的什么顺序。
 *
 * 为什么用 CSS Custom Highlight API，而不是把 token 包进 <span>：聊天记录是 React 掌管的，
 * 而 Markdown 层（`@deepseek-ai/dsh-client-ui-primitives`）不暴露任何节点渲染钩子——它的
 * `MarkdownDelegate` 只管链接导航。改写文本节点会和 reconciliation 打架，而 highlight 区间
 * 能在不碰 DOM 的前提下标出字符段：React 继续拥有结构，这个模块只拥有文字的透明度。
 *
 * `::highlight()` 不接受 transition，所以淡入是采样出来的、而不是动画出来的：活着的区间按
 * 存活时长分档，大致一帧一档，一档一个 highlight 名字来承载 alpha（规则由下面的 `revealCss`
 * 从 `REVEAL_STEPS` 推出，alpha 线性移动，于是文字以恒定速率变实）。
 *
 * 淡入用的颜色是区间自己的颜色——从它文字渲染所在的元素上读出来，发布到 `RUN_COLOR_VAR` 下——
 * 既不是 `currentColor`，也不是全页面共用一个值。`::highlight()` 里的 `currentColor` 在
 * Chromium 中不解析到承载元素上，而是塌缩成初始色：实测（`rgb(21, 21, 23)` 画布 +
 * `color-scheme: dark`）只以它作为颜色的规则画出了 `rgb(0, 0, 0)`——在那块画布上不可见，
 * 表现为每个字符在 highlight 撤销前闪一下黑。所以 alpha 只能挂在显式的 `color` 上。
 * 这个颜色也不能是同一个：一段回答里不只有正文，把链接、语法 token 或列表标记在淡入期间涂成
 * 正文色，读起来是高亮闪一下，而不是淡入。
 *
 * 档位规则**常驻，不按需插拔**。禁用与启用之间的那一下翻转会让整篇文档的样式失效，于是下一次
 * 样式计算从「只算新节点」变成「整页重算」——而它恰好落在流式刚开头那一帧，也就是读者按下提交的
 * 同一帧。常驻的代价只是「每次全量重算多几条规则」，而全量重算在阅读期本来就不常发生（见
 * `REVEAL_STEPS`）。
 *
 * @module dsh-chat-ux/client/token-motion
 */

import { STREAMING_ATTRIBUTE, STREAMING_SELECTOR } from './dom-contract'
import { isProgrammaticToggle } from './programmatic-toggle'

/**
 * 一个字符从极淡到停稳之间有多少档。
 *
 * 下界由最可能跑这个渐变的最快显示器定：`REVEAL_MS` 120 ms 在 144 Hz 上是 17 帧，档数少于帧数
 * 就必然有绘制帧共用一档，眼睛看到的是台阶。24 档在下界之上留了一点余量。
 *
 * 上界由规则条数的代价定，而这是实测出来的：每一档就是下面 `revealCss` 里的一条
 * `::highlight()` 规则，而规则条数直接乘在浏览器每一次强制同步样式重算上。在一个 5800 节点的
 * 会话里，96 条档位规则把「提交」那一刻的样式重算从约 18 ms 抬到约 77 ms；只留 1 条时它又回到
 * 18 ms。档数曾经按「多出来的部分不花任何代价」取到 96，那个前提不成立。
 *
 * 常驻就是拿它换来的：页面上每一次全量样式重算都要乘上这个条数，六千节点上实测约四十毫秒。
 * 把它降下来只有两条路——减档，或者让这些规则不参与重算；后者已经试过并撤掉了（见
 * `installTokenMotion`）。
 */
export const REVEAL_STEPS = 24

/**
 * 一个字符开始淡入之前的不透明度。
 *
 * 淡入是文字自身透明度的变化，不是换成别的颜色：字符淡淡地到达、然后坐实，没有任何东西的颜色
 * 被替换成某个高亮色。`::highlight()` 不接受 `opacity`——它能用的属性集很小，并不包含它——
 * 所以 alpha 挂在 `color` 上，由下面的档位规则变成每档一条。
 *
 * 五分之一淡到两种主题下都读不出字来——`rgb(249, 250, 251)` 以 20% 压在 `rgb(21, 21, 23)` 上
 * 约合 `rgb(67, 68, 70)`——同时仍然看得见，读起来像文字正在到达，而不是什么都没渲染出来。
 */
export const TOKEN_MIN_OPACITY = 0.2

/**
 * 一个字符从最淡到完全不透明所用的时长。
 *
 * 它不是一个设置项：更长的渐变会把按 `REVEAL_STEPS` 生成的档位规则摊成看得见的台阶，更短的
 * 在常规刷新率下一帧就跨过去了、等于没有渐变——120 ms 是两头都合适的那个点。要动它，得连
 * `REVEAL_STEPS` 与档位规则一起想。
 */
export const REVEAL_MS = 120

/** 这个模块注册的每一个 highlight 名字的前缀。 */
export const HIGHLIGHT_PREFIX = 'dsh-chat-ux-tok-'

/**
 * 一个元素自己的颜色所发布到的自定义属性。
 *
 * 下面那份档位规则在 `::highlight()` 里读它——在那个位置自定义属性确实会解析到区间所在的元素
 * 上：实测一个带着 `rgb(77, 155, 255)` 的元素，在第 0 档读出
 * `color(srgb 0.301961 0.607843 1 / 0.7)`。正是这一点让「每档一条规则」能覆盖一段回答里
 * 所有的颜色。
 */
export const RUN_COLOR_VAR = '--dsh-chat-ux-run-color'

/** 同一批字符之间错开多少相位：步长与渐变时长成比例，所以把设置调快调慢都不会让错峰反客为主。 */
const STAGGER_DIVISOR = 50

/** 错峰步长的上下限：再小看不出扫动，再大就让最后到的字符显得迟滞。 */
const MIN_STAGGER_MS = 1
const MAX_STAGGER_MS = 8

/**
 * 给整页安装淡入效果。
 *
 * 引擎没有 Highlight API、或者读者开了「减少动态效果」时都能安全调用：这两种情况都返回一个
 * 什么都不做的 disposer。
 * @returns disposer：断开 observer，并清掉全部 highlight。
 */
export function installTokenMotion(): () => void {
  const registry = (globalThis as unknown as { CSS?: { highlights?: HighlightRegistryLike } }).CSS?.highlights
  if (registry === undefined) return () => {}
  const HighlightConstructor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight
  if (HighlightConstructor === undefined) return () => {}
  if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true) return () => {}

  /** 还没有停稳的字符区间。 */
  const liveRuns: LiveRun[] = []
  /** 安装那一刻就已经在页面上的流式容器：它们是历史，不重播淡入。 */
  const historyContainers = new WeakSet<Element>()
  for (const container of document.querySelectorAll(STREAMING_SELECTOR)) historyContainers.add(container)
  /** 上一个绘制帧的时间戳；0 表示还没有画过。 */
  let lastFrameAt = 0
  /** 每个流式容器当前的文本快照：扫描时写入，绘制帧直接复用。 */
  const textSnapshots = new WeakMap<Element, TextSnapshot>()
  /** 读者刚刚折叠或展开过的容器，记到守卫过期为止。 */
  const foldQuietUntil = new WeakMap<Element, number>()
  /** 已经写到元素上的颜色，重复的那一遍就跳过样式读取。 */
  const writtenColors = new WeakMap<Element, string>()
  /** 排队中的绘制帧句柄；0 表示没有排队。 */
  let scheduledFrame = 0

  // 档位规则单独一张样式表，挂上就一直生效。
  //
  // 它曾经按需插拔：没有流式容器时整张 `disabled`，有新字符要淡入时再启用。那样省下的是「阅读期
  // 每一次全量重算」，代价却出在另一头：`disabled` 的翻转会让整篇文档的样式失效，于是紧接着的那
  // 一次样式计算从「只算新节点」升级成「整页重算」。六千节点上实测，翻转后的一次重算约三十八毫秒，
  // 而不翻转的插入四百个节点只要三点五毫秒——也就是说这一下翻转**凭空造出**了一次整页重算，还正好
  // 造在读者按下提交的那一帧上（新字符到达、流式刚开头）。同值写入是零代价的（Blink 会短路），
  // 贵的是值真的变了。
  const revealStyleElement = document.createElement('style')
  revealStyleElement.id = REVEAL_STYLE_ID
  revealStyleElement.textContent = revealCss
  document.head.append(revealStyleElement)

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
   * 记下折叠即将重排的那些容器。
   *
   * 点一下思考行并不是模型在吐字，但它切换的那一行就住在一个仍然带着 `data-streaming` 的容器里；
   * 当收起时的摘要恰好是展开后内容的前缀时，它产生的 mutation 看起来和一次追加一模一样。
   * 点击是区分二者的唯一信号，所以在 React 的处理函数跑之前就捕获它，把它能触达的容器从淡入里
   * 摘出去。
   * @param event - 页面上任意一处点击或按键。
   */
  const rememberReaderFold = (event: Event): void => {
    // 本插件自己的自动收起不是读者的意图，它落在思考刚停、正文刚开头的位置上。
    if (isProgrammaticToggle()) return
    const target = event.target
    if (!(target instanceof Element)) return
    const until = performance.now() + FOLD_QUIET_MS
    const ownContainer = target.closest(STREAMING_SELECTOR)
    if (ownContainer !== null) foldQuietUntil.set(ownContainer, until)
    // 触发折叠的控件可能住在它要重排的那个容器之外，所以这里连子树一起扫，而不是只看目标自己的
    // 祖先——但只在点击时扫：键盘事件的目标常常是整个 body，那时「子树」就是整篇文档，一次
    // PageUp 会把页面上每一个流式容器一起静默掉，而按方向键的读者并没有碰过它们。
    if (event.type !== 'click') return
    for (const container of target.querySelectorAll(STREAMING_SELECTOR)) foldQuietUntil.set(container, until)
  }

  /** 按当前年龄重画每一个还活着的区间，然后排下一帧。 */
  const paint = (now: number): void => {
    scheduledFrame = 0
    if (liveRuns.length === 0) {
      clearHighlights()
      return
    }
    // 上一帧到现在隔得太久，说明这段空白里根本没有绘制帧：页面被藏起来时 rAF 不跑，主线程
    // 被占住时也会跳帧，而 `performance.now()` 一直在走。把没绘制的时长从每个区间的年龄里
    // 扣掉，它们才能在切回来（或卡顿结束）之后接着自己的淡入往下走，而不是一帧之内全部过期。
    const previousFrameAt = lastFrameAt
    lastFrameAt = now
    const gap = previousFrameAt === 0 ? 0 : now - previousFrameAt
    if (gap > FRAME_GAP_LIMIT_MS) {
      const unspent = gap - NOMINAL_FRAME_MS
      for (const run of liveRuns) {
        // 空白期里出生的区间按「此刻出生」算，否则它还要再等这段空白过去才开始淡入。
        run.bornAt = run.bornAt <= previousFrameAt ? run.bornAt + unspent : now
      }
    }
    const buckets: Range[][] = []
    for (let step = 0; step < REVEAL_STEPS; step += 1) buckets.push([])
    for (let index = liveRuns.length - 1; index >= 0; index -= 1) {
      const run = liveRuns[index]
      if (run === undefined) continue
      const age = now - run.bornAt - run.delay
      // 到点就出列：它已经和别的文字一样实了，不再需要 highlight。
      if (age >= REVEAL_MS) {
        liveRuns.splice(index, 1)
        continue
      }
      // 排队这些区间的扫描顺手建好了快照，而之后的每一次 mutation 都会先经过一次新的扫描才轮到
      // 这一帧绘制，所以缓存里就是屏幕上那份文本。在这里重新走一遍容器，等于给每一帧都塞进一个
      // O(整条消息) 的 TreeWalker。
      const snapshot = textSnapshots.get(run.container)
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
      const firstEntry = snapshot.entries[firstIndex]
      if (firstEntry === undefined) continue
      if (firstEntry.start >= end) continue
      const range = document.createRange()
      range.setStart(firstEntry.node, Math.max(0, run.start - firstEntry.start))
      let lastNode = firstEntry.node
      let lastEnd = Math.min(firstEntry.node.data.length, end - firstEntry.start)
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
      // 上面的卫语句已经排除了 age >= REVEAL_MS，比值必然小于 1，档位必然落在范围内。
      const step = age <= 0 ? 0 : Math.floor((age / REVEAL_MS) * REVEAL_STEPS)
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
      registry.set(HIGHLIGHT_PREFIX + step, new HighlightConstructor(...ranges))
    }
    if (liveRuns.length > 0) scheduledFrame = requestAnimationFrame(paint)
  }

  /** 把每个流式容器与上一次的快照对比，然后把新出现的那一段排成区间。 */
  const scan = (): void => {
    const containers = document.querySelectorAll(STREAMING_SELECTOR)
    if (containers.length === 0) return
    const now = performance.now()
    /** 这一次扫描里新排出来的区间，用来按批分配错峰相位。 */
    const createdRuns: LiveRun[] = []
    for (const container of containers) {
      const batchStart = createdRuns.length
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

      const previous = textSnapshots.get(container)?.text
      textSnapshots.set(container, { text, entries })

      // 第一次见到这个容器。安装那一刻就在页面上的，是历史；一出现就已经很长（切会话、翻历史
      // 时整段挂载）的，也当历史。只有安装之后才冒出来、还没长出几个字的那种——新的一轮回答——
      // 才把它开头这几个字符也算成新出现的。
      if (previous === undefined && (historyContainers.has(container) || text.length > FIRST_SIGHT_LIMIT)) continue
      const before = previous ?? ''

      // 这一趟变化里的两段稳定区：公共前缀里的区间位置不变，公共后缀里的区间整体平移，中间那段
      // 才是真被改写的地方。展开或收起一行思考正是这个形状——容器前面的文本被摘要和正文互相
      // 替换，后面正在流的正文一个字都没动，那些字不该因为读者碰了一下折叠控件就整片定格；而
      // 重排一次就把整个容器里的区间杀光，会让正淡到一半的文字直接跳成实色。
      const overlapLimit = Math.min(before.length, text.length)
      let prefix = 0
      while (prefix < overlapLimit && before.charCodeAt(prefix) === text.charCodeAt(prefix)) prefix += 1
      // 后缀不与前缀重叠，所以中间那段改写区不会被两边同时认领。
      let suffix = 0
      while (
        suffix < overlapLimit - prefix
        && before.charCodeAt(before.length - 1 - suffix) === text.charCodeAt(text.length - 1 - suffix)
      ) suffix += 1
      const stableFrom = before.length - suffix
      const shift = text.length - before.length
      for (let index = liveRuns.length - 1; index >= 0; index -= 1) {
        const run = liveRuns[index]
        if (run === undefined) continue
        if (run.container !== container) continue
        if (run.start + run.length <= prefix) continue
        if (run.start >= stableFrom) {
          // 同一段字符，只是整体挪了位：跟着挪，它的年龄和相位都不动。
          liveRuns[index] = { ...run, start: run.start + shift }
          continue
        }
        liveRuns.splice(index, 1)
      }

      // 读者刚折叠或展开过：这一次变化是那一下重排引起的，不是模型在吐字。
      const quietUntil = foldQuietUntil.get(container)
      if (quietUntil !== undefined && now <= quietUntil) continue

      // 新出现的字符。纯粹在尾部追加时，它就是最后那一段；Markdown 闭合一个标记（`**`、反引号、
      // 链接）时，新字符夹在旧文字中间，那种改写里对不上旧文本的那几个字同样该淡入。
      //
      // 改写要看中间那段：把旧文本与新文本各自的前后缀剥掉之后，两边剩下的部分用一次字符级公共子
      // 序列对齐，对不上的新字符就是新出现的。中间那段一旦大起来就放弃——整块重写（流式结束时整体
      // 重排、切换渲染分支）不该让读者重看一遍淡入，只有小范围闭合才值得给那几个字动画。
      const oldMiddle = before.slice(prefix, before.length - suffix)
      const newMiddle = text.slice(prefix, text.length - suffix)
      if (newMiddle.length === 0) continue
      if (oldMiddle.length > 0 && oldMiddle.length * newMiddle.length > REWRITE_DIFF_BUDGET) continue

      // 每个新字符在旧文本里对不对得上。旧文本的中间段是空的，就是整段都没对上——这一次变化全是
      // 新增，不必走一次对齐。
      const matched = new Uint8Array(newMiddle.length)
      if (oldMiddle.length > 0) {
        // 自底向上的公共子序列长度表，回溯时用它判断哪个新字符对得上旧文本。
        const columns = newMiddle.length + 1
        const lengths = new Uint16Array((oldMiddle.length + 1) * columns)
        for (let row = oldMiddle.length - 1; row >= 0; row -= 1) {
          for (let column = newMiddle.length - 1; column >= 0; column -= 1) {
            const sameCharacter = oldMiddle.charCodeAt(row) === newMiddle.charCodeAt(column)
            lengths[row * columns + column] = sameCharacter
              ? (lengths[(row + 1) * columns + column + 1] ?? 0) + 1
              : Math.max(lengths[(row + 1) * columns + column] ?? 0, lengths[row * columns + column + 1] ?? 0)
          }
        }
        let matchedCount = 0
        let row = 0
        let column = 0
        while (row < oldMiddle.length && column < newMiddle.length) {
          if (oldMiddle.charCodeAt(row) === newMiddle.charCodeAt(column)) {
            matched[column] = 1
            matchedCount += 1
            row += 1
            column += 1
            continue
          }
          // 哪边的表值大就往哪边走。
          const skipOldRow = lengths[(row + 1) * columns + column] ?? 0
          const skipNewColumn = lengths[row * columns + column + 1] ?? 0
          const advanceOldRow = skipOldRow >= skipNewColumn
          if (advanceOldRow) row += 1
          if (!advanceOldRow) column += 1
        }
        if (matchedCount === 0 || newMiddle.length - matchedCount > LOCAL_REWRITE_LIMIT) continue
      }

      // 对不上的新字符就是要淡入的那批，连续的合并成一段。
      const addedRanges: OffsetRange[] = []
      let rangeStart = -1
      for (let index = 0; index < newMiddle.length; index += 1) {
        if (matched[index] === 1) {
          if (rangeStart >= 0) addedRanges.push({ start: rangeStart + prefix, end: index + prefix })
          rangeStart = -1
          continue
        }
        if (rangeStart < 0) rangeStart = index
      }
      if (rangeStart >= 0) addedRanges.push({ start: rangeStart + prefix, end: newMiddle.length + prefix })
      if (addedRanges.length === 0) continue

      // 逐个文本节点走，而不是在拼接后的整串上走：每个区间都要带上它渲染所在的元素，而
      // `styles.ts` 正是从这个元素读淡入用的颜色，一个节点的文本总是渲染在一个元素里。
      // 同一个节点里的字符出生时间相同，相位在遍历完之后按位次统一分配——一到屏幕就整块变亮的
      // 台阶感，正是错峰要摊掉的东西。
      // 按码点迭代，所以代理对算作一个区间；空白不单独成区间，但仍然推进偏移。
      const touchedElements = new Set<Element>()
      for (const range of addedRanges) {
        for (const entry of entries) {
          if (entry.start + entry.node.data.length <= range.start) continue
          if (entry.start >= range.end) break
          const begin = Math.max(range.start, entry.start)
          const end = Math.min(range.end, entry.start + entry.node.data.length)
          const element = entry.node.parentElement
          let offset = begin
          for (const character of entry.node.data.slice(begin - entry.start, end - entry.start)) {
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
            const run: LiveRun = { container, start: offset, length: character.length, bornAt: now, delay: 0 }
            liveRuns.push(run)
            createdRuns.push(run)
            offset += character.length
          }
        }
      }
      // 按这批字符在流里的位次错开：整批摊开的总相位不超过一次渐变，所以一次插入几百个字符也不会
      // 让尾巴等上好几秒。字符越多，每个字符让出的相位越小，扫动仍然连成一片；再小看不出扫动，
      // 再大就让最后到的字符显得迟滞。
      const batchCount = createdRuns.length - batchStart
      const staggerLimit = Math.min(MAX_STAGGER_MS, Math.max(MIN_STAGGER_MS, REVEAL_MS / STAGGER_DIVISOR))
      const step = batchCount <= 1 ? 0 : Math.min(staggerLimit, REVEAL_MS / (batchCount - 1))
      for (let slot = batchStart; slot < createdRuns.length; slot += 1) {
        const run = createdRuns[slot]
        if (run === undefined || step === 0) continue
        run.delay = (slot - batchStart) * step
      }
    }
    // 新字符必须在同一帧就带上最淡的一档。排一次绘制帧是等下一个渲染步骤，而这一次扫描可能正好
    // 发生在本次渲染步骤的 rAF 阶段之后——那样新字会先以本色画一帧、下一帧才被压回最淡再淡入，
    // 也就是眼睛看到的「闪一下」。这里直接同步画一次：区间刚建好，立刻就有自己的 alpha。
    if (createdRuns.length === 0) return
    if (scheduledFrame !== 0) {
      cancelAnimationFrame(scheduledFrame)
      scheduledFrame = 0
    }
    paint(performance.now())
  }

  const observer = new MutationObserver(scan)
  // 也看着 `data-streaming`：流式容器不总是「新插进来的一个节点」——React 给已经在那儿的 div 补上
  // 这个属性时只有一次属性变化，漏掉它就漏掉那一整段回答的开头。
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [STREAMING_ATTRIBUTE],
  })
  document.addEventListener('click', rememberReaderFold, true)
  document.addEventListener('keydown', rememberReaderFold, true)
  scan()

  return () => {
    observer.disconnect()
    document.removeEventListener('click', rememberReaderFold, true)
    document.removeEventListener('keydown', rememberReaderFold, true)
    if (scheduledFrame !== 0) cancelAnimationFrame(scheduledFrame)
    scheduledFrame = 0
    liveRuns.length = 0
    clearHighlights()
    revealStyleElement.remove()
  }
}

/**
 * 承载档位规则的那张样式表的 id，用于排查。
 *
 * 它和 `styles.ts` 那张 `ALL_CSS` 是两张表：这一张只装 `REVEAL_STEPS` 条档位规则，跟着
 * `installTokenMotion` 一起挂上和撤下。
 */
const REVEAL_STYLE_ID = 'dsh-chat-ux-reveal'

/**
 * 档位规则。第 0 档是字符最淡的样子，最后一档完全不透明，所以文字正好在区间离开 highlight
 * 注册表的那一刻到达它最终的颜色。
 *
 * 淡入是「变实」，不是「变色」：每一档都把文字画在它最终会停住的那个颜色上——也就是它自己的
 * 颜色，由 `RUN_COLOR_VAR` 逐元素发布——从 `TOKEN_MIN_OPACITY` 一路走到完全不透明。透明度只能
 * 走 `color` 的 alpha 通道（`::highlight()` 的属性集里没有 `opacity`），而
 * `color-mix(in srgb, C p%, transparent)` 的语义正好是它：与 `transparent` 混合会把结果的
 * alpha 按 `p` 加权，色相不变。
 *
 * 条数就是 `REVEAL_STEPS`，而条数是有代价的（见那个常量），所以这里不额外多生成任何一档。
 * alpha 仍然写成两位小数：档数降到 24 之后整数百分比其实也够表达，留两位小数只是按比例算出来
 * 的值本来就在那儿，不必再舍一次。
 */
const revealCss = Array.from({ length: REVEAL_STEPS }, (_, step) => {
  const ratio = TOKEN_MIN_OPACITY + (1 - TOKEN_MIN_OPACITY) * (step / (REVEAL_STEPS - 1))
  const alpha = Number((ratio * 100).toFixed(2))
  return [
    '::highlight(' + HIGHLIGHT_PREFIX + step + ') {',
    '  color: color-mix(in srgb, var(' + RUN_COLOR_VAR + ', currentColor) ' + alpha + '%, transparent);',
    '}',
  ].join('\n')
}).join('\n\n')

/**
 * 一次折叠之后，它重排过的容器要被排除在淡入之外多久。
 *
 * 容器只要消息还在 `running` 就一直带着 `data-streaming`，而这段时间覆盖整轮——包括思考停下
 * 之后才到的正文。所以点一下思考行或工具行，会改写扫描仍然在看的那个容器。这个时长够长，能盖住
 * React 的重渲染和它产生的那批 mutation；又够短，让点击之后立刻续上的流仍然有动效。
 */
const FOLD_QUIET_MS = 400
/**
 * 一个刚冒出来的流式容器最多带多少字符，还算「刚开头的一轮回答」。
 *
 * 新的一轮回答是容器先出现、字符再一个个到；而切会话、翻历史时挂上来的容器一出现就已经是整段
 * 文本。两者都算「第一次见到这个容器」，区别只在长度。
 */
const FIRST_SIGHT_LIMIT = 200

/** 两帧之间超过这么久，就认为中间没有绘制帧：页面被藏起来、主线程被占住时都会这样。 */
const FRAME_GAP_LIMIT_MS = 40

/** 正常的一帧有多长（按 60 Hz 算）；补偿时从空白里扣掉它，区间就接着上一帧的位置往下走。 */
const NOMINAL_FRAME_MS = 16.7

/** 一个正在淡入的字符区间。 */
interface LiveRun {
  readonly container: Element
  /** 在容器拼接文本里的字符偏移。 */
  readonly start: number
  /** 区间长度，单位是 UTF-16 码元。 */
  readonly length: number
  /**
   * 这段区间开始淡入时的 `performance.now()` 时间戳。它会被帧间隔补偿整体推后（见 `paint`），
   * 所以不是只读的。
   */
  bornAt: number
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
/** 新文本里的一段字符偏移，左闭右开。 */
interface OffsetRange {
  readonly start: number
  readonly end: number
}

/**
 * 一次改写里最多认几个新字符。
 *
 * 中间那段已经被 `REWRITE_DIFF_BUDGET` 限制过大小，这里再给「新增字符」本身一个上限：Markdown
 * 闭合一个标记只会多出一两个字，一次多出几十个字的那种变化是整块重写，不该给它动画。
 */
const LOCAL_REWRITE_LIMIT = 64

/**
 * 中间那段最多允许多大（旧段长度 × 新段长度）。
 *
 * 字符级对齐是 O(旧段 × 新段) 的，而它每次 mutation 都要跑一遍，所以给一个预算：超出预算就
 * 认为这是整块重写，一个字符都不动。
 */
const REWRITE_DIFF_BUDGET = 4096


