/**
 * 输入框插入符动效的样式。
 *
 * 两条规则：把原生插入符按下去，把自绘的那根画出来。前者只认 `caret-motion.ts` 写在可编辑面上的
 * 标记——脚本半途没跑起来时一条规则都不命中，原生插入符还在。这是这套动效唯一真正会伤人的地方
 * （读者看不见光标），所以隐藏永远由脚本自己开启，CSS 不先斩后奏。
 *
 * 需要压过的是 dsh 自己的 `.input { caret-color: … }`（一个类，0-1-0）；下面这条是两个属性选择器
 * （0-2-0），在真实页面上量到它就是赢的那一条。
 *
 * 过渡的是 `transform` 而不是 `top`/`left`：VS Code 那边过渡的是布局属性，这里没有理由跟着付
 * 那份代价。80ms 与它同档，缓动也是它那个默认的 ease。
 *
 * @module dsh-chat-ux/client/caret-motion-styles
 */
import { CARET_ATTRIBUTE, CARET_BLINK_NAME, CARET_LAYER_ATTRIBUTE, CARET_VISIBLE_ATTRIBUTE } from './caret-motion'

/** 自绘插入符的宽度。VS Code 的 `cursorWidth` 默认是 0，渲染时按屏幕缩放落到 2px，同档。 */
const CARET_WIDTH = '2px'

/** 位移时长，与 VS Code 的平滑光标同档。 */
const CARET_TRAVEL_MS = '80ms'

/** 闪烁周期。Chromium 自己的插入符就是亮五百毫秒、灭五百毫秒。 */
const CARET_BLINK_PERIOD = '1s'

/**
 * 插入符动效的样式表，由 `styles.ts` 拼进注入的那一张。
 */
export const CARET_MOTION_CSS = `
/* 自绘的那根就位之后，原生插入符才让位。标记由 caret-motion 在挂上光标之后才写。 */
[data-composer-input][${CARET_ATTRIBUTE}] {
  caret-color: transparent;
}

[${CARET_LAYER_ATTRIBUTE}] {
  position: absolute;
  top: 0;
  left: 0;
  width: ${CARET_WIDTH};
  visibility: hidden;
  pointer-events: none;
  /* 颜色取 dsh 给原生插入符定的那一支，主题切换跟着走。 */
  background: var(--dsw-alias-state-business-primary, currentColor);
  transition: transform ${CARET_TRAVEL_MS} ease;
  will-change: transform;
  /* 原生那根被按下去了，闪烁得自己来。 */
  animation: ${CARET_BLINK_NAME} ${CARET_BLINK_PERIOD} step-end infinite;
}

[${CARET_LAYER_ATTRIBUTE}][${CARET_VISIBLE_ATTRIBUTE}] {
  visibility: visible;
}

@keyframes ${CARET_BLINK_NAME} {
  50% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  /* 连闪烁一起停：这一档要的是少动，恒亮的光标正好是 VS Code 的 solid 档的样子。 */
  [${CARET_LAYER_ATTRIBUTE}] {
    transition: none;
    animation: none;
  }
}
`
