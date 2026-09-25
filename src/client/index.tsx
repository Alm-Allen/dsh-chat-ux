/**
 * dsh-chat-ux —— 浏览器半区。
 *
 * DSH 通过 `exports["./client"]` 加载这个模块。产物由 `tsc -p tsconfig.client.json` 加上
 * `scripts/wrap-client.cjs` 生成，后者把 CommonJS 产物包成客户端模块加载器要求的那个单文件
 * `window.__ModuleLoader__.load({...})` bundle。
 *
 * 读者看得见的一切都归这一半：聊天区样式表、token 淡入、思考行的自动展开与收起、过程组的自动
 * 开合、折叠过渡、跟随守护、输入框插入符的位移过渡，以及插件管理页渲染的配置卡片。它还读 `dsh-chat-ux` 这一行的共享
 * config form——这一页上改的值就是这样到达效果里的，不用刷新。
 *
 * @module dsh-chat-ux/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installCaretMotion } from './caret-motion'
import type { CaretMotionMode } from './caret-motion'
import { installFileMutationRow } from './file-mutation-row'
import type { SlotsService } from './file-mutation-row'
import { installFoldGlide } from './fold-glide'
import { installFollowGuard } from './follow-guard'
import { applyFontChoice, clearFontChoice } from './font-override'
import type { FontChoice } from './font-override'
import { installProcessFollow } from './process-follow'
import { installProcessFold } from './process-fold'
import { installReasoningFold } from './reasoning-fold'
import { ChatUxConfigCard } from './settings-card'
import { DEFAULT_CARET_MOTION, DEFAULT_EMBEDDED_FONTS, DEFAULT_ENHANCED_FOLLOW, DEFAULT_FONT_FAMILY } from './settings-scope'
import type { ChatUxSection, ConfigForm, LocaleLike } from './settings-scope'
import { ALL_CSS, STYLE_ID } from './styles'
import { installTokenMotion } from './token-motion'

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
    caret: DEFAULT_CARET_MOTION,
    font: { embedded: DEFAULT_EMBEDDED_FONTS, sans: DEFAULT_FONT_FAMILY, code: DEFAULT_FONT_FAMILY },
  }

  // 插入符动效与字体两项不是「每一轮现读」，而是常驻的 DOM 状态：配置一改就得重落一次（卡片上保存完
  // 不必刷新页面），插件卸下时也要把写过的东西撤干净。所以订阅由这里拿着，syncSettings 是唯一的入口。
  const caret = installCaretMotion(() => settings.caret)
  const syncSettings = (): void => {
    const value = scope.getSnapshot().value
    settings.follow = value?.enhancedFollow ?? DEFAULT_ENHANCED_FOLLOW
    settings.caret = value?.caretMotion ?? DEFAULT_CARET_MOTION
    settings.font.embedded = value?.fonts ?? DEFAULT_EMBEDDED_FONTS
    settings.font.sans = value?.fontSans ?? DEFAULT_FONT_FAMILY
    settings.font.code = value?.fontCode ?? DEFAULT_FONT_FAMILY
    applyFontChoice(settings.font)
    caret.resync()
  }
  syncSettings()
  ctx.effect(() => scope.subscribe(syncSettings), 'dsh-chat-ux: settings mirror')
  ctx.effect(() => caret.dispose, 'dsh-chat-ux: caret motion')
  ctx.effect(() => clearFontChoice, 'dsh-chat-ux: font override')

  // 思考和正文都渲染在 Markdown 层那个流式容器里，所以一处安装就覆盖整段回答。
  ctx.effect(() => installTokenMotion(), 'dsh-chat-ux: token reveal')

  // dsh 把每一行思考行都发成收起的，也没有为它暴露任何设置，所以这一行自己的控件是唯一的杆。
  // 模块里写明了「按阶段让位」这套作用域，它让读者自己的折叠不被覆盖。
  ctx.effect(() => installReasoningFold(), 'dsh-chat-ux: reasoning reveal')

  // 「简洁」与「标准」两档下，运行中的过程组体初始是收起的，读者得自己点开才看得见模型在做什么。
  // 这一处让它在过程还在跑时开着，这一段过程结束（最终正文该出来了）时收回去。
  ctx.effect(() => installProcessFold(), 'dsh-chat-ux: process groups')

  // 跟随偶尔会丢，而丢的那一刻几乎总是结构事件的时刻：思考行收起、工具行插入。这一处挑那些时刻
  // 把滚动位置交还给 dsh 的跟随；开关关着时它一次都不动手。
  ctx.effect(() => installFollowGuard(() => settings.follow), 'dsh-chat-ux: follow guard')

  // 组体那一层的跟随是另一回事：标准与简洁两档把过程收进封顶的组体，dsh 用平滑滚动追它，而
  // 平滑滚动追不上匀速增长的内容，位置就长期停在离底几十像素的地方。这一处在它旁边补一次钉底。
  ctx.effect(() => installProcessFollow(() => settings.follow), 'dsh-chat-ux: process follow')

  // 折叠时下方内容直接瞬移，读者看不出「推开」这件事。展开体自己是卸掉的，CSS 没有可过渡的
  // 旧值，所以这一处走 FLIP：点击时先记下视口内每个流块的坐标，DOM 变化后用 transform 把它们
  // 拉回旧位置再播到新位置。只认点击，流式追加与自动开合都不受影响。
  ctx.effect(() => installFoldGlide(), 'dsh-chat-ux: fold glide')

  // 内置的文件变更行只给**根调用**画 diff 卡片（diff-card-model 第一行就按 parentCallId 排除），
  // 所以 run_code 的程序里派发出去的 write / edit 拿不到行尾那截 `+n -m`。这一处用 -1 的遮蔽
  // 等级在 edit / write 两个座位上接管那一行——keyed 座位按 priority 升序取最低的那个渲染，
  // 内置那两行是默认的 0。
  installFileMutationRow(services.slots)

  // 插件管理页把 `plugins.bundle.config` 声明成它自己 `main` 注册的子项，所以那一页在的时候
  // 这个座位就在。`inject` 会等那个声明而不是抛错，这也正是注册写在回调里、而不是写在 apply
  // 执行时的原因。
  services.slots.inject('plugins.bundle.config', () =>
    services.slots.register(
      {
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        inject: () => ({
          scope,
          locale: services.reflect.get('locale') as LocaleLike | undefined,
        }),
      },
      ChatUxConfigCard,
    ),
  )

  console.log('[dsh-chat-ux] client half loaded')
}

/** 这一半读到的配置，镜像在一份可变对象里：跟随那几处每轮现读它，插入符与字体由 `syncSettings` 重落。 */
interface ChatUxSettings {
  /** 增强跟随。 */
  follow: boolean
  /** 插入符动效的档位。 */
  caret: CaretMotionMode
  /** 字体那三项，原样交给 `applyFontChoice`。 */
  font: FontChoice
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
const PACKAGE_NAME = 'dsh-chat-ux'

/** 配置条目 id；设置服务按它标识一份表单。 */
const SETTINGS_NAMESPACE = 'dsh-chat-ux'
