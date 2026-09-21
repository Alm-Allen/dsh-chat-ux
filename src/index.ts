/**
 * dsh-chat-ux —— host 半区。
 *
 * 聊天区本身由浏览器半区渲染（见 `src/client/`），DSH 之所以从 `exports["./client"]` 加载它，
 * 是因为这个包声明了 `dsh.client`。这一半拥有只有 host 才能拥有的东西：承载聊天区偏好的那个
 * 设置命名空间，好让插件管理页能编辑它们、`settings.yaml` 能留着它们。
 *
 * 两半只对齐两个字符串——命名空间和字段名——别的什么都不共享。浏览器半区通过自己的 settings
 * scope 读这个命名空间；这一半把它注册给设置服务，并且从不看它的值，因为这些值的消费者全在浏览器里。
 *
 * @module dsh-chat-ux
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

/** 报给加载器的插件名；同时也是它拥有的设置命名空间。 */
export const name = 'dsh-chat-ux'

/**
 * 这个插件拥有的设置命名空间。浏览器半区把它的 settings scope 绑在这个字符串上，所以两半必须
 * 一字不差地拼出它。
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-ux'

/** 一个被揭开的字符回到文字本色所用的默认时长。 */
export const DEFAULT_REVEAL_MS = 120

/**
 * 渐变时长的边界。浏览器半区会 clamp 到同一个范围，所以直接写进 `settings.yaml` 的值也没法
 * 要求一个分档的 highlight 规则采样不出来的渐变：在 `MAX_REVEAL_MS` 上，一档仍然能撑约一显示帧。
 */
export const MIN_REVEAL_MS = 30
export const MAX_REVEAL_MS = 600

/** 这个插件拥有的设置分节。 */
export interface Config {
  /**
   * 一个刚揭开的字符从高亮色淡回文字本色所用的时长。越小越快。
   */
  revealMs: number
}

/**
 * 设置服务解析这个命名空间所用的 schema。这里的默认值就是任何人编辑这个分节之前读者看到的值。
 */
export const Config: Schema<Config> = Schema.object({
  revealMs: Schema.number().min(MIN_REVEAL_MS).max(MAX_REVEAL_MS).default(DEFAULT_REVEAL_MS),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 设置服务；在没有挂载任何 provider 的部署上不存在。 */
    settings: {
      installSection(
        owner: Context,
        ns: string,
        schema: unknown,
        entry: unknown,
        hooks: { setSource: (source: () => unknown) => void; onChange: () => void },
      ): void
    }
  }
}

/**
 * host 侧入口。
 *
 * 注册命名空间就是 host 侧的全部工作：设置服务把 schema 默认值、这一行的组合配置和用户层合起来，
 * 再把结果交给每一个配置界面。没有这个服务时插件照样加载，浏览器半区只是退回它自己的默认值。
 *
 * @param ctx - host 根 context。
 * @param config - 这一行的组合配置，用作 `base` 层。
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
      // host 不从分节里读任何东西：浏览器半区是唯一的消费者，而它读的是自己的 settings scope。
      setSource: () => {},
      onChange: () => {},
    })
  })
  console.log('[dsh-chat-ux] host half loaded')
}
