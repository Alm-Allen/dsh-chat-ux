/**
 * 发送气泡的形变：把输入卡片克隆、预先算好形状与文字层，再交给合成器从卡片收成气泡。
 *
 * 位移、形状、颜色和字层必须共用一条时间轴：任何一条单独跑快，卡顿时右边缘都会越出消息列。
 * clip-path 与 background-color 上不了合成器；形状走壳的 scale，内容用反向 scale 抵消。
 *
 * 替身就是真卡片那一棵子树：克隆带着它自己的 class 与 `data-*`，dsh 与玻璃的规则照样命中，只补一层
 * 阶段属性（见 `STAGE_ATTRIBUTES`）让那几条以祖先为条件的规则也成立。真卡片在飞行期间整个藏着，
 * 所以替身不必退而求其次去画一份平替：底色、`::before` 上的玻璃与盒内阴影全都由克隆自己画。
 */

/**
 * 整段飞行时长（毫秒）。只留开关，不开放时长。
 *
 * 改它时同步重算 `文档/业务/发送动效.md` 的一帧对照表；兜底定时器按 FLIGHT_MS + RESCUE_MARGIN_MS 走。
 */
export const FLIGHT_MS = 350

/**
 * 位移与形变共用的角频率。
 *
 * 两者必须同一条曲线、同一条时间轴，右边缘才始终落在起点和终点之间；单独调快位移会让未收窄的
 * 卡片越出消息列。取 7 是为了压住首帧位移，同时避免形变收尾时出现可见顿挫。
 */
const ACROSS_OMEGA = 7

/**
 * 纵向弹簧的阻尼比，临界是 1。**落定那一下弹多少，全看这一个数**：过冲量是
 * `exp(-πζ/√(1-ζ²))`，所以越大越收敛，取 1 就完全不弹。
 */
const RISE_DAMPING = 0.8

/**
 * 纵向弹簧的角频率。落点让位复用它，只另配阻尼比和时间窗。
 */
export const RISE_OMEGA = 7.5

/**
 * 纵向起步的延迟，占整段的比例。
 *
 * 延迟段只横移、不上升，接缝处弹簧速度为零；落点让位用同一延迟对齐两边进度。
 */
export const RISE_DELAY = 0.15

/**
 * 形变收尾的位置，占整段的比例。
 *
 * 越早收完，宽度越早退进列内，右边缘越安全；剩下的时间只留给上升与落定。
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
 * 起手格那块底：chat-ux 玻璃卡片落到实色之后的样子（浅色主题）。
 *
 * **硬编码，不读 DOM。** 玻璃是「七成透明的底 + `backdrop-filter: blur(22px) saturate(130%)`」，
 * 读一遍还要合成背后那层颜色，读错一次就是一块色差明显的补丁；而这套东西本来就不打算兼容别人的
 * 输入框样式。换主题、换版本时改这三行（`SLAB_FILL` / `SLAB_BACKING` / `SLAB_SHEEN`）。
 */
const SLAB_FILL = 'rgba(247, 247, 250, 0.85)'

/** 同一块底的不透明版本。`flattenColor` 合成气泡色时要一个实底，半透明的底会把结果算错。 */
const SLAB_BACKING = 'rgb(247, 247, 250)'

/**
 * 玻璃两端那两片极淡的色，横着铺：左端偏蓝、右端偏紫，中间完全透明。
 *
 * 照抄 chat-ux 玻璃卡片 `::before` 上那条四停渐变。卡片又宽又扁，横向的两端色读起来就是它的「对角」，
 * 少了这一层，起手格会是一块平涂的灰白。
 */
const SLAB_SHEEN = 'linear-gradient(to right, rgb(122 155 240 / 0.022) 0%, rgb(122 155 240 / 0) 38%, rgb(143 137 184 / 0) 64%, rgb(143 137 184 / 0.018) 100%)'

/**
 * 起手格为什么不做真玻璃。
 *
 * 替身这里要还三笔账：它**在动**，背后那片像素每帧都得重新采样；圆角动画每帧在主线程改值，整层的
 * 绘制记录跟着每帧重录，模糊也只能回到主线程；`none` 与 `blur()` 之间还不可插值，结尾只能硬切。
 * 350 ms 的一段飞行换来的是把整段动画从纯合成拖回逐帧 raster——读者其实来不及看那点模糊。
 * 所以用一层八成半透的白加卡片自己那几笔内阴影模拟，七八成像，主线程一点不碰。
 */

/**
 * 色块挂着等回显时的不透明度。
 *
 * 那一百来毫秒里读者盯着的应该是**输入框本身**——占位文字、按钮、描边一样不少。替身不透明地盖在
 * 上面，看起来就是「输入框没了」。所以它挂上时几乎透明（不取 0：真为 0 时浏览器会把这一层整个
 * 跳过绘制，起飞那一刻又要重新栅格化），起飞时才显形（见 `startSlab`）。
 */
const SLAB_HOLD_OPACITY = '0.01'

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

/** 起飞之前在输入卡片上抓下来的一切。全部在 React 清空草稿之前拿到。 */
export interface ComposerSnapshot {
    /** 卡片的视口矩形：替身的起点。 */
    readonly box: DOMRect
    readonly radius: number
    /** 卡片底落到背后那个不透明底色上的结果：色块替身的起手色，永远不透明。 */
    readonly fill: string
    /**
     * 卡片的阴影，按「画在盒内」与「画在盒外」拆开。
     *
     * 盒内那几笔（玻璃的三笔质感）由克隆自己画；盒外那些归壳外的光晕层——壳的 `overflow: hidden` 只裁得到
     * 盒外那一半，两层各管一半，既齐又不叠。
     */
    readonly shadowInside: string
    readonly shadowOutside: string
    /**
     * 卡片祖先链上的阶段属性（见 `STAGE_ATTRIBUTES`）。
     *
     * 玻璃那几组选择器拿它当祖先条件，替身离开真实祖先链之后得自己把它补到一层上。
     */
    readonly stage: readonly (readonly [string, string])[]
    /** 整张卡片的克隆：只摘掉插入符，底色与阴影留给它自己画，草稿区的高度钉死。 */
    readonly clone: HTMLElement
    /** 克隆里那一块草稿滚动区——第一段字就是它。 */
    readonly draft: HTMLElement
    /** 草稿滚动区原来滚到哪儿。克隆要进了文档才能滚，所以先记下来。 */
    readonly draftScrollTop: number
    /** 克隆里要收走的那几块（工具栏左右两组，以及别的有面积的东西），带着它们在卡片里的位置。 */
    readonly chrome: readonly ChromePiece[]
    /** 草稿的内容区相对卡片的位置：左、上内边距，以及右边还剩多少。 */
    readonly text: TextFrame
    /** 卡片的祖先给它的继承环境：字体、字号、颜色，以及那些自定义属性。 */
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
     * 起跑：放开停在起手格的那批动画。由 `send-flight` 把落点补好之后调一次。
     *
     * **不钉 `startTime`**，让动画 pending 到下一次渲染更新。这一条是整段飞行的关键：提交那一帧本身
     * 就要画一百多毫秒（实测 128 ms 与 115 ms），把起跑时刻钉在「这一帧」的话，屏幕第一次出现替身时
     * 动画已经走了同样长的一段——读者从来看不到起手格，第一眼就在半路，画面直接跳到后半段。
     * pending 把起点落在「起手格已经画到屏幕上」之后的那一帧，那一帧花了多久都不影响。
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
    /**
     * 位移那条动画跑完（被取消时同样结算，永远不拒绝）。
     *
     * `send-flight` 靠它落定，不逐帧轮询：主线程被长任务占住时轮询要等下一帧才认得出「走完了」，
     * 画面就停在终态上多停一格。
     */
    readonly finished: Promise<void>
    /** 位移、形状、底色、光晕、工具栏与字层的动画，收尾时一起取消。 */
    readonly animations: readonly Animation[]
}

/**
 * 从卡片那里继承下来、克隆必须带上的普通属性。自定义属性在 `snapshotComposer` 里另取一遍。
 *
 * **`font-size` 与 `line-height` 必须在。** dsh 给输入区定的字号挂在**祖先**的选择器上（hero 态一条、
 * 会话态一条），克隆一离开那条链，这两项就直接掉回 body 的 16px：实测逐路径对齐 37 对元素，有
 * **26 对字号对不上**（卡片 15px 对替身 16px，输入面 14px/24px 对 16px/26px）。这一条不需要任何人
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
 * 插入符那一层。`scrub` 会把它整块从克隆里摘掉：替身里没有 Lexical 的运行时，留着只会多一个会动的框。
 */
const CARET_LAYER_SELECTOR = '[data-chat-ux-caret-layer]'

/**
 * 卡片祖先链上的阶段属性。玻璃那几组选择器（见 `composer-glass-styles.ts`）把自己挂在
 * `[data-phase='active'] [data-composer-card]`、`[data-content-phase='active'] ...` 这样的条件上，
 * 替身离开真实祖先链之后就得自己补一层，否则克隆卡片交出底色之后背后什么都没有。
 *
 * 两个属性在 dsh 那里只跟自己的 class 配对（`.root[data-phase='active']`、`.embeddedBody[data-content-phase=...]`），
 * 所以单把属性补到替身的某一层上不会顺带命中 dsh 的规则，命中的只有本插件那几组玻璃。
 */
const STAGE_ATTRIBUTES = ['data-phase', 'data-content-phase'] as const

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
 * 输入框里那块字站在哪儿：相对卡片边框盒的左、上、右各多远，行高多少。
 *
 * 两条替身路线共用它。色块那条**没有草稿克隆**，起手格的文字是气泡自己的写法，但站位仍取输入框的——
 * 读者按下回车时，字看起来还长在原地，只是换了一套排字。
 */
export function textFrameOf(input: HTMLElement, box: DOMRect): TextFrame {
    const style = getComputedStyle(input)
    const inputBox = input.getBoundingClientRect()
    return {
        left: inputBox.left - box.left + input.clientLeft + pixel(style.paddingLeft),
        top: inputBox.top - box.top + input.clientTop + pixel(style.paddingTop),
        right: box.right - (inputBox.right - pixel(style.borderRightWidth) - pixel(style.paddingRight)),
        lineHeight: pixel(style.lineHeight),
    }
}

/**
 * 抓一次输入卡片：几何、阴影、阶段属性，以及整张克隆。
 *
 * 必须在提交的捕获阶段调——那时草稿还在。量的都是布局已经结算好的东西，克隆也只是一次
 * `cloneNode`，放在读者按下回车的那一刻不会让它等。
 */
export function snapshotComposer(input: HTMLElement, card: HTMLElement): ComposerSnapshot | null {
    const box = card.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    const scroll = input.closest<HTMLElement>('[data-input-scroll]')
    if (scroll === null || scroll.parentElement !== card) return null
    const cardStyle = getComputedStyle(card)
    const fill = flattenColor(cardStyle.backgroundColor, behindColorOf(card))
    const shadow = splitShadow(cardStyle.boxShadow)
    const text = textFrameOf(input, box)

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

    // 继承环境：字体、字号、颜色，以及卡片身上那些自定义属性。克隆离开原来的父链，这些得跟着走，
    // 否则字号掉回 body 的 16px、`var(--x)` 掉进 fallback。
    const context: [string, string][] = []
    for (const name of INHERITED_PROPERTIES) context.push([name, cardStyle.getPropertyValue(name)])
    for (let index = 0; index < cardStyle.length; index += 1) {
        const name = cardStyle[index]
        if (name === undefined || !name.startsWith('--')) continue
        context.push([name, cardStyle.getPropertyValue(name)])
    }

    // 阶段属性：取最近的那一层就够了，等于真卡片此刻看到的值。
    const stage: [string, string][] = []
    for (const name of STAGE_ATTRIBUTES) {
        const value = card.closest('[' + name + ']')?.getAttribute(name)
        if (value !== null && value !== undefined) stage.push([name, value])
    }

    const clone = card.cloneNode(true)
    if (!(clone instanceof HTMLElement)) return null
    scrub(clone)
    // 这几条必须带 `!important`：克隆带着卡片自己的 class 与 `data-*`，dsh 自己的规则会命中它，
    // 其中就有 `!important` 的定位那一类。行内 + `!important` 把定位与尺寸钉在起飞那一刻量到的值上。
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
        // 底与阴影交给克隆自己：它带着卡片自己的 class 与 `data-*`，dsh 与玻璃那几套规则在它身上照常
        // 命中——真卡片在飞行期间藏着，替身画的就是它本身，不必再凑一份实色底的平替。盒内那几笔写进行内，
        // 盒外那些留给光晕层（见 `halo`）。
        ['box-shadow', shadow.inside === '' ? 'none' : shadow.inside],
    ])
    const draft = clone.children[Array.from(card.children).indexOf(scroll)]
    if (!(draft instanceof HTMLElement)) return null
    // 草稿区的高度钉死：hero 态的最小高度挂在祖先选择器上，克隆离开那条链就会塌，工具栏会跟着往上跑。
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
        radius: pixel(cardStyle.borderTopLeftRadius),
        fill,
        shadowInside: shadow.inside,
        shadowOutside: shadow.outside,
        stage,
        clone,
        draft,
        draftScrollTop: scroll.scrollTop,
        chrome,
        text,
        context,
    }
}

/**
 * 把一条动画的 `finished` 变成「永远结算、永不拒绝」的 `Promise<void>`。
 *
 * 动画被 `cancel` 掉时 `finished` 是拒绝的，而取消在这里是正常收尾（落定、连发时收掉上一段）。
 * 不接住的话控制台里每次取消都留一条 unhandled rejection。
 */
function settled(animation: Animation): Promise<void> {
    return animation.finished.then(() => undefined, () => undefined)
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
 * 挂在页面上的那一份替身。
 *
 * 不管里面是克隆出来的整张卡片，还是一块只复刻尺寸与圆角的色块，`send-flight` 只认这一个接口。
 */
export interface HoldFrame {
    /** 最外层：终点补差写在它身上。 */
    readonly wrapper: HTMLElement
    /** 起手位置：挂上替身时卡片的矩形。 */
    readonly origin: DOMRect
    /** 起飞：把落点、采样与动画补上。 */
    readonly launch: (bubble: HTMLElement, end: DOMRect) => Morph | null
}

/**
 * 色块替身要的那点东西：尺寸、圆角、底色，以及字站在哪儿。
 *
 * 和 `ComposerSnapshot` 分开是为了**省掉那次克隆**。整卡克隆要 `cloneNode` 一整棵子树、再逐个子元素
 * `getBoundingClientRect` 一次（`collect` 会强制布局），而色块一个元素都用不上。提交那一帧主线程本来
 * 就被 dsh 占着，这笔账不该再记在它头上。
 */
export interface SlabSnapshot {
    readonly box: DOMRect
    readonly radius: number
    /**
     * 卡片的描边与阴影，原样的 `border` / `box-shadow`。
     *
     * 底色写死（见 `SLAB_FILL`），这两笔留在快照里：起飞之后色块要自己认得出形状，而阴影是卡片
     * 在浅色背景上唯一看得出来的一笔。它们跟着 `mover` 一起缩放，落定时正好贴到气泡边上。
     */
    readonly border: string
    readonly shadow: string
    /** 字站在哪儿：相对卡片边框盒的四条边与行高。色块的文字层拿它当起手站位（见 `textFrameOf`）。 */
    readonly text: TextFrame
}

/** 抓一次色块快照：四次布局读、几次样式读，没有克隆、没有子树遍历。 */
export function snapshotSlab(input: HTMLElement, card: HTMLElement): SlabSnapshot | null {
    const box = card.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    const style = getComputedStyle(card)
    const borderWidth = pixel(style.borderTopWidth)
    return {
        box,
        radius: pixel(style.borderTopLeftRadius),
        border: borderWidth > 0 ? borderWidth + 'px ' + style.borderTopStyle + ' ' + style.borderTopColor : '',
        shadow: style.boxShadow === 'none' ? '' : style.boxShadow,
        text: textFrameOf(input, box),
    }
}

/**
 * 已经挂好的替身骨架：停在起手格，一条动画都还没有。
 */
export interface GhostFrame {
    /** 最外层：终点补差写在它身上。 */
    readonly wrapper: HTMLElement
    /** 位移那一层。 */
    readonly mover: HTMLElement
    /** 壳外的光晕层。 */
    readonly halo: HTMLElement
    /** 做缩放与裁剪的壳。 */
    readonly shell: HTMLElement
    /** 与壳互为倒数的内容层，字层也挂在它里面。 */
    readonly scaler: HTMLElement
    /** 提交那一刻抓到的卡片。 */
    readonly snapshot: ComposerSnapshot
    /** 起手位置：挂上替身时卡片的矩形。 */
    readonly origin: DOMRect
}

/**
 * 把替身挂到页面上，停在起手格，动画一条都不建。
 *
 * 这一步要发生在**提交那一刻**，而不是回声出现时：替身是刚插进文档的新子树，第一次栅格化要好几百
 * 毫秒（实测闲时提交时开头那两帧是 128 与 115 ms）。先挂上、让它在「按下回车到回声出现」这段空档里
 * 画完，起飞时就没有首次绘制那笔账。
 *
 * 位置与尺寸都取快照：那时真卡片正好停在那里，而它随即被藏起来，由替身接替它。
 */
export function mountGhost(snapshot: ComposerSnapshot, origin: DOMRect): HoldFrame {
    const W0 = snapshot.box.width
    const H0 = snapshot.box.height
    const R0 = snapshot.radius
    const wrapper = document.createElement('div')
    wrapper.setAttribute(GHOST_ATTRIBUTE, '')
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.inert = true
    wrapper.style.cssText = 'position:fixed;margin:0;width:0;height:0;pointer-events:none;z-index:2147483000'
    wrapper.style.left = origin.left + 'px'
    wrapper.style.top = origin.top + 'px'
    const mover = document.createElement('div')
    mover.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;will-change:transform'
    const halo = document.createElement('div')
    halo.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;background:transparent;will-change:transform,opacity'
    halo.style.width = W0 + 'px'
    halo.style.height = H0 + 'px'
    halo.style.borderRadius = R0 + 'px'
    // 只画盒外那一半：盒内那几笔（玻璃的三笔质感）长在克隆卡片自己身上，两层叠在同一处会加深。
    halo.style.boxShadow = snapshot.shadowOutside
    const shell = document.createElement('div')
    shell.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0;will-change:transform'
    shell.style.width = W0 + 'px'
    shell.style.height = H0 + 'px'
    for (const [name, value] of snapshot.context) shell.style.setProperty(name, value)
    // 壳既做**缩放**（形状）又做**裁**（overflow: hidden）。下面这层 scaler 与它逐格互为倒数
    // ——壳缩小多少、内容就放大多少，内容的视觉尺寸与位置一个像素都不变，变的只有裁剪框。两层加位移
    // 全是纯 transform，走同一条时间轴、同一块合成器：主线程被 dsh 占住时它们一起停在同一格上。
    const scaler = document.createElement('div')
    scaler.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform'
    scaler.style.width = W0 + 'px'
    scaler.style.height = H0 + 'px'
    // 起手显式写一次圆角：动画还 pending 的那一两帧按 offset 0 画，慢机器上不写会先露一次方盒子。
    shell.style.borderRadius = R0 + 'px'
    shell.appendChild(scaler)
    // 阶段层：display: contents 不生成盒子，只把真卡片祖先链上的阶段属性带进来。玻璃那几组
    // [data-phase='active'] [data-composer-card]::before 因此在替身里也命中，克隆卡片于是自己画那份底
    // ——半透明、背后模糊、三笔质感，与读者刚按过的那张卡片是同一个样子。
    //
    // 飞过消息列时也不会再透出下面滚过的字：玻璃把它们糊掉，没有玻璃时克隆的底本来就不透明。
    const stage = document.createElement('div')
    stage.style.display = 'contents'
    for (const [name, value] of snapshot.stage) stage.setAttribute(name, value)
    stage.appendChild(snapshot.clone)
    scaler.appendChild(stage)
    mover.appendChild(halo)
    mover.appendChild(shell)
    wrapper.appendChild(mover)
    // 替身永远落在文档最后：document.querySelector 取文档序第一个，排在后面，认卡片、认输入框的
    // 人才始终拿到真的那两个（留下的样式钩子见 IDENTITY_ATTRIBUTES）。
    ghostHost().appendChild(wrapper)
    // 克隆要进了文档才能滚到原来的位置。
    if (snapshot.draftScrollTop > 0) snapshot.draft.scrollTop = snapshot.draftScrollTop
    const frame: GhostFrame = {wrapper, mover, halo, shell, scaler, snapshot, origin}
    return {wrapper, origin, launch: (bubble, end) => startMorph(frame, bubble, end)}
}

/**
 * 起一段形变：把终点、采样、字层与全部动画补上。
 *
 * 起点是 frame.origin——替身挂上那一刻卡片所在的位置，此刻它已经在屏幕上停在那，**不能再挪**：
 * 再挪一次就是读者看到的那一下跳。
 *
 * 尺寸仍取快照：克隆就是按它排好的，外壳、草稿区、工具栏的相对位置全以它为尺子。
 */
export function startMorph(frame: GhostFrame, bubble: HTMLElement, end: DOMRect): Morph | null {
    if (end.width === 0 || end.height === 0) return null
    const {snapshot, origin, mover, halo, shell, scaler, wrapper} = frame
    const style = getComputedStyle(bubble)
    const W0 = snapshot.box.width
    const H0 = snapshot.box.height
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
    // 壳挂载时按快照的尺寸建（起手格要与真卡片逐像素重合），这里按落点一次改到位；改动发生在起飞
    // 那一帧、动画还没起跑，读者看不到。
    shell.style.width = boxWidth + 'px'
    shell.style.height = boxHeight + 'px'
    shell.style.borderRadius = cornerRadius(R0, W0 / boxWidth, H0 / boxHeight)
    scaler.style.width = boxWidth + 'px'
    scaler.style.height = boxHeight + 'px'

    const dx = end.left - origin.left
    const dy = end.top - origin.top
    // 右边缘的硬上限：终点那条气泡的右边。曲线本身已经保证走不到它外头（见 `ACROSS_OMEGA`），这一道
    // 夹子是留给「主线程卡住时形变落后于位移」这类意外的——真夹到了，也只是起点那几帧少画一条边。
    const reach = end.right - origin.left
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
            // 所以曲线本身已经把右边缘钉在 `[origin.right, end.right]` 里，这一项只是保险。
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



    // 字：先在沿途每个宽度上排一遍，再按「折行一样、行高一档」归段。第一段是克隆卡片里那份草稿
    // 自己，其余每段一层。
    const bottomPadding = pixel(style.paddingBottom) + pixel(style.borderBottomWidth)
    const [draftWindow, ...bubbleWindows] = textWindows(bubble, style, samples, to.lineHeight, bottomPadding, true)
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
    // 把半径压成一个恒定值会让卡顿椭圆更小，但离终点的角更远、跳变更大；这里优先保留终点形状。
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


    const timing: KeyframeAnimationOptions = {duration: FLIGHT_MS, easing: 'linear', fill: 'forwards'}
    const animations: Animation[] = []
    const run = (element: HTMLElement, frames: Keyframe[]): Animation => {
        const animation = element.animate(frames, timing)
        animations.push(animation)
        return animation
    }
    const between = (windowFrom: number, windowUntil: number, frame: (sample: Sample) => Keyframe, stride = 1): Keyframe[] =>
        betweenFrames(samples, windowFrom, windowUntil, frame, stride)

    // 位移交给**合成器**：一整段 `transform` 关键帧。它与形状走同一条时间轴（同一个 `FLIGHT_MS`、同一批
    // `offset`），所以「一起走、一起停」是时间轴的保证，不是时序上的巧合。左边从卡片的左边走到气泡的
    // 左边，右边由宽度决定，两条边都单调。
    // 纵向就是弹簧本身，**不补任何下限**：过冲幅度 = 行程 × 1.52%，只由 `RISE_DAMPING` 决定
    // 窄气泡、短行程弹得少，长行程弹得多；补下限会让每次飞行都弹同样一段。
    const travel = run(mover, samples.map(sample => ({
        offset: sample.u,
        transform: 'translate(' + dx * sample.m + 'px, ' + dy * riseProgress(sample.u) + 'px)',
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
    // 光晕挂在壳**外面**，壳的 `overflow: hidden` 裁不到它——它的阴影会画到可见右边缘之外（实测每一帧
    // 都越过列右 24 px）。缩放按「外框 + 阴影扩散」算，阴影的外沿正好落在可见右边缘上。
    const shadow = shadowSpread(snapshot.shadowOutside)
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
        // 只 play，不写 startTime：让浏览器在**下一次渲染更新**时自己定起点。见 `Morph.play` 的文档
        // ——把起点钉在这一帧，这一帧画了多久，屏幕第一次看见替身时动画就已经走了多久。
        for (const animation of animations) animation.play()
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
    return {wrapper, compact, progress, play, alignStart, animations, finished: settled(travel)}
}

/**
 * 色块替身：只复刻卡片的尺寸、圆角与底色，一个内容元素都不复制。
 *
 * 这一版把「形变要画的东西」压到最低：一个方块加一层渐入的气泡色。它没有克隆子树，首次栅格化几乎
 * 不用花钱；全程只有 transform、opacity 与 border-radius 三条动画，前两条在合成器上。
 *
 * **两层，各管一件事**：外层只承接 `followTarget` 的补差平移（飞行期间落点自己会动几十像素），
 * 内层负责整段位移与形变。两层分开是必须的——补差每帧往行内写 `transform`，飞行那条是动画，
 * 写在同一个元素上时谁压谁全看动画处于 pending、running 还是刚结束，位置会在两处之间跳。
 */
export function mountSlab(snapshot: SlabSnapshot, origin: DOMRect): HoldFrame {
    const wrapper = document.createElement('div')
    wrapper.setAttribute(GHOST_ATTRIBUTE, '')
    wrapper.setAttribute('aria-hidden', 'true')
    wrapper.inert = true
    wrapper.style.cssText = 'position:fixed;margin:0;width:0;height:0;pointer-events:none;z-index:2147483000'
    wrapper.style.left = origin.left + 'px'
    wrapper.style.top = origin.top + 'px'
    const mover = document.createElement('div')
    mover.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform'
    mover.style.width = snapshot.box.width + 'px'
    mover.style.height = snapshot.box.height + 'px'
    mover.style.boxSizing = 'border-box'
    mover.style.borderRadius = snapshot.radius + 'px'
    mover.style.backgroundColor = SLAB_FILL
    mover.style.backgroundImage = SLAB_SHEEN
    mover.style.opacity = SLAB_HOLD_OPACITY
    if (snapshot.border !== '') mover.style.border = snapshot.border
    if (snapshot.shadow !== '') mover.style.boxShadow = snapshot.shadow
    const tint = document.createElement('div')
    tint.style.cssText = 'position:absolute;inset:0;border-radius:inherit;opacity:0'
    mover.appendChild(tint)
    // 字层挂在**色块里面**，跟着它一起被缩放：mover 是非均匀缩放的，字要视觉不变形就得再乘一层
    // 倒数（见 `slabPlate`）。字是起飞那一刻才补的——那时才知道气泡排成什么样。
    const frame: SlabFrame = {wrapper, mover, tint, snapshot, origin}
    wrapper.appendChild(mover)
    ghostHost().appendChild(wrapper)
    return {wrapper, origin, launch: (bubble, end) => startSlab(frame, bubble, end)}
}

/**
 * 已经挂好的色块骨架：停在起手格，除了那块底什么都没有。
 *
 * 与 `GhostFrame` 分开是因为两边挂的东西不一样：色块这边起飞时才补字层（那时才知道气泡排成什么样），
 * 克隆那边字层在挂载时就跟着克隆一起在了。
 */
interface SlabFrame {
    /** 最外层：终点补差写在它身上。 */
    readonly wrapper: HTMLElement
    /** 位移与形状那一层：色块的底，以及它的描边与阴影。 */
    readonly mover: HTMLElement
    /** 气泡色的渐入层。 */
    readonly tint: HTMLElement
    /** 提交那一刻按输入框抓到的快照。 */
    readonly snapshot: SlabSnapshot
    /** 起手位置：挂上替身时卡片的矩形。 */
    readonly origin: DOMRect
}

/**
 * 色块替身的起飞：位置、形状、圆角、颜色与字层共用一条时间轴。
 *
 * **字是起飞这一刻现排的**（见 `slabWindows`）：沿途每个宽度排一遍，折行/行高一样的归成一段，每段一层，
 * 宽度写死。动画期间只动 `transform` 与 `opacity`，主线程一格都不碰；换行是"提前算好"的，不是
 * "让浏览器逐帧重排"。
 */
function startSlab(frame: SlabFrame, bubble: HTMLElement, end: DOMRect): Morph | null {
    if (end.width === 0 || end.height === 0) return null
    const {wrapper, mover, tint, snapshot, origin} = frame
    const style = getComputedStyle(bubble)
    const W0 = snapshot.box.width
    const H0 = snapshot.box.height
    const W1 = end.width
    const H1 = end.height
    const R0 = snapshot.radius
    const R1 = pixel(style.borderTopLeftRadius)
    const dx = end.left - origin.left
    const dy = end.top - origin.top
    const from = snapshot.text
    const to: TextFrame = {
        left: bubble.clientLeft + pixel(style.paddingLeft),
        top: bubble.clientTop + pixel(style.paddingTop),
        right: pixel(style.borderRightWidth) + pixel(style.paddingRight),
        lineHeight: pixel(style.lineHeight),
    }
    tuning = readTuning()
    // 起飞这一刻才显形：气泡从输入框里长出来，就是从这一帧开始的（理由见 `SLAB_HOLD_OPACITY`）。
    mover.style.opacity = '1'
    tint.style.background = flattenColor(style.backgroundColor, SLAB_BACKING)

    // 每一格：外框、位移、圆角，外加**字的站位与可排字宽度**。字那几项与克隆那条同源（`Sample`）。
    const samples: Sample[] = Array.from({length: SAMPLES + 1}, (_, step) => {
        const u = step / SAMPLES
        const m = morphProgress(u)
        const width = W0 + (W1 - W0) * m
        const left = from.left + (to.left - from.left) * m
        const right = from.right + (to.right - from.right) * m
        return {
            u,
            m,
            width,
            visible: width,
            height: H0 + (H1 - H0) * m,
            radius: 0,
            left,
            top: from.top + (to.top - from.top) * m,
            content: Math.max(1, width - left - right),
            lineHeight: from.lineHeight + (to.lineHeight - from.lineHeight) * m,
        }
    })
    // 字：沿途每个宽度排一遍，折行一样、行高一档的归段。行数变多时字会把外框撑高，`slabWindows` 顺手
    // 把 `sample.height` 改掉——否则多行的正文会顶出气泡的底边。
    const bottomPadding = pixel(style.paddingBottom) + pixel(style.borderBottomWidth)
    // `draft` 传 false：色块这条没有草稿克隆，第一段就是气泡自己的写法，不必在 `DRAFT_HANDOFF_AT` 拆一次。
    const windows = textWindows(bubble, style, samples, to.lineHeight, bottomPadding, false)
    // 圆度与克隆那一版同一套：从卡片自己的走到气泡自己的，按进度的平方根插值。
    const shortStart = Math.min(W0, H0)
    const shortEnd = Math.min(W1, H1)
    const shareStart = shortStart > 0 ? Math.min(1, (2 * R0) / shortStart) : 0
    const shareEnd = shortEnd > 0 ? Math.min(1, (2 * R1) / shortEnd) : 0
    for (const sample of samples) {
        const short = Math.min(sample.width, sample.height)
        const share = shareStart + (shareEnd - shareStart) * Math.sqrt(sample.m)
        sample.radius = (short / 2) * share
    }

    const timing: KeyframeAnimationOptions = {duration: FLIGHT_MS, easing: 'linear', fill: 'forwards'}
    const animations: Animation[] = []
    /**
     * 一条动画。`between` 的关键帧只在字层窗口里采样，那几段两头都补了 0 与 1 的定格（见 `between`），
     * 所以每层只要在自己的窗口外全透明即可——窗口顺序在这里无关紧要，靠 `opacity` 的阶跃切开。
     */
    const run = (element: HTMLElement, frames: Keyframe[]): Animation => {
        const animation = element.animate(frames, timing)
        animations.push(animation)
        return animation
    }
    // 位移与形状**必须同一条动画、同一条时间轴**：任何一条单独跑快，卡顿时未收窄的色块就会先飞到终点。
    // 形状走 scale 而不是 width/height——后者是布局属性，逐帧改它等于逐帧重排整棵子树。
    const travel = run(mover, samples.map(sample => ({
        offset: sample.u,
        transform: 'translate(' + dx * sample.m + 'px, ' + dy * riseProgress(sample.u) + 'px) scale('
            + (sample.width / W0) + ', ' + (sample.height / H0) + ')',
    })))
    run(mover, samples.map(sample => ({
        offset: sample.u,
        borderRadius: cornerRadius(sample.radius, sample.width / W0, sample.height / H0),
    })))
    run(tint, samples.map(sample => ({
        offset: sample.u,
        opacity: String(Math.min(1, sample.m * 1.6)),
    })))
    // 字层：每层只在自己的窗口里亮，窗口外完全透明。一层字是两个元素——`plate` 抵消 mover 的缩放、
    // `layer` 在自己窗口的宽度上排好只做平移（见 `slabLayer`）。
    for (const window of windows) {
        const plate = slabPlate(bubble, style, window, W0, H0)
        // 挂在 tint 之后：字的上面没有别的东西了。
        mover.appendChild(plate)
        const layer = plate.firstElementChild as HTMLElement
        run(plate, betweenFrames(samples, window.from, window.until, sample => ({
            transform: 'scale(' + W0 / Math.max(sample.width, MIN_REVERSE_DIVISOR) + ', '
                + H0 / Math.max(sample.height, MIN_REVERSE_DIVISOR) + ')',
        })))
        run(layer, betweenFrames(samples, window.from, window.until, sample => ({
            transform: slabShift(sample, window),
        })))
        run(plate.firstElementChild as HTMLElement, stepOpacity(window.from, window.until))
    }

    const progress = (): number => {
        const raw = travel.currentTime
        if (typeof raw !== 'number') return 0
        const u = raw / FLIGHT_MS
        if (!(u > 0)) return 0
        return u > 1 ? 1 : u
    }
    for (const animation of animations) {
        animation.pause()
        animation.currentTime = 0
    }
    let started = false
    let playedAt: number | null = null
    let aligned = false
    const play = (): void => {
        if (started) return
        started = true
        playedAt = performance.now()
        for (const animation of animations) animation.play()
    }
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
    return {wrapper, compact: () => {}, progress, play, alignStart, animations, finished: settled(travel)}
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
 * 克隆带着卡片自己的 class 与 `data-*`，dsh 的规则照样命中它，其中就有 `!important` 的定位那一类。
 * 普通行内样式压不住 `!important`：一条居中的规则就足以让克隆飞到屏幕正中再掉回来。行内 + `!important`
 * 是样式层级的顶格，把定位与尺寸定死在起飞那一刻量到的值上。
 *
 * 钉的时候要留意别把替身自己那几段动画驱动的属性一起钉死——`opacity` 就不在钉的名单里。
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

/**
 * 只在一段窗口里逐格采样，两头各补一帧定住。
 *
 * 形变收尾之后那些属性不再变，一层字也只在它亮着的那一段里才看得见——窗口外的关键帧只是让起飞那一帧
 * 多解析几百条（实测建动画占了建替身的一半）。
 *
 * `stride` 只给不参与几何抵消的那几段用（圆角、底色、光晕、工具栏）：它们的曲线平缓，隔一格取一格看不
 * 出来，省下的关键帧换的是实打实的建动画时间。**形状与内容那两段必须同格**，一错格两层就不再互为倒数，
 * 中段会看见偏移。
 */
function betweenFrames(
    samples: readonly Sample[],
    windowFrom: number,
    windowUntil: number,
    frame: (sample: Sample) => Keyframe,
    stride = 1,
): Keyframe[] {
    const inside = samples.filter(sample => sample.u >= windowFrom && sample.u <= windowUntil)
    const frames: Keyframe[] = []
    inside.forEach((sample, index) => {
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
 * 自己。最后一段就是气泡本身。顺带把字撑高的那几格的外框高度补上（`samples` 里的高度会被改写）。
 *
 * `draft` 说的是**第一段让不让给输入框那份草稿克隆**。克隆那条替身里有草稿，第一段就该是它；色块那条
 * 没有草稿，从头到尾都是气泡自己的写法，拆那一刀只会多一层看不见的字。
 */
function textWindows(
    bubble: HTMLElement,
    style: CSSStyleDeclaration,
    samples: readonly Sample[],
    finalLineHeight: number,
    bottomPadding: number,
    draft: boolean,
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
    // 色块那条没有草稿，这一刀不切（见 `draft` 参数）。
    const first = windows[0]
    if (draft && first !== undefined) {
        const handoff = samples.find(sample => sample.m >= DRAFT_HANDOFF_AT)?.u ?? 1
        if (first.until > handoff) {
            windows.splice(1, 0, {key: first.key, from: handoff, until: first.until, width: first.width, lineHeight: first.lineHeight})
            first.until = handoff
        }
    }
    // 太多段就把最短的那些并进**后一段**：后一段排得更窄，提前亮出来只是早折一行；并进前一段的话，
    // 更宽的那份排版会在外框已经收窄之后还亮着，字就顶出去了。有草稿时前两段（草稿与它交出去的那一段）
    // 不参与；没有草稿时前一段就是普通的一段。
    const guard = draft ? 2 : 1
    while (windows.length > MAX_TEXT_LAYERS) {
        let shortest = guard
        for (let index = guard + 1; index < windows.length - 1; index += 1) {
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
 * 色块里的一层字：`plate` 抵消 mover 的缩放，里面那层按窗口宽度排好、只做平移。
 *
 * 与 `textLayer` 的区别只有一处——**它挂在被非均匀缩放的 `mover` 里面**。mover 宽收得比高快，字要视觉
 * 不变形就得再乘一层倒数；而倒数不能写在层自己身上（那会连平移一起放大），所以多一层壳：
 *
 *     mover（缩放 S）> plate（缩放 1/S）> layer（按窗口宽度排好，只平移）
 *
 * 两层都取**起手格**（卡片）的尺寸，也就是 mover 的布局尺寸：坐标原点、单位长度都一致，倒数才对得上。
 */
function slabPlate(
    bubble: HTMLElement,
    style: CSSStyleDeclaration,
    window: TextWindow,
    width: number,
    height: number,
): HTMLElement {
    const plate = document.createElement('div')
    plate.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform'
    plate.style.width = width + 'px'
    plate.style.height = height + 'px'
    const layer = textLayer(bubble, style)
    layer.style.width = window.width + 'px'
    layer.style.lineHeight = window.lineHeight + 'px'
    plate.appendChild(layer)
    return plate
}

/**
 * 一层字在这一格平移到哪儿：内容区的左上角，行高差的一半补在竖直方向。
 *
 * `plate` 与 mover 同尺寸同原点，所以直接就用外框坐标，不必再减去内边距。
 */
function slabShift(sample: Sample, window: TextWindow): string {
    const y = sample.top + (sample.lineHeight - window.lineHeight) / 2
    return 'translate(' + sample.left + 'px, ' + y + 'px)'
}

/**
 * 一层预先排好的正文：气泡里的内容原样克隆，排字属性从气泡上抄。
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
 */
function cornerRadius(radius: number, sx: number, sy: number): string {
    return (radius / Math.max(sx, MIN_CORNER_SCALE)) + 'px / ' + (radius / Math.max(sy, MIN_CORNER_SCALE)) + 'px'
}

/**
 * 一条 box-shadow 向外扩多少：取各层里最大的 `模糊半径 + 扩散半径`。颜色函数里的数字先剔掉。
 *
 * 光晕那一层要用它把阴影的外沿收回可见右边缘以内（见 `startMorph` 里 halo 的缩放）。
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
 * 把一条 `box-shadow` 拆成「画在盒内」与「画在盒外」两串。
 *
 * 盒内那几笔（`inset`）跟着卡片走，盒外那些归壳外的光晕层——壳把盒子外面的东西裁掉。逗号只在层与层
 * 之间才是分隔符，颜色函数里的逗号要跳过，所以按括号层级切。`none` 拆出来两边都是空串。
 */
function splitShadow(shadow: string): { inside: string; outside: string } {
    const inside: string[] = []
    const outside: string[] = []
    for (const layer of shadow.split(/,(?![^()]*\))/)) {
        const trimmed = layer.trim()
        if (trimmed === '') continue
        if (/\binset\b/.test(trimmed)) inside.push(trimmed)
        else outside.push(trimmed)
    }
    return {inside: inside.join(', '), outside: outside.join(', ')}
}

/**
 * 卡片背后第一个不透明的底色。
 *
 * 一路往上找第一个 background-color 不透明的节点——多半是画布。到 body 都没找到就给 transparent。
 */
function behindColorOf(card: HTMLElement): string {
    for (let node: HTMLElement | null = card; node !== null; node = node.parentElement) {
        const color = getComputedStyle(node).backgroundColor
        if (alphaOf(color) >= 1) return color
    }
    return 'transparent'
}

/**
 * 把一层可能半透明的颜色落到一个实色底上，得到一个不透明的颜色。
 *
 * 读得出来的只有 rgb() / rgba()（getComputedStyle 给的就是这两种）；别的写法原样返回。
 */
function flattenColor(color: string, behind: string): string {
    const front = colorParts(color)
    if (front === null) return color
    const alpha = front[3] ?? 1
    if (alpha >= 1) return color
    const back = colorParts(behind)
    if (back === null) return color
    const mix = (index: number): number => Math.round(
        (front[index] ?? 0) * alpha + (back[index] ?? 0) * (1 - alpha),
    )
    return 'rgb(' + mix(0) + ', ' + mix(1) + ', ' + mix(2) + ')'
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
