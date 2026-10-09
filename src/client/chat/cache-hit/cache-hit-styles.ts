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

/** 一次翻动用多久；与 hit-reel.tsx 的 `REEL_TURN_MS` 是同一个数，改一处就要改另一处。 */
const REEL_TURN_MS = 220

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

/** 一个数字位：一格窗口，只负责裁。 */
export const HIT_REEL_CLASS = 'dsh-chat-ux-hit-reel'

/** 窗口里现在的那个数字：从下面一格上来，终态零位移。 */
export const HIT_REEL_CELL_CLASS = 'dsh-chat-ux-hit-reel-cell'

/** 上一个数字：往上面一格走。 */
export const HIT_REEL_WAS_CLASS = 'dsh-chat-ux-hit-reel-was'

/** 读数里的小数点与百分号：不滚，与数字轮并排。 */
export const HIT_REEL_STATIC_CLASS = 'dsh-chat-ux-hit-static'

/** 给读屏的那一份读数，视觉上藏起来。 */
export const HIT_REEL_SPOKEN_CLASS = 'dsh-chat-ux-hit-spoken'

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

/* 命中率那一截：几位数字、小数点、百分号并排，**全部落在同一个写死的行盒里**。
   一格的高写死 20px：字形盒 17px 放在里面，上下各余一点，读者换字体也裁不到；小数点与百分号跟着
   用同一个行高，所以数字与它们必然齐平，不靠对齐属性去凑。翻动的位移**不用**这个数——它是相对
   各自行盒的百分比（下面那两条关键帧），所以这一处没有「算一格」的地方，停位与字号、字体度量、
   页面缩放全都无关。 */

.${CACHE_HIT_VALUE_CLASS} {
  --dsh-chat-ux-reel-cell: 20px;
  display: inline-flex;
  align-items: center;
  height: var(--dsh-chat-ux-reel-cell);
}

/* 一个数字位：一格的窗口，只负责裁。position 定在这里，好让上一个数字压在同一格上。 */
.${HIT_REEL_CLASS} {
  display: block;
  position: relative;
  /* 胶囊挤的时候，这一格也不许被压窄。 */
  flex: none;
  overflow: hidden;
  height: var(--dsh-chat-ux-reel-cell);
}

/* 新数字从下面一格上来：位移是相对**这一格自己的行盒**的百分比，所以一格有多高、字号多大、
   页面缩放多少都不参与；而终态是零位移——动画走完，数字就落在它本来的位置上，没有可歪的余地。 */
.${HIT_REEL_CELL_CLASS} {
  display: block;
  height: var(--dsh-chat-ux-reel-cell);
  line-height: var(--dsh-chat-ux-reel-cell);
  text-align: center;
  animation: dsh-chat-ux-hit-in ${REEL_TURN_MS}ms cubic-bezier(0.22, 0.61, 0.24, 1) both;
}

/* 上一个数字往上面一格走；走完停在窗口外，被列口裁着，不碍事。
   它必须**脱离文档流**压在同一个格上：两个 display: block 上下排的话，新数字会被推到下一格，
   正好落在窗口外面——那样读者只会看到旧数字往上走、新数字永远不出现。 */
.${HIT_REEL_WAS_CLASS} {
  display: block;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: var(--dsh-chat-ux-reel-cell);
  line-height: var(--dsh-chat-ux-reel-cell);
  text-align: center;
  animation: dsh-chat-ux-hit-out ${REEL_TURN_MS}ms cubic-bezier(0.22, 0.61, 0.24, 1) both;
}

@keyframes dsh-chat-ux-hit-in {
  from { transform: translateY(100%); }
  to { transform: none; }
}

@keyframes dsh-chat-ux-hit-out {
  from { transform: none; }
  to { transform: translateY(-100%); }
}

/* 系统说「减少动态效果」：两个数字都不动，上一个直接不显示。 */
@media (prefers-reduced-motion: reduce) {
  .${HIT_REEL_CELL_CLASS},
  .${HIT_REEL_WAS_CLASS} {
    animation: none;
  }

  .${HIT_REEL_WAS_CLASS} {
    display: none;
  }
}

/* 小数点与百分号也进同一个行盒：三处行高相同，数字与它们必然齐平。
   flex: none 不能省：胶囊挤的时候，flex 会先把没有固定尺寸的小数点压成零宽——读者那边就是
   「小数点不见了」；数字列口一直有这一条，它们两个漏了。 */
.${HIT_REEL_STATIC_CLASS} {
  display: block;
  flex: none;
  height: var(--dsh-chat-ux-reel-cell);
  line-height: var(--dsh-chat-ux-reel-cell);
}

/* 给读屏的那一份读数：视觉上藏起来，读出来还是「97.3%」。 */
.${HIT_REEL_SPOKEN_CLASS} {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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
