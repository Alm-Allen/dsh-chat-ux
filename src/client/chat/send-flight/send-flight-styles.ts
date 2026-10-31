/**
 * 发送气泡起飞时的样式。
 *
 * 两件事：
 *
 * 1. 飞行期间那条回显行先藏着，而且**只藏**它——盒子仍然参与布局，替身靠它逐帧量终点。输入卡片不在
 *    这条规则的范围里：它自始至终都在，气泡就是从它上面升起来的。那个属性由 `send-flight.ts` 的
 *    `FLYING_ATTRIBUTE` 挂上，两边必须一字不差。
 * 2. 色块替身那块底的**两个变量**，深浅两档各一份。替身自己的结构仍是行内写死的（见 `send-morph.ts`），
 *    但底色与那两片渐变只认变量名——这样主题一切，CSS 自己重算，飞行中途切也不掉队，JS 那边不必读 DOM、
 *    也不必知道当前是哪一档。
 */

import {GLASS_ATTRIBUTE} from '../composer-glass/composer-glass-styles'

/** 色块替身的底色变量，挂在 `body` 上由替身继承（见 `send-morph.ts` 的 `SLAB_FILL_VAR`）。 */
export const SLAB_FILL_VARIABLE = '--dsh-chat-ux-slab-fill'

/** 色块替身那两片渐变的变量（见 `SLAB_SHEEN_VAR`）。 */
export const SLAB_SHEEN_VARIABLE = '--dsh-chat-ux-slab-sheen'

/**
 * 整份样式，由 `styles.ts` 拼进那张 `<style>`。
 *
 * **起手色不另抄一遍数**：它要的就是「chat-ux 玻璃卡片落到实色之后的样子」，玻璃那边已经按主题备好了
 * `--dsh-chat-ux-glass-base`（浅色压过一点灰，深色换成 neutral-bluish-850 那一档）与让出多少的
 * `--dsh-chat-ux-glass-alpha`。直接引用它们，以后调玻璃不必再回来改一遍色块。
 *
 * 浅色这一档同时是**兜底**：读者关掉毛玻璃时那两个变量不在，`var()` 里的字面值接上（与旧版写死的
 * 那三条逐字相同），于是起手块与以前一模一样。
 *
 * 深色那两片渐变比浅色浓一档（0.035 / 0.03 对 0.022 / 0.018）：同样的透明度叠在深底上几乎看不见。
 * 括号里是空兜底的那条——变量缺席时整层渐变作废，底还在，不会算出一块黑。
 */
export const SEND_FLIGHT_CSS = `/* dsh-chat-ux —— 发送气泡的起飞 */
[data-chat-ux-send-flight] {
  visibility: hidden;
}

body {
  ${SLAB_FILL_VARIABLE}: rgba(247, 247, 250, 0.85);
  ${SLAB_SHEEN_VARIABLE}: linear-gradient(to right, rgb(122 155 240 / 0.022) 0%, rgb(122 155 240 / 0) 38%, rgb(143 137 184 / 0) 64%, rgb(143 137 184 / 0.018) 100%);
}

/* 有毛玻璃就走它那块底：深浅两档、让出多少都由那边定，色块跟着走 */
@supports (color: color-mix(in srgb, white 50%, transparent)) {
  body[${GLASS_ATTRIBUTE}] {
    ${SLAB_FILL_VARIABLE}: color-mix(in srgb, var(--dsh-chat-ux-glass-base, #f7f7fa) var(--dsh-chat-ux-glass-alpha, 70%), transparent);
  }
}

/* 深色这一档两层：底先取 dsh 自己的输入面色（没开毛玻璃时就是它），开了毛玻璃再由下面那条压过去。
   两片渐变也跟着浓一档——同样的透明度叠在深底上几乎看不见 */
body[data-ds-dark-theme] {
  ${SLAB_FILL_VARIABLE}: color-mix(in srgb, var(--dsw-specific-input-major, #1b2028) 88%, transparent);
  ${SLAB_SHEEN_VARIABLE}: linear-gradient(to right, rgb(122 155 240 / 0.035) 0%, rgb(122 155 240 / 0) 38%, rgb(143 137 184 / 0) 64%, rgb(143 137 184 / 0.03) 100%);
}

@supports (color: color-mix(in srgb, white 50%, transparent)) {
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] {
    ${SLAB_FILL_VARIABLE}: color-mix(in srgb, var(--dsh-chat-ux-glass-base, #0e1117) var(--dsh-chat-ux-glass-alpha, 70%), transparent);
  }
}
`
