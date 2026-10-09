/**
 * 上下文占用那枚比例圆的样式。
 *
 * 这一处只管三件事：把原环留成占位（不塌格）、给出五档取色、给出未占用那一角的底色。饼本身是
 * 浏览器半区画上去的——内联 SVG 作为那颗按钮的背景图，几何在 JS 里算。为什么不用伪元素 +
 * conic-gradient（那种写法不碰内联样式，本来更干净）：dsh 的主题把 corner-shape 全局设成
 * superellipse(1.5)（连 :before/:after 一起），任何 border-radius: 50% 都画成圆角方块；而伪元素
 * 又只能从自定义属性里取值。改成自己画一张图，这两处一起绕开。
 *
 * 颜色仍留在这一侧：浏览器半区只是把计算值读出来涂进图里。
 *
 * @module dsh-chat-ux/client/chat/context-meter/context-meter-styles
 */

/** 挂在这个比例圆的根上：在，就说明这一处已经接管。 */
export const CONTEXT_PIE_ATTRIBUTE = 'data-dsh-chat-ux-context-pie'

/** 挂在它的按钮上：占用落在哪一档。 */
export const CONTEXT_TONE_ATTRIBUTE = 'data-dsh-chat-ux-context-tone'

/** 按钮上的档位色，由下面那些档位规则提供；浏览器半区读它来涂扇形。 */
export const CONTEXT_TONE_VAR = '--dsh-chat-ux-context-tone'

/** 按钮上的未占用底色；浏览器半区读它来涂底。 */
export const CONTEXT_REST_VAR = '--dsh-chat-ux-context-rest'

/** 占用不到 20%：绿。 */
export const CONTEXT_TONE_CALM = 'calm'

/** 占用 20% ~ 30%：浅绿。 */
export const CONTEXT_TONE_STEADY = 'steady'

/** 占用 30% ~ 40%：黄。 */
export const CONTEXT_TONE_WARM = 'warm'

/** 占用 40% ~ 50%：橙黄。 */
export const CONTEXT_TONE_HOT = 'hot'

/** 占用超过 50%：红。 */
export const CONTEXT_TONE_FULL = 'full'

/**
 * 整张样式表，由浏览器半区在安装时拼进那张 `<style>`。
 *
 * 档位色与底色都写成字面值，不经过第二层变量：浏览器半区要用 `getComputedStyle` 把它们读出来，
 * 而那个接口对「值本身又是一个 var()」的自定义属性只会返回原文。
 */
export const CONTEXT_METER_CSS = `
body {
  --dsh-chat-ux-context-rest: rgba(127, 127, 127, 0.3);
}

body[data-ds-dark-theme] {
  --dsh-chat-ux-context-rest: rgba(255, 255, 255, 0.16);
}

/* 原环让位但不塌格：图标那一格还在原处，饼就是按那一格画的。 */
[${CONTEXT_PIE_ATTRIBUTE}] button > svg {
  visibility: hidden;
}

/* 读数也跟着档位走：饼与那串百分比同色，一眼对得上。tone 就定义在这颗按钮上，读数继承得到。

   字号按输入框下方另一枚胶囊那一份来（StatsPills.module.css 的 .anchor，同样减 1px）。dsh 自己
   这两处本来就差 1px——它这一处用的是没减的 --dsh-content-font-size-secondary，于是同一行里两个
   挨着的数字不一样大，读者一眼看得出不齐。 */
[${CONTEXT_PIE_ATTRIBUTE}] button > span {
  color: var(--dsh-chat-ux-context-tone, currentColor);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
}

[${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_CALM}'] {
  --dsh-chat-ux-context-tone: #1a7f37;
}

[${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_STEADY}'] {
  --dsh-chat-ux-context-tone: #4ba95b;
}

[${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_WARM}'] {
  --dsh-chat-ux-context-tone: #9a6700;
}

[${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_HOT}'] {
  --dsh-chat-ux-context-tone: #c76a00;
}

[${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_FULL}'] {
  --dsh-chat-ux-context-tone: #cf222e;
}

body[data-ds-dark-theme] [${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_CALM}'] {
  --dsh-chat-ux-context-tone: #3fb950;
}

body[data-ds-dark-theme] [${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_STEADY}'] {
  --dsh-chat-ux-context-tone: #7ee787;
}

body[data-ds-dark-theme] [${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_WARM}'] {
  --dsh-chat-ux-context-tone: #d29922;
}

body[data-ds-dark-theme] [${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_HOT}'] {
  --dsh-chat-ux-context-tone: #e3873c;
}

body[data-ds-dark-theme] [${CONTEXT_TONE_ATTRIBUTE}='${CONTEXT_TONE_FULL}'] {
  --dsh-chat-ux-context-tone: #f85149;
}
`
