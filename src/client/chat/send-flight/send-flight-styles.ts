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
import {PAPER_BUBBLE_PROPERTY} from '../paper/paper-bubble'
import {PAPER_ROOT_ATTRIBUTE} from '../paper/paper-tokens'

/** 色块替身的底色变量，挂在 `body` 上由替身继承（见 `send-morph.ts` 的 `SLAB_FILL_VAR`）。 */
export const SLAB_FILL_VARIABLE = '--dsh-chat-ux-slab-fill'

/** 色块替身那两片渐变的变量（见 `SLAB_SHEEN_VAR`）。 */
export const SLAB_SHEEN_VARIABLE = '--dsh-chat-ux-slab-sheen'

/**
 * 整份样式，由 `styles.ts` 拼进那张 `<style>`。
 *
 * **起手色分两条路：没铺纸时照抄玻璃，铺纸时照抄纸。**
 *
 * 没铺纸时，起手色要的就是「chat-ux 玻璃卡片落到实色之后的样子」，玻璃那边已经按主题备好了
 * `--dsh-chat-ux-glass-base`（浅色压过一点灰，深色换成 neutral-bluish-850 那一档）与让出多少的
 * `--dsh-chat-ux-glass-alpha`。直接引用它们，以后调玻璃不必再回来改一遍色块。
 *
 * 铺了纸时这条取舍**不再成立**：那条路的终点是纸上压出来的一层纸（气泡的底由 paper-bubble 换掉），
 * 起点却还是玻璃的冷白，于是整段飞行是"冷白渐变成米黄"。所以纸开着时起手色直接取气泡那一笔
 * `--dsh-chat-ux-paper-bubble`（paper-bubble.ts 写的，与宿主的 --dsw-specific-bubble 同一个值），
 * 两端同色，飞行中颜色一次都不变；那两片冷蓝紫色的渐变也一并作废——气泡自己没有渐变，
 * 留着它等于在半路上又把色块染蓝一次。
 *
 * 浅色这一档同时是**兜底**：读者关掉毛玻璃时那两个变量不在，`var()` 里的字面值接上（与旧版写死的
 * 那三条逐字相同），于是起手块与以前一模一样。纸那一段没有兜底值：`--dsh-chat-ux-paper-bubble` 缺席时
 * 这一条变量算作无效，JS 侧 `SLAB_FILL_VAR` 自带的玻璃色兜底接手——退回今天的行为，而不是画一块
 * 没有来路的色。
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

/* 铺了纸：起手块的底就是纸面上那一层，与落点气泡同一个值，整段飞行颜色不变。
   深浅两档不分开写——纸色本身就是按纸算好的，夜纸那一份是"略亮的纸"，与主题无关。

   这条必须排在最后、也必须带 !important：上面那几条没有它时都在 body 上写同一个变量，
   而以 body[data-ds-dark-theme] 与 body[data-chat-ux-composer-glass] 起头的那几条特异度更高，
   同值后写的规则赢不过它们，纸开着时起手块又会变回玻璃的冷白。

   顺序这一条查过：ALL_CSS 里 COMPOSER_GLASS_CSS 排在本表之后，但那份表一个 --dsh-chat-ux-slab-*
   都不写（它只管 --dsh-chat-ux-glass-base / -alpha 与它自己那几组规则），所以后写的那一张盖不到这里。
   真要有人往毛玻璃那张表里加这两个变量，这里的 !important 仍然压得住——前提是它不加 !important。

   两片冷蓝紫渐变一并抹掉：气泡自己身上没有渐变，留着它等于飞行中途再把色块染蓝一次 */
:root[${PAPER_ROOT_ATTRIBUTE}] body {
  ${SLAB_FILL_VARIABLE}: var(--dsh-chat-ux-paper-bubble) !important;
  ${SLAB_SHEEN_VARIABLE}: none !important;
}
`
