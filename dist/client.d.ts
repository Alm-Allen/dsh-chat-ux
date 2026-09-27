window.__ModuleLoader__.load({
  id: "@alm-allen/dsh-chat-ux",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
import { Context } from "@deepseek-ai/cordis";
//#region src/client/index.d.ts
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
 * @param ctx - 客户端根 context。
 */
export declare function apply(ctx: Context): void;
//#endregion
    return module.exports;
  }
});