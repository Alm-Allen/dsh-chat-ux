/**
 * 输入框里的滚动条：一律不显示。
 *
 * 两个盒子都算输入框：主输入框的滚动容器（DraftEditor 给那个 div 挂了 data-input-scroll），
 * 以及输入区里的纯文本框（提问卡片的作答框、排队消息的行内编辑框）。
 *
 * **为什么非做不可。** 主输入框的滚动容器只声明了 overflow-y: auto；按 CSS Overflow 规范，
 * 另一个轴是 visible 时会计算成 auto，于是它同时成了横向滚动容器。纵向条一出现就吃掉 5px 宽度，
 * 贴右缘的内容当场横向溢出，两根条一起冒出来；羽毛光标朝右上伸出去的那一截也计入它的可滚动宽度。
 * 两根条不只难看，出现与消失还会让文字列左右跳一下。
 *
 * **两条属性并存是有意的。** scrollbar-width: none 给新 Chromium 与 Firefox，条消失、也不占位；
 * ::-webkit-scrollbar 给不认识上一条的老 Chromium。反过来，一旦引擎认得 scrollbar-width 且值不是 auto，
 * 它会丢掉同一个元素上所有 ::-webkit-scrollbar* 规则（dsh 自己的 scrollbar.css 里写着这条互斥），
 * 所以两边都要写，它们不互相打架。
 *
 * **只隐藏、不禁止滚动。** 纵向仍能用滚轮与键盘滚，横向也仍可滚；14 行上限与随光标滚动都还在，
 * 拿走的只有那两根条
 */
import {COMPOSER_TEXTAREA_SELECTOR} from "../../dom-contract"

/**
 * 主输入框的滚动容器。DraftEditor 给那个 div 挂了 data-input-scroll，滚动发生在它身上，
 * 不在里面的 contenteditable 上
 */
const SCROLLPORT_SELECTOR = "[data-input-scroll]"

export const COMPOSER_SCROLL_CSS = `
${SCROLLPORT_SELECTOR},
${COMPOSER_TEXTAREA_SELECTOR} {
  scrollbar-width: none;
}

${SCROLLPORT_SELECTOR}::-webkit-scrollbar,
${COMPOSER_TEXTAREA_SELECTOR}::-webkit-scrollbar {
  width: 0;
  height: 0;
}
`
