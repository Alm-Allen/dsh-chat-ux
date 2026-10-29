/**
 * 折叠体的入场动画，以及高度动画期间的排版
 *
 * dsh 的 DisclosureRow 在收起时把展开体整个卸掉（ui-primitives/src/DisclosureRow.tsx），重新插入的那一帧是唯一
 * 能挂过渡的时机，所以用 @starting-style 给起始值，从 2px 上方淡入。只动 opacity 与 translate，高度在插入瞬间
 * 就位：逐帧改高度会让聊天区的跟随与过程组体里那层跟随互相追，分页锚点按元素位置记录，动画期间量到的位置也会漂
 *
 * 收起方向做不到退场，元素在同一帧就被移除，CSS 没有可过渡的旧值
 */
import {DISCLOSURE_HEADER_SELECTOR, DISCLOSURE_ROW_SELECTOR} from "../../dom-contract"
import {ROLLING_ATTRIBUTE} from "./fold-glide"

// 展开体的入场：2px 上浮加淡入，节奏取聊天区已有的 120ms（MessageItem 与 TurnNavigator 预览同档）
// 两条排除：聊天区之外（文件预览、工作流面板）也发 [data-disclosure-row]，所以整条规则收在 [data-chat-flow] 里面；
// 轮次头展开时几十个过程成员一起被当成刚插入，会整块滑着出现，所以过程成员的整棵子树与轮次触发通知都排除
export const FOLD_MOTION_CSS = `
@starting-style {
  [data-chat-flow] :is(${DISCLOSURE_HEADER_SELECTOR}, ${DISCLOSURE_ROW_SELECTOR}) ~ *:not(${DISCLOSURE_HEADER_SELECTOR} *, [data-turn-process-member] *, [data-turn-trigger] *) {
    opacity: 0;
    translate: 0 -2px;
  }
}

[data-chat-flow] :is(${DISCLOSURE_HEADER_SELECTOR}, ${DISCLOSURE_ROW_SELECTOR}) ~ *:not(${DISCLOSURE_HEADER_SELECTOR} *, [data-turn-process-member] *, [data-turn-trigger] *) {
  transition: opacity 120ms ease-out, translate 120ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  [data-chat-flow] :is(${DISCLOSURE_HEADER_SELECTOR}, ${DISCLOSURE_ROW_SELECTOR}) ~ *:not(${DISCLOSURE_HEADER_SELECTOR} *, [data-turn-process-member] *, [data-turn-trigger] *) {
    transition: none;
  }
}

/* 高度动画期间，展开体里的每张卡片按自然高度排好，不被 flex 挤扁。这两百毫秒里谁也不该改它，所以带 !important；
   动画一停标记就撤，排版回到 dsh 原样：展开体的高度本来就是子元素自然高度之和，两种排法在终点上一个像素都不差 */
[${ROLLING_ATTRIBUTE}] > * {
  flex: none !important;
}
`;
