/**
 * dsh-chat-ux —— 后端。
 *
 * 聊天区本身由前端渲染（见 `src/client/`），DSH 之所以从 `exports["./client"]` 加载它，
 * 是因为这个包声明了 `dsh.client`。这一半现在只剩一件事：让这一行存在。设置服务把 `Config` 里
 * 标了 `.volatile()` 的字段投影成表单，值由前端通过自己的 config form 读写，host 侧不注册任何
 * 东西，也从不看它的值——这些值的消费者全在浏览器里。
 *
 * @module dsh-chat-ux
 */
import type { Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

// 报给加载器的插件名；同时也是这一行在 profile 里的条目 id。
export const name = 'dsh-chat-ux'

/**
 * 前端绑定 config form 用的那个字符串。设置服务按 **profile 条目 id** 标识一份表单，而这个 id 就是
 * 上面那个插件名，所以前后端必须一字不差地拼出它。
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-ux'

// 一个被揭开的字符回到文字本色所用的默认时长。
export const DEFAULT_REVEAL_MS = 120

/**
 * 渐变时长的边界。前端会 clamp 到同一个范围，所以直接写进 profile patch 的值也没法
 * 要求一个分档的 highlight 规则采样不出来的渐变：在 `MAX_REVEAL_MS` 上，一档仍然能撑约一显示帧。
 */
export const MIN_REVEAL_MS = 30
export const MAX_REVEAL_MS = 600

// 这个插件拥有的配置字段。
export interface Config {
  // 一个刚揭开的字符从高亮色淡回文字本色所用的时长。越小越快。
  revealMs: Volatile<number>
}

/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export const Config = Schema.object({
  revealMs: Schema.number().min(MIN_REVEAL_MS).max(MAX_REVEAL_MS).default(DEFAULT_REVEAL_MS).volatile(),
})

/**
 * host 侧入口。
 *
 * 什么都不注册：表单由设置服务从 `Config` 的 volatile 字段投影，值走前端自己的 config form。
 * 这个函数必须存在——client 半区是靠「启用的 Loader 条目」被组合进浏览器启动图的。
 */
export function apply(): void {
  console.log('[dsh-chat-ux] host half loaded')
}
