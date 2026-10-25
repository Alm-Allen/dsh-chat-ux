/**
 * 本插件自己按下折叠切换时的记账。
 *
 * 自动开合派发的也是真正的 click，计数让「读者碰过就让他赢」的守卫能放过这一下。
 */

/** 本插件自己按下折叠控件的深度。 */
let depth = 0

/** 标记一段本插件自己的折叠切换，让「读者意图」那几处守卫忽略其间的事件。 */
export function beginProgrammaticToggle(): void {
    depth += 1
}

/** 结束一段本插件自己的折叠切换。 */
export function endProgrammaticToggle(): void {
    depth = Math.max(0, depth - 1)
}

/**
 * 此刻是否有本插件自己的折叠切换正在进行。
 */
export function isProgrammaticToggle(): boolean {
    return depth > 0
}
