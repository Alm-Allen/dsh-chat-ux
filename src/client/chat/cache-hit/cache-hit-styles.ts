/**
 * 缓存命中胶囊自己的样式表。
 *
 * 这一处遮蔽了 dsh 在 `conversation.composer.dock` 上 id 为 `usage` 的那个座位，所以内置
 * StatsPills.module.css 的胶囊皮肤与 stat-dialog.module.css 的弹窗皮肤都要在这里重写一份——
 * 那两套类名带构建期 hash，既拿不到、也不能当接口。尺寸、令牌与节奏逐条对齐，只有命中率那一处
 * 是新的：它按 90%~100% 的无极色阶取色（见下面那几段），这是 dsh 原版没有的；色阶涂在「缓存命中 +
 * 读数」那一组上，所以那个名字与读数同色。
 *
 * 数字轮的类名与规则**不在这里**：那是两处共用的（上下文占用那串百分比也在用），在
 * `../reel/reel-styles`；色阶的段标记与位置也不在这里，在 `../ramp`。
 *
 * @module dsh-chat-ux/client/chat/cache-hit/cache-hit-styles
 */
import {RAMP_POSITION_VAR, RAMP_SPAN_ATTRIBUTE, RAMP_SPAN_HIGH, RAMP_SPAN_LOW} from '../ramp'

/** 座位根，也是弹窗的定位锚点：只包住胶囊，让定位夹取量的是胶囊自己。 */
export const CACHE_HIT_ANCHOR_CLASS = 'dsh-chat-ux-hit-anchor'

/** 胶囊本体。静态读数是 `span`，能展开明细的是 `button`。 */
export const CACHE_HIT_PILL_CLASS = 'dsh-chat-ux-hit-pill'

/** 胶囊里的文本容器。 */
export const CACHE_HIT_LABEL_CLASS = 'dsh-chat-ux-hit-label'

/**
 * 「缓存命中」这几个字与紧随其后的那串读数：命中率色阶就挂在这一组上，所以那个名字与读数同色。
 *
 * 详细档里 token 总量与中间那个分隔点**不在**这一组里，它们留在胶囊自己的文字色上；数字轮那一截
 * 自己不带颜色，从这一组继承。
 */
export const CACHE_HIT_READING_CLASS = 'dsh-chat-ux-hit-reading'

/** token 总量与命中率之间的那个点。 */
export const CACHE_HIT_SEP_CLASS = 'dsh-chat-ux-hit-sep'

/** 弹窗面板。 */
export const CACHE_HIT_PANEL_CLASS = 'dsh-chat-ux-hit-panel'

/** 弹窗标题行：左边图标加标题，右边精确总量。 */
export const CACHE_HIT_TITLE_CLASS = 'dsh-chat-ux-hit-title'

/** 标题左侧那一半。 */
export const CACHE_HIT_TITLE_LABEL_CLASS = 'dsh-chat-ux-hit-title-label'

/** 标题右侧那个精确总量。 */
export const CACHE_HIT_TITLE_VALUE_CLASS = 'dsh-chat-ux-hit-title-value'

/** 标题下那条发丝线。 */
export const CACHE_HIT_RULE_CLASS = 'dsh-chat-ux-hit-rule'

/** 明细的 dt/dd 栅格。 */
export const CACHE_HIT_DETAILS_CLASS = 'dsh-chat-ux-hit-details'

/**
 * 老版坞（dsh 0.2.0-rc.2 及更早）里 dsh 自己那一枚用量胶囊上的收起标记。
 *
 * 那一版只有一个 `stats` 座位条目，按 id 遮蔽不了座位，插件这一枚只会与内置那一枚并列。所以由
 * `legacy-usage-pill` 在 DOM 上把内置那一枚收起来——收起只是 `display: none`，属性一撤它就回来。
 */
export const CACHE_HIT_SHADOWED_ATTRIBUTE = 'data-chat-ux-shadowed-stat'

/**
 * 整张样式表，由浏览器半区在安装时拼进那张 `<style>`。
 *
 * 色阶的六个色标：90.0 红、92.0 橙黄、94.0 黄、96.0 黄绿、98.0 浅绿、99.0 深绿。低于 90.0 一律红；
 * **99.0 及以后一律深绿**——读者不必等到 100.0 才看见绿。六个都从 `../ramp` 那组共用的色调里取，
 * 锚点之间的颜色由浏览器在 OKLCH 里自己插出来（`color-mix(in oklch, …)`）：浏览器半区只给「落在哪
 * 一段、段内位置多少」，一个色值都不碰，所以主题一切它自动跟着重算。
 */
export const CACHE_HIT_CSS = `
/* 座位根：尺寸对齐内置胶囊的 anchor，只包住胶囊本身。 */
.${CACHE_HIT_ANCHOR_CLASS} {
  display: inline-flex;
  min-width: 0;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
}

.${CACHE_HIT_PILL_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  max-width: 100%;
  padding: 1px 8px;
  border: none;
  border-radius: 999px;
  corner-shape: round;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-variant-numeric: tabular-nums;
  line-height: inherit;
  white-space: nowrap;
}

.${CACHE_HIT_PILL_CLASS} svg {
  width: 14px;
  height: 14px;
  flex: none;
}

/* 只有能点开明细的 button 形才邀请交互；静态读数保持三级文字色。 */
button.${CACHE_HIT_PILL_CLASS} {
  cursor: pointer;
}

button.${CACHE_HIT_PILL_CLASS}:hover,
button.${CACHE_HIT_PILL_CLASS}[aria-expanded='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

.${CACHE_HIT_LABEL_CLASS} {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.${CACHE_HIT_SEP_CLASS} {
  color: var(--dsw-alias-separator-primary);
  margin: 0 6px;
}

/* 色阶挂在「缓存命中 + 读数」这一组上：那几个字与读数同色。同一行里的 token 总量与那个分隔点不在
   这一组里，仍留在胶囊自己的三级文字色上；这一组自带颜色，所以胶囊 hover 时它不跟着变，色阶一路
   看得见。

   颜色分两步走：下面这几条段规则把这一组的两个端点挂在 --dsh-chat-ux-hit-from/to 上（端点只是
   引用那组共用的色调，主题不同解析出来的就不同，所以这几条与主题无关），这一侧只写一个段内位置。
   这一处敢套两层 var()，是因为读这些色值的只有浏览器自己——没有任何 JS 去 getComputedStyle。 */

/* 低于 90%：两端都是红，所以插值恒等于红，不另开一档颜色。 */
.${CACHE_HIT_READING_CLASS}[${RAMP_SPAN_ATTRIBUTE}='${RAMP_SPAN_LOW}'] {
  --dsh-chat-ux-hit-from: var(--dsh-chat-ux-tone-red);
}

.${CACHE_HIT_READING_CLASS}[${RAMP_SPAN_ATTRIBUTE}='0'] {
  --dsh-chat-ux-hit-from: var(--dsh-chat-ux-tone-red);
  --dsh-chat-ux-hit-to: var(--dsh-chat-ux-tone-orange);
}

.${CACHE_HIT_READING_CLASS}[${RAMP_SPAN_ATTRIBUTE}='1'] {
  --dsh-chat-ux-hit-from: var(--dsh-chat-ux-tone-orange);
  --dsh-chat-ux-hit-to: var(--dsh-chat-ux-tone-yellow);
}

.${CACHE_HIT_READING_CLASS}[${RAMP_SPAN_ATTRIBUTE}='2'] {
  --dsh-chat-ux-hit-from: var(--dsh-chat-ux-tone-yellow);
  --dsh-chat-ux-hit-to: var(--dsh-chat-ux-tone-lime);
}

.${CACHE_HIT_READING_CLASS}[${RAMP_SPAN_ATTRIBUTE}='3'] {
  --dsh-chat-ux-hit-from: var(--dsh-chat-ux-tone-lime);
  --dsh-chat-ux-hit-to: var(--dsh-chat-ux-tone-green-light);
}

.${CACHE_HIT_READING_CLASS}[${RAMP_SPAN_ATTRIBUTE}='4'] {
  --dsh-chat-ux-hit-from: var(--dsh-chat-ux-tone-green-light);
  --dsh-chat-ux-hit-to: var(--dsh-chat-ux-tone-green);
}

/* 99.0 及以后：不必等到 100.0，两端都是深绿。 */
.${CACHE_HIT_READING_CLASS}[${RAMP_SPAN_ATTRIBUTE}='${RAMP_SPAN_HIGH}'] {
  --dsh-chat-ux-hit-from: var(--dsh-chat-ux-tone-green);
}

/* 撑不起 color-mix 的浏览器停在段起点色上：退成六档取色，读数、布局与翻动一个都不受影响。
   段标记也没写上时退回胶囊自己的文字色，而不是变成看不出的一团。 */
.${CACHE_HIT_READING_CLASS} {
  color: var(--dsh-chat-ux-hit-from, currentColor);
}

/* 括号里必须是一个「属性: 值」声明。写成裸的函数调用（color-mix(...)）会被规范归入「未知的
   函数形式」而恒为假，整块规则静默跳过——与 styles.ts 里那道流光同一个坑。 */
@supports (color: color-mix(in oklch, red, blue 50%)) {
  .${CACHE_HIT_READING_CLASS} {
    color: color-mix(
      in oklch,
      var(--dsh-chat-ux-hit-from),
      var(--dsh-chat-ux-hit-to, var(--dsh-chat-ux-hit-from)) var(${RAMP_POSITION_VAR}, 0%)
    );
  }
}

/* 明细面板：菜单面、突出阴影，与内置的 stat 弹窗同一层。定位由 useAnchoredPosition 给。 */
.${CACHE_HIT_PANEL_CLASS} {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  width: max-content;
  min-width: min(300px, calc(100vw - 24px));
  max-width: min(440px, calc(100vw - 24px));
  padding: 16px;
  border: 0;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-specific-menu);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-elevation-prominent);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  cursor: default;
}

.${CACHE_HIT_TITLE_CLASS} {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.${CACHE_HIT_TITLE_LABEL_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.${CACHE_HIT_TITLE_LABEL_CLASS} svg {
  width: 14px;
  height: 14px;
  flex: none;
}

.${CACHE_HIT_TITLE_VALUE_CLASS} {
  font-variant-numeric: tabular-nums;
}

.${CACHE_HIT_RULE_CLASS} {
  margin-bottom: 10px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

.${CACHE_HIT_DETAILS_CLASS} {
  display: grid;
  grid-template-columns: minmax(76px, auto) minmax(0, 1fr);
  gap: 6px 16px;
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
}

.${CACHE_HIT_DETAILS_CLASS} dt,
.${CACHE_HIT_DETAILS_CLASS} dd {
  min-width: 0;
  margin: 0;
}

.${CACHE_HIT_DETAILS_CLASS} dd {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* 老版坞里 dsh 自己那一枚用量胶囊：插件这一枚在场时把它收起来，两版看到的都是「速度 + 这一枚」。
   收起只是不画：内置那一枚仍在 DOM 里、仍按 dsh 自己的口径算，插件卸下时属性一撤就回来
   （见 legacy-usage-pill）。 */
[${CACHE_HIT_SHADOWED_ATTRIBUTE}] {
  display: none !important;
}
`
