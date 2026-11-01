/**
 * dsh-chat-ux 的浏览器侧。
 *
 * DSH 通过 exports["./client"] 加载这个模块，产物由 tsc -p tsconfig.client.json 加上
 * scripts/wrap-client.cjs 生成，后者把 CommonJS 产物包成客户端模块加载器要求的那个单文件 bundle。
 *
 * 读者看得见的一切都归这一半：聊天区样式表、思考行与过程组的自动开合、折叠过渡、插入符位移过渡、
 * 输入框玻璃、轨迹视图里收掉输入区、工作步骤展示的默认档位，以及插件管理页的配置卡片。
 * 它还读 dsh-chat-ux 这一行的共享 config form，这一页上改的值就是这样到达效果里的，不用刷新
 */
import type {Context as ClientContext} from "@deepseek-ai/cordis"
import {installCaretMotion} from "./chat/caret/caret-motion"
import type {CaretMotionMode} from "./chat/caret/caret-motion"
import {installCacheHitPill} from "./chat/cache-hit/cache-hit-pill"
import {installComposerGlass} from "./chat/composer-glass/composer-glass"
import {GLASS_ATTRIBUTE} from "./chat/composer-glass/composer-glass-styles"
import {installContextMeterPie} from "./chat/context-meter/context-meter-pie"
import {installFileMutationRow} from "./chat/file-mutation/file-mutation-row"
import type {SlotsService} from "./chat/file-mutation/file-mutation-row"
import {installCallAppearFollow} from "./chat/follow/call-appeared"
import {installFoldGlide} from "./chat/fold/fold-glide"
import {createFoldWatch} from "./chat/fold/fold-observers"
import {installProcessFold} from "./chat/fold/process-fold"
import {installReasoningFold} from "./chat/fold/reasoning-fold"
import {installPaperLayer} from "./chat/paper/install"
import type {PaperHandle, PaperSettingsInput} from "./chat/paper/install"
import {installSendFlight} from "./chat/send-flight/send-flight"
import {ChatUxConfigCard} from "./settings/settings-card"
import {
    DEFAULT_AUTO_FOLD, DEFAULT_CARET_MOTION, DEFAULT_COMPOSER_GLASS,
    DEFAULT_CONTEXT_PIE, DEFAULT_FOLLOW_ON_APPEAR, DEFAULT_LIVE_DIFF, DEFAULT_PAPER_ON,
    DEFAULT_PAPER_SIDEBAR, DEFAULT_SEND_FLIGHT,
} from "./settings/settings-scope"
import type {ChatUxSection, ConfigForm, LocaleLike} from "./settings/settings-scope"
import {applyTranscriptViewDefault} from "./settings/transcript-default"
import {ALL_CSS, STYLE_ID} from "./styles"

/**
 * 必须的客户端服务：slots 承载插件管理页那个座位，configForms 提供这个插件的配置表单。
 * 后者由 @deepseek-ai/dsh-client-ui-settings 提供，而它自己声明了 remote 与 remote.settings，
 * 所以这一半不用再直接依赖那两个服务
 *
 * locale 服务刻意不在其中：卡片通过 ctx.reflect 读它，而没有 locale 插件时 reflect 返回 undefined、不抛错，
 * 所以没有它的部署照样能得到一张能用的卡片
 */
export const inject: string[] = ["slots", "configForms"]

// 浏览器侧入口
export function apply(ctx: ClientContext): void {
    const services = ctx as unknown as ClientServices

    ctx.effect(() => {
        const style = document.createElement("style")
        style.id = STYLE_ID
        style.dataset.plugin = "dsh-chat-ux"
        // 一张样式表承载浏览器这侧的全部内容：聊天区规则、配置卡片、文件变更行、折叠体入场、字体接管。
        // 那几份 CSS 由 styles.ts 的 ALL_CSS 拼起来，这里不再逐个模块地认
        style.textContent = ALL_CSS
        document.head.appendChild(style)
        return () => style.remove()
    }, "dsh-chat-ux: chat-area stylesheet")

    // 这一份镜像在每一轮效果里现读，所以插件管理页上改完不必重新安装任何东西，也不会丢掉正在跑的定时器。
    // 平台把原来的 settings scope 换成了按 Host 条目 id 取的共享表单。
    // 这个值仍叫 scope：插件管理页给这个座位的 owner props 里已经有一个 form，注入面再用同名就会撞上去
    const scope = services.configForms.get<ChatUxSection>(SETTINGS_NAMESPACE)
    // 官方的收起时机：默认「完成时收起」，不改变本插件行为；读者选「下次发送时收起」时，
    // 过程组结束后的那一次收起归官方，见 process-fold 的让开。这里只现读，不订阅，过程组的每一次扫描都会读它
    const chatSettings = services.configForms.get<ChatSettingsLike>(CHAT_SETTINGS_NAMESPACE)
    const defersCollapse = (): boolean =>
        chatSettings.getSnapshot().value?.collapseTiming === "next-input"
    const settings: ChatUxSettings = {
        autoFold: DEFAULT_AUTO_FOLD,
        caret: DEFAULT_CARET_MOTION,
        pie: DEFAULT_CONTEXT_PIE,
        glass: DEFAULT_COMPOSER_GLASS,
        liveDiff: DEFAULT_LIVE_DIFF,
        followOn: DEFAULT_FOLLOW_ON_APPEAR,
        sendFlight: DEFAULT_SEND_FLIGHT,
        paperOn: DEFAULT_PAPER_ON,
        paperSidebar: DEFAULT_PAPER_SIDEBAR,
    }

    // 插入符动效与字体两项不是每一轮现读，而是常驻的 DOM 状态：配置一改就得重新落一次
    // （卡片上保存完不必刷新页面），插件卸下时也要把写过的东西撤干净。所以订阅由这里拿着，syncSettings 是唯一的入口
    // 纸感开着时那根自绘插入符画成羽毛，关掉时回到 2px 的竖线。几何、位移与闪烁仍归 caret-motion，
    // 羽毛只是它里面的一种画法——两套自绘互相覆盖是这套动效最容易翻车的地方，所以不另起一根
    const caret = installCaretMotion(() => settings.caret, () => settings.paperOn)
    // 上下文占用那个圆也归这一处：dsh 画的是环、也没有档位色。它不是座位（InputBar 直接渲染的那一个），
    // 接不过来，所以从 DOM 上认它，只写读数与档位，形状与颜色由样式表接。
    // 开关关掉时整块卸下：写过的属性、内联样式与数字滚动一起撤干净，读者看到的是 dsh 原来那圈环
    let pieDispose: (() => void) | null = null
    const syncPie = (): void => {
        if (!settings.pie) {
            pieDispose?.()
            pieDispose = null
            return
        }
        if (pieDispose !== null) return
        pieDispose = installContextMeterPie()
    }
    // 自动开合是装了才有的两块（思考行、过程组）：开关关掉时两块都卸下，页面上一次都不动手。
    // 设置一改就得重新落，所以那一次的卸载函数由这里拿着，syncSettings 是唯一的入口
    let autoFoldDispose: (() => void) | null = null
    const syncAutoFold = (): void => {
        if (!settings.autoFold) {
            autoFoldDispose?.()
            autoFoldDispose = null
            return
        }
        if (autoFoldDispose !== null) return
        const reasoning = installReasoningFold()
        const process = installProcessFold(defersCollapse)
        // 两块共用同一个观察者：哪一行、哪一组被碰到由它一处认出来，再分给两块各自的收敛
        const unwatch = createFoldWatch((rows, groups) => {
            reasoning.sync(rows)
            process.sync(groups)
        })
        autoFoldDispose = () => {
            unwatch()
            reasoning.dispose()
            process.dispose()
        }
    }
    // 输入框玻璃：属性在，样式表里那一整块才命中，量卡片位置的那个观察者也只有这时候才装。
    // 关掉时两样一起撤，观察者不跑，属性也摘掉
    let glassDispose: (() => void) | null = null
    const syncGlass = (): void => {
        if (!settings.glass) {
            glassDispose?.()
            glassDispose = null
            document.body.removeAttribute(GLASS_ATTRIBUTE)
            return
        }
        document.body.setAttribute(GLASS_ATTRIBUTE, "")
        if (glassDispose !== null) return
        glassDispose = installComposerGlass()
    }

    // 纸：开着才装。装的是两片 canvas 加令牌，关掉时把它卸干净、令牌一并还原。
    // 纸只有一张，纸色跟着 body 上的深浅色标记走，所以配置里只剩两个开关
    let paper: PaperHandle | null = null
    const paperSettings = (): PaperSettingsInput => ({
        on: settings.paperOn,
        sidebar: settings.paperSidebar,
    })
    const syncPaper = (): void => {
        if (!settings.paperOn) {
            paper?.dispose()
            paper = null
            document.documentElement.removeAttribute("data-dsh-chat-ux-paper")
            return
        }
        // 已经装着的时候只重落参数：重画两片 canvas 会把纸纹整块重算一遍，改一个开关的代价不该这么大
        if (paper !== null) {
            paper.refresh()
            return
        }
        paper = installPaperLayer(paperSettings)
    }

    let followDispose: (() => void) | null = null
    const syncFollow = (): void => {
        if (!settings.followOn) {
            followDispose?.()
            followDispose = null
            return
        }
        if (followDispose !== null) return
        followDispose = installCallAppearFollow()
    }
    const syncSettings = (): void => {
        const value = scope.getSnapshot().value
        settings.autoFold = value?.autoFold ?? DEFAULT_AUTO_FOLD
        settings.caret = value?.caretMotion ?? DEFAULT_CARET_MOTION
        settings.pie = value?.contextPie ?? DEFAULT_CONTEXT_PIE
        settings.glass = value?.composerGlass ?? DEFAULT_COMPOSER_GLASS
        settings.liveDiff = value?.liveDiff ?? DEFAULT_LIVE_DIFF
        settings.followOn = value?.followOnAppear ?? DEFAULT_FOLLOW_ON_APPEAR
        settings.sendFlight = value?.sendFlight ?? DEFAULT_SEND_FLIGHT
        settings.paperOn = value?.paperOn ?? DEFAULT_PAPER_ON
        settings.paperSidebar = value?.paperSidebar ?? DEFAULT_PAPER_SIDEBAR
        syncGlass()
        caret.resync()
        syncPie()
        syncAutoFold()
        syncFollow()
        syncPaper()
    }
    syncSettings()
    ctx.effect(() => scope.subscribe(syncSettings), "dsh-chat-ux: settings mirror")
    ctx.effect(() => caret.dispose, "dsh-chat-ux: caret motion")
    ctx.effect(
        () => {
            syncPaper()
            return () => {
                paper?.dispose()
                paper = null
            }
        },
        "dsh-chat-ux: paper",
    )
    ctx.effect(
        () => {
            syncGlass()
            return () => {
                glassDispose?.()
                glassDispose = null
                document.body.removeAttribute(GLASS_ATTRIBUTE)
            }
        },
        "dsh-chat-ux: composer glass",
    )

    // dsh 自己按客户端给「工作步骤展示」的默认值：桌面端「标准」、网页端「详细」。这个插件的过程组行为
    // 是照着「标准」与「简洁」两档做的，所以网页端在读者没自己选过时补一次「标准」；读者选过之后一次都不再动手
    ctx.effect(() => applyTranscriptViewDefault(services.configForms), "dsh-chat-ux: work details default")

    // 思考行与过程组归同一个开关：dsh 把每一行思考行都发成收起的，也没有为它暴露任何设置；
    // 简洁与标准两档下，运行中的过程组体初始也是收起的。两处都在过程还在跑时开着、这一段结束再收回去
    // （模块里写明了按阶段让开，读者自己动过手的不被覆盖）。装与卸都在 syncAutoFold 里。
    // 两块共用 fold-observers 的那一个观察者：同一批变化只遍历一次、只排一帧
    ctx.effect(() => {
        syncAutoFold()
        return () => {
            autoFoldDispose?.()
            autoFoldDispose = null
        }
    }, "dsh-chat-ux: auto fold")

    // 这一块自己管门控属性与监听，所以这里只负责按开关装卸，卸的时候两样一起撤干净
    ctx.effect(
        () => {
            syncFollow()
            return () => {
                followDispose?.()
                followDispose = null
            }
        },
        "dsh-chat-ux: follow on appear",
    )

    // 折叠时下方内容直接瞬移，读者看不出推开这件事。展开体自己是卸掉的，CSS 没有可过渡的旧值，
    // 所以这一处从 DOM 之外接管：动真实高度，让布局逐帧长出来、逐帧收回去，收起方向靠拦下那次点击
    // 把展开体留在展开态，压到终点再放行。只认点击，流式追加与自动开合都不受影响
    ctx.effect(() => installFoldGlide(), "dsh-chat-ux: fold glide")

    // 发送气泡的形变：读者按下发送以后，整张输入卡片（连工具栏与草稿）收成落点那条气泡。开关关掉时
    // 连起点都不量
    ctx.effect(() => installSendFlight(() => settings.sendFlight), "dsh-chat-ux: send flight")

    // 内置的文件变更行只给根调用画 diff 卡片（diff-card-model 第一行就按 parentCallId 排除），
    // 所以 run_code 的程序里派发出去的 write 与 edit 拿不到行尾那截 +n -m。这一处用 -1 的遮挡等级
    // 在 edit 与 write 两个座位上接管那一行：keyed 座位按 priority 升序取最低的那个渲染，内置那两行是默认的 0。
    // 第二项是准备态那两个数的开关（默认开着）
    installFileMutationRow(services.slots, () => settings.liveDiff)

    // 输入框下方那枚「缓存命中」胶囊也归这一处：dsh 内置的那一枚只到整数，也没有档位色。这里用同一个 id
    // 与 order、更低的 priority 接管它（内置是默认的 0），换成恒取一位小数、按四档取色的那一枚；
    // 档位读的是 dsh 自己那份 ui-chat 表单，读者的「简洁」与「详细」照旧生效
    installCacheHitPill(services.slots, services.configForms)

    ctx.effect(
        () => {
            syncPie()
            return () => {
                pieDispose?.()
                pieDispose = null
            }
        },
        "dsh-chat-ux: context meter pie",
    )

    // 插件管理页把 plugins.bundle.config 声明成它自己 main 注册的子项，所以那一页在的时候这个座位就在。
    // inject 会等那个声明而不是抛错，这也正是注册写在回调里、而不是写在 apply 执行时的原因
    services.slots.inject("plugins.bundle.config", () =>
        services.slots.register(
            {
                name: "plugins.bundle.config",
                key: PACKAGE_NAME,
                inject: () => {
                    const locale = services.reflect.get("locale")
                    return {scope, locale: locale == null ? undefined : locale as LocaleLike}
                },
            },
            ChatUxConfigCard,
        ),
    )
}

// 这一半读到的配置，镜像在一份可变对象里：文件变更行由自己的模块现读，其余几项都由 syncSettings 重落
interface ChatUxSettings {
    // 思考行与过程组是否自己开合，改一次就得重落一次
    autoFold: boolean
    // 插入符动效的档位
    caret: CaretMotionMode

    // 上下文占用那圈环是否换成实心饼图，改一次就得重落一次（装或卸）
    pie: boolean
    // 输入框玻璃开着没有。它是 body 上的一层常驻状态，改一次就得重落一次
    glass: boolean
    // 文件变更行的 +n -m 是否在准备态就长出来，那一行在渲染期现读它
    liveDiff: boolean
    // 工具调用与思考行出现时是否补一次底，改一次就得重落一次（装或卸）
    followOn: boolean
    // 发送气泡是否走形变（整张卡片收成气泡），改一次就得重落一次
    sendFlight: boolean
    // 纸感总开关。它不只是画不画，还决定整页底色那几条令牌写不写
    paperOn: boolean
    // 左侧栏是否也铺纸。材质平台（darwin、Windows 11 acrylic）上读者想留着侧栏的窗口材质时关掉它
    paperSidebar: boolean
}

// dsh 那份 ui-chat 表单里这一处只读一个字段：completion（默认）或 next-input
interface ChatSettingsLike {
    collapseTiming?: string | null | undefined
}

// dsh 的聊天设置条目 id；工作步骤展示与收起时机都住在它里面
const CHAT_SETTINGS_NAMESPACE = "ui-chat"

// 共享配置表单的提供者，收窄到 get
interface ConfigFormsService {
    get<T>(entryId: string): ConfigForm<T>
}

// 这一半通过 context 够到的那些平台服务
interface ClientServices {
    slots: SlotsService
    configForms: ConfigFormsService
    reflect: { get(name: string): unknown }
}

/**
 * 这个包的 npm 名。自 dsh 0.1.6 起，插件管理页把 plugins.bundle.config 按 bundle 的包名索引，
 * 而不是按设置命名空间，所以下面两个字符串都需要，且不能混为一谈
 */
const PACKAGE_NAME = "@alm-allen/dsh-chat-ux"

// 配置条目 id；设置服务按它标识一份表单
const SETTINGS_NAMESPACE = "dsh-chat-ux"
