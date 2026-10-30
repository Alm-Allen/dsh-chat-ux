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
export declare const DEFAULT_AUTO_FOLD = true;
export type CaretMotionMode = "off" | "move" | "typing";
export declare const DEFAULT_CARET_MOTION: CaretMotionMode;
export declare const DEFAULT_HIT_REEL = true;
export declare const DEFAULT_CONTEXT_PIE = true;
export declare const DEFAULT_COMPOSER_GLASS = true;
export declare const DEFAULT_LIVE_DIFF = true;
export declare const DEFAULT_FOLLOW_ON_APPEAR = true;
export declare const DEFAULT_SEND_FLIGHT = true;
export declare const DEFAULT_BUBBLE_RISE = true;
export declare const DEFAULT_BUBBLE_EMERGE_SCALE = 0.8;
export declare const DEFAULT_BUBBLE_REVEAL = 16;
export declare const DEFAULT_BUBBLE_OUTDENT = 0;
export declare const DEFAULT_BUBBLE_TOTAL_MS = 800;
export declare const DEFAULT_BUBBLE_CURVE_X: number[];
export declare const DEFAULT_BUBBLE_CURVE_Y: number[];
export interface Config {
    autoFold: Volatile<boolean>;
    caretMotion: Volatile<CaretMotionMode>;
    hitReel: Volatile<boolean>;
    contextPie: Volatile<boolean>;
    composerGlass: Volatile<boolean>;
    liveDiff: Volatile<boolean>;
    followOnAppear: Volatile<boolean>;
    bubbleRise: Volatile<boolean>;
    sendFlight: Volatile<boolean>;
    bubbleEmergeScale: Volatile<number>;
    bubbleReveal: Volatile<number>;
    bubbleOutdent: Volatile<number>;
    bubbleTotalMs: Volatile<number>;
    bubbleCurveX: Volatile<number[]>;
    bubbleCurveY: Volatile<number[]>;
}
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
    followOnAppear: Schema<boolean, boolean, "volatile-defined">;
    bubbleRise: Schema<boolean, boolean, "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
    bubbleEmergeScale: Schema<number, number, "volatile-defined">;
    bubbleReveal: Schema<number, number, "volatile-defined">;
    bubbleOutdent: Schema<number, number, "volatile-defined">;
    bubbleTotalMs: Schema<number, number, "volatile-defined">;
    bubbleCurveX: Schema<NoInfer<number[]>, NoInfer<number[]>, "volatile-defined">;
    bubbleCurveY: Schema<NoInfer<number[]>, NoInfer<number[]>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
    followOnAppear: Schema<boolean, boolean, "volatile-defined">;
    bubbleRise: Schema<boolean, boolean, "volatile-defined">;
    sendFlight: Schema<boolean, boolean, "volatile-defined">;
    bubbleEmergeScale: Schema<number, number, "volatile-defined">;
    bubbleReveal: Schema<number, number, "volatile-defined">;
    bubbleOutdent: Schema<number, number, "volatile-defined">;
    bubbleTotalMs: Schema<number, number, "volatile-defined">;
    bubbleCurveX: Schema<NoInfer<number[]>, NoInfer<number[]>, "volatile-defined">;
    bubbleCurveY: Schema<NoInfer<number[]>, NoInfer<number[]>, "volatile-defined">;
}>>, "plain">;
export declare function apply(): void;
