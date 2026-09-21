/**
 * 插件配置卡片的样式。写法与插件管理页表达自己的方式一致：同一套设计令牌（`--dsw-*`）、
 * 同一套字段节奏、同一套控件几何——与 dsh 随附的插件配置页完全相同。一张夹在两张官方卡片
 * 之间的卡片应该读起来像这一页自己的一部分，而不是一个客人；何况这一页也没有可供借用的现成外壳。
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
  field: 'dsh-chat-ux-card-field',
  head: 'dsh-chat-ux-card-head',
  labelGroup: 'dsh-chat-ux-card-label-group',
  label: 'dsh-chat-ux-card-label',
  badges: 'dsh-chat-ux-card-badges',
  reset: 'dsh-chat-ux-card-reset',
  input: 'dsh-chat-ux-card-input',
  hint: 'dsh-chat-ux-card-hint',
  invalid: 'dsh-chat-ux-card-invalid',
  footer: 'dsh-chat-ux-card-footer',
  failed: 'dsh-chat-ux-card-failed',
  save: 'dsh-chat-ux-card-save',
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

.${CARD_CLASS.field} {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 0;
}

.${CARD_CLASS.head} {
  display: flex;
  align-items: center;
  gap: 8px;
}

.${CARD_CLASS.labelGroup} {
  display: flex;
  flex: 1;
  align-items: center;
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

.${CARD_CLASS.input} {
  height: 34px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.${CARD_CLASS.input}:focus-visible {
  border-color: var(--dsw-alias-brand-primary);
  outline: none;
}

.${CARD_CLASS.input}:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: default;
}

.${CARD_CLASS.input}[aria-invalid='true'] {
  border-color: var(--dsw-alias-state-error-primary);
}

.${CARD_CLASS.hint} {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.invalid} {
  margin: 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.footer} {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 16px;
}

.${CARD_CLASS.failed} {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--dsw-alias-label-error);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.save} {
  padding: 5px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-layer-3);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  cursor: pointer;
  appearance: none;
}

.${CARD_CLASS.save}:disabled {
  opacity: 0.4;
  cursor: default;
}

.${CARD_CLASS.save}:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`
