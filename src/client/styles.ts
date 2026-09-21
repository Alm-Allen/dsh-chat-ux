/**
 * 聊天区样式，写成纯文本是为了让 client bundle 保持单文件自包含
 * （DSH 的 client 模块加载器不提供任何资源 URL）。
 *
 * 注入的样式表管两件事：插件自己的聊天区规则，以及 token 淡入所驱动的分档规则
 * （见 `token-motion.ts`）。
 *
 * 淡入是「变实」，不是「变色」：每一档都把文字画在它最终会停住的那个颜色上——也就是
 * 它自己的颜色，由 `token-motion.ts` 以 `RUN_COLOR_VAR` 逐元素发布——从
 * `TOKEN_MIN_OPACITY` 一路走到完全不透明。三条约束决定了它只能这么写：
 *
 *   - 用不了 `opacity`。highlight 伪元素只接受很小的属性集（color、background-color、
 *     各种 text-decoration、text-shadow），所以透明度只能挂在 `color` 的 alpha 通道上——
 *     这正是 `color-mix(in srgb, C p%, transparent)` 的语义：与 `transparent` 混合会把
 *     结果的 alpha 按 `p` 加权，色相不变。
 *   - 也用不了 `currentColor`。在 `::highlight()` 里 Chromium 不会把它解析到承载元素上，
 *     而是塌缩成初始色：实测（`rgb(21, 21, 23)` 画布 + `color-scheme: dark`）只以
 *     `currentColor` 为色的规则画出了 `rgb(0, 0, 0)`——在那块画布上不可见，表现为每个
 *     字符在 highlight 撤销前闪一下黑。
 *   - 更不能用同一个颜色。一段回答里不只有正文：它还带着链接、语法 token 和列表标记，
 *     这些字符最终停住的都不是正文色。淡入期间把它们涂成正文色，每个字符就会先比它最终
 *     的颜色更亮、然后掉回去——那是高亮闪一下，不是淡入。所以颜色从区间所在的元素上读出来，
 *     写成该元素自己的自定义属性，`::highlight()` 再逐元素解析它；下面的 `body` 规则
 *     只是页面级兜底。
 */
import { HIGHLIGHT_PREFIX, REVEAL_STEPS, RUN_COLOR_VAR, TOKEN_MIN_OPACITY } from './token-motion'

/** 注入样式表的固定 id，用于卸载和排查。 */
export const STYLE_ID = 'dsh-chat-ux-style'

/**
 * 一档一条规则。第 0 档是字符最淡的样子，最后一档完全不透明，所以文字正好在区间离开
 * highlight 注册表的那一刻到达它最终的颜色。
 *
 * alpha 写成两位小数，而不是整数百分比。`REVEAL_STEPS` 比 `TOKEN_MIN_OPACITY` 到 1
 * 之间的那 81 个整数百分比更密，四舍五入会让若干档撞成同一个颜色，渐变就变回一段台阶——
 * 而那正是这些多出来的档位要消掉的东西。
 */
const revealStepRules = Array.from({ length: REVEAL_STEPS }, (_, step) => {
  const ratio = TOKEN_MIN_OPACITY + (1 - TOKEN_MIN_OPACITY) * (step / (REVEAL_STEPS - 1))
  const alpha = Number((ratio * 100).toFixed(2))
  return [
    '::highlight(' + HIGHLIGHT_PREFIX + step + ') {',
    '  color: color-mix(in srgb, var(' + RUN_COLOR_VAR + ', currentColor) ' + alpha + '%, transparent);',
    '}',
  ].join('\n')
}).join('\n\n')

/** 聊天区样式表。 */
export const CHAT_AREA_CSS = `/* dsh-chat-ux —— 聊天区 */
body {
  /* 页面级兜底：正文自己的令牌，跟着主题走。区间真正渲染所在的元素会用自己算出来的
     颜色覆盖它。 */
  ${RUN_COLOR_VAR}: var(--dsw-alias-label-primary, #0f1115);
}

body[data-ds-dark-theme] {
  /* 深色画布：同一个令牌解析出来是亮色，默认值的读法一致。 */
  ${RUN_COLOR_VAR}: var(--dsw-alias-label-primary, #f9fafb);
}

${revealStepRules}
`
