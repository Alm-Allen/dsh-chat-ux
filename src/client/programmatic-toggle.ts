/**
 * 本插件自己按下的折叠切换的记账。
 *
 * 自动收起思考行、自动开合过程组派发的都是真正的 click——`HTMLElement.click()` 走的是同一条捕获
 * 路径，各自的「读者碰过就让他赢」守卫分不出它和读者那一下的区别。可这一次点击落在「思考刚停、
 * 正文刚开头」这样的位置上，静默它等于把读者正在读的那段正文的渐变整段掐掉，所以它必须被认出来
 * 并放过。两个自动开合模块共用这一个计数：谁都不该把对方的程序化点击记成读者的意图。
 *
 * @module dsh-chat-ux/client/programmatic-toggle
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
 * @returns 计数大于零时为真。
 */
export function isProgrammaticToggle(): boolean {
  return depth > 0
}
