/**
 * 输入框插入符动效的样式
 *
 * 三条规则：按掉原生插入符、给挂那根的父元素补定位上下文、把自绘的那根画出来
 * 前两条只认 caret-motion.ts 写上的标记，脚本半途没跑起来时一条都不命中，原生插入符还在
 * 这是这套动效唯一真正会伤人的地方（读者看不见光标），所以隐藏永远由脚本自己开启，CSS 不先斩后奏
 *
 * 纸感开着时那根画成一支羽毛，那一份表在 ../paper/caret/quill-styles，拼在最后面：
 * 它要求根元素上有纸感标记、并且那根带着羽毛标记，条件不成立时这里一个字节都不受影响
 */
import {
    CARET_ATTRIBUTE, CARET_BLINK_NAME, CARET_COLOR_PROPERTY, CARET_HOST_ATTRIBUTE, CARET_LAYER_ATTRIBUTE,
    CARET_VISIBLE_ATTRIBUTE,
} from "./caret-motion"
import {QUILL_CSS} from "../paper/caret/quill-styles"

// 自绘插入符的宽度。VS Code 的 cursorWidth 默认是 0，渲染时按屏幕缩放落到 2px，与这里同档
const CARET_WIDTH = "2px"

// 位移时长，与 VS Code 的平滑光标同档
const CARET_TRAVEL_MS = "80ms"

// 闪烁周期。Chromium 自己的插入符就是亮五百毫秒、灭五百毫秒
const CARET_BLINK_PERIOD = "1s"

// 自绘那根的选择器。同一个属性写两遍，把它抬到 0-2-0
// 它落进别人的容器里当子元素，容器给子元素定的规则也会落到它身上：作答框的 .field > * 就给它写了
// grid-area、padding 与一整套字体，下面那串显式写回的项正是对着这些
const LAYER = `[${CARET_LAYER_ATTRIBUTE}][${CARET_LAYER_ATTRIBUTE}]`

// 插入符动效的样式表，由 styles.ts 拼进注入的那一张
export const CARET_MOTION_CSS = `
/* 自绘的那根就位之后，原生插入符才被按掉
   标记由 caret-motion 在挂上光标之后才写
   dsh 自己给每种面各定了 caret-color（主输入框的 .input、作答框的 .fieldInput，都是一个类，0-1-0），
   下面那两个属性选择器（0-2-0）与「标签 + 属性」（0-1-1）都赢 */
[data-composer-input][${CARET_ATTRIBUTE}],
textarea[${CARET_ATTRIBUTE}] {
  caret-color: transparent;
}

/* 挂那根的父元素原本不是定位上下文时才有这个标记。它们都没有绝对定位的后代，所以这一条不改任何布局 */
[${CARET_HOST_ATTRIBUTE}] {
  position: relative;
}

${LAYER} {
  position: absolute;
  top: 0;
  left: 0;
  grid-area: auto;
  box-sizing: content-box;
  width: ${CARET_WIDTH};
  min-width: 0;
  max-width: none;
  min-height: 0;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  visibility: hidden;
  pointer-events: none;
  /* 颜色是接管那一刻从这个面的原生插入符上读下来的；读到之前退回 dsh 给主输入框定的那一支 */
  background: var(${CARET_COLOR_PROPERTY}, var(--dsw-alias-state-business-primary, currentColor));
  /* 过渡的是 transform 而不是 top 与 left：VS Code 那边过渡的是布局属性，这里没有理由跟着付那份代价 */
  transition: transform ${CARET_TRAVEL_MS} ease;
  will-change: transform;
  /* 原生那根被按下去了，闪烁得自己来 */
  animation: ${CARET_BLINK_NAME} ${CARET_BLINK_PERIOD} step-end infinite;
}

${LAYER}[${CARET_VISIBLE_ATTRIBUTE}] {
  visibility: visible;
}

@keyframes ${CARET_BLINK_NAME} {
  50% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  /* 连闪烁一起停：这一档要的是少动，恒亮的光标正好是 VS Code 的 solid 档的样子 */
  ${LAYER} {
    transition: none;
    animation: none;
  }
}
`

    // 纸感开着时那根换成羽毛。它整张表都以纸感标记与羽毛标记为前提，两个条件缺一个就一条都不命中
    + QUILL_CSS
