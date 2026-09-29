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
 * 形状、位置、透明度都能交给合成器——**除了 `clip-path`**。那一条是实测否掉的：它单独放一段关键帧
 * 也一样上不了合成器，读者在慢机器上抓到过「位移在合成器上继续走、裁剪冻在主线程」，一整张还没收窄的
 * 卡片被平移出消息列。所以形状改走壳上的 `transform: scale`，内容再用一层互为倒数的 `scale` 抵回来
 * （见 `startMorph` 里的 `scaler`）。唯一绕不开布局的是「字跟着形状重新排」——但折行只在一串离散的
 * 宽度上变化，所以把它也提前做掉：
 *
 *   形状    一个壳，`scale` 从卡片尺寸收到气泡尺寸；壳里垫一层反向缩放，内容的视觉尺寸与位置一个像素
 *           都不变，变的只有 `overflow: hidden` 那个裁剪框。圆角不可合成，单独一层、留在主线程——
 *           它不参与右边缘。底色是壳里两层实色（卡片的、气泡的）靠透明度交叉淡换：`background-color`
 *           写进同一段关键帧时会掉回主线程（实测主线程一占住，形状与颜色一起定格），所以只用透明度。
 *   描边    壳的 `overflow: hidden` 会连元素自己的阴影一起裁掉，所以卡片的阴影与那一圈发丝描边挂在壳
 *           后面一个单独的「光晕」上：透明的盒子、原样的 box-shadow，跟着壳的外框缩放，一路淡掉。
 *   工具栏  卡片整张克隆下来（去掉底色与阴影，交给壳和光晕），工具栏左右两组各自贴着壳上最近的
 *           那个角走，边缩小边淡出——右边那组跟着右下角往里收，左边那组跟着底边往上收。
 *   字      起飞前先把「气泡的正文」在形变沿途的每一个宽度上排一遍，折行一样的归成一段，每段一层
 *           预先排好的字；时间到了哪一段就亮哪一层（`opacity` 的阶跃，合成器上切换）。多行时行高也
 *           要从输入框的 24 走到气泡的 22，行高按半像素分档，同样归进层里。第一段用的是输入框里那份
 *           草稿自己的克隆（引用、技能那些小块在输入框里另有样式），形变过半才换成气泡的写法。最后
 *           一层就是气泡自己的排版，交接时一个像素都不跳。
 *
 * 主线程上每帧只剩两件事：终点跟着页面动了多少（dsh 滚到底、回显换正式行）写在最外层；形变段走完
 * 那一帧把壳归一（见 `startMorph` 里的 `compact`）。两件都在 `send-flight.ts` 的帧循环里。
 *
 * **替身凭什么长得像真卡片。** 三条路一起走：DOM 结构（class 一个不删，dsh 的样式是 CSS Modules，
 * 认 class 就有样式）、起飞前现读的计算样式（底色、圆角、阴影这些不进 class 的属性）、以及**祖先
 * 链**——克隆一旦离开原来的父链，`.hero .input` 这类后代选择器就全不匹配了，所以起飞时照着卡片的
 * 祖先再套一条 `display: contents` 的链回去（见 `startMorph`）。自定义属性与那十几个继承属性另
 * 有抄法，理由见 `snapshotComposer`。
 *
 * @module dsh-chat-ux/client/chat/send-flight/send-morph
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
 * 位移与形变共用的角频率。**一整段里只有一个进度 `m`**：横向位置、外框宽度、内容区、行高全都由它
 * 推出来。读者看到的是先横着离开输入卡片、再一路上升，两件事在时间上分开——这是 PR #4 之前那套
 * 标定出来的轨迹，与纵向那条（`RISE_OMEGA`）的比值是 2.98 / 2.11 / 1.61 / 1.32 / 1.15。
 *
 * **位移和形变必须同源**——同一条曲线、同一条时间轴。同源时右边缘是
 *
 *     right(u) = start.right + (end.right - start.right) × m(u)
 *
 * 无论哪一头冻住，它都只是这条曲线上的某个值，**恒在 `[start.right, end.right]` 里**。
 *
 * 这条等式今天由「两个 `transform` 关键帧 + 同一个 `FLIGHT_MS`」保证：形状（壳的 `scale`）与位移一起
 * 跑在合成器上，卡顿时一起停在同一格。**一旦给位移单独一条更快的曲线就出事**（曾经这么干过，回归成了
 * 读者报的「偶尔超出右侧聊天区」）：卡顿时位移跑在前面、形变还没收，右边缘甩出消息列。超出量
 *
 *     (W0 - W1) × (1 - m_冻结) − dx × (1 - across_当前)
 *
 * 卡在起手那几十毫秒时第一项接近满值。当时的抓帧实测：一整张还没收窄的卡片飞到了终点，右边缘顶到
 * 视口最右边（列右之外 59 px 以上）。**卡得越早、越久，甩得越远**——这正是「偶尔一点点、偶尔特别多」
 * 的来源。同一个理由还写在 `send-flight.ts` 的帧循环里：那里原来是「位移每帧由主线程写、跟着形状那条
 * 动画的 `currentTime` 走」；两条都上了合成器之后，依据换成了时间轴本身。
 *
 * 临界阻尼，不过冲：形状不该弹。
 *
 * **纵向压在整段上，并且刻意欠阻尼**：走到头冲过去约 **2.84%**（`exp(-πζ/√(1-ζ²))`，只由阻尼比定、
 * 与 ω 无关），峰值落在 190 ms，之后一路落回目标——落定那一下的弹性就是它。
 *
 * 这几个数**不开放给读者调**（逐帧对照见 `文档/业务/发送动效.md`）。
 */
const ACROSS_OMEGA = 16

/**
 * 纵向弹簧的阻尼比，临界是 1。**落定那一下弹多少，全看这一个数**：过冲量是
 * `exp(-πζ/√(1-ζ²))`，所以越大越收敛，取 1 就完全不弹。
 */
const RISE_DAMPING = 0.75

/** 纵向弹簧的角频率，与整段时长同一把尺子：越大收得越早、回冲越靠前。 */
const RISE_OMEGA = 7.5

/**
 * 形变收尾的位置（占整段的比例）。**它同时是「形变比横向快多少」的那个倍数**（见 `ACROSS_OMEGA`）：
 * 形变走的还是同一个弹簧，只是时间轴压到这一段的长度上。
 *
 * 它曾经压在 0.45 是因为形变每帧由主线程写、必须早收；后来形变搬上合成器，一度放宽到 0.7。现在压回
 * 0.45，理由换了一条：形变越早收完，宽度就越早收到位，右边缘也就越早退进列内（算式见 `ACROSS_OMEGA`）。
 * 配上那一条曲线，二十毫秒走掉一半、五十毫秒走掉七成九、百毫秒九成九，一百三十五毫秒就定形，剩下那
 * 一段只有上升与落定。
 */
const MORPH_END = 0.45

/**
 * 内容反向缩放的除数下限（**像素**）。`visible` 被右边缘那道夹子夹到 0 时，倒数会算出 `Infinity`——
 * 那几帧壳本来就什么都看不见（缩放是 0），给个半像素的下限只为让关键帧里是一个有限数。
 */
const MIN_REVERSE_DIVISOR = 0.5

/**
 * 圆角补偿里的缩放下限（**比值**）。和上面那个不是一回事，别拿来顶替：壳收到最窄时纵轴缩放约 0.45，
 * 拿 0.5 当比例下限会把补偿算少，圆角在竖直方向被压扁——实测视觉半径从 20 掉到 17.96px，归一那一帧
 * 再跳回 20（`morph-probe` 逐帧读数）。这里只需要挡住 0，取一个远小于任何真实缩放的数。
 */
const MIN_CORNER_SCALE = 0.02

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
    /**
     * 卡片到 `body` 之间的祖先（从外到内，**不含 body**）：替身要照着套一条 `display: contents`
     * 的链，后代选择器才匹配得上。太深时为 null——整条不模拟（理由见 `MAX_ANCESTOR_LINKS`）。
     */
    readonly ancestors: readonly AncestorMark[] | null
}

/** 一块要收走的装饰。 */
interface ChromePiece {
    readonly element: HTMLElement
    /** 在卡片里的矩形：左、上、宽、高。 */
    readonly rect: readonly [number, number, number, number]
}

/**
 * 一个祖先的标记：标签名与 class。**不含 id，也不含 `data-*`**。
 *
 * 标签名要带上：选择器可以写成 `section > .card` 这样认标签的，链上一律用 `div` 搭的话这类规则
 * 就匹配不上。带的是真标签，而 `display: contents` 让它不生成盒子，所以标签自带的默认样式
 * （`section` 的 margin 之类）一个都落不到布局上。
 *
 * **`data-*` 一个都不抄，这一条是量出来的。** 链的用途只有「让后代选择器的祖先条件命中」，而
 * `data-*` 同时是**别人手里的状态把手**：页面代码用 `document.querySelector('[data-phase="hero"]')`
 * 这类**全局**查询读它判阶段。链上抄的是**快照那一刻**的值，而卡片的阶段会在提交后的几十毫秒内
 * 翻转（hero → settling → active）——那个过期的假节点留在文档里，别人的状态机就一直读到 hero。
 *
 * 实测（同页装着 Claude 皮肤、新会话提交一条，原始数据 `.probe/compat/hero-phase.json`）：链上带
 * `data-phase="hero"` 时，真输入卡片被抬到 `y=526`、**停住替身在场的整整 300 ms**（`FLIGHT_MS`），
 * 替身一消失就落回 `y=824`；只把链上那两个阶段属性摘掉，**同一帧**卡片就落回去并保持；往会话态的
 * 页面里注入一个空的 `<div data-phase="hero">` 也能搬动真卡片——与替身无关，纯粹是「文档里多了一个
 * 过期状态节点」。
 *
 * 只抄 class 的代价：少数**只认祖先 data 属性**的规则在替身上失配（例如 dsh 的
 * `.root[data-phase='hero'] .scrollBody`、皮肤里 `:is([data-phase="active"], …) [data-composer-seat]`），
 * 影响仅限替身自己那 300 ms 的细节外观，hero 态输入面的高度另有 `composerHero` class 兜着；
 * 而反过来的代价是整页的输入卡片被抬起来一下，比这大得多。
 */
interface AncestorMark {
    readonly tag: string
    readonly className: string
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
    /** 最外层：终点动了多少写在它身上（主线程）。 */
    readonly wrapper: HTMLElement
    /**
     * 形变段走完之后把壳归一（幂等，每帧调一次即可，见 `startMorph` 里的 `compact`）。
     * **由主线程在帧里调**：它是一次性的样式写，本来就不属于合成器那条路径。
     */
    readonly compact: (u: number) => void
    /** 位移那条动画此刻的进度（0 到 1）；位移与形状同轴，拿它判「整段走完了没有」。 */
    readonly progress: () => number
    /** 位移、形状、底色、光晕、工具栏与字层的动画，收尾时一起取消。 */
    readonly animations: readonly Animation[]
}

/**
 * 从卡片祖先那里继承下来、克隆必须带上的普通属性。自定义属性另外按差值挑。
 *
 * **`font-size` 与 `line-height` 必须在。** dsh 给输入区定的字号挂在**祖先**的选择器上（hero 态一条、
 * 会话态一条），克隆一离开那条链，这两项就直接掉回 body 的 16px：实测逐路径对齐 37 对元素，有
 * **26 对字号对不上**（卡片 15px → 替身 16px，输入面 14px/24px → 16px/26px）。这一条不需要任何人
 * 动样式，**每一段飞行都在发生**。
 *
 * 抄在外壳上不会夺走克隆里自己写死的字号：直接命中的规则赢过继承，所以只有那些**没写死**、本来
 * 靠祖先传下来的元素会被兜住——正是要兜的那批。
 */
const INHERITED_PROPERTIES = [
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-feature-settings',
    'font-variation-settings', 'font-kerning', 'line-height', 'letter-spacing', 'word-spacing', 'text-rendering',
    '-webkit-font-smoothing', 'direction',
] as const

/** 字层要从气泡身上抄的排字属性：少抄一条，折行或字形就会和真实气泡对不上。 */
const TEXT_PROPERTIES = [
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'font-feature-settings',
    'font-variation-settings', 'font-kerning', 'letter-spacing', 'word-spacing', 'text-rendering',
    '-webkit-font-smoothing', 'direction', 'text-align', 'text-transform', 'text-indent', 'tab-size',
    'white-space', 'word-break', 'overflow-wrap', 'line-break', 'hyphens',
] as const

/**
 * 克隆里要摘掉的标记：它们是 dsh（和本插件）拿来找输入框的，替身不能被找成输入框。
 *
 * **样式钩子不摘。** 属性选择器是精确匹配属性名的，`[data-composer-card]` 这样的规则除了留属性
 * 没有第二条路——留或不留，就是它命中或不命中。留下的代价量过：
 *
 *   `document.querySelector` 取**文档序第一个**，而替身永远挂在文档最后（见 `startMorph`），
 *   真卡片与真输入框都在它前面；dsh 自己那几处认卡片（`ModelSelect`、`MenuView`、
 *   `FeedbackDialog`、`AgentPresetSeat`）要么从真节点往上 `closest`，要么取文档序第一个，
 *   两条路都够不到替身。而替身只活 `FLIGHT_MS`，`wrapper` 上还写着 `inert`：里面的东西既拿不到
 *   焦点，也进不了无障碍树。收益是 dsh 与同页别的插件写在这几个属性上的规则在替身上照常生效。
 *
 * 所以下面留下的三个是**样式钩子**：`data-composer-card`、`data-composer-input`、
 * `data-input-scroll`（它们从清单里删掉了，不是被忽略）。而 `id` 必须摘——文档里多一个同 id 的
 * 节点，`getElementById`、`label[for]`、页内锚点全会认错人，这是兜不了底的坏；`contenteditable`
 * 与 `tabindex` / `autofocus` 是可编辑性与焦点序，不是外观；`data-lexical-editor` 与
 * `data-chat-ux-caret` 是两套运行时的把手（Lexical 的编辑器根、本插件插入符的让位标记），替身
 * 里没有对应的运行时，留着只会让找的人认错。
 */
const IDENTITY_ATTRIBUTES = [
    'id', 'contenteditable', 'data-lexical-editor', 'data-chat-ux-caret', 'tabindex', 'autofocus',
] as const

/**
 * 模拟祖先链最多几层。
 *
 * 超过就**整条不套**，不做截断：链是从卡片往上数的，被截掉的正是最外面那几层，而 `.hero .input`
 * 这类选择器认的恰好是外层——留着半条链，外层没了、内层照匹配，选择器会错配到链上别的元素上，
 * 比完全没有链更坏。
 *
 * **这个数实测过，别照着直觉往回改。** dsh 的输入卡片到 body 是 **15 层**（hero 空态与提交后的
 * 会话语态一致，两次独立会话一致），其中七层是没有语义的空 `div` 与 `[data-slot]` 座位——当初估
 * 「七八层」正是漏掉了这些。取 **24**：留一倍余量给 dsh 以后加容器，同时仍然挡得住病态深度——
 * 到了那个量级，多半是某个插件把整棵树包进了自己的布局容器里，那种情况下把链照搬过去反而会把
 * 它的容器样式一起带进来。
 */
const MAX_ANCESTOR_LINKS = 24

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
            Array.from(element.children).forEach((child, index) => {
                collect(child, [...path, index])
            })
            return
        }
        const groups = Array.from(element.children).filter((child) => {
            const [, , w, h] = rectOf(child)
            return w * h > 0
        })
        if (width >= box.width * 0.9 && groups.length >= 2) {
            Array.from(element.children).forEach((child, index) => {
                const rect = rectOf(child)
                if (rect[2] * rect[3] > 0) paths.push({path: [...path, index], rect})
            })
            return
        }
        paths.push({path, rect: rectOf(element)})
    }
    Array.from(card.children).forEach((child, index) => {
        if (child !== scroll) collect(child, [index])
    })

    // 继承环境：自定义属性只挑和挂载点上不一样的（替身就挂在它下面，一样的本来就继承得到）。
    //
    // 基准取**挂载点**，三种情形都对着验算过：
    //   变量只定义在中间祖先上（挂载点上没有）→ 那边读出来是空串，两边不同，抄下来；不抄的话替身
    //     上这个变量根本不存在，`var(--x)` 会掉进它的 fallback，而真卡片上它是有的。
    //   挂载点与卡片取值相同 → 不抄，替身从挂载点继承到的就是同一个值。
    //   中间祖先覆盖了挂载点的值、卡片沿用 → 两边不同，抄的是祖先那一份，也就是卡片此刻算出来的
    //     那一份（覆盖值），替身拿到的与真卡片一致。
    // 唯一的边界是「变量只在挂载点上定义」：替身本来就继承得到，不抄也对。
    const hostStyle = getComputedStyle(ghostHost())
    const context: [string, string][] = []
    for (let index = 0; index < cardStyle.length; index += 1) {
        const name = cardStyle[index]
        if (name === undefined || !name.startsWith('--')) continue
        const value = cardStyle.getPropertyValue(name)
        if (value !== hostStyle.getPropertyValue(name)) context.push([name, value])
    }
    for (const name of INHERITED_PROPERTIES) context.push([name, cardStyle.getPropertyValue(name)])

    // 祖先链：克隆离开父链之后，`.hero .input` 这类后代选择器在它身上全都不匹配，而 dsh 的 hero 态
    // 最小高度正是这么写的。所以把链记下来，起飞时照着套回去（见 `startMorph`）。只记标签与 class：
    // 替身要的是**选择器命中**，而 `data-*` 是别人手里的状态把手、抄进链里会被读成过期状态（见
    // `AncestorMark` 那段），`id` 更是复制过去只会让人认错。
    // 这一段跑在读者按下回车的那一帧上，所以只读属性：读属性不碰布局，不会把布局结算拖进这一帧。
    const ancestors: AncestorMark[] = []
    let interrupted = false
    for (let node = card.parentElement; node !== null && node !== document.body; node = node.parentElement) {
        // 替身自己的部件不该进链。真卡片的祖先里本来不会有它，这是防御——防的是上一段还没落定就又
        // 抓了一次起点。链在这里断掉就**整条不要**：少一层的话，外层选择器会错配到内层上去。
        if (node.hasAttribute(GHOST_ATTRIBUTE)) {
            interrupted = true
            break
        }
        ancestors.push({
            tag: node.tagName.toLowerCase(),
            className: node.getAttribute('class') ?? '',
        })
    }
    ancestors.reverse()

    const clone = card.cloneNode(true) as HTMLElement
    scrub(clone)
    // 这几条**必须带 `!important`**，不是保险起见随手加的。克隆带着卡片自己的 class 与 `data-*`
    // ——替身要的就是让宿主与同页插件的规则命中它（`IDENTITY_ATTRIBUTES` 那段讲了为什么留钩子）。
    // 而那些规则里就有 `!important` 的：实测同页的颜色插件用 `!important` 压过 `[data-composer-card]`。
    // 普通行内样式**压不住 `!important`**，于是一条 `position: fixed` 配居中的规则就能让克隆当场飞
    // 到屏幕正中、再随动画掉回来——读者看到的是「聊天框被抬到中间又闪下去」。行内 + `!important` 是
    // 样式层级的顶格（只输给动画），把定位与尺寸钉在起飞那一刻量到的值上。
    pin(clone, [
        ['position', 'absolute'],
        ['left', '0px'],
        ['top', '0px'],
        ['right', 'auto'],
        ['bottom', 'auto'],
        ['margin', '0px'],
        ['width', box.width + 'px'],
        ['max-width', 'none'],
        ['height', box.height + 'px'],
        ['box-sizing', 'border-box'],
        ['transform', 'none'],
        ['float', 'none'],
        ['background', 'transparent'],
        ['box-shadow', 'none'],
    ])
    const draft = clone.children[Array.from(card.children).indexOf(scroll)] as HTMLElement
    // 草稿区的高度钉死：hero 态的最小高度挂在 `.hero .input` 上，克隆离开 `.hero` 就会塌，
    // 工具栏会跟着往上跑。
    const scrollBox = scroll.getBoundingClientRect()
    draft.style.height = scrollBox.height + 'px'
    draft.style.minHeight = '0px'
    draft.style.maxHeight = 'none'
    const chrome: ChromePiece[] = []
    for (const {path, rect} of paths) {
        let element: Element | undefined = clone
        for (const index of path) element = element?.children[index]
        if (element instanceof HTMLElement) chrome.push({element, rect})
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
        // 太深、或者中途断开，都整条作废（见 `MAX_ANCESTOR_LINKS`）：null 是「不模拟」，不是「这条链是空的」。
        ancestors: interrupted || ancestors.length > MAX_ANCESTOR_LINKS ? null : ancestors,
    }
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

    const dx = end.left - start.left
    const dy = end.top - start.top
    // 右边缘的硬上限：终点那条气泡的右边。曲线本身已经保证走不到它外头（见 `ACROSS_OMEGA`），这一道
    // 夹子是留给「主线程卡住时形变落后于位移」这类意外的——真夹到了，也只是起点那几帧少画一条边。
    const reach = end.right - start.left

    // 整段时间线：每个采样点上的形变进度与横向进度，以及由它们推出来的外框、内边距、行高、可排字的宽度。
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
            // 位移把外框推到上限之外时，多出来的那一段不画。位移与形变走同一个 `m`（见 `travel`），
            // 所以曲线本身已经把右边缘钉在 `[start.right, end.right]` 里，这一项只是保险。
            visible: Math.max(0, Math.min(width, reach - dx * m)),
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
    shell.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0;will-change:transform'
    shell.style.width = boxWidth + 'px'
    shell.style.height = boxHeight + 'px'
    for (const [name, value] of snapshot.context) shell.style.setProperty(name, value)
    // 壳只做两件事：**缩放**（形状）与**裁**（`overflow: hidden`）。下面这层 `scaler` 与它逐格互为倒数
    // ——壳缩小多少、内容就放大多少，内容的视觉尺寸与位置一个像素都不变，变的只有裁剪框。两层加位移
    // 全是纯 `transform`，走同一条时间轴、同一块合成器：主线程被 dsh 占住时它们一起停在同一格上。
    const scaler = document.createElement('div')
    scaler.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform'
    scaler.style.width = boxWidth + 'px'
    scaler.style.height = boxHeight + 'px'
    // 起手显式写一次圆角：动画还 pending 的那一两帧按 offset 0 画，慢机器上不写会先露一次方盒子。
    // 半径补偿见下面那段动画。
    shell.style.borderRadius = cornerRadius(R0, W0 / boxWidth, H0 / boxHeight)
    shell.appendChild(scaler)
    // 底色是两层实色叠着淡，不是 `background-color` 动画：它和几何属性写在同一段关键帧里时，整段都会
    // 掉回主线程（实测主线程一占住，形状与颜色一起定格，只有透明度还在走）；而透明度是合成器最老的那
    // 条路，旧一点的 Chromium 上也稳。两层不透明的实色按 α 叠，正好就是两色的线性插值。
    const bubbleFill = document.createElement('div')
    bubbleFill.style.cssText = 'position:absolute;inset:0'
    bubbleFill.style.backgroundColor = style.backgroundColor
    const cardFill = document.createElement('div')
    cardFill.style.cssText = 'position:absolute;inset:0;will-change:opacity'
    cardFill.style.backgroundColor = snapshot.background
    scaler.append(bubbleFill, cardFill)
    // 克隆脱离了卡片的父链，后代选择器在它身上全都不匹配，所以照着卡片的祖先套一条链回来。每一层
    // `display: contents`：不生成盒子，因而既不参与布局、也不当包含块（克隆仍然相对壳定位），但
    // **照样参与选择器匹配**——要的就是这个。链套在壳里、克隆外面：这些选择器认的是克隆里的元素，
    // 链只要在克隆之上就够；套到 mover 外面会连光晕与壳一起罩进去，而它们两块是替身自己的装饰，
    // 不是卡片的后代。缺链时（`ancestors` 为 null）克隆直接挂在壳上，与加固之前一样。
    // `display: contents` 写在**行内**：祖先那一层的 class 规则里就算有 `display`，优先级也压不过
    // 行内（dsh 的样式里没有 `!important`），链不会因为带上某个 class 就长出盒子来。
    let cloneHost: HTMLElement = scaler
    for (const mark of snapshot.ancestors ?? []) {
        const link = document.createElement(mark.tag)
        // 这里的 `!important` 同样必要，理由和克隆那几条一样：链节点带着祖先的 class，而祖先那层的规则
        // 里可能就有 `display`（实测同页插件在用 `!important`）。一旦它长出盒子，问题不只是多一层——
        // 它可能成为克隆的**包含块**，克隆那几条 `left: 0; top: 0` 就会相对它算，位置整体偏掉。
        link.style.setProperty('display', 'contents', 'important')
        link.setAttribute('aria-hidden', 'true')
        // 只带 class：链上**一个 `data-*` 都不写**，理由与实测见 `AncestorMark`。
        if (mark.className !== '') link.className = mark.className
        cloneHost.appendChild(link)
        cloneHost = link
    }
    cloneHost.appendChild(snapshot.clone)

    // 字：先在沿途每个宽度上排一遍，再按「折行一样、行高一档」归段。第一段是克隆卡片里那份草稿
    // 自己，其余每段一层。
    const bottomPadding = pixel(style.paddingBottom) + pixel(style.borderBottomWidth)
    const [draftWindow, ...bubbleWindows] = textWindows(bubble, style, samples, to.lineHeight, bottomPadding)
    const layers = bubbleWindows.map((window) => {
        const layer = textLayer(bubble, style)
        layer.style.width = window.width + 'px'
        layer.style.lineHeight = window.lineHeight + 'px'
        scaler.appendChild(layer)
        return {layer, window}
    })

    mover.appendChild(halo)
    mover.appendChild(shell)
    wrapper.appendChild(mover)
    // 替身永远落在文档最后：`document.querySelector` 取文档序第一个，排在后面，认卡片、认输入框的
    // 人才始终拿到真的那两个（留下的样式钩子见 `IDENTITY_ATTRIBUTES`）。
    ghostHost().appendChild(wrapper)
    // 克隆要进了文档才能滚到原来的位置。
    if (snapshot.draftScrollTop > 0) snapshot.draft.scrollTop = snapshot.draftScrollTop

    const timing: KeyframeAnimationOptions = {duration: FLIGHT_MS, easing: 'linear', fill: 'forwards'}
    const animations: Animation[] = []
    const run = (element: HTMLElement, frames: Keyframe[]): Animation => {
        const animation = element.animate(frames, timing)
        animations.push(animation)
        return animation
    }
    // 只在 [windowFrom, windowUntil] 里逐格采样，两头各补一帧定住。形变收尾之后那些属性不再变，一层字只在它亮着的
    // 那一段里才看得见——窗口外的关键帧只是让起飞那一帧多解析几百条（实测建动画占了建替身的一半）。
    const between = (windowFrom: number, windowUntil: number, frame: (sample: Sample) => Keyframe, stride = 1): Keyframe[] => {
        const inside = samples.filter(sample => sample.u >= windowFrom && sample.u <= windowUntil)
        const frames: Keyframe[] = []
        inside.forEach((sample, index) => {
            // `stride` 只给不参与几何抵消的那几段用（圆角、底色、光晕、工具栏）：它们的曲线平缓，隔一格取一格
            // 看不出来，省下的关键帧换的是实打实的建动画时间。**形状与内容那两段必须同格**，一错格两层就
            // 不再互为倒数，中段会看见偏移。
            if (index % stride !== 0) return
            frames.push({...frame(sample), offset: sample.u})
        })
        // 末尾那一格永远补上：它是定形的值，缺了它会停在上一格上。
        const final = inside.at(-1)
        if (final !== undefined && (frames.at(-1)?.offset ?? -1) !== final.u) {
            frames.push({...frame(final), offset: final.u})
        }
        const first = frames[0]
        const last = frames.at(-1)
        if (first !== undefined && (first.offset ?? 0) > 0) frames.unshift({...first, offset: 0})
        if (last !== undefined && (last.offset ?? 1) < 1) frames.push({...last, offset: 1})
        return frames
    }

    // 位移交给**合成器**：一整段 `transform` 关键帧。它与形状走同一条时间轴（同一个 `FLIGHT_MS`、同一批
    // `offset`），所以「一起走、一起停」是时间轴的保证，不是时序上的巧合。左边从卡片的左边走到气泡的
    // 左边，右边由宽度决定，两条边都单调。
    const travel = run(mover, samples.map(sample => ({
        offset: sample.u,
        transform: 'translate(' + dx * sample.m + 'px, '
            + dy * springProgress(sample.u, RISE_DAMPING, RISE_OMEGA) + 'px)',
    })))
    // 形状：壳缩到这一刻真正画得出来的那一段。原来这里是 `clip-path: inset(...)`，它**上不了合成器**
    // ——读者在慢机器上抓到过「位移在合成器上继续走、裁剪冻在主线程」，一整张卡片被平移出消息列。
    // `sample.visible` 是右边缘那道夹子，`sample.m` 与位移逐格同源，右边缘的等式因此成立。
    const shape = run(shell, between(0, MORPH_END, sample => ({
        transform: 'scale(' + sample.visible / boxWidth + ', ' + sample.height / boxHeight + ')',
    })))
    // 内容的反向缩放：与壳逐格互为倒数，视觉上正好抵消。下限 `MIN_REVERSE_DIVISOR` 挡住 `visible` 被
    // 夹到 0 时的除零——那几帧壳本来就什么都看不见。
    const inverse = run(scaler, between(0, MORPH_END, sample => ({
        transform: 'scale(' + boxWidth / Math.max(sample.visible, MIN_REVERSE_DIVISOR) + ', '
            + boxHeight / Math.max(sample.height, MIN_REVERSE_DIVISOR) + ')',
    })))
    // 圆角**必须长在壳上**，不能挂到里面那层：可见区的右边缘是壳裁出来的，挂在内层就只有左边圆、
    // 右边缘是直角（读者一眼就看出来了）。它不可合成，所以单独一段动画、留在主线程——和几何那段分开，
    // 壳的 `transform` 照样在合成器上。卡住时半径停在旧值，圆还是圆的。
    // 壳是**非均匀**缩放的（宽收得比高快），半径不补的话会被压成椭圆，所以逐格按缩放除回去。
    const corners = run(shell, between(0, MORPH_END, sample => ({
        borderRadius: cornerRadius(sample.radius, sample.visible / boxWidth, sample.height / boxHeight),
    }), 2))

    /**
     * 这一刻的进度（0 到 1），取自**位移那条动画**自己的 `currentTime`。
     *
     * 位移与形状现在由同一条时间轴驱动，本来就不会互相领先；读动画自己的时间而不是墙上时钟，为的是起手
     * 那一两帧：WAAPI 动画那时还是 pending（`startTime` 没定），按 offset 0 画——也就是**整张输入卡片**，
     * 而墙上时钟已经走了十几毫秒。实测抓到的屏幕帧：替身左边缘还是 317（卡片左边），右边缘已经从 1030
     * 拉到视口最右 1073。读动画自己的时间，两边就永远落在同一格上：动画 pending 时它读 0，替身也停在
     * 起手那一格。
     * @returns 进度；动画读不出时间时为 0（停在起手不动，比飞出去强）。
     */
    const progress = (): number => {
        const raw = travel.currentTime
        if (typeof raw !== 'number') return 0
        const u = raw / FLIGHT_MS
        if (!(u > 0)) return 0
        return u > 1 ? 1 : u
    }

    /** 壳归一了没有（见 `compact`）。 */
    let normalized = false
    /**
     * 形变段走完之后把壳**归一**：布局尺寸换成那一刻的可视尺寸，两级缩放一起归 1。
     *
     * 不归一的话，内容会长期留在「放大再缩回」的路径上（结尾处反向放大到 5.9 倍），光栅化按放大后的
     * 尺寸做，字就越发虚。归一那一帧里「宽度从 `boxWidth` 改成 `visible`」与「缩放从 `visible / boxWidth`
     * 归到 1」是等价的（`boxWidth × visible / boxWidth = visible`），所以视觉不跳。
     *
     * **必须把两条动画 `cancel` 掉**：它们 `fill: forwards`，会一直按最后一帧写着 `transform`，行内那两条
     * 归 1 压不过动画。取消之后属性回落到行内，正好是归一后的样子。
     *
     * 取的是形变段末尾那一格，不是最后一个采样点：形变收尾之后宽度不再变，但字撑高的那几格可能把外框
     * 改高，拿整段末尾去比就会在归一时跳一下。
     * @param u - 这一刻的进度；还没走完形变段就什么都不做。
     */
    const compact = (u: number): void => {
        if (normalized || u < MORPH_END) return
        const final = samples.find(sample => sample.u >= MORPH_END) ?? samples.at(-1)
        if (final === undefined) return
        normalized = true
        shape.cancel()
        inverse.cancel()
        corners.cancel()
        shell.style.width = final.visible + 'px'
        shell.style.height = final.height + 'px'
        shell.style.transform = 'none'
        shell.style.borderRadius = final.radius + 'px'
        scaler.style.transform = 'none'
    }
    run(cardFill, between(0, MORPH_END, sample => ({opacity: String(1 - sample.m)}), 2))
    // 光晕挂在壳**外面**，壳的 `overflow: hidden` 裁不到它——它的阴影会画到可见右边缘之外（实测每一帧
    // 都越过列右 24 px）。缩放按「外框 + 阴影扩散」算，阴影的外沿正好落在可见右边缘上。
    const shadow = shadowSpread(snapshot.shadow)
    run(halo, between(0, MORPH_END, sample => ({
        transform: 'scale(' + sample.visible / (W0 + shadow) + ', ' + sample.height / (H0 + shadow) + ')',
        opacity: String(Math.max(0, 1 - sample.m / HALO_GONE_AT)),
    }), 2))
    for (const piece of snapshot.chrome) {
        const [x, y, width, height] = piece.rect
        // 贴着最近的那个角走：右半边的跟着右边，下半边的跟着底边，缩放也以那个角为原点。
        const anchorRight = x + width / 2 > W0 / 2
        const anchorBottom = y + height / 2 > H0 / 2
        piece.element.style.transformOrigin = (anchorRight ? '100%' : '0%') + ' ' + (anchorBottom ? '100%' : '0%')
        run(piece.element, between(0, MORPH_END, (sample) => {
            const gone = Math.min(1, sample.m / CHROME_GONE_AT)
            const shiftX = anchorRight ? sample.visible - W0 : 0
            const shiftY = anchorBottom ? sample.height - H0 : 0
            return {
                transform: 'translate(' + shiftX + 'px, ' + shiftY + 'px) scale(' + (1 - (1 - CHROME_MIN_SCALE) * gone) + ')',
                opacity: String(1 - gone),
            }
        }, 2))
    }

    // 第一段字是输入框里那份草稿自己：它在克隆的卡片里原地待着，跟着内容区的起点平移。
    const draftUntil = draftWindow === undefined ? 1 : draftWindow.until
    run(snapshot.draft, between(0, draftUntil, sample => ({
        transform: 'translate(' + (sample.left - from.left) + 'px, '
            + (sample.top - from.top + (sample.lineHeight - from.lineHeight) / 2) + 'px)',
    })))
    run(snapshot.draft, stepOpacity(0, draftUntil))
    for (const {layer, window} of layers) {
        run(layer, between(window.from, window.until, sample => ({
            transform: 'translate(' + sample.left + 'px, ' + (sample.top + (sample.lineHeight - window.lineHeight) / 2) + 'px)',
        })))
        run(layer, stepOpacity(window.from, window.until))
    }
    return {wrapper, compact, progress, animations}
}

/** 替身最外层上的标记。它只是个排查用的把手，样式一条都不挂在它上面。 */
const GHOST_ATTRIBUTE = 'data-chat-ux-send-ghost'

/**
 * 替身挂在哪儿，以及**它从谁那里继承**。
 *
 * 一处两用是刻意的：`snapshotComposer` 拿它当自定义属性的差值基准（替身继承到的就是它的值），
 * `startMorph` 拿它当挂载点。两处各写一个 `document.body` 也跑得起来，可那样这件耦合就只活在
 * 注释里了——哪天换挂载点（挂进某个 portal 容器）而漏掉基准那一处，症状是「一部分变量悄悄抄错
 * 值」，从外观反推回挂载点几乎不可能。
 *
 * 挂载点还必须是文档的**最后一个**子节点，理由见 `startMorph` 里那句注释。
 */
function ghostHost(): HTMLElement {
    return document.body
}

/**
 * 把几条声明钉在行内、并带上 `!important`。
 *
 * 替身里有两样东西会被**别人的**规则命中：带着卡片 class 与 `data-*` 的克隆（要的就是命中），以及
 * 套在它外面的模拟祖先链。这些选择器上可能有 `!important` 的规则——实测同页的颜色插件就用它压过
 * `[data-composer-card]`。普通行内样式压不住 `!important`：一条居中的规则就足以让克隆飞到屏幕
 * 正中再掉回来。行内 + `!important` 是样式层级的顶格（只输给动画），把"错一下就看得出"的那几项
 * 钉在起飞时量到的值上。
 * @param element - 要钉的元素。
 * @param declarations - 属性名与值，按顺序写。
 */
function pin(element: HTMLElement, declarations: readonly (readonly [string, string])[]): void {
    for (const [name, value] of declarations) element.style.setProperty(name, value, 'important')
}

/** 时间线上的一个采样点。 */
interface Sample {
    /** 时间占比，0 到 1。 */
    readonly u: number
    /** 进度，0 到 1。位移、外框、内容区、行高全都由它推出来（见 `ACROSS_OMEGA`）。 */
    readonly m: number
    /** 壳的外框。高度可能被字撑高（见 `textWindows`），所以不是只读的。 */
    readonly width: number
    /** 这一刻真正画得出来的宽度：外框被位移推出右边缘上限时，从右边裁掉多出来的那一段。 */
    readonly visible: number
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
        const layout = {signature: parts.join(','), lines: tops.size}
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
        windows.push({key, from: sample.u, until: sample.u, width, lineHeight})
    })
    probeHost.remove()
    const lastWindow = windows.at(-1)
    if (lastWindow !== undefined) lastWindow.until = 1
    // 第一段由草稿克隆负责，但最晚在 DRAFT_HANDOFF_AT 交出去：那之后同样的折行改用气泡的写法。
    const handoff = samples.find(sample => sample.m >= DRAFT_HANDOFF_AT)?.u ?? 1
    const first = windows[0]
    if (first !== undefined && first.until > handoff) {
        windows.splice(1, 0, {key: first.key, from: handoff, until: first.until, width: first.width, lineHeight: first.lineHeight})
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
    if (from > 0) frames.push({offset: 0, opacity: '0'}, {offset: from, opacity: '0'})
    frames.push({offset: from, opacity: '1'}, {offset: until, opacity: '1'})
    if (until < 1) frames.push({offset: until, opacity: '0'}, {offset: 1, opacity: '0'})
    return frames
}

/**
 * 把一棵克隆里的身份标记全部摘掉：替身不能被 dsh 或本插件找成输入框、也不能拿到焦点。
 * 摘哪些、为什么样式钩子不摘，见 `IDENTITY_ATTRIBUTES`。
 */
function scrub(root: Element): void {
    const all = [root, ...root.querySelectorAll('*')]
    for (const element of all) {
        for (const name of IDENTITY_ATTRIBUTES) element.removeAttribute(name)
    }
    for (const layer of root.querySelectorAll('[data-chat-ux-caret-layer]')) layer.remove()
}

/**
 * 形变进度：一条临界阻尼的弹簧，压进前 `MORPH_END` 段。弹簧在窗口末端还差一点点没到，整条按末端的
 * 值归一，终点严丝合缝、中间也不跳。
 */
function morphProgress(u: number): number {
    if (u >= MORPH_END) return 1
    return springProgress(u / MORPH_END, 1, ACROSS_OMEGA) / springProgress(1, 1, ACROSS_OMEGA)
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

/**
 * 一个圆角半径在非均匀缩放的壳上该怎么写。
 *
 * 壳的宽按 `sx` 收、高按 `sy` 收（详情见 `MORPH_END`：宽收得比高快），圆角会跟着被压成椭圆。CSS 的
 * `border-radius` 支持两个轴各写一个半径（`水平 / 垂直`），所以把缩放除回去，视觉上就还是正圆。
 * @param radius - 这一刻想要的视觉半径。
 * @param sx - 壳在横轴上的缩放。
 * @param sy - 壳在纵轴上的缩放。
 * @returns 给 `borderRadius` 用的值。
 */
function cornerRadius(radius: number, sx: number, sy: number): string {
    return (radius / Math.max(sx, MIN_CORNER_SCALE)) + 'px / ' + (radius / Math.max(sy, MIN_CORNER_SCALE)) + 'px'
}

/**
 * 一条 box-shadow 向外扩多少：取各层里最大的 `模糊半径 + 扩散半径`。颜色函数里的数字先剔掉。
 *
 * 光晕那一层要用它把阴影的外沿收回可见右边缘以内（见 `startMorph` 里 halo 的缩放）。
 * @param shadow - 计算样式里的 `box-shadow`。
 * @returns 像素数；读不出来当 0——阴影小一点，总比画到列外强。
 */
function shadowSpread(shadow: string): number {
    if (shadow === '' || shadow === 'none') return 0
    let spread = 0
    for (const part of shadow.split(/,(?![^()]*\))/)) {
        const clean = part.replace(/[a-z-]+\([^)]*\)/gi, ' ')
        const found = clean.match(/-?\d*\.?\d+px/g)
        if (found === null) continue
        const values = found.map(Number.parseFloat)
        spread = Math.max(spread, (values[2] ?? 0) + (values[3] ?? 0))
    }
    return spread
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
