import Schema from '@deepseek-ai/schemastery';
// 报给加载器的插件名；同时也是这一行在 profile 里的条目 id。
export const name = 'dsh-chat-ux';
/**
 * 前端绑定 config form 用的那个字符串。设置服务按 **profile 条目 id** 标识一份表单，而这个 id 就是
 * 上面那个插件名，所以前后端必须一字不差地拼出它。
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-ux';
/**
 * 自动开合默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：思考行与过程组自己开合是这个插件的主效果之一。关掉时两块都整块不装，读者自己点开收起
 * 照常——卷帘门过渡仍留给手动点击。
 */
export const DEFAULT_AUTO_FOLD = true;
/** 插入符动效的默认档位：凡是会挪窝的都给过渡。 */
export const DEFAULT_CARET_MOTION = 'typing';
/**
 * 聊天气泡动效默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：这一段已经调定，卡片上不再标 beta。关着时页面上一次都不动手，看到的就是 dsh 原来的样子。
 */
export const DEFAULT_SEND_FLIGHT = true;
/**
 * 命中率转轮默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：读数只在每次模型结算时才变，转轮一天也转不了几次。
 */
export const DEFAULT_HIT_REEL = true;
/**
 * 上下文占用那枚饼默认是否生效。前端有一份同样的常量（`client/settings/settings-scope.ts`），
 * 改一处就要改另一处。
 *
 * 默认开着：dsh 画的那圈环换成一枚按占用取色的实心饼，已占用那一角沿折线切开、推开一点。关掉时这一处
 * 整块不装——页面上一次都不动手，看到的就是 dsh 原来的环。
 */
export const DEFAULT_CONTEXT_PIE = true;
/**
 * 输入框那块玻璃默认是否生效。前端有一份同样的常量（`client/settings/settings-scope.ts`），
 * 改一处就要改另一处。
 *
 * 默认开着：它就是读者要的那一层磨砂——整块输入座位半透明、背后模糊。关掉后前端不往 body 上挂
 * 属性，那一整张规则表一条都不命中，看到的就是 dsh 原来的样子。
 */
export const DEFAULT_COMPOSER_GLASS = true;
/**
 * 文件变更行的 `+n -m` 是否在准备态就跟着参数流长出来。前端有一份同样的常量
 * （`client/settings/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：这一段在 2026-10-11 调定（去掉卡片上的 beta 标）。它只在**直接调用**的 write / edit
 * 上有意义——run_code 里派发的子调用没有准备态，参数由程序在运行时一次给齐，那些行看到的仍是
 * 接管之前的样子。
 */
export const DEFAULT_LIVE_DIFF = true;
/**
 * 工具调用与思考行第一次出现时是否把滚动位置补到底。前端有一份同样的常量
 * （`client/settings/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：dsh 自己的跟随在结构时刻会掉队——实测一次 run_code 执行里有两回落后到一百四十像素
 * 上下，正好把新出现的思考推出视野。关掉时前端不挂那个门控属性，探针一条都不命中。
 */
export const DEFAULT_FOLLOW_ON_APPEAR = true;
/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export const Config = Schema.object({
    autoFold: Schema.boolean().default(DEFAULT_AUTO_FOLD).volatile(),
    caretMotion: Schema.union(['off', 'move', 'typing']).default(DEFAULT_CARET_MOTION).volatile(),
    sendFlight: Schema.boolean().default(DEFAULT_SEND_FLIGHT).volatile(),
    hitReel: Schema.boolean().default(DEFAULT_HIT_REEL).volatile(),
    contextPie: Schema.boolean().default(DEFAULT_CONTEXT_PIE).volatile(),
    composerGlass: Schema.boolean().default(DEFAULT_COMPOSER_GLASS).volatile(),
    liveDiff: Schema.boolean().default(DEFAULT_LIVE_DIFF).volatile(),
    followOnAppear: Schema.boolean().default(DEFAULT_FOLLOW_ON_APPEAR).volatile(),
});
/**
 * host 侧入口。
 * @param ctx - host 根 context。
 */
export function apply() {
    console.log('[dsh-chat-ux] host half loaded');
}
