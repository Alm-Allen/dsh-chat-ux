/**
 * 上下文占用那枚比例饼的样式。
 *
 * 这一处只管三件事：把原环留成占位（不塌格）、给出色阶、给出未占用那一角的底色。饼本身是浏览器
 * 半区画上去的——内联 SVG 作为那颗按钮的背景图，几何在 JS 里算。为什么不用伪元素 + conic-gradient
 * （那种写法不碰内联样式，本来更干净）：dsh 的主题把 corner-shape 全局设成 superellipse(1.5)
 * （连 :before/:after 一起），任何 border-radius: 50% 都画成圆角方块；而伪元素又只能从自定义属性里
 * 取值。改成自己画一张图，这两处一起绕开。
 *
 * 色阶与命中率同一套机制（见 `../ramp`）：六个色标、每 5 个点一个锚点，锚点之间由浏览器的
 * `color-mix(in oklch, …)` 插值；**15% 之前一律绿、40% 起一律红**。色只写在这一份样式表里读数那一
 * 截的 `color` 上，浏览器半区把它读出来涂进 SVG——读到的必须是求值后的真实颜色，所以这一处的色值
 * 不能写成 `var()` 串。
 *
 * @module dsh-chat-ux/client/chat/context-meter/context-meter-styles
 */
import {RAMP_POSITION_VAR, RAMP_SPAN_ATTRIBUTE, RAMP_SPAN_HIGH, RAMP_SPAN_LOW} from '../ramp'
import {REEL_TAKEOVER_ATTRIBUTE} from '../reel/reel-styles'

/** 挂在这个比例圆的根上：在，就说明这一处已经接管。 */
export const CONTEXT_PIE_ATTRIBUTE = 'data-dsh-chat-ux-context-pie'

/** 按钮上的未占用底色；浏览器半区读它来涂底。 */
export const CONTEXT_REST_VAR = '--dsh-chat-ux-context-rest'

/**
 * 整张样式表，由浏览器半区在安装时拼进那张 `<style>`。
 *
 * 档位色与底色都写成字面值，不经过第二层变量：浏览器半区要用 `getComputedStyle` 把它们读出来。
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

/* 读数与饼同色（就是下面那条 color 算出来的色）。

   字号按输入框下方另一枚胶囊那一份来（StatsPills.module.css 的 .anchor，同样减 1px）。dsh 自己
   这两处本来就差 1px——它这一处用的是没减的 --dsh-content-font-size-secondary，于是同一行里两个
   挨着的数字不一样大，读者一眼看得出不齐。 */
[${CONTEXT_PIE_ATTRIBUTE}] button > span {
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
}

/* 接管之后原文本让位：视觉上收起，读屏照旧读得到。不用 display: none（文本节点不生成盒子，藏了
   读屏也没了），也不用 font-size: 0——那一手要靠接手方从父级那里把字号再拿回来，多一层继承；这里
   用惯常的「视觉隐藏」：绝对定位加 1px 加裁剪，既不占位也不显示。

   绝对定位同时把这一截从按钮那个 flex 行里摘出去——图标与它之间那道 6px 的 gap 也就不再算它——
   接手的数字轮（挂在按钮上，见 reel-host）紧跟在图标后面，落点与原来的读数完全一样。 */
[${CONTEXT_PIE_ATTRIBUTE}] button > span[${REEL_TAKEOVER_ATTRIBUTE}] {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  white-space: nowrap;
  clip-path: inset(50%);
}

/* 六个色标：15 绿、20 浅绿、25 黄、30 橙黄、35 橙红、40 红。低于 15 一律绿，40 及以后一律红——
   读者不必等到 50 才看见红。段规则只把这一段的两个端点挂上去（端点只是引用那组共用的色调，主题不同
   解析出来的就不同），插值交给浏览器的 color-mix；两条饱和段只有一个端点，所以恒色。 */
[${RAMP_SPAN_ATTRIBUTE}='${RAMP_SPAN_LOW}'] {
  --dsh-chat-ux-context-from: var(--dsh-chat-ux-tone-green);
}

[${RAMP_SPAN_ATTRIBUTE}='0'] {
  --dsh-chat-ux-context-from: var(--dsh-chat-ux-tone-green);
  --dsh-chat-ux-context-to: var(--dsh-chat-ux-tone-green-light);
}

[${RAMP_SPAN_ATTRIBUTE}='1'] {
  --dsh-chat-ux-context-from: var(--dsh-chat-ux-tone-green-light);
  --dsh-chat-ux-context-to: var(--dsh-chat-ux-tone-yellow);
}

[${RAMP_SPAN_ATTRIBUTE}='2'] {
  --dsh-chat-ux-context-from: var(--dsh-chat-ux-tone-yellow);
  --dsh-chat-ux-context-to: var(--dsh-chat-ux-tone-orange);
}

[${RAMP_SPAN_ATTRIBUTE}='3'] {
  --dsh-chat-ux-context-from: var(--dsh-chat-ux-tone-orange);
  --dsh-chat-ux-context-to: var(--dsh-chat-ux-tone-red-orange);
}

[${RAMP_SPAN_ATTRIBUTE}='4'] {
  --dsh-chat-ux-context-from: var(--dsh-chat-ux-tone-red-orange);
  --dsh-chat-ux-context-to: var(--dsh-chat-ux-tone-red);
}

/* 40 及以后：不必等到 50，两端都是红。 */
[${RAMP_SPAN_ATTRIBUTE}='${RAMP_SPAN_HIGH}'] {
  --dsh-chat-ux-context-from: var(--dsh-chat-ux-tone-red);
}

/* 扇形色与读数色是同一个：色只写在这一处，浏览器半区把它读出来涂进 SVG。兜底那一条给的是段起点色
   （撑不起 color-mix 时退成六档取色），读数与饼仍然同色。 */
[${CONTEXT_PIE_ATTRIBUTE}] button > span {
  color: var(--dsh-chat-ux-context-from, currentColor);
}

@supports (color: color-mix(in oklch, red, blue 50%)) {
  [${CONTEXT_PIE_ATTRIBUTE}] button > span {
    color: color-mix(
      in oklch,
      var(--dsh-chat-ux-context-from),
      var(--dsh-chat-ux-context-to, var(--dsh-chat-ux-context-from)) var(${RAMP_POSITION_VAR}, 0%)
    );
  }
}
`
