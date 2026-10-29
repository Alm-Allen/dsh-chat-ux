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
export declare const DEFAULT_BUBBLE_RISE = true;
export declare const DEFAULT_BUBBLE_EMERGE_MS = 210;
export declare const DEFAULT_BUBBLE_EMERGE_SCALE = 1.43;
export declare const DEFAULT_BUBBLE_REVEAL = 35;
export declare const DEFAULT_BUBBLE_OUTDENT = 12;
export declare const DEFAULT_BUBBLE_HOLD = 100;
export declare const DEFAULT_BUBBLE_HOLD_DRIFT = 0.06;
export declare const DEFAULT_BUBBLE_RISE_MS = 360;
export declare const DEFAULT_BUBBLE_OVERSIZE = 1.34;
export declare const DEFAULT_BUBBLE_RISE_DAMPING = 0.62;
export declare const DEFAULT_BUBBLE_SIZE_DAMPING = 0.55;
export declare const DEFAULT_BUBBLE_EMERGE_BEZIER_X1 = 0.66;
export declare const DEFAULT_BUBBLE_EMERGE_BEZIER_Y1 = 0;
export declare const DEFAULT_BUBBLE_EMERGE_BEZIER_X2 = 0.96;
export declare const DEFAULT_BUBBLE_EMERGE_BEZIER_Y2 = 0.17;
export interface Config {
    autoFold: Volatile<boolean>;
    caretMotion: Volatile<CaretMotionMode>;
    hitReel: Volatile<boolean>;
    contextPie: Volatile<boolean>;
    composerGlass: Volatile<boolean>;
    liveDiff: Volatile<boolean>;
    followOnAppear: Volatile<boolean>;
    bubbleRise: Volatile<boolean>;
    bubbleEmergeMs: Volatile<number>;
    bubbleEmergeScale: Volatile<number>;
    bubbleReveal: Volatile<number>;
    bubbleOutdent: Volatile<number>;
    bubbleHold: Volatile<number>;
    bubbleHoldDrift: Volatile<number>;
    bubbleRiseMs: Volatile<number>;
    bubbleOversize: Volatile<number>;
    bubbleRiseDamping: Volatile<number>;
    bubbleSizeDamping: Volatile<number>;
    bubbleEmergeBezierX1: Volatile<number>;
    bubbleEmergeBezierY1: Volatile<number>;
    bubbleEmergeBezierX2: Volatile<number>;
    bubbleEmergeBezierY2: Volatile<number>;
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
    bubbleEmergeMs: Schema<number, number, "volatile-defined">;
    bubbleEmergeScale: Schema<number, number, "volatile-defined">;
    bubbleReveal: Schema<number, number, "volatile-defined">;
    bubbleOutdent: Schema<number, number, "volatile-defined">;
    bubbleHold: Schema<number, number, "volatile-defined">;
    bubbleHoldDrift: Schema<number, number, "volatile-defined">;
    bubbleRiseMs: Schema<number, number, "volatile-defined">;
    bubbleOversize: Schema<number, number, "volatile-defined">;
    bubbleRiseDamping: Schema<number, number, "volatile-defined">;
    bubbleSizeDamping: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierX1: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierY1: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierX2: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierY2: Schema<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    autoFold: Schema<boolean, boolean, "volatile-defined">;
    caretMotion: Schema<"off" | "move" | "typing", "off" | "move" | "typing", "volatile-defined">;
    hitReel: Schema<boolean, boolean, "volatile-defined">;
    contextPie: Schema<boolean, boolean, "volatile-defined">;
    composerGlass: Schema<boolean, boolean, "volatile-defined">;
    liveDiff: Schema<boolean, boolean, "volatile-defined">;
    followOnAppear: Schema<boolean, boolean, "volatile-defined">;
    bubbleRise: Schema<boolean, boolean, "volatile-defined">;
    bubbleEmergeMs: Schema<number, number, "volatile-defined">;
    bubbleEmergeScale: Schema<number, number, "volatile-defined">;
    bubbleReveal: Schema<number, number, "volatile-defined">;
    bubbleOutdent: Schema<number, number, "volatile-defined">;
    bubbleHold: Schema<number, number, "volatile-defined">;
    bubbleHoldDrift: Schema<number, number, "volatile-defined">;
    bubbleRiseMs: Schema<number, number, "volatile-defined">;
    bubbleOversize: Schema<number, number, "volatile-defined">;
    bubbleRiseDamping: Schema<number, number, "volatile-defined">;
    bubbleSizeDamping: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierX1: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierY1: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierX2: Schema<number, number, "volatile-defined">;
    bubbleEmergeBezierY2: Schema<number, number, "volatile-defined">;
}>>, "plain">;
export declare function apply(): void;
