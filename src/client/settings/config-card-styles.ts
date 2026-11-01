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
`

