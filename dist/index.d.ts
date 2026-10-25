/**
 * dsh-chat-ux 的 host 半区。
 *
 * 这里只声明插件名与 volatile 配置 schema：设置服务据此在插件页投影表单，字段值由浏览器半区读写。
 */
import type { Volatile } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-chat-ux";
/**
 * 前端绑定 config form 用的那个字符串。设置服务按 **profile 条目 id** 标识一份表单，而这个 id 就是
 * 上面那个插件名，所以前后端必须一字不差地拼出它。
 */
export declare const SETTINGS_NAMESPACE = "dsh-chat-ux";
export declare const DEFAULT_AUTO_FOLD = true;
/** 插入符动效档位；前端 `client/caret-motion.ts` 有同一组字面量。 */
export type CaretMotionMode = 'off' | 'move' | 'typing';
/** 插入符动效默认档位。 */
export declare const DEFAULT_CARET_MOTION: CaretMotionMode;
export declare const DEFAULT_SEND_FLIGHT = true;
export declare const DEFAULT_HIT_REEL = true;
export declare const DEFAULT_CONTEXT_PIE = true;
export declare const DEFAULT_COMPOSER_GLASS = true;
export declare const DEFAULT_LIVE_DIFF = true;
export declare const DEFAULT_FOLLOW_ON_APPEAR = true;
export interface Config {
    autoFold: Volatile<boolean>;
    caretMotion: Volatile<CaretMotionMode>;
    sendFlight: Volatile<boolean>;
    hitReel: Volatile<boolean>;
    contextPie: Volatile<boolean>;
    composerGlass: Volatile<boolean>;
    liveDiff: Volatile<boolean>;
    followOnAppear: Volatile<boolean>;
}
/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
    followOnAppear: Schema<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
    followOnAppear: Schema<boolean, boolean, "volatile-defined">;
}>>, "plain">;
export declare function apply(): void;
