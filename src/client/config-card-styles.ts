/**
 * 插件配置卡片的样式。写法与插件管理页表达自己的方式一致：同一套设计令牌（`--dsw-*`）、
 * 同一套字段节奏、同一套控件几何——与 dsh 随附的插件配置页完全相同。一张夹在两张官方卡片
 * 之间的卡片应该读起来像这一页自己的一部分，而不是一个客人；何况这一页也没有可供借用的现成外壳。
 *
 * 开关本身不在这里画：它直接用平台提供的 `Switch`，也就是 dsh 设置页里那些开关用的同一个控件。
 * 这一份只负责把「标题 + 说明 + 控件」摆成官方开关行的样子（左侧一列文字，控件靠右）。
 *
 * 与聊天区样式表一样保持为纯文本，理由也相同：client bundle 是单文件自包含的，没有资源 URL。
 *
 * @module dsh-chat-ux/client/config-card-styles
 */

/**
 * 卡片渲染的类名。带前缀，所以不可能和宿主页面自己的类名撞车
 * （那一页用的是带 hash 的 CSS Module 名，而插件的样式表是普通的全局 CSS）。
 */
export const CARD_CLASS = {
  form: 'dsh-chat-ux-card-form',
  notice: 'dsh-chat-ux-card-notice',
  row: 'dsh-chat-ux-card-row',
  rowText: 'dsh-chat-ux-card-row-text',
  label: 'dsh-chat-ux-card-label',
  labelLine: 'dsh-chat-ux-card-label-line',
  badges: 'dsh-chat-ux-card-badges',
  reset: 'dsh-chat-ux-card-reset',
  hint: 'dsh-chat-ux-card-hint',
  failed: 'dsh-chat-ux-card-failed',
  field: 'dsh-chat-ux-card-field',
  fieldHead: 'dsh-chat-ux-card-field-head',
  input: 'dsh-chat-ux-card-input',
  invalid: 'dsh-chat-ux-card-invalid',
  segment: 'dsh-chat-ux-card-segment',
  subfields: 'dsh-chat-ux-card-subfields',
} as const

/**
 * 卡片的样式表。每种颜色都来自主题令牌，所以卡片跟随深浅色切换，不需要第二套规则。
 */
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

/* 标签那一行：标签后面可以跟一个小标（beta）。用行内 flex，标才不会把说明挤下去。 */
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

/* 字体字段是竖排：标签一行、输入框一行、说明一行。官方配置页的文本字段就是这个版式
   （ui-primitives 的 fields.module.css），输入框要占满整行，所以不能沿用开关行的横排。 */
.${CARD_CLASS.field} {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}

/* 首行之外每个字段行都带一条分隔线，各行于是有同一个节奏。 */
.${CARD_CLASS.row}:not(:first-child),
.${CARD_CLASS.field}:not(:first-child) {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

/* 两条自定义字体栈是「自带字体」那一行的下属，不是并列的第三、第四项：它们缩进一档、左侧挂一条
   同粗的竖线，与上面那一行连成一组。**组内不画横线**——横线一画，三项就又读成彼此独立了；
   组的边界交给上面那条线（它本来就分隔「自带字体」与它前一行）和这条竖线。 */
.${CARD_CLASS.subfields} {
  margin-left: 2px;
  padding-left: 14px;
  border-left: 0.5px solid var(--dsw-alias-border-l2);
}

.${CARD_CLASS.subfields} .${CARD_CLASS.field} {
  border-top: none;
}

.${CARD_CLASS.fieldHead} {
  display: flex;
  align-items: center;
  gap: 8px;
}

.${CARD_CLASS.fieldHead} > .${CARD_CLASS.label} {
  flex: 1;
}

.${CARD_CLASS.input} {
  height: 34px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary);
}

.${CARD_CLASS.input}:focus-visible {
  outline: none;
  border-color: var(--dsw-alias-state-business-primary);
}

.${CARD_CLASS.input}:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}

.${CARD_CLASS.input}[aria-invalid='true'] {
  border-color: var(--dsw-alias-state-error-primary);
}

.${CARD_CLASS.invalid} {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 1.5;
}

/* 分段控件由平台自己画（ui-primitives 的 SegmentedControl），这里只保证它不被左侧文字挤扁：
   它是这一行里唯一的控件，宽度该由它自己定。 */
.${CARD_CLASS.segment} {
  flex: none;
}
`
