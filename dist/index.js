/**
 * dsh-chat-ux —— 后端。
 *
 * 聊天区本身由前端渲染（见 `src/client/`），DSH 之所以从 `exports["./client"]` 加载它，
 * 是因为这个包声明了 `dsh.client`。这一半做两件事：
 *
 * 1. 让这一行存在。设置服务把 `Config` 里标了 `.volatile()` 的字段投影成表单，值由前端通过
 *    自己的 config form 读写，host 侧不看这些值——它们的消费者全在浏览器里。
 * 2. 把包内 `assets/fonts/` 的字体子集挂到 dsh 的 web 服务器上。前端那几条 `@font-face` 从
 *    `/dsh-chat-ux/fonts/<file>` 取字，所以装插件的人不必自己装字体。Web 与桌面 App 是同一个
 *    页面：桌面 App 把 `dsh-app://app/` 下不属于 shell 的路径原样转发给 Host，两边同一条路径。
 *
 * 没有 web 服务器（例如 headless）时这里什么都不注册，前端会落到字体栈里的系统字体。
 *
 * @module dsh-chat-ux
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Schema from '@deepseek-ai/schemastery';
// 报给加载器的插件名；同时也是这一行在 profile 里的条目 id。
export const name = 'dsh-chat-ux';
/**
 * 前端绑定 config form 用的那个字符串。设置服务按 **profile 条目 id** 标识一份表单，而这个 id 就是
 * 上面那个插件名，所以前后端必须一字不差地拼出它。
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-ux';
/**
 * 增强跟随的默认值。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：它修的正是读者没碰过键鼠时的那一类丢失，而读者自己滚动离开底部时它一概不动手。
 */
export const DEFAULT_ENHANCED_FOLLOW = true;
/**
 * 自带字体是否默认接管界面。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：装插件的人不必自己装字体，两端看到的也是同一套字。
 */
export const DEFAULT_EMBEDDED_FONTS = true;
/**
 * 自定义字体栈的默认值。空串是「没有自定义」，也就是用插件自带的那两套。
 * 前端有一份同样的常量，改一处就要改另一处。
 */
export const DEFAULT_FONT_FAMILY = '';
/** 插入符动效的默认档位：凡是会挪窝的都给过渡。 */
export const DEFAULT_CARET_MOTION = 'typing';
/**
 * 聊天气泡动效默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认关着：这一段还在调，卡片上标着 beta，读者自己打开才算数。关着时页面上一次都不动手，
 * 看到的就是 dsh 原来的样子。
 */
export const DEFAULT_SEND_FLIGHT = false;
/**
 * token 淡入默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：它就是这个插件的主效果。关掉之后新字符直接以本色出现，页面上也不再挂那二十几条档位
 * 规则——所以它同时是排查性能问题时的一根对照杆。
 */
export const DEFAULT_TOKEN_FADE = true;
/**
 * 内嵌字体对外的路径前缀。前端 `client/font-styles.ts` 里有同一个字符串，改一处就要改另一处。
 */
export const FONT_ROUTE_PATH = '/dsh-chat-ux/fonts';
/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export const Config = Schema.object({
    enhancedFollow: Schema.boolean().default(DEFAULT_ENHANCED_FOLLOW).volatile(),
    caretMotion: Schema.union(['off', 'move', 'typing']).default(DEFAULT_CARET_MOTION).volatile(),
    fonts: Schema.boolean().default(DEFAULT_EMBEDDED_FONTS).volatile(),
    fontSans: Schema.string().default(DEFAULT_FONT_FAMILY).volatile(),
    fontCode: Schema.string().default(DEFAULT_FONT_FAMILY).volatile(),
    sendFlight: Schema.boolean().default(DEFAULT_SEND_FLIGHT).volatile(),
    tokenFade: Schema.boolean().default(DEFAULT_TOKEN_FADE).volatile(),
});
/**
 * host 侧入口。
 * @param ctx - host 根 context。
 */
export function apply(ctx) {
    console.log('[dsh-chat-ux] host half loaded');
    // 等 web 服务器出现再挂字体：它在 profile 里是另一行，不一定比这一行先激活。没有它的组合
    // （例如 headless）里这段回调不会跑，字体取不到，插件其余部分照常工作。
    ctx.inject(['webServer'], (scope) => {
        const webServer = scope.get('webServer');
        scope.effect(() => webServer.register({ kind: 'prefix', path: FONT_ROUTE_PATH, handler: serveFont }), 'dsh-chat-ux: embedded fonts');
    });
}
/** 包内字体目录。host 产物在 `dist/`，所以从这里回到包根。 */
const FONT_DIRECTORY = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
/**
 * 能被请求到的字体文件。用白名单而不是拼路径：请求里的任何一段都不该进文件系统。
 * 文件名与 `scripts/subset-fonts.py` 的产物、前端 `font-styles.ts` 的 URL 三者一致。
 */
const FONT_FILES = new Set([
    'harmonyos-sans-sc-regular.woff2',
    'harmonyos-sans-sc-medium.woff2',
    'harmonyos-sans-sc-bold.woff2',
    'maple-mono-nf-cn-regular.woff2',
    'maple-mono-nf-cn-bold.woff2',
]);
/** 把一份字体子集写进响应。 */
const serveFont = async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const fileName = pathname.slice(FONT_ROUTE_PATH.length + 1);
    if (!FONT_FILES.has(fileName)) {
        response.writeHead(404).end();
        return;
    }
    const file = join(FONT_DIRECTORY, fileName);
    // 文件读不到就当 404：这条路由只服务包内固定的几份字，缺了就是没生成或没随包发出。
    const info = await stat(file).catch(() => null);
    if (info === null) {
        response.writeHead(404).end();
        return;
    }
    const etag = '"' + String(info.size) + '-' + String(Math.round(info.mtimeMs)) + '"';
    if (request.headers['if-none-match'] === etag) {
        response.writeHead(304).end();
        return;
    }
    response.writeHead(200, {
        'content-type': 'font/woff2',
        'content-length': String(info.size),
        // 重新生成子集时文件名不变，所以留一天而不是 immutable。
        'cache-control': 'public, max-age=86400',
        etag,
    });
    createReadStream(file).pipe(response);
};
