/**
 * dsh-chat-ux —— 后端。
 *
 * 聊天区本身由前端渲染（见 `src/client/`），DSH 之所以从 `exports["./client"]` 加载它，
 * 是因为这个包声明了 `dsh.client`。这一半做两件事：
 *
 * 这一行存在。设置服务把 `Config` 里标了 `.volatile()` 的字段投影成表单，值由前端通过自己的
 * config form 读写，host 侧不看这些值——它们的消费者全在浏览器里。
 *
 * @module dsh-chat-ux
 */
import type { Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-chat-ux";
/**
 * 前端绑定 config form 用的那个字符串。设置服务按 **profile 条目 id** 标识一份表单，而这个 id 就是
 * 上面那个插件名，所以前后端必须一字不差地拼出它。
 */
export declare const SETTINGS_NAMESPACE = "dsh-chat-ux";
/**
 * 增强跟随的默认值。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：它修的正是读者没碰过键鼠时的那一类丢失，而读者自己滚动离开底部时它一概不动手。
 */
export declare const DEFAULT_ENHANCED_FOLLOW = true;
/**
 * 自动开合默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：思考行与过程组自己开合是这个插件的主效果之一。关掉时两块都整块不装，读者自己点开收起
 * 照常——卷帘门过渡仍留给手动点击。
 */
export declare const DEFAULT_AUTO_FOLD = true;
/**
 * 插入符动效的档位。前端 `client/caret-motion.ts` 里有同一组字面量，改一处就要改另一处。
 *
 * - `off` —— 不动手，用浏览器自己的插入符。
 * - `move` —— 只在方向键、点击这类显式移动上放过渡，打字瞬时。
 * - `typing` —— 打字也放过渡。
 */
export type CaretMotionMode = 'off' | 'move' | 'typing';
/** 插入符动效的默认档位：凡是会挪窝的都给过渡。 */
export declare const DEFAULT_CARET_MOTION: CaretMotionMode;
/**
 * 聊天气泡动效默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：这一段已经调定，卡片上不再标 beta。关着时页面上一次都不动手，看到的就是 dsh 原来的样子。
 */
export declare const DEFAULT_SEND_FLIGHT = true;
/**
 * token 淡入默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：它就是这个插件的主效果。关掉之后新字符直接以本色出现，页面上也不再挂那二十几条档位
 * 规则——所以它同时是排查性能问题时的一根对照杆。
 */
export declare const DEFAULT_TOKEN_FADE = true;
/**
 * 命中率转轮默认是否生效。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：读数只在每次模型结算时才变，转轮一天也转不了几次。
 */
export declare const DEFAULT_HIT_REEL = true;
/**
 * 上下文占用那枚饼默认是否生效。前端有一份同样的常量（`client/settings/settings-scope.ts`），
 * 改一处就要改另一处。
 *
 * 默认开着：dsh 画的那圈环换成一枚按占用取色的实心饼，已占用那一角沿折线切开、推开一点。关掉时这一处
 * 整块不装——页面上一次都不动手，看到的就是 dsh 原来的环。
 */
export declare const DEFAULT_CONTEXT_PIE = true;
/**
 * 输入框那块玻璃默认是否生效。前端有一份同样的常量（`client/settings/settings-scope.ts`），
 * 改一处就要改另一处。
 *
 * 默认开着：它就是读者要的那一层磨砂——整块输入座位半透明、背后模糊。关掉后前端不往 body 上挂
 * 属性，那一整张规则表一条都不命中，看到的就是 dsh 原来的样子。
 */
export declare const DEFAULT_COMPOSER_GLASS = true;
/**
 * 文件变更行的 `+n -m` 是否在准备态就跟着参数流长出来。前端有一份同样的常量
 * （`client/settings/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认关着、卡片上标 beta：这一段还在收，而且它只在**直接调用**的 write / edit 上有意义——
 * run_code 里派发的子调用没有准备态，参数由程序在运行时一次给齐。
 */
export declare const DEFAULT_LIVE_DIFF = false;
export interface Config {
    enhancedFollow: Volatile<boolean>;
    autoFold: Volatile<boolean>;
    caretMotion: Volatile<CaretMotionMode>;
    sendFlight: Volatile<boolean>;
    tokenFade: Volatile<boolean>;
    hitReel: Volatile<boolean>;
    contextPie: Volatile<boolean>;
    composerGlass: Volatile<boolean>;
    liveDiff: Volatile<boolean>;
}
/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    enhancedFollow: Schema<boolean, boolean, "volatile-defined">;
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
    tokenFade: Schema<boolean, boolean, "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enhancedFollow: Schema<boolean, boolean, "volatile-defined">;
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
    tokenFade: Schema<boolean, boolean, "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
}>>, "plain">;
/**
 * host 侧入口。
 * @param ctx - host 根 context。
 */
export declare function apply(): void;
