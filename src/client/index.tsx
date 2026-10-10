/**
 * dsh-chat-ux —— 浏览器半区。
 *
 * DSH 通过 `exports["./client"]` 加载这个模块。产物由 `tsc -p tsconfig.client.json` 加上
 * `scripts/wrap-client.cjs` 生成，后者把 CommonJS 产物包成客户端模块加载器要求的那个单文件
 * `window.__ModuleLoader__.load({...})` bundle。
 *
 * 读者看得见的一切都归这一半：聊天区样式表、token 淡入、思考行的自动展开与收起、过程组的自动
 * 开合、折叠过渡、跟随守护、输入框插入符的位移过渡、提交后气泡的起飞、输入框那块玻璃、轨迹视图里
 * 收掉输入区、网页端「工作步骤展示」的默认档位，以及插件管理页渲染的配置卡片。它还读 `dsh-chat-ux` 这一行的共享 config form——这一页
 * 上改的值就是这样到达效果里的，不用刷新。
 *
 * @module dsh-chat-ux/client
 */
import type {Context as ClientContext} from '@deepseek-ai/cordis'
import {installCaretMotion} from './chat/caret/caret-motion'
import type {CaretMotionMode} from './chat/caret/caret-motion'
import {installCacheHitPill} from './chat/cache-hit/cache-hit-pill'
import {installComposerGlass} from './chat/composer-glass/composer-glass'
import {GLASS_ATTRIBUTE} from './chat/composer-glass/composer-glass-styles'
import {installContextMeterPie} from './chat/context-meter/context-meter-pie'
import {installFileMutationRow} from './chat/file-mutation/file-mutation-row'
import type {SlotsService} from './chat/file-mutation/file-mutation-row'
import {installFoldGlide} from './chat/fold/fold-glide'
import {installFollowGuard} from './chat/follow/follow-guard'
import {installProcessFollow} from './chat/follow/process-follow'
import {installProcessFold} from './chat/fold/process-fold'
import {installReasoningFold} from './chat/fold/reasoning-fold'
import {installSendFlight} from './chat/send-flight/send-flight'
import {ChatUxConfigCard} from './settings/settings-card'
import {
    DEFAULT_AUTO_FOLD, DEFAULT_CARET_MOTION, DEFAULT_COMPOSER_GLASS, DEFAULT_ENHANCED_FOLLOW,
    DEFAULT_LIVE_DIFF, DEFAULT_PIE_PUSH, DEFAULT_SEND_FLIGHT, DEFAULT_TOKEN_FADE,
} from './settings/settings-scope'
import type {ChatUxSection, ConfigForm, LocaleLike} from './settings/settings-scope'
import {applyTranscriptViewDefault} from './settings/transcript-default'
import {ALL_CSS, STYLE_ID} from './styles'
import {installTokenMotion} from './chat/token-motion'

/**
 * 必须的客户端服务：`slots` 承载插件管理页那个座位，`configForms` 提供这个插件的配置表单。
 * 后者由 `@deepseek-ai/dsh-client-ui-settings` 提供，而它自己声明了 `remote` 与 `remote.settings`，
 * 所以这一半不用再直接依赖那两个服务。
 *
 * locale 服务刻意不在其中：卡片通过 `ctx.reflect` 读它，而没有 locale 插件时 `reflect` 返回
 * undefined、不会抛错，所以没有它的部署照样能得到一张能用的卡片。
 */
export const inject: string[] = ['slots', 'configForms']

/**
 * 浏览器侧入口。
 * @param ctx - 客户端根 context。
 */
export function apply(ctx: ClientContext): void {
    const services = ctx as unknown as ClientServices

    ctx.effect(() => {
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.dataset.plugin = 'dsh-chat-ux'
        // 一张样式表承载浏览器这侧的全部内容：聊天区规则、配置卡片、文件变更行、折叠体入场、字体接管。
        // 那几份 CSS 由 `styles.ts` 的 `ALL_CSS` 拼起来，这里不再逐个模块地认。
        style.textContent = ALL_CSS
        document.head.appendChild(style)
        return () => style.remove()
    }, 'dsh-chat-ux: chat-area stylesheet')

    // 这一份镜像在每一轮效果里现读，所以插件管理页上改完不必重新安装任何东西，也不会丢掉正在跑的
    // 定时器。平台把原来的 settings scope 换成了按 Host 条目 id 取的共享表单。这个值仍叫 scope：
    // 插件管理页给这个座位的 owner props 里已经有一个 `form`，注入面再用同名就会撞上去。
    const scope = services.configForms.get<ChatUxSection>(SETTINGS_NAMESPACE)
    const settings: ChatUxSettings = {
        follow: DEFAULT_ENHANCED_FOLLOW,
        autoFold: DEFAULT_AUTO_FOLD,
        caret: DEFAULT_CARET_MOTION,
        sendOn: DEFAULT_SEND_FLIGHT,
        tokenFade: DEFAULT_TOKEN_FADE,
        piePush: DEFAULT_PIE_PUSH,
        glass: DEFAULT_COMPOSER_GLASS,
        liveDiff: DEFAULT_LIVE_DIFF,
    }

    // 插入符动效与字体两项不是「每一轮现读」，而是常驻的 DOM 状态：配置一改就得重落一次（卡片上保存完
    // 不必刷新页面），插件卸下时也要把写过的东西撤干净。所以订阅由这里拿着，syncSettings 是唯一的入口。
    const caret = installCaretMotion(() => settings.caret)
    const tokenMotion = installTokenMotion(() => settings.tokenFade)
    // 上下文占用那个圆也归这一处：dsh 画的是环、也没有档位色。它不是座位（InputBar 直接渲染的那
    // 一个），接不过来，所以从 DOM 上认它——只写读数与档位，形状与颜色由样式表接。开关决定折线切开
    // 之后那一块推不推出去，所以它也由 syncSettings 重落一次。
    const pie = installContextMeterPie(() => settings.piePush)
    // 自动开合是「装了才有」的两块（思考行、过程组）：开关关掉时两块都卸下，页面上一次都不动手。
    // 设置一改就得重落，所以那一次的卸载函数由这里拿着，syncSettings 是唯一的入口。
    let autoFoldDispose: (() => void) | null = null
    const syncAutoFold = (): void => {
        if (!settings.autoFold) {
            autoFoldDispose?.()
            autoFoldDispose = null
            return
        }
        if (autoFoldDispose !== null) return
        const disposeReasoning = installReasoningFold()
        const disposeProcess = installProcessFold()
        autoFoldDispose = () => {
            disposeReasoning()
            disposeProcess()
        }
    }
    // 输入框那块玻璃：属性在，样式表里那一整块才命中；量卡片位置的那个观察者也只有这时候才装。
    // 关掉时两样一起撤——观察者不跑，属性也摘掉，页面上一次都不动手。
    let glassDispose: (() => void) | null = null
    const syncGlass = (): void => {
        if (!settings.glass) {
            glassDispose?.()
            glassDispose = null
            document.body.removeAttribute(GLASS_ATTRIBUTE)
            return
        }
        document.body.setAttribute(GLASS_ATTRIBUTE, '')
        if (glassDispose !== null) return
        glassDispose = installComposerGlass()
    }
    const syncSettings = (): void => {
        const value = scope.getSnapshot().value
        settings.follow = value?.enhancedFollow ?? DEFAULT_ENHANCED_FOLLOW
        settings.autoFold = value?.autoFold ?? DEFAULT_AUTO_FOLD
        settings.caret = value?.caretMotion ?? DEFAULT_CARET_MOTION
        settings.sendOn = value?.sendFlight ?? DEFAULT_SEND_FLIGHT
        settings.tokenFade = value?.tokenFade ?? DEFAULT_TOKEN_FADE
        settings.piePush = value?.piePush ?? DEFAULT_PIE_PUSH
        settings.glass = value?.composerGlass ?? DEFAULT_COMPOSER_GLASS
        settings.liveDiff = value?.liveDiff ?? DEFAULT_LIVE_DIFF
        syncGlass()
        caret.resync()
        tokenMotion.resync()
        pie.resync()
        syncAutoFold()
    }
    syncSettings()
    ctx.effect(() => scope.subscribe(syncSettings), 'dsh-chat-ux: settings mirror')
    ctx.effect(() => caret.dispose, 'dsh-chat-ux: caret motion')
    ctx.effect(
        () => {
            syncGlass()
            return () => {
                glassDispose?.()
                glassDispose = null
                document.body.removeAttribute(GLASS_ATTRIBUTE)
            }
        },
        'dsh-chat-ux: composer glass',
    )

    // dsh 自己按客户端给「工作步骤展示」的默认值：桌面端「标准」、网页端「详细」。这个插件的过程组
    // 行为是照着「标准」与「简洁」两档做的，所以网页端在读者没自己选过时补一次「标准」——读者选过
    // 之后一次都不再动手。
    ctx.effect(() => applyTranscriptViewDefault(services.configForms), 'dsh-chat-ux: work details default')

    // 提交之后 dsh 会立刻挂一条「即发即显」的回显气泡，外观与真实消息一模一样。这一处给它补上从
    // 输入框收成那条气泡的那一段：起点（整张输入卡片）在清空草稿之前抓，终点由 dsh 自己那条气泡决定。
    // 这一项默认开着，所以每一段起手前先读一次开关——关着时它连起点都不量。整段时长
    // 不是一个设置项，它是 send-morph 里的 FLIGHT_MS。
    ctx.effect(
        () => installSendFlight(() => settings.sendOn),
        'dsh-chat-ux: send flight',
    )

    // 思考和正文都渲染在 Markdown 层那个流式容器里，所以一处安装就覆盖整段回答。开关关着时它整块
    // 不装：那二十几条档位规则、扫描观察者与绘制帧一个都不存在。
    ctx.effect(() => tokenMotion.dispose, 'dsh-chat-ux: token reveal')

    // 思考行与过程组归同一个开关：dsh 把每一行思考行都发成收起的，也没有为它暴露任何设置；
    // 「简洁」与「标准」两档下，运行中的过程组体初始也是收起的。两处都让它们在过程还在跑时开着、
    // 这一段结束再收回去（模块里写明了「按阶段让位」，读者自己动过手的不被覆盖）。装与卸都在
    // syncAutoFold 里，读者在卡片上关掉就一起停。
    ctx.effect(() => {
        syncAutoFold()
        return () => {
            autoFoldDispose?.()
            autoFoldDispose = null
        }
    }, 'dsh-chat-ux: auto fold')

    // 跟随偶尔会丢，而丢的那一刻几乎总是结构事件的时刻：思考行收起、工具行插入。这一处挑那些时刻
    // 把滚动位置交还给 dsh 的跟随；开关关着时它一次都不动手。
    ctx.effect(() => installFollowGuard(() => settings.follow), 'dsh-chat-ux: follow guard')

    // 组体那一层的跟随是另一回事：标准与简洁两档把过程收进封顶的组体，dsh 用平滑滚动追它，而
    // 平滑滚动追不上匀速增长的内容，位置就长期停在离底几十像素的地方。这一处在它旁边补一次钉底。
    ctx.effect(() => installProcessFollow(() => settings.follow), 'dsh-chat-ux: process follow')

    // 折叠时下方内容直接瞬移，读者看不出「推开」这件事。展开体自己是卸掉的，CSS 没有可过渡的
    // 旧值，所以这一处从 DOM 之外接管：动真身的高度，让布局逐帧长出来、逐帧收回去——收起方向靠
    // 拦下那次点击把真身留在展开态，压到终点再放行。只认点击，流式追加与自动开合都不受影响。
    ctx.effect(() => installFoldGlide(), 'dsh-chat-ux: fold glide')

    // 内置的文件变更行只给**根调用**画 diff 卡片（diff-card-model 第一行就按 parentCallId 排除），
    // 所以 run_code 的程序里派发出去的 write / edit 拿不到行尾那截 `+n -m`。这一处用 -1 的遮蔽
    // 等级在 edit / write 两个座位上接管那一行——keyed 座位按 priority 升序取最低的那个渲染，
    // 内置那两行是默认的 0。第二项是准备态那两个数的开关（默认关，卡片上标 beta）。
    installFileMutationRow(services.slots, () => settings.liveDiff)

    // 输入框下方那枚「缓存命中」胶囊也归这一处：dsh 内置的那一枚只到整数，也没有档位色。这里用同
    // 一个 id 与 order、更低的 priority 接管它（内置是默认的 0），换成恒取一位小数、按四档取色的
    // 那一枚；档位读的是 dsh 自己那份 ui-chat 表单，读者的「简洁 / 详细」照旧生效。
    installCacheHitPill(services.slots, services.configForms)

    ctx.effect(() => pie.dispose, 'dsh-chat-ux: context meter pie')

    // 插件管理页把 `plugins.bundle.config` 声明成它自己 `main` 注册的子项，所以那一页在的时候
    // 这个座位就在。`inject` 会等那个声明而不是抛错，这也正是注册写在回调里、而不是写在 apply
    // 执行时的原因。
    services.slots.inject('plugins.bundle.config', () =>
        services.slots.register(
            {
                name: 'plugins.bundle.config',
                key: PACKAGE_NAME,
                inject: () => {
                    const locale = services.reflect.get('locale')
                    return {scope, locale: locale == null ? undefined : locale as LocaleLike}
                },
            },
            ChatUxConfigCard,
        ),
    )

    // 启动图里这条 entry 的 rev 就是浏览器拿到的产物哈希：产物一改它就变，刷新页面看一眼控制台
    // 就知道浏览器拿到的是不是刚构建的那一份。没有启动图的场合问不出来。
    const boot = (window as unknown as {
        __DSH_BOOT__?: {
            entries?: readonly { id?: string | undefined; rev?: string | undefined }[] | undefined
        } | undefined
    }).__DSH_BOOT__
    console.log('[dsh-chat-ux] client half loaded', {
        rev: boot?.entries?.find(entry => entry.id === PACKAGE_NAME)?.rev ?? 'unknown',
    })
}

/** 这一半读到的配置，镜像在一份可变对象里：跟随那几处每轮现读它，插入符与字体由 `syncSettings` 重落。 */
interface ChatUxSettings {
    /** 增强跟随。 */
    follow: boolean
    /** 思考行与过程组是否自己开合；改一次就得重落一次。 */
    autoFold: boolean
    /** 插入符动效的档位。 */
    caret: CaretMotionMode
    /** 聊天气泡动效开着没有，每一段起手前现读。 */
    sendOn: boolean
    /** token 淡入开着没有；它整块装不装由 `syncSettings` 重落。 */
    tokenFade: boolean
    /** 上下文占用那枚饼：折线切开之后那一块推不推出去；改一次就得重画一次。 */
    piePush: boolean
    /** 输入框那块玻璃开着没有；它是 body 上的一层常驻状态，改一次就得重落一次。 */
    glass: boolean
    /** 文件变更行的 `+n -m` 是否在准备态就长出来；那一行在渲染期现读它。 */
    liveDiff: boolean
}

/** 共享配置表单的提供者，收窄到 `get`。 */
interface ConfigFormsService {
    get<T>(entryId: string): ConfigForm<T>
}

/** 这一半通过 context 够到的那些平台服务。 */
interface ClientServices {
    slots: SlotsService
    configForms: ConfigFormsService
    reflect: { get(name: string): unknown }
}

/**
 * 这个包的 npm 名。自 dsh 0.1.6 起，插件管理页把 `plugins.bundle.config` 按 **bundle** 的包名
 * 索引，而不是按设置命名空间，所以下面两个字符串都需要，且不能混为一谈。
 */
const PACKAGE_NAME = '@alm-allen/dsh-chat-ux'

/** 配置条目 id；设置服务按它标识一份表单。 */
const SETTINGS_NAMESPACE = 'dsh-chat-ux'
