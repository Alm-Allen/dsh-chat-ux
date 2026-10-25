/**
 * dsh-chat-ux 的 host 半区。
 *
 * 这里只声明插件名与 volatile 配置 schema：设置服务据此在插件页投影表单，字段值由浏览器半区读写。
 */
import type {Volatile} from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

// 报给加载器的插件名；同时也是这一行在 profile 里的条目 id。
export const name = 'dsh-chat-ux'

/**
 * 前端绑定 config form 用的那个字符串。设置服务按 **profile 条目 id** 标识一份表单，而这个 id 就是
 * 上面那个插件名，所以前后端必须一字不差地拼出它。
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-ux'

// ⚠️ 以下默认值与浏览器半区的 client/settings-scope.ts 一一对应，改一处必须同步另一处
export const DEFAULT_AUTO_FOLD = true

/** 插入符动效档位；前端 `client/caret-motion.ts` 有同一组字面量。 */
export type CaretMotionMode = 'off' | 'move' | 'typing'

/** 插入符动效默认档位。 */
export const DEFAULT_CARET_MOTION: CaretMotionMode = 'typing'

export const DEFAULT_SEND_FLIGHT = true

export const DEFAULT_HIT_REEL = true

export const DEFAULT_CONTEXT_PIE = true

export const DEFAULT_COMPOSER_GLASS = true

export const DEFAULT_LIVE_DIFF = true

export const DEFAULT_FOLLOW_ON_APPEAR = true

// 这个插件拥有的配置字段；时长等行为参数留在浏览器半区，不进入设置 schema。
export interface Config {
    autoFold: Volatile<boolean>
    caretMotion: Volatile<CaretMotionMode>
    sendFlight: Volatile<boolean>
    hitReel: Volatile<boolean>
    contextPie: Volatile<boolean>
    composerGlass: Volatile<boolean>
    liveDiff: Volatile<boolean>
    followOnAppear: Volatile<boolean>
}

/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export const Config = Schema.object({
    autoFold: Schema.boolean().default(DEFAULT_AUTO_FOLD).volatile(),
    caretMotion: Schema.union(['off', 'move', 'typing'] as const).default(DEFAULT_CARET_MOTION).volatile(),
    sendFlight: Schema.boolean().default(DEFAULT_SEND_FLIGHT).volatile(),
    hitReel: Schema.boolean().default(DEFAULT_HIT_REEL).volatile(),
    contextPie: Schema.boolean().default(DEFAULT_CONTEXT_PIE).volatile(),
    composerGlass: Schema.boolean().default(DEFAULT_COMPOSER_GLASS).volatile(),
    liveDiff: Schema.boolean().default(DEFAULT_LIVE_DIFF).volatile(),
    followOnAppear: Schema.boolean().default(DEFAULT_FOLLOW_ON_APPEAR).volatile(),
})

export function apply(): void {
    console.log('[dsh-chat-ux] host half loaded')
}

