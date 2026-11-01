/**
 * 插件配置卡片的样式。
 *
 * 与插件管理页表达自己的方式一致：同一套 --dsw-* 令牌、同一套字段节奏与控件几何，一张夹在两张官方
 * 卡片中间的卡片该读起来像这一页自己的一部分
 *
 * 开关本身不在这里画，用的是平台提供的 Switch；这一份只管把标题、说明与控件摆成官方开关行的样子
 * 保持纯文本的理由与聊天区样式表相同：client bundle 单文件自包含，没有资源 URL
 */

// 卡片渲染的类名，带前缀所以不会和宿主页面的类名撞车（那一页用的是带 hash 的 CSS Modules 名，插件的样式表是普通的全局 CSS）
export const CARD_CLASS = {
	form: "dsh-chat-ux-card-form",
	notice: "dsh-chat-ux-card-notice",
	row: "dsh-chat-ux-card-row",
	rowText: "dsh-chat-ux-card-row-text",
	label: "dsh-chat-ux-card-label",
	labelLine: "dsh-chat-ux-card-label-line",
	badges: "dsh-chat-ux-card-badges",
	reset: "dsh-chat-ux-card-reset",
	hint: "dsh-chat-ux-card-hint",
	failed: "dsh-chat-ux-card-failed",
	segment: "dsh-chat-ux-card-segment",
	// 纸样那一行：文字在上、两排色片在下，一行里装下一张纸与一个房间两个维度
	stacked: "dsh-chat-ux-card-row-stacked",
	lane: "dsh-chat-ux-card-lane",
	laneTitle: "dsh-chat-ux-card-lane-title",
	laneChips: "dsh-chat-ux-card-lane-chips",
	chip: "dsh-chat-ux-card-chip",
	chipOn: "dsh-chat-ux-card-chip-on",
} as const

// 每种颜色都来自主题令牌，所以卡片跟随深浅色切换，不需要第二套规则
export const CARD_CSS = `/* dsh-chat-ux —— 插件配置卡片 */
.${CARD_CLASS.form} {
  display: flex;
  flex-direction: column;
}

.${CARD_CLASS.notice} {
  margin: 0 0 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.row} {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}

.${CARD_CLASS.rowText} {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.${CARD_CLASS.label} {
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

/* 标签那一行：行内 flex，标签后面再跟什么小标都不会把说明挤下去 */
.${CARD_CLASS.labelLine} {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.${CARD_CLASS.badges} {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.${CARD_CLASS.reset} {
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.${CARD_CLASS.reset}:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}

.${CARD_CLASS.reset}:disabled {
  cursor: default;
}

.${CARD_CLASS.hint} {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.failed} {
  margin: 0 0 4px;
  color: var(--dsw-alias-label-error);
  font-size: 12px;
  line-height: 1.5;
}

/* 首行之外每一行都带一条分隔线，各行于是有同一个节奏 */
.${CARD_CLASS.row}:not(:first-child) {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

/* 分段控件由平台自己画（ui-primitives 的 SegmentedControl），这里只保证它不被左侧文字挤扁：
   它是这一行里唯一的控件，宽度该由它自己定 */
.${CARD_CLASS.segment} {
  flex: none;
}

/* 纸样那一行：一行里要摆下两个维度，控件没法靠右跟文字并排，于是文字在上、色片铺满下层 */
.${CARD_CLASS.stacked} {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.${CARD_CLASS.lane} {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.${CARD_CLASS.laneTitle} {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

/* 色片按内容排，一行装不下就换行：纸那排五枚、房间那排三枚，两种屏幕宽度下都不会横向溢出 */
.${CARD_CLASS.laneChips} {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 一枚色片复用的是这一页自己的控件几何：高度 28、水平 16 的内边距、6 的圆角，
   底色与描边也来自同一套主题令牌，所以深浅色两套主题都不用第二条规则 */
.${CARD_CLASS.chip} {
  box-sizing: border-box;
  height: 28px;
  padding: 0 16px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: color 120ms ease;
}

@media (hover: hover) {
  .${CARD_CLASS.chip}:hover:not(:disabled) {
    color: var(--dsw-alias-label-primary);
  }
}

/* 选中的那枚抬起来：底色换成最上面那一层、边去掉，和分段控件那颗滑动指示器同一套观感 */
.${CARD_CLASS.chipOn} {
  border-color: transparent;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-soft);
  color: var(--dsw-alias-label-primary);
}

.${CARD_CLASS.chip}:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}

.${CARD_CLASS.chip}:disabled {
  cursor: default;
  opacity: 0.4;
}

@media (prefers-reduced-motion: reduce) {
  .${CARD_CLASS.chip} {
    transition: none;
  }
}
`

