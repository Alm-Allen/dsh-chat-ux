/**
 * 纸感的样式。
 *
 * 三件事：给两片全屏 canvas 与那层暗角找位置、把纸色铺到宿主真正画底的几处、以及让侧栏在需要时
 * 躲开纸。整张表都以根元素上的 `data-dsh-chat-ux-paper` 为前提——那个标记不在时一条都不命中，
 * 于是关掉纸感是彻底的，不必逐条撤销
 */
import {PAPER_ROOT_ATTRIBUTE, PAPER_PREFIX} from "./paper-tokens"

// 两片 canvas 与暗角上的标记，值就是它们的角色
export const PAPER_SHEET_ATTRIBUTE = "data-dsh-chat-ux-paper-sheet"
export const PAPER_GLOW_ATTRIBUTE = "data-dsh-chat-ux-paper-glow"
export const PAPER_VIGNETTE_ATTRIBUTE = "data-dsh-chat-ux-paper-vignette"

/**
 * 收起标记。写在三件身上就是「这一层此刻不参与绘制」。
 *
 * 用它而不是 hidden 属性：UA 样式表里 [hidden] 只有 display:none 这一条，而本表给三件写的是
 * display:block，作者样式恒赢，于是 hidden 一点作用都没有（实测：加了 hidden 之后
 * computed display 仍是 block，截图与纸开逐字节相同）
 */
export const PAPER_HIDDEN_ATTRIBUTE = "data-dsh-chat-ux-paper-hidden"

// 纸层的层级。必须高过页面里所有正常内容，才压得住字；发送气泡的替身是 2147483000，比这里高，所以它飞在纸上面
const SHEET_Z = "2147482000"
const GLOW_Z = "2147482001"
const VIGNETTE_Z = "2147482002"

// 根元素上的选择器前缀，整张表的共同前提
const ROOT = "html[" + PAPER_ROOT_ATTRIBUTE + "]"

/**
 * 纸感那一整张表。
 *
 * 两片 canvas 直接挂在 body 下、不带任何包裹容器：mix-blend-mode 的元素一旦被包进带 z-index 的容器，
 * 就会连同那个容器的隔离栈一起与页面断开，multiply 退化成直接覆盖。这条是 nocturne 实测出来的，
 * 这里照搬同样的挂法
 */
export const PAPER_CSS = `
/* 纸与光：两片 fixed 全屏 canvas。left / top / width / height 由 paper-mount 逐帧写，
   纸不铺侧栏时那几项就是左侧栏右边那一块 */
${ROOT} [${PAPER_SHEET_ATTRIBUTE}],
${ROOT} [${PAPER_GLOW_ATTRIBUTE}],
${ROOT} [${PAPER_VIGNETTE_ATTRIBUTE}] {
  position: fixed;
  left: 0;
  top: 0;
  display: block;
  pointer-events: none;
  user-select: none;
}

${ROOT} [${PAPER_SHEET_ATTRIBUTE}] {
  mix-blend-mode: multiply;
  z-index: ${SHEET_Z};
}

${ROOT} [${PAPER_GLOW_ATTRIBUTE}] {
  mix-blend-mode: screen;
  z-index: ${GLOW_Z};
}

/* 暗角挂在单独一层上，位置跟着纸走：纸不覆盖左侧栏时，那块的窗口材质不该被压暗 */
${ROOT} [${PAPER_VIGNETTE_ATTRIBUTE}] {
  z-index: ${VIGNETTE_Z};
  background: radial-gradient(
    ellipse 92% 88% at 50% 46%,
    transparent 52%,
    rgba(0, 0, 0, calc(var(${PAPER_PREFIX}vignette, 0.35) * 0.30)) 100%
  );
}

/* 收起来的三件。这里必须自己写一条，而不是靠 UA 的 [hidden]{display:none}：
   上面那条把 display 写成了 block，作者样式压过 UA 样式表，于是加了 hidden 也照样是 block、
   照样参与合成（实测截图与纸开逐字节相同）。
   连定位一起撤掉也是必须的：只藏不撤的话，三块 1440x900 的元素仍然撑在文档流里，
   body.scrollHeight 会从 900 涨到 3610 */
${ROOT} [${PAPER_HIDDEN_ATTRIBUTE}] {
  display: none;
  /* 定位一起撤：只藏不撤的话，三块 1440x900 的元素仍会撑在文档流里 */
  position: static;
  left: auto;
  top: auto;
  width: 0;
  height: 0;
}

/* 纸面下的字与背景：宿主的底色与侧栏填充色由 paper-tokens 内联写，这里只管那些靠自己的色值画底、
   不认令牌的地方 */
${ROOT} ::selection {
  background: var(${PAPER_PREFIX}selection, rgba(176, 138, 74, 0.28));
  color: inherit;
}

`
