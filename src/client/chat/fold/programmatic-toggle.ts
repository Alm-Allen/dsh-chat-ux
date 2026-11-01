/**
 * 本插件自己按下的折叠切换的记账。
 *
 * 自动收起思考行、自动开合过程组派发的都是真正的 click，HTMLElement.click() 走同一条捕获路径，
 * 各自的读者意图守卫分不出它和读者那一下，所以它必须被认出来并放过。
 * 两个自动开合模块共用这一个计数：谁都不该把对方的程序化点击记成读者的意图
 */

// 本插件自己按下折叠控件的深度
let depth = 0

// 标记一段本插件自己的折叠切换，让读者意图那几处守卫忽略其间的事件
export function beginProgrammaticToggle(): void {
    depth += 1
}

// 结束一段本插件自己的折叠切换
export function endProgrammaticToggle(): void {
    depth = Math.max(0, depth - 1)
}

// 此刻是否有本插件自己的折叠切换正在进行
export function isProgrammaticToggle(): boolean {
    return depth > 0
}
