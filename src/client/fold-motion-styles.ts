/**
 * 折叠体的入场动画。
 *
 * dsh 的 DisclosureRow 在收起时把展开体整个卸掉（`{open && children}`，见
 * ui-primitives/src/DisclosureRow.tsx），所以元素重新插入的那一帧是唯一能挂过渡的时机——
 * 用 `@starting-style` 给出起始值，展开体从 2px 上方淡入，而不是"啪"地出现。这一处覆盖
 * 聊天区里所有走 DisclosureRow 的行：工具卡片、思考行、系统提示、上下文注入、通用命令卡片，
 * 以及本插件自己接管的那两行文件变更。
 *
 * 只动 opacity 与 translate，高度在插入瞬间就位。聊天区是单一滚动容器加滚动跟随，过程组体内部
 * 还有一层自己的 ResizeObserver 跟随，逐帧改写高度会让两边都去追一个移动的目标；分页锚点
 * 按元素位置记录，动画期间量到的位置也会漂。所以这里做的是"淡入"，不是"展开"。
 *
 * 收起方向的退场做不到：元素在同一帧就被移除，CSS 没有可过渡的旧值。要退场只能接管渲染。
 *
 * 选择器锚在 `data-disclosure-row` 上——那是 DisclosureRow 自己发的语义属性，不是带构建期
 * hash 的类名，所以不会随 dsh 发版失效。row 之后的所有兄弟就是展开体。
 *
 * @module dsh-chat-ux/client/fold-motion-styles
 */

/** 展开体的入场：2px 上浮 + 淡入，节奏取聊天区已有的 120ms（MessageItem 与 TurnNavigator 预览同档）。 */
export const FOLD_MOTION_CSS = `
@starting-style {
  [data-disclosure-row] ~ * {
    opacity: 0;
    translate: 0 -2px;
  }
}

[data-disclosure-row] ~ * {
  transition: opacity 120ms ease-out, translate 120ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  [data-disclosure-row] ~ * {
    transition: none;
  }
}
`
