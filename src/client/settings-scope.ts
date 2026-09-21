/**
 * 这个半区消费的那一小片设置传输层。
 *
 * 浏览器半区通过客户端 settings scope（`ctx.settingsScope.bind`）与 host 半区持有的
 * `dsh-chat-ux` 命名空间对话。这里的形状是 `@deepseek-ai/dsh-client-ui-settings` 契约的
 * 本地复述，而不是 import：client bundle 必须保持单文件自包含，平台包由模块加载器在
 * 运行时解析，不参与编译。
 *
 * @module dsh-chat-ux/client/settings-scope
 */

/** host 解析出来的、本插件占用的那个分节。 */
export interface ChatUxSection {
  /** 渐变时长，单位毫秒；分节里唯一的字段。 */
  revealMs?: number
}

/**
 * 一个设置命名空间在客户端的同步状态。对映平台的 `SettingsScopeSnapshot`，
 * 收窄到本插件会读的那些字段。
 */
export interface SettingsSnapshot {
  /**
   * 第一个被接受的分节到达之前是 `loading`，有一个分节立着时是 `ready`，
   * 命名空间没有暴露给这个客户端时是 `unavailable`——也就是 host 半区从未被加载过时，
   * 浏览器看到的状态。
   */
  status: 'loading' | 'ready' | 'unavailable'
  /** 最后一次被接受的、经 schema 解析的分节；第一次接受之前是 undefined。 */
  value: ChatUxSection | undefined
  /** host 解析 `value` 时叠在上面的组合层。 */
  base: unknown
  /** 原始用户层；某个字段在这里「存在」才是被覆盖的标志。 */
  user: unknown
  /** 围栏下一次写入的命名空间版本号。 */
  revision: number | undefined
  /** host 文档是否接受写入。 */
  writable: boolean
  /** `host` 与 host 文档同步；`memory` 只活在当前页面进程里。 */
  mode: 'host' | 'memory'
}

/** 一个命名空间绑定的 scope：读它、观察它、写它。 */
export interface SettingsScope {
  getSnapshot(): SettingsSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/**
 * locale 服务，通过 `ctx.reflect` 读取，而不是声明成依赖：没有它的部署里，
 * 卡片退化成按浏览器语言显示，而不是干脆不挂载。
 */
export interface LocaleLike {
  getSnapshot(): { active?: string | null }
  subscribe(listener: () => void): () => void
}
