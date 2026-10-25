/**
 * dsh-chat-ux 的浏览器半区。
 *
 * 这里注入聊天区样式，并按共享配置表单装、卸各项效果；具体机制归各模块，入口只负责生命周期与开关。
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/**
 * 必须的客户端服务：`slots` 承载插件管理页那个座位，`configForms` 提供这个插件的配置表单。
 * 后者由 `@deepseek-ai/dsh-client-ui-settings` 提供，而它自己声明了 `remote` 与 `remote.settings`，
 * 所以这一半不用再直接依赖那两个服务。
 *
 * locale 服务刻意不在其中：卡片通过 `ctx.reflect` 读它，而没有 locale 插件时 `reflect` 返回
 * undefined、不会抛错，所以没有它的部署照样能得到一张能用的卡片。
 */
export declare const inject: string[];
/**
 * 浏览器侧入口。
 */
export declare function apply(ctx: ClientContext): void;
