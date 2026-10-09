/**
 * 缓存命中胶囊自己的样式表。
 *
 * 这一处遮蔽了 dsh 在 `conversation.composer.dock` 上 id 为 `usage` 的那个座位，所以内置
 * StatsPills.module.css 的胶囊皮肤与 stat-dialog.module.css 的弹窗皮肤都要在这里重写一份——
 * 那两套类名带构建期 hash，既拿不到、也不能当接口。尺寸、令牌与节奏逐条对齐，只有命中率那一截
 * 是新的：它按四档取色（见下面的自定义属性），这是 dsh 原版没有的。
 *
 * @module dsh-chat-ux/client/chat/cache-hit/cache-hit-styles
 */

/** 座位根，也是弹窗的定位锚点：只包住胶囊，让定位夹取量的是胶囊自己。 */
export const CACHE_HIT_ANCHOR_CLASS = 'dsh-chat-ux-hit-anchor'

/** 胶囊本体。静态读数是 `span`，能展开明细的是 `button`。 */
export const CACHE_HIT_PILL_CLASS = 'dsh-chat-ux-hit-pill'

/** 胶囊里的文本容器。 */
export const CACHE_HIT_LABEL_CLASS = 'dsh-chat-ux-hit-label'

/** token 总量与命中率之间的那个点。 */
export const CACHE_HIT_SEP_CLASS = 'dsh-chat-ux-hit-sep'

/** 命中率那一截：四档取色挂在它与下面四个档位类名的组合上。 */
export const CACHE_HIT_VALUE_CLASS = 'dsh-chat-ux-hit-value'

/** 命中率 ≥ 98%。 */
export const CACHE_HIT_GOOD_CLASS = 'dsh-chat-ux-hit-good'

/** 命中率 93% ~ 98%。 */
export const CACHE_HIT_FAIR_CLASS = 'dsh-chat-ux-hit-fair'

/** 命中率 90% ~ 93%。 */
export const CACHE_HIT_WARN_CLASS = 'dsh-chat-ux-hit-warn'

/** 命中率 < 90%。 */
export const CACHE_HIT_BAD_CLASS = 'dsh-chat-ux-hit-bad'

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
 * 整张样式表，由浏览器半区在安装时拼进那张 `<style>`。
 *
 * 四档取色用的是自定义属性而不是字面色值：深浅两套主题各一份，改档只改这一段。两套的色相不变、
 * 明度各自适配画布——「浅绿」在两套里都读作比「绿」淡的那一档。
 */
export const CACHE_HIT_CSS = `
body {
  --dsh-chat-ux-hit-good: #1a7f37;
  --dsh-chat-ux-hit-fair: #4ba95b;
  --dsh-chat-ux-hit-warn: #9a6700;
  --dsh-chat-ux-hit-bad: #cf222e;
}

body[data-ds-dark-theme] {
  --dsh-chat-ux-hit-good: #3fb950;
  --dsh-chat-ux-hit-fair: #7ee787;
  --dsh-chat-ux-hit-warn: #d29922;
  --dsh-chat-ux-hit-bad: #f85149;
}

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

/* 命中率那一截自带颜色，所以 hover 时它不跟着胶囊变，档位一路看得见。 */
.${CACHE_HIT_VALUE_CLASS}.${CACHE_HIT_GOOD_CLASS} {
  color: var(--dsh-chat-ux-hit-good);
}

.${CACHE_HIT_VALUE_CLASS}.${CACHE_HIT_FAIR_CLASS} {
  color: var(--dsh-chat-ux-hit-fair);
}

.${CACHE_HIT_VALUE_CLASS}.${CACHE_HIT_WARN_CLASS} {
  color: var(--dsh-chat-ux-hit-warn);
}

.${CACHE_HIT_VALUE_CLASS}.${CACHE_HIT_BAD_CLASS} {
  color: var(--dsh-chat-ux-hit-bad);
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
`
