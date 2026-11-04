/**
 * 输入框插入符动效的样式
 *
 * 三条规则：按掉原生插入符、给挂那根的父元素补定位上下文、把自绘的那根画出来
 * 前两条只认 caret-motion.ts 写上的标记，脚本半途没跑起来时一条都不命中，原生插入符还在
 * 这是这套动效唯一真正会伤人的地方（读者看不见光标），所以隐藏永远由脚本自己开启，CSS 不先斩后奏
 */
import {
    CARET_ATTRIBUTE, CARET_BLINK_NAME, CARET_COLOR_PROPERTY, CARET_HOST_ATTRIBUTE, CARET_LAYER_ATTRIBUTE,
    CARET_VISIBLE_ATTRIBUTE,
} from "./caret-motion"
import {DARK_THEME_ATTRIBUTE} from "../../dom-contract"

// 自绘插入符的宽度。VS Code 的 cursorWidth 默认是 0，渲染时按屏幕缩放落到 2px；这里比它粗一点
// 这一份只是兜底：caret-motion 每画一帧都按 devicePixelRatio 写回一个对齐到物理像素的宽度
// （DPR 1.25 时是 2.4px，也就是整 3 个物理像素），不按物理像素对齐的话左右各留半格灰边
const CARET_WIDTH = "2.5px"

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
  /* 颜色跟着 dsh 的明暗走：浅色黑、深色白（深色那一条在下面），写成一个变量再由 background 取用 */
  ${CARET_COLOR_PROPERTY}: #000000d9;
  background: var(${CARET_COLOR_PROPERTY});
  /* 两端圆角。这根只有两三个像素宽，999px 会被 CSS 按边长收成两端半圆，看起来是一根圆头的条 */
  border-radius: 999px;
  /* 过渡的是 transform 而不是 top 与 left：VS Code 那边过渡的是布局属性，这里没有理由跟着付那份代价 */
  transition: transform ${CARET_TRAVEL_MS} ease;
  /* 这里不写 will-change：常驻的合成层会让落在非整数偏移上的这一根被合成器重采样，边缘反而更糊。
     过渡真在跑的那一段由 caret-motion 的 armWillChange 临时提上去，过完就撤 */

  /* 原生那根被按下去了，闪烁得自己来 */
  animation: ${CARET_BLINK_NAME} ${CARET_BLINK_PERIOD} step-end infinite;
}

${LAYER}[${CARET_VISIBLE_ATTRIBUTE}] {
  visibility: visible;
}

/* 深色配色：dsh 把配色方案投影在 body 上，纸感的明暗认的也是这一个属性。
   选择器比上面那条多一段，赢的是它，切换主题时当场生效、不必重建那根 */
body[${DARK_THEME_ATTRIBUTE}] ${LAYER} {
  ${CARET_COLOR_PROPERTY}: #ffffffe7;
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

