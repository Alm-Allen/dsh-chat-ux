import type { Context, Volatile } from '@deepseek-ai/cordis';
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
 * 自带字体是否默认接管界面。前端有一份同样的常量（`client/settings-scope.ts`），改一处就要改另一处。
 *
 * 默认开着：装插件的人不必自己装字体，两端看到的也是同一套字。
 */
export declare const DEFAULT_EMBEDDED_FONTS = true;
/**
 * 自定义字体栈的默认值。空串是「没有自定义」，也就是用插件自带的那两套。
 * 前端有一份同样的常量，改一处就要改另一处。
 */
export declare const DEFAULT_FONT_FAMILY = "";
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
 * 发送气泡起飞的时长默认值（毫秒）。前端有一份同样的常量（`client/settings-scope.ts`），
 * 改一处就要改另一处。
 *
 * 默认 200：就是实测过的那一段——短到读者不等它，长到看得清路径。
 */
export declare const DEFAULT_SEND_FLIGHT_MS = 200;
/**
 * 起飞时长可填的范围。前端输入框按同一对数给提示，schema 这里是第二道：越界的值写不进来。
 */
export declare const SEND_FLIGHT_MS_MIN = 80;
export declare const SEND_FLIGHT_MS_MAX = 1200;
/**
 * 内嵌字体对外的路径前缀。前端 `client/font-styles.ts` 里有同一个字符串，改一处就要改另一处。
 */
export declare const FONT_ROUTE_PATH = "/dsh-chat-ux/fonts";
export interface Config {
    enhancedFollow: Volatile<boolean>;
    caretMotion: Volatile<CaretMotionMode>;
    fonts: Volatile<boolean>;
    fontSans: Volatile<string>;
    fontCode: Volatile<string>;
    sendFlightMs: Volatile<number>;
}
/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    enhancedFollow: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    fonts: Schema<boolean, boolean, "volatile-defined">;
    fontSans: Schema<string, string, "volatile-defined">;
    fontCode: Schema<string, string, "volatile-defined">;
    sendFlightMs: Schema<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enhancedFollow: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    fonts: Schema<boolean, boolean, "volatile-defined">;
    fontSans: Schema<string, string, "volatile-defined">;
    fontCode: Schema<string, string, "volatile-defined">;
    sendFlightMs: Schema<number, number, "volatile-defined">;
}>>, "plain">;
/**
 * host 侧入口。
 * @param ctx - host 根 context。
 */
export declare function apply(ctx: Context): void;
