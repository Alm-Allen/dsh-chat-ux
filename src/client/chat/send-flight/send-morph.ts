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
 * **替身凭什么长得像真卡片。** 五条路一起走：DOM 结构（class 一个不删，dsh 的样式是 CSS Modules，
 * 认 class 就有样式）、起飞前现读的计算样式（底色、圆角、阴影这些不进 class 的属性）、**卡片那一层
 * 的面**（卡片自身与它两个伪元素的背景照抄那一刻算出来的值，见 `ComposerSurface`：玻璃的底就画在
 * 卡片的 `::before` 上，而模拟链一个 `data-*` 都不抄，只认规则的话整块卡面都会丢）、**克隆子树里每个
 * 元素的面**（同样照抄那一刻的值，起飞时跟替身现算的比一次、只把失配的写进去，见 `ElementSurface`），
 * 以及**祖先链**——克隆一旦离开原来的父链，`.hero .input` 这类后代选择器就全不匹配了，所以起飞时照
 * 着卡片的祖先再套一条 `display: contents` 的链回去（见 `startMorph`）。自定义属性与那十几个继承属
 * 性另有抄法，理由见 `snapshotComposer`。
 *
 * @module dsh-chat-ux/client/chat/send-flight/send-morph
 */

/**
 * 起飞那一整段的时长（毫秒）。**不是一个设置项**——它曾经是卡片上的 `sendFlightMs`（80–1200 ms 可调），
 * 后来固定下来：这条动效只留一个开关，多一个旋钮不值得。
 *
 * **开发期要微调就是改这一个数**，改完 `npm run build`、刷新页面（Ctrl+F5）。
 * 注意 `文档/业务/发送动效.md` 里那张一帧对照表是按这个数算的，改了这个数那张表的时刻要跟着重算；
 * 兜底定时器按 `FLIGHT_MS + RESCUE_MARGIN_MS` 走，不用另改。
 */
export const FLIGHT_MS = 350

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
 * **这个数同时定着「开局那几帧各自走多远」，取 7 是照这个量出来的。** 时间轴压进 `MORPH_END` 之后，
 * 弹簧的角频率相对那一段长度就偏大：取 16 时第一帧（提交后 16.7 ms 那一格）已经走掉 58.8%、第二帧
 * 90.4%——读者看到的是一上来就闪到半路；而提交那一刻 dsh 的主线程本来就重，首帧没提交出来，第一眼
 * 就是九成。取 7 之后那一串（每帧 16.7 ms）是 21.7 / 30.2 / 21.8 / 12.9 / 7.0 / 3.6 / 1.8 / 0.9（%），
 * 首帧丢了是五成二；想再小就往 6、5 走，代价见下一段。
 *
 * **再往下取要付两笔代价。** 一是收尾：形变在 135 ms 一刀定死，取到 4 时最后一格横向还剩 2%/帧（约 12 px）
 * 才归零，看得见一次顿。二是轨迹：横向拖得越久，「先横着离开输入卡片、再一路上升」就越像一条对角线
 * （当年 `ω = 7`、`MORPH_END = 0.7`、纵向又没有延迟的那一版整段方向角都在 -50° 上下，读者直接说
 * 「曲线像直线了」——同样是 7，差别全在后面那两项上）。
 *
 * **纵向压在整段上，并且刻意欠阻尼**：走到头冲过去约 **2.84%**（`exp(-πζ/√(1-ζ²))`，只由阻尼比定、
 * 与 ω 无关），峰值落在 190 ms，之后一路落回目标——落定那一下的弹性就是它。
 *
 * 这几个数**不开放给读者调**（逐帧对照见 `文档/业务/发送动效.md`）。
 */
const ACROSS_OMEGA = 7

/**
 * 纵向弹簧的阻尼比，临界是 1。**落定那一下弹多少，全看这一个数**：过冲量是
 * `exp(-πζ/√(1-ζ²))`，所以越大越收敛，取 1 就完全不弹。
 */
const RISE_DAMPING = 0.8

/**
 * 过冲的像素下限。
 *
 * 过冲的绝对幅度是「纵向行程 × 过冲比例」（比例只由 `RISE_DAMPING` 定），而窄气泡、短会话里纵向行程
 * 可能只有几十像素——1.52% 摊下来不到一个像素，落地那一下就只剩「停住」，读者读成「傻快」「没有 Q 弹」。
 * 这里给过冲补一个下限：**主线仍然落在真实气泡上**（`dy` 一点不动），只把「冲过头」的那几像素补到
 * 看得见；行程本来够长时（`|dy| × 过冲比例 ≥ 这个数`）它一个像素都不加。
 *
 * 4 像素是照着宽气泡那档实测取的：那边过冲 3.4~5.4 px，取它做下限，两头「弹一下」才像同一档动效。
 */
const MIN_OVERSHOOT_PX = 4

/**
 * 纵向弹簧的角频率，与整段时长同一把尺子：越大收得越早、回冲越靠前。
 *
 * **导出是为了让落点让位那条弹簧与它同源**：让位借的就是这条曲线的形状（同一个函数、同一个角频率），
 * 阻尼比与时间窗自己一套——见 `send-reveal.ts` 的 `REVEAL_DAMPING`。
 */
export const RISE_OMEGA = 7.5

/**
 * 纵向起步的延迟（占整段的比例）：这一段里替身只横着走、一步都不上升。
 *
 * 横向那条放慢之后（见 `ACROSS_OMEGA`），前段的方向角本来会一直贴在 -40° ~ -64° 的斜线上，读者
 * 报的是「像一条直线飞过去」。把上升压到这之后，轨迹回到「先横着离开输入卡片、再一路升起来」：
 * 0.15 是四十五毫秒，那一段里横向走掉六成八（约 420 px），方向角恒为 0°（纯水平），之后才折向上。
 * 延迟段里弹簧还没起步，而弹簧起手的速度本来就是零，所以接缝处没有速度突变。
 *
 * **导出是为了让落点让位与它同一时刻起步**：让位那条弹簧把窗口内的比例先换算到这段延迟之后
 * （见 `send-reveal.ts` 的 `atRise`），两者才读得出「气泡升多少、内容就让多少」。
 */
export const RISE_DELAY = 0.15

/**
 * 形变收尾的位置（占整段的比例）。**它同时是「形变比横向快多少」的那个倍数**（见 `ACROSS_OMEGA`）：
 * 形变走的还是同一个弹簧，只是时间轴压到这一段的长度上。
 *
 * 它曾经压在 0.45 是因为形变每帧由主线程写、必须早收；后来形变搬上合成器，一度放宽到 0.7。现在压回
 * 0.45，理由换了一条：形变越早收完，宽度就越早收到位，右边缘也就越早退进列内（算式见 `ACROSS_OMEGA`）。
 * 配上那一条曲线，二十毫秒走掉一成八、五十毫秒走掉五成八、百毫秒九成二，一百三十五毫秒就定形，剩下那
 * 一段只有上升与落定。
 */
const MORPH_END = 0.45

/**
 * 一次飞行要用的那一套曲线参数。
 *
 * 默认值就是上面那几条常量。**开发期可以在浏览器里覆盖它**（见 `readTuning`）：改一次、发一条消息
 * 就能看到新的一套，不必重新构建、也不必刷新页面。它不进配置——卡片上没有这一行，schema 里也没有。
 */
interface FlightTuning {
    /** 位移与形变共用的角频率（见 `ACROSS_OMEGA`）。 */
    readonly acrossOmega: number
    /** 纵向起步的延迟，占整段的比例（见 `RISE_DELAY`）。 */
    readonly riseDelay: number
    /** 纵向弹簧的角频率。 */
    readonly riseOmega: number
    /** 纵向弹簧的阻尼比。 */
    readonly riseDamping: number
    /** 形变收尾的位置（见 `MORPH_END`）。 */
    readonly morphEnd: number
}

/** 上面那几条常量的合订本：`readTuning` 的兜底值，也是每段飞行默认用的那一套。 */
const DEFAULT_TUNING: FlightTuning = {
    acrossOmega: ACROSS_OMEGA,
    riseDelay: RISE_DELAY,
    riseOmega: RISE_OMEGA,
    riseDamping: RISE_DAMPING,
    morphEnd: MORPH_END,
}

/** 覆盖曲线参数用的 `localStorage` 键（见 `readTuning`）。 */
const TUNING_KEY = 'dsh-chat-ux:send-flight'

/** 这一段飞行正在用的参数；每段起飞前由 `readTuning()` 现读一次。 */
let tuning: FlightTuning = DEFAULT_TUNING

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

/**
 * 归一那一帧，画面上的圆角与终态差多少（水平 + 垂直，像素）才值得补一段过渡。
 *
 * 没卡过时两者本来就相等，剩下的是浮点噪声；卡过才差得出几像素到十几像素。
 */
const CORNER_SNAP_PX = 2

/** 卡顿留下的那个椭圆收回正圆用的时长。短到看不出「角在动」，长到不像一帧的跳。 */
const CORNER_RECOVER_MS = 110

/**
 * 相邻两次帧回调之间进度差多少才算「主线程卡过」。
 *
 * 摊到 300 ms 的整段上：60 fps 一帧是 0.056、**30 fps 一帧就到了 0.111**。阈值取 0.15（45 ms）——
 * 低于它只当是帧率低或抖动，不补过渡，否则那段收拢会在低帧率的机器上每一次飞行都播一遍。
 */
const CORNER_STALL_GAP = 0.15

/**
 * 起播后第一帧，动画的时间比墙钟快多少（毫秒）才值得把时间轴退回去（见 `Morph.alignStart`）。
 *
 * 一帧是十六点七毫秒，正常起跑两边最多差一帧的零头；取 24（一帧半）留出抖动，又不至于把真错位漏掉。
 */
const ALIGN_TOLERANCE_MS = 24

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

/** 一条要抄下来的声明：属性名与那一刻算出来的值。 */
type LookDeclaration = readonly [string, string]

/**
 * 卡片那一层的面：卡片自身的背景、它两个伪元素的背景，以及卡片背后最先画实的那层底色。
 *
 * **抄的是值，不是规则。** 玻璃把底与两片端色画在卡片的 `::before` 上，而那条选择器要祖先带
 * `data-phase`——替身的模拟链只抄 class（见 `AncestorMark`），规则在它身上失配，克隆于是少了整块
 * 卡面。照抄计算值把这一类失配整个绕开：不认属性名、不认设计令牌、也不认选择器挂在谁身上，
 * dsh 改属性、同页插件换写法，替身都跟得上。
 */
interface ComposerSurface {
    /** 卡片自身那一层。 */
    readonly card: readonly LookDeclaration[]
    /** 卡片 `::before` 那一层；没有这个伪元素时为 null。 */
    readonly before: readonly LookDeclaration[] | null
    /** 卡片 `::after` 那一层；没有这个伪元素时为 null。 */
    readonly after: readonly LookDeclaration[] | null
    /** 卡片背后最先画实的那层底色：垫在替身最底下，卡面半透明时才不会透出飞过的内容。 */
    readonly behind: string
}

/**
 * 克隆子树里一个元素的「面」：它自己那层，以及它两个伪元素那层。
 *
 * 与 `ComposerSurface` 同一个道理（照抄那一刻算出来的值，不是规则），只是覆盖到整棵子树：替身靠
 * class 与祖先链只能命中一部分规则，凡是选择器里认祖先 `data-*` 的（同页皮肤那几条、玻璃给按钮
 * 上色的那一条）在替身上全失配。起飞时拿这里的值与替身现算的值比一次，只把不一样的写进去。
 */
interface ElementSurface {
    /** 元素自己那层。 */
    readonly own: readonly LookDeclaration[]
    /** 这个元素的 `::before`；没有这个伪元素时为 null。 */
    readonly before: readonly LookDeclaration[] | null
    /** 这个元素的 `::after`；没有这个伪元素时为 null。 */
    readonly after: readonly LookDeclaration[] | null
}

/** 起飞之前在输入卡片上抓下来的一切。全部在 React 清空草稿之前拿到。 */
export interface ComposerSnapshot {
    /** 卡片的视口矩形：替身的起点。 */
    readonly box: DOMRect
    /** 卡片那一层的面（见 `ComposerSurface`）。 */
    readonly surface: ComposerSurface
    /**
     * 克隆子树里每个元素的面（见 `ElementSurface`），按 DOM 序与 `clone.querySelectorAll('*')`
     * 一一对应，**不含卡片自己那一层**（它归 `surface`，而且要画在气泡色底下）。子树太大时为
     * null——整块不抄，退回本来的样子。
     */
    readonly subtree: readonly ElementSurface[] | null
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
    /**
     * 起跑：把预热期间停在起手格的那批动画放开。
     *
     * **由 `send-flight` 在预热帧走完之后调一次**。替身是刚插进文档的新子树，第一次 raster 要跨一两个
     * 合成器帧，这段时间里合成器上的时间轴照走、屏幕上却一个像素都没有——读者第一眼看到的就是半路
     * （见 `send-flight.ts` 的 `WARMUP_FRAMES`）。停住等它画得出来再起跑，起手那一段就落在可见之后。
     */
    readonly play: () => void
    /**
     * 起播后的第一帧核对一次时间轴（幂等，每帧调也行）。
     *
     * 正常的 pending 只会让起跑**晚**一点；只有起跑时刻被错定在过去，动画的时间才会一下子超过「`play()`
     * 到现在」那段墙钟。那一格还没画出来（rAF 在绘制之前），把全部动画一起往后挪掉多出来的这一截，
     * 第一眼就还是起手格。
     */
    readonly alignStart: () => void
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
 * 卡片那一层的面要抄哪些属性。
 *
 * 只抄**画出来的东西**：颜色、图像，以及图像怎么铺。**不抄几何与布局**——替身的壳自己管几何
 * （逐格缩放、反向缩放、圆角补偿），把 `width` / `position` / `transform` 这一类抄进去会和它打架。
 */
const SURFACE_PROPERTIES = [
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
] as const

/**
 * 克隆子树里每个元素要抄哪些属性。
 *
 * 与 `SURFACE_PROPERTIES` 同一口径（只抄画出来的东西），只是铺得开一些：一个元素画在页面上的
 * 东西除了背景还有边框、阴影、圆角、字与那几样跟绘制有关的开关。**不抄几何与布局**——替身的壳
 * 自己管几何（逐格缩放、反向缩放、圆角补偿），把 `width` / `position` / `transform` 这一类抄进去
 * 会和它打架；也不抄 `transition` / `animation`，抄下来克隆会自己动起来，把整段时间轴搅乱。
 * **`opacity` 也不抄**：替身自己那几段淡出就是靠它，而差异抄法写下去的声明带着 `!important`、在层叠
 * 顺序里压得过动画——真卡片某个元素那一刻恰好是半透明的（例如禁用的按钮），那个元素就会在整段飞行
 * 里一直半透明，不肯淡出去。
 */
const PAINT_PROPERTIES = [
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'box-shadow', 'text-shadow', 'visibility', 'filter', 'mix-blend-mode', 'clip-path',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height',
    'text-align', 'text-transform', 'white-space', 'word-break', 'overflow-wrap',
] as const

/**
 * 伪元素那一层要抄哪些属性：**全量**，连 `content` 与定位几何一起。
 *
 * 与元素自己那层不同：替身身上那条伪元素规则多半整个不成立（玻璃那条要祖先带 `data-phase`），
 * 不给 `content` 它根本不会出现，不给定位与尺寸它会落在错的地方。这里抄的 `position` / `top` /
 * `width` 是**伪元素自己的**几何，不是替身壳管的那套几何，两者不打架。
 */
const PSEUDO_PROPERTIES = [
    'content', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'z-index',
    ...PAINT_PROPERTIES,
] as const

/** 替身里每个元素身上的坐号：那一小段 `<style>` 的选择器靠它定位到具体哪个元素。 */
const PAINT_ATTRIBUTE = 'data-chat-ux-send-paint'

/**
 * 插入符那一层。`scrub` 会把它整块从克隆里摘掉，所以逐元素抄面的名单里也不能有它（含它的后代）——
 * 少一个元素就整体错位，抄上去的会是一排别人的样式。
 */
const CARET_LAYER_SELECTOR = '[data-chat-ux-caret-layer]'

/**
 * 逐元素抄面的元素数上限。超过就整块不抄，退回「卡片那一层 + 三条路」。
 *
 * 这一步要读两遍子树的计算样式（真卡片一遍、替身一遍），而提交那一帧 dsh 的主线程本来就重
 * （见 `文档/开发/性能风险.md`）。所以它是「更好」，不是「必须」：宁可退回本来的样子，也不让
 * 起手那一停变长。
 *
 * **这个数是拍的，不是量出来的**：输入卡片子树常见在几十到一百多个元素之间，取 240 留一倍余量。
 * 第一次实测之后按读数回来改它。
 */
const MAX_PAINT_ELEMENTS = 240

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
    // 卡片那一层的面得在这一帧抄下来：既因为克隆要的就是那一刻的样子，也因为伪元素那条规则
    // （玻璃只在本插件开着、且祖先是 `active` / `hero` 相位时才命中）在替身上不一定还匹配。
    const surface: ComposerSurface = {
        card: readDeclarations(cardStyle, SURFACE_PROPERTIES),
        before: readPseudoLayer(card, '::before', SURFACE_PROPERTIES),
        after: readPseudoLayer(card, '::after', SURFACE_PROPERTIES),
        behind: behindColorOf(card),
    }
    // 克隆子树里每个元素的面：替身靠 class 与祖先链只能命中一部分规则，凡是选择器里认祖先 `data-*`
    // 的（同页皮肤那几条、玻璃给按钮上色的那一条）在替身上全失配。所以这一帧把真卡片子树里每个元素
    // 画出来的值抄下来，起飞时跟替身现算的值比一次、只把不一样的写进去（见 `startMorph` 里那段）。
    // 元素太多就整块不抄（见 `MAX_PAINT_ELEMENTS`）。
    // 名单要和克隆里的元素一一对应：`scrub` 会把插入符那一层整块摘掉，所以那一支（连同它的后代）
    // 在这一份里也不能有——少一个就整体错位，抄上去的会是一排别人的样式。
    const descendants = [...card.querySelectorAll<HTMLElement>('*')]
        .filter(element => element.closest(CARET_LAYER_SELECTOR) === null)
    const subtree: ElementSurface[] | null = descendants.length > MAX_PAINT_ELEMENTS ? null : descendants.map((element) => ({
        own: readDeclarations(getComputedStyle(element), PAINT_PROPERTIES),
        before: readPseudoLayer(element, '::before', PSEUDO_PROPERTIES),
        after: readPseudoLayer(element, '::after', PSEUDO_PROPERTIES),
    }))
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
        surface,
        subtree,
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
    // 这一段用哪一套参数：默认值，或者浏览器里那一份覆盖（见 `readTuning`）。现读一次，所以调完参数
    // 发下一条消息就是新的，不必刷新页面。
    tuning = readTuning()

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
            // 圆角要等字撑高的那几格落定之后再算（见 `textWindows` 调用之后那段），这里先占个位。
            radius: 0,
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
    // 底色不做 `background-color` 动画：它和几何属性写在同一段关键帧里时，整段都会掉回主线程（实测
    // 主线程一占住，形状与颜色一起定格，只有透明度还在走）；而透明度是合成器最老的那条路，旧一点的
    // Chromium 上也稳。所以起手那格与落定那格各画一层，中间靠上面那层的透明度淡过去——两层都是不
    // 透明的实色，按 α 叠正好就是两色的线性插值。
    //
    // 绘制序（DOM 序就是绘制序，都是 `absolute`）：卡片背后那层底色 → 卡片自身 → `::before` 那层 →
    // `::after` 那层 → 气泡色从透明淡到实。中间那三层都是**照抄卡片那一刻算出来的值**（见
    // `ComposerSurface`），所以画在卡片 `::before` 上的东西——玻璃的底与两片端色——跟着一起飞，
    // 不必认识它是什么。
    //
    // 为什么要垫那层背后底色：卡面可能是半透明的（玻璃的底只有七成），替身飞过消息列时若直接透过去，
    // 会看见下面滚过的字。垫一层卡片原来位置背后的底色，替身就与真卡片一样，只透到画布为止。
    const behindFill = document.createElement('div')
    behindFill.style.cssText = 'position:absolute;inset:0'
    behindFill.style.backgroundColor = snapshot.surface.behind
    const cardFill = document.createElement('div')
    cardFill.style.cssText = 'position:absolute;inset:0'
    paintSurface(cardFill, snapshot.surface.card)
    const beforeFill = document.createElement('div')
    beforeFill.style.cssText = 'position:absolute;inset:0'
    paintSurface(beforeFill, snapshot.surface.before)
    const afterFill = document.createElement('div')
    afterFill.style.cssText = 'position:absolute;inset:0'
    paintSurface(afterFill, snapshot.surface.after)
    const bubbleFill = document.createElement('div')
    bubbleFill.style.cssText = 'position:absolute;inset:0;will-change:opacity'
    bubbleFill.style.backgroundColor = style.backgroundColor
    scaler.append(behindFill, cardFill, beforeFill, afterFill, bubbleFill)
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
    // 半径 = **可见区短边的一半 × 圆度**，圆度从 `2R0/短边` 走到 `2R1/短边`；半径因此总是跟着区域
    // 一起收，两端精确还原真实值（起手与真卡片逐点一致，落定就是气泡自己的圆角）。
    //
    // **圆度用进度的平方根插值，不是线性。** 这是一次量出来的取舍：卡顿冻住的是 `border-radius` 的
    // 写入值，形状却在合成器上继续收——而**圆度在冻结期间保持不变**（写入值除以缩放，分子分母按两个
    // 方向各自的缩放比走，正好约掉）。所以冻结那一刻圆度越高，回来时看到的那个椭圆就越接近气泡自己
    // 的角。平方根让圆度在前段抬得快：30 ms 时 75%（线性只有 64%）。四种卡顿跨度逐一比过，平方根
    // 的「离 20×20 差多少」都比线性小一到两成——30 ms 冻到 90 ms 是 14.7 对 18.3，60 ms 冻到 90 ms
    // 给的是 13.4×20.4，垂直方向正好贴上气泡的圆弧。中段仍是圆角矩形（75% 圆度），不是胶囊。
    //
    // 反过来把半径**压死**成一个恒定值（曾经试过收到的终值 20 px）会让卡顿椭圆变小四成，但离终点的
    // 角更远，跳变更大：同一场景 7.5 变成 17.2。**「椭圆小」和「离终点近」不可兼得的，取后者。**
    //
    // **两端都夹在短边的一半以内**：圆度不超过 1，半径就不会撞上浏览器那条「半径之和超过边长就等比
    // 缩小所有角」的静默规则——那条规则一接管，这条曲线说什么都不算了，极窄的气泡上还会连水平方向
    // 一起缩。
    //
    // **必须在 `textWindows` 之后算**：多行时字会把外框撑高（那里写 `sample.height`），短边跟着变，
    // 早算一步就会在归一那一帧对不上。
    const shortStart = Math.min(W0, H0)
    const shortEnd = Math.min(W1, H1)
    const shareStart = shortStart > 0 ? Math.min(1, (2 * R0) / shortStart) : 0
    const shareEnd = shortEnd > 0 ? Math.min(1, (2 * R1) / shortEnd) : 0
    for (const sample of samples) {
        const shortSide = Math.min(sample.visible, sample.height)
        const share = shareStart + (shareEnd - shareStart) * Math.sqrt(sample.m)
        sample.radius = (shortSide / 2) * share
    }
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

    // 克隆里每个元素再跟真卡片那一刻的值比一次，只把不一样的写下来。
    //
    // **必须在替身进了文档之后读**：要比的是「替身此刻算出来的值」，它得先拿得到链上的规则与继承。
    // 早一步（克隆还游离着）读到的是一份断了继承的值，那时就只剩「把值全量钉一遍」这条路——而全量钉
    // 会把不该钉的也钉住（理由见 `PAINT_PROPERTIES` 里的 `opacity` 那一条）。
    //
    // 替身多半已经靠 class 与祖先链画对了，差的就是规则失配的那几笔——包括伪元素：替身身上那条伪元素
    // 规则多半整个不成立（见 `ElementSurface`），得把它连 `content` 与定位一起写进去。写成 `<style>`
    // 而不是行内，是因为伪元素没法行内设置——两者共用同一套选择器，靠打在元素上的坐号定位。
    const subtree = snapshot.subtree
    if (subtree !== null) {
        /** 那一刻抄下来的值里，有哪些与替身现在算出来的不一样。 */
        const differences = (from: readonly LookDeclaration[], now: CSSStyleDeclaration): string[] => {
            const declarations: string[] = []
            for (const [name, value] of from) {
                if (now.getPropertyValue(name) === value) continue
                declarations.push(name + ':' + value + ' !important')
            }
            return declarations
        }
        const rules: string[] = []
        const clones = [...snapshot.clone.querySelectorAll<HTMLElement>('*')]
        clones.forEach((element, index) => {
            const surface = subtree[index]
            if (surface === undefined) return
            const own = differences(surface.own, getComputedStyle(element))
            const before = surface.before === null ? [] : differences(surface.before, getComputedStyle(element, '::before'))
            const after = surface.after === null ? [] : differences(surface.after, getComputedStyle(element, '::after'))
            if (own.length + before.length + after.length === 0) return
            element.setAttribute(PAINT_ATTRIBUTE, String(index))
            const selector = '[' + PAINT_ATTRIBUTE + '="' + index + '"]'
            if (own.length > 0) rules.push(selector + '{' + own.join(';') + '}')
            if (before.length > 0) rules.push(selector + '::before{' + before.join(';') + '}')
            if (after.length > 0) rules.push(selector + '::after{' + after.join(';') + '}')
        })
        if (rules.length > 0) {
            const paintStyle = document.createElement('style')
            paintStyle.textContent = rules.join('')
            shell.appendChild(paintStyle)
        }
    }

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
    // 过冲的补充（见 `MIN_OVERSHOOT_PX`）：`overshootPeak` 是阻尼比决定的过冲比例，临界阻尼时为 0。
    const overshootPeak = tuning.riseDamping >= 1 ? 0
        : Math.exp(-Math.PI * tuning.riseDamping / Math.sqrt(1 - tuning.riseDamping * tuning.riseDamping))
    // `overshootFloor` 是**要补足的像素数**（不是归一化幅度）：行程够长时它是 0，一帧都不改。
    const overshootFloor = overshootPeak > 0
        ? Math.max(0, MIN_OVERSHOOT_PX - Math.abs(dy) * overshootPeak)
        : 0
    // 过冲只出现在峰值之后那一段（`rise` 大于 1）。补足量的形状沿用主线，但**到整段末尾收回到 0**：
    // 主线自己在 u=1 时还悬着零点三个百分点（落定时本来就有不到一像素的跳），补出来的那几像素不该
    // 把这一跳放大。
    const peakU = overshootPeak > 0
        ? tuning.riseDelay + (1 - tuning.riseDelay)
            * (Math.PI / (tuning.riseOmega * Math.sqrt(1 - tuning.riseDamping * tuning.riseDamping)))
        : 1
    /**
     * 这一刻的纵向位移：主线是 `dy × 进度`，过冲那一段再沿同方向补上 `overshootFloor` 像素。
     * @param u - 时间占比。
     * @returns 纵向位移（像素，负值向上）。
     */
    const vertical = (u: number): number => {
        const rise = riseProgress(u)
        if (overshootFloor <= 0 || rise <= 1) return dy * rise
        const tailSpan = 1 - peakU
        const tail = tailSpan > 0 ? Math.max(0, 1 - (u - peakU) / tailSpan) : 0
        return dy * rise + Math.sign(dy) * ((rise - 1) / overshootPeak) * tail * overshootFloor
    }
    const travel = run(mover, samples.map(sample => ({
        offset: sample.u,
        transform: 'translate(' + dx * sample.m + 'px, ' + vertical(sample.u) + 'px)',
    })))
    // 形状：壳缩到这一刻真正画得出来的那一段。原来这里是 `clip-path: inset(...)`，它**上不了合成器**
    // ——读者在慢机器上抓到过「位移在合成器上继续走、裁剪冻在主线程」，一整张卡片被平移出消息列。
    // `sample.visible` 是右边缘那道夹子，`sample.m` 与位移逐格同源，右边缘的等式因此成立。
    const shape = run(shell, between(0, tuning.morphEnd, sample => ({
        transform: 'scale(' + sample.visible / boxWidth + ', ' + sample.height / boxHeight + ')',
    })))
    // 内容的反向缩放：与壳逐格互为倒数，视觉上正好抵消。下限 `MIN_REVERSE_DIVISOR` 挡住 `visible` 被
    // 夹到 0 时的除零——那几帧壳本来就什么都看不见。
    const inverse = run(scaler, between(0, tuning.morphEnd, sample => ({
        transform: 'scale(' + boxWidth / Math.max(sample.visible, MIN_REVERSE_DIVISOR) + ', '
            + boxHeight / Math.max(sample.height, MIN_REVERSE_DIVISOR) + ')',
    })))
    // 圆角**必须长在壳上**，不能挂到里面那层：可见区的右边缘是壳裁出来的，挂在内层就只有左边圆、
    // 右边缘是直角（读者一眼就看出来了）。它不可合成，所以单独一段动画、留在主线程——和几何那段分开，
    // 壳的 `transform` 照样在合成器上。卡顿时半径停在旧值、形状却继续在合成器上收，两者的比例会散
    // （宽收到 404 px 时圆角冻在 23.5 px，等缩到 44 高，那 23.5 px 就是满圆）。这是留在主线程的固有
    // 代价，只能靠「半径本身跟着短边走」把错拍压到最小。
    // 壳是**非均匀**缩放的（宽收得比高快），半径不补的话会被压成椭圆，所以逐格按缩放除回去。
    //
    // **采样密度要与形状同格**：半径现在随短边逐格变，隔一格取一格会让这条折线与缩放那条错开，
    // 中段能看见角比轮廓早一格到位。
    const corners = run(shell, between(0, tuning.morphEnd, sample => ({
        borderRadius: cornerRadius(sample.radius, sample.visible / boxWidth, sample.height / boxHeight),
    })))

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
     * 上一次帧回调看到的进度。
     *
     * 主线程被占住时 `tick` 不跑，这个值就停在卡顿前那一格上——而圆角的写入值也正是冻在那一格。
     * `compact` 靠它与当前 `u` 的差认出「这一帧之前卡了多久」。
     */
    let lastTickU: number | null = null
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
     *
     * 圆角在这之前已经是**视觉半径**（按那一格的可见短边算出来的，见 `textWindows` 之后那段）；归一
     * 之后壳的布局尺寸就是可见尺寸，同一把尺子，直接写回去即可。
     * @param u - 这一刻的进度；还没走完形变段就什么都不做。
     */
    const compact = (u: number): void => {
        if (normalized) return
        const stalledAt = lastTickU
        lastTickU = u
        if (u < tuning.morphEnd) return
        const final = samples.find(sample => sample.u >= tuning.morphEnd) ?? samples.at(-1)
        const before = samples.find(sample => sample.u >= (stalledAt ?? 0)) ?? samples[0]
        if (final === undefined || before === undefined) return
        normalized = true
        // 卡顿跨过这一帧时，圆角停在**上一帧**那一格的补偿值上，而形状已经收到终点——直接换成
        // `final.radius` 就是一次硬跳（读者报的「快落地时突然变成正确圆角」）。要补的正是这一下。
        //
        // **不读样式**：`getComputedStyle` 会按动画的 `currentTime` 采样，读到的永远是「这一帧该有的
        // 值」，读不回冻结的那个。改成用进度差推算——卡顿时`tick` 不跑，`lastTickU` 就停在卡顿前那一格。
        const stalled = stalledAt !== null && u - stalledAt > CORNER_STALL_GAP
        // 冻结那一格的补偿值换算到终点的尺寸上，就是此刻画面上那个椭圆。
        const frozenHorizontal = before.radius * (final.visible / Math.max(before.visible, 1))
        const frozenVertical = before.radius * (final.height / Math.max(before.height, 1))
        shape.cancel()
        inverse.cancel()
        corners.cancel()
        shell.style.width = final.visible + 'px'
        shell.style.height = final.height + 'px'
        shell.style.transform = 'none'
        scaler.style.transform = 'none'
        shell.style.borderRadius = final.radius + 'px'
        if (!stalled) return
        const off = Math.abs(frozenHorizontal - final.radius) + Math.abs(frozenVertical - final.radius)
        if (off < CORNER_SNAP_PX) return
        // 归一之后壳的缩放是 1，`border-radius` 就是视觉半径：先摆回卡顿留下的那个椭圆，再用一小段收回
        // 正圆。一帧的跳变成一瞬的舒展，而且**只在真卡过的时候才播**。
        shell.animate([
            {borderRadius: frozenHorizontal + 'px / ' + frozenVertical + 'px'},
            {borderRadius: final.radius + 'px'},
        ], {duration: CORNER_RECOVER_MS, easing: 'ease-out'})
    }
    // 落定那格是气泡自己：不透明，把下面四层整个盖住。方向与从前相反（从前是卡面那层从 1 淡到 0），
    // 因为卡面现在是照抄来的、可能半透明，压在气泡色上会偏色。
    run(bubbleFill, between(0, tuning.morphEnd, sample => ({opacity: String(sample.m)}), 2))
    // 光晕挂在壳**外面**，壳的 `overflow: hidden` 裁不到它——它的阴影会画到可见右边缘之外（实测每一帧
    // 都越过列右 24 px）。缩放按「外框 + 阴影扩散」算，阴影的外沿正好落在可见右边缘上。
    const shadow = shadowSpread(snapshot.shadow)
    run(halo, between(0, tuning.morphEnd, sample => ({
        transform: 'scale(' + sample.visible / (W0 + shadow) + ', ' + sample.height / (H0 + shadow) + ')',
        opacity: String(Math.max(0, 1 - sample.m / HALO_GONE_AT)),
    }), 2))
    for (const piece of snapshot.chrome) {
        const [x, y, width, height] = piece.rect
        // 贴着最近的那个角走：右半边的跟着右边，下半边的跟着底边，缩放也以那个角为原点。
        const anchorRight = x + width / 2 > W0 / 2
        const anchorBottom = y + height / 2 > H0 / 2
        piece.element.style.transformOrigin = (anchorRight ? '100%' : '0%') + ' ' + (anchorBottom ? '100%' : '0%')
        run(piece.element, between(0, tuning.morphEnd, (sample) => {
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
    // 预热：全部动画先停在起手那一格（见 `Morph.play`）。替身刚插进文档，第一次 raster 要跨一两个
    // 合成器帧；这期间合成器上的时间轴照走、屏幕上却还没有它的像素，等 `send-flight` 的预热帧走完
    // 再起跑，第一眼才落在起手格上。
    for (const animation of animations) {
        animation.pause()
        animation.currentTime = 0
    }
    /** 起跑了没有（见 `Morph.play`）。 */
    let started = false
    /** 起跑那一刻的墙钟；没起跑时为 null。起首对齐拿它当尺子（见 `alignStart`）。 */
    let playedAt: number | null = null
    /** 首帧对齐做过没有（见 `Morph.alignStart`）。 */
    let aligned = false
    /** 见 `Morph.play`。 */
    const play = (): void => {
        if (started) return
        started = true
        playedAt = performance.now()
        // 起跑时刻显式钉在「现在」：等 pending 自己定的话，主线程被长任务拖住时这一格会晚出几十毫秒
        // （动画还没起跑，屏幕上却该动了）。
        const now = document.timeline.currentTime
        for (const animation of animations) {
            animation.play()
            if (typeof now === 'number') animation.startTime = now
        }
    }
    /** 见 `Morph.alignStart`。 */
    const alignStart = (): void => {
        if (aligned) return
        const raw = travel.currentTime
        if (typeof raw !== 'number' || raw <= 0) return
        aligned = true
        if (playedAt === null) return
        const ahead = raw - (performance.now() - playedAt)
        if (ahead <= ALIGN_TOLERANCE_MS) return
        for (const animation of animations) {
            const start = animation.startTime
            if (typeof start === 'number') animation.startTime = start + ahead
        }
    }
    return {wrapper, compact, progress, play, alignStart, animations}
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
 * 正中再掉回来。行内 + `!important` 是样式层级的顶格：级联顺序里作者声明的 `!important` 排在动画之上
 * （动画与过渡都在它下面）。也正因为这样，钉的时候要留意别把替身自己那几段动画驱动的属性一起钉死
 * ——`PAINT_PROPERTIES` 里因此没有 `opacity`。
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
    /** 这一刻的视觉半径：可见区短边的一半乘圆度，圆度按进度的平方根从 `2R0/短边` 走到 `2R1/短边`（见 `textWindows` 调用之后那段）。 */
    radius: number
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
    for (const layer of root.querySelectorAll(CARET_LAYER_SELECTOR)) layer.remove()
}

/**
 * 形变进度：一条临界阻尼的弹簧，压进前 `tuning.morphEnd` 段。弹簧在窗口末端还差一点点没到，整条按
 * 末端的值归一，终点严丝合缝、中间也不跳。
 */
function morphProgress(u: number): number {
    if (u >= tuning.morphEnd) return 1
    return springProgress(u / tuning.morphEnd, 1, tuning.acrossOmega) / springProgress(1, 1, tuning.acrossOmega)
}

/**
 * 纵向上升的进度：还是那条弹簧，只是起步先让给横向（见 `RISE_DELAY`）。
 * @param u - 时间占比，0 到 1。
 * @returns 位移进度；延迟段里恒为 0。
 */
function riseProgress(u: number): number {
    const shifted = (u - tuning.riseDelay) / (1 - tuning.riseDelay)
    if (!(shifted > 0)) return 0
    return springProgress(shifted, tuning.riseDamping, tuning.riseOmega)
}

/**
 * 反解纵向进度：气泡在视觉上走到 `progress` 那一刻，占整段飞行的多少。
 *
 * 让位要收在「气泡底边越过输入框上沿」那一刻，而那是一个**位移比例**、不是时间；纵向弹簧又不是
 * 匀速的，所以要反解一次。二分 24 次，误差压在一帧以下（0.06 的进度差在 60 fps 里就是两帧）。
 * @param progress - 纵向位移的比例（1 是落点）。
 * @returns 时间占比；进度不大于 0 时是 0。
 */
export function timeAtRise(progress: number): number {
    if (!(progress > 0)) return 0
    let low = 0
    let high = 1
    for (let step = 0; step < 24; step += 1) {
        const mid = (low + high) / 2
        if (riseProgress(mid) < progress) low = mid
        else high = mid
    }
    return (low + high) / 2
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
 *
 * **导出给落点让位用**：它借的是形状（同一个函数、同一个 `RISE_OMEGA`），阻尼比与时间窗按自己那一段定
 * （见 `send-reveal.ts` 的 `springFrames`）。
 */
export function springProgress(u: number, damping: number, omega: number): number {
    if (damping >= 1) return 1 - (1 + omega * u) * Math.exp(-omega * u)
    const damped = omega * Math.sqrt(1 - damping * damping)
    return 1 - Math.exp(-damping * omega * u)
        * (Math.cos(damped * u) + (damping * omega / damped) * Math.sin(damped * u))
}

/**
 * 这一段飞行要用的曲线参数：默认值，加上浏览器里那一份覆盖。
 *
 * **这是给开发期试参数的口子。** 在控制台里写
 *
 *     localStorage.setItem('dsh-chat-ux:send-flight', '{"acrossOmega":7,"riseDelay":0.15}')
 *
 * 然后发一条消息就能看到新的一套：每段起飞前现读一次，不必重新构建、也不必刷新页面。
 * `localStorage.removeItem('dsh-chat-ux:send-flight')` 就回到默认值。能覆盖的键就是 `FlightTuning`
 * 那五个——`acrossOmega`（越大开局越快、横向越早走完）、`riseDelay`（越大开头那段水平滑行越长）、
 * `riseOmega`、`riseDamping`、`morphEnd`。它不进配置：卡片上没有这一行，schema 里也没有。
 *
 * **只认说得通的值**：不是有限数、或越界（`morphEnd` 要在 0 与 1 之间、阻尼比夹在 0.05~1）就退回
 * 默认——一次笔误不该把动画钉死在半路。读不到 `localStorage`（隐私模式会直接抛）时同样退默认。
 * @returns 这一次要用的那一套参数。
 */
function readTuning(): FlightTuning {
    let raw: string | null = null
    try {
        raw = window.localStorage.getItem(TUNING_KEY)
    } catch {
        return DEFAULT_TUNING
    }
    if (raw === null || raw === '') return DEFAULT_TUNING
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return DEFAULT_TUNING
    }
    if (parsed === null || typeof parsed !== 'object') return DEFAULT_TUNING
    const source = parsed as Record<string, unknown>
    const read = (key: keyof FlightTuning): number => {
        const value = source[key]
        return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TUNING[key]
    }
    const acrossOmega = read('acrossOmega')
    const riseOmega = read('riseOmega')
    const morphEnd = read('morphEnd')
    return {
        acrossOmega: acrossOmega > 0 ? acrossOmega : DEFAULT_TUNING.acrossOmega,
        riseDelay: Math.min(0.9, Math.max(0, read('riseDelay'))),
        riseOmega: riseOmega > 0 ? riseOmega : DEFAULT_TUNING.riseOmega,
        riseDamping: Math.min(1, Math.max(0.05, read('riseDamping'))),
        morphEnd: morphEnd > 0 && morphEnd < 1 ? morphEnd : DEFAULT_TUNING.morphEnd,
    }
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

/**
 * 抄下一层的「面」：按白名单把这一刻算出来的值读下来。
 *
 * 抄的永远是**画出来的东西**，不碰几何与布局——替身的壳自己管几何（逐格缩放、反向缩放、圆角补偿），
 * 抄进去会和它打架。伪元素的定位几何也不在这份白名单里（元素那层根本用不上那几条），它由
 * `PSEUDO_PROPERTIES` 单独列上，理由见那里。
 * @param style - 这一层的计算样式。
 * @param properties - 抄哪些属性。
 * @returns 属性名与那一刻算出来的值。
 */
function readDeclarations(style: CSSStyleDeclaration, properties: readonly string[]): readonly LookDeclaration[] {
    return properties.map((name): LookDeclaration => [name, style.getPropertyValue(name)])
}

/**
 * 抄一个伪元素那一层。
 *
 * `content` 是 `none` 就是没有这个伪元素，给 null——替身那一层什么都不写，回落到本来的样子。
 * @param element - 带伪元素的元素。
 * @param pseudo - `'::before'` 或 `'::after'`。
 * @param properties - 抄哪些属性。
 * @returns 那一层的面；没有这个伪元素时为 null。
 */
function readPseudoLayer(element: HTMLElement, pseudo: '::before' | '::after', properties: readonly string[]): readonly LookDeclaration[] | null {
    const style = getComputedStyle(element, pseudo)
    if (style.content === 'none') return null
    return readDeclarations(style, properties)
}

/**
 * 卡片背后最先画实的那层底色。
 *
 * 一路往上找第一个不透明的 `background-color`——多半是画布。到 `body` 都没找到就给 `transparent`：
 * 垫不出来就不垫，宁可不透，也不画一块来路不明的色。
 * @param card - 卡片。
 * @returns 一个颜色；找不到时是 `transparent`。
 */
function behindColorOf(card: HTMLElement): string {
    for (let node = card.parentElement; node !== null; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor
        if (alphaOf(color) >= 1) return color
    }
    return 'transparent'
}

/**
 * 把抄下来的一层「面」写到替身的某一片填充上。
 * @param element - 填充层。
 * @param declarations - 抄下来的属性；这一层不存在时为 null，那就什么都不写。
 */
function paintSurface(element: HTMLElement, declarations: readonly LookDeclaration[] | null): void {
    for (const [name, value] of declarations ?? []) element.style.setProperty(name, value)
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
