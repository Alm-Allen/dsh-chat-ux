/**
 * dsh-chat-ux —— 浏览器半区。
 *
 * DSH 通过 `exports["./client"]` 加载这个模块。产物由 `tsc -p tsconfig.client.json` 加上
 * `scripts/wrap-client.cjs` 生成，后者把 CommonJS 产物包成客户端模块加载器要求的那个单文件
 * `window.__ModuleLoader__.load({...})` bundle。
 *
 * 读者看得见的一切都归这一半：聊天区样式表、token 淡入，以及插件管理页渲染的配置卡片。它还读
 * host 半区注册的 `dsh-chat-ux` 设置命名空间——这一页上改的值就是这样到达效果里的，不用刷新。
 *
 * @module dsh-chat-ux/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { CARD_CSS } from './config-card-styles'
import { ChatUxConfigCard } from './settings-card'
import type { LocaleLike, SettingsScope } from './settings-scope'
import { installReasoningFold } from './reasoning-fold'
import { CHAT_AREA_CSS, STYLE_ID } from './styles'
import { ChatUxUserBubble } from './user-bubble'
import { USER_BUBBLE_CSS } from './user-bubble-styles'
import { DEFAULT_REVEAL_MS, clampRevealMs, installTokenMotion } from './token-motion'

/**
 * 这个包的 npm 名。自 dsh 0.1.6 起，插件管理页把 `plugins.bundle.config` 按 **bundle** 的包名
 * 索引，而不是按设置命名空间，所以下面两个字符串都需要，且不能混为一谈。
 */
const PACKAGE_NAME = 'dsh-chat-ux'

/** 设置命名空间；host 半区就是把它注册在这个字符串下的。 */
const SETTINGS_NAMESPACE = 'dsh-chat-ux'

/**
 * 必须的客户端服务。`settingsScope.bind` 是从**调用方** context 上读 `connection` 与 `remote`
 * 的，所以这两个必须和这一半自己用的那两个服务一起声明；`slots` 承载插件管理页那个座位。
 *
 * locale 服务刻意不在其中：卡片通过 `ctx.reflect` 读它，而没有 locale 插件时 `reflect` 返回
 * undefined、不会抛错，所以没有它的部署照样能得到一张能用的卡片。
 */
export const inject: string[] = ['slots', 'settingsScope', 'connection', 'remote']

/** 槽位注册表，收窄到这一半会发出的两次调用。 */
interface SlotsService {
  inject(name: string, callback: () => () => void): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** 设置 scope 的绑定器，收窄到 `bind`。 */
interface SettingsScopeBinder {
  bind(spec: { namespace: string }): SettingsScope
}

/** 这一半通过 context 够到的那些平台服务。 */
interface ClientServices {
  slots: SlotsService
  settingsScope: SettingsScopeBinder
  reflect: { get(name: string): unknown }
}

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
    // 一张样式表承载浏览器这侧的全部内容：聊天区规则、配置卡片的、以及替换用户气泡的。
    style.textContent = CHAT_AREA_CSS + '\n' + CARD_CSS + '\n' + USER_BUBBLE_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'dsh-chat-ux: chat-area stylesheet')

  // 淡入在每一个绘制帧上通过这个小格子读时长，所以插件管理页上的保存不必重新安装效果就能生效，
  // 也不会丢掉正在飞的区间。
  const scope = services.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
  const motion = { revealMs: DEFAULT_REVEAL_MS }
  const sync = (): void => {
    motion.revealMs = clampRevealMs(scope.getSnapshot().value?.revealMs)
  }
  sync()
  ctx.effect(() => scope.subscribe(sync), 'dsh-chat-ux: settings mirror')

  // 思考和正文都渲染在 Markdown 层那个流式容器里，所以一处安装就覆盖整段回答。
  ctx.effect(() => installTokenMotion(() => motion.revealMs), 'dsh-chat-ux: token reveal')

  // dsh 把每一行思考行都发成收起的，也没有为它暴露任何设置，所以这一行自己的控件是唯一的杆。
  // 模块里写明了「按阶段让位」这套作用域，它让读者自己的折叠不被覆盖。
  ctx.effect(() => installReasoningFold(), 'dsh-chat-ux: reasoning reveal')

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

  // dsh 用 MarkdownText 渲染回答，却用 projectUserText 渲染读者自己的消息，而后者只装饰引用、
  // 什么都不解析——所以读者自己气泡里打的反引号路径保持字面量。这里把两种用户书写的消息都挪到
  // markdown 渲染器上。
  //
  // 这个座位是 keyed 的，槽位契约渲染一个 key 下 priority **最低**的那个，而官方注册没传
  // priority（默认 0）。所以负 priority 才是让这次注册成为替换的原因；在 0 上注册，会变成同 key
  // 同 priority 的第二个占位者，直接抛错。
  for (const key of ['user', 'steering'] as const) {
    services.slots.inject('conversation.chat.node', () =>
      services.slots.register(
        { name: 'conversation.chat.node', key, priority: -1 },
        ChatUxUserBubble,
      ),
    )
  }

  console.log('[dsh-chat-ux] client half loaded')
}
