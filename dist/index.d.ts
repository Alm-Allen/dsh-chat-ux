/**
 * dsh-chat-ux 的 host 侧。
 *
 * 聊天区由前端渲染（见 client/），DSH 从 exports["./client"] 加载它，因为包声明了 dsh.client。
 * 这一半只做两件事：把插件名报给加载器，把设置服务要投影的字段声明清楚
 */
import type { Volatile } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";
export declare const name = "dsh-chat-ux";
export declare const SETTINGS_NAMESPACE = "dsh-chat-ux";
export declare const DEFAULT_PAPER_ON = true;
export declare const DEFAULT_PAPER_SIDEBAR = true;
export declare const DEFAULT_AUTO_FOLD = true;
export type CaretMotionMode = "off" | "move" | "typing";
export declare const DEFAULT_CARET_MOTION: CaretMotionMode;
export declare const DEFAULT_HIT_REEL = true;
export declare const DEFAULT_CONTEXT_PIE = true;
export declare const DEFAULT_COMPOSER_GLASS = true;
export declare const DEFAULT_LIVE_DIFF = true;
export declare const DEFAULT_FOLLOW_ON_APPEAR = true;
export declare const DEFAULT_SEND_FLIGHT = true;
export interface Config {
    paperOn: Volatile<boolean>;
    paperSidebar: Volatile<boolean>;
    autoFold: Volatile<boolean>;
    caretMotion: Volatile<CaretMotionMode>;
    hitReel: Volatile<boolean>;
    contextPie: Volatile<boolean>;
    composerGlass: Volatile<boolean>;
    liveDiff: Volatile<boolean>;
    followOnAppear: Volatile<boolean>;
    sendFlight: Volatile<boolean>;
}
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    paperOn: Schema<boolean, boolean, "volatile-defined">;
    paperSidebar: Schema<boolean, boolean, "volatile-defined">;
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
    followOnAppear: Schema<boolean, boolean, "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    paperOn: Schema<boolean, boolean, "volatile-defined">;
    paperSidebar: Schema<boolean, boolean, "volatile-defined">;
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
    followOnAppear: Schema<boolean, boolean, "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
}>>, "plain">;
export declare function apply(): void;
