/**
 * 折叠体入场与卷帘门期间的排版。
 *
 * 展开体插入时用 @starting-style 做 2px 淡入；退场时元素同帧被移除，CSS 没有可过渡的旧值。
 * 只认 data-disclosure-row 等语义属性，并排除聊天流之外与轮次头子树。
 *
 * 卷帘门运行时子元素一律 flex: none，避免 flex 先挤扁自带滚动的卡片。
 */
import {DISCLOSURE_HEADER_SELECTOR, DISCLOSURE_ROW_SELECTOR} from '../../dom-contract'
import {ROLLING_ATTRIBUTE} from './fold-glide'

/** 展开体的入场：2px 上浮 + 淡入，节奏取聊天区已有的 120ms（MessageItem 与 TurnNavigator 预览同档）。 */
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

/* 卷帘门走的时候，门里的每一张卡片按自然高度排好，不被 flex 挤扁。 */
[${ROLLING_ATTRIBUTE}] > * {
  flex: none !important;
}
`
