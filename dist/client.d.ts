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
import type { Context as ClientContext } from "@deepseek-ai/cordis";
/**
 * 必须的客户端服务：slots 承载插件管理页那个座位，configForms 提供这个插件的配置表单。
 * 后者由 @deepseek-ai/dsh-client-ui-settings 提供，而它自己声明了 remote 与 remote.settings，
 * 所以这一半不用再直接依赖那两个服务
 *
 * locale 服务刻意不在其中：卡片通过 ctx.reflect 读它，而没有 locale 插件时 reflect 返回 undefined、不抛错，
 * 所以没有它的部署照样能得到一张能用的卡片
 *
 * remote 与 sessions 也不在这里，理由不同：它们缺席时整块插件都不该消失，只有完成通知那一条用不了。
 * 那一条自己用 ctx.inject(["remote", "sessions"], …) 等它们就绪，见下面 syncNotify 之前那段注释
 */
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
