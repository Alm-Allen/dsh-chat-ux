/**
 * Styles for the plugin's configuration card, expressed the way the Plugins page
 * expresses its own: the same design tokens (`--dsw-*`), the same field rhythm,
 * and the same control geometry the shipped plugin configuration pages use. A
 * card rendered between them should read as part of the page rather than as a
 * guest, and the page draws no chrome this card could borrow instead.
 *
 * Kept as plain text beside the chat-area sheet for the same reason that one is:
 * the client bundle is a single self-contained file with no asset URLs.
 *
 * @module dsh-chat-ux/client/config-card-styles
 */

/**
 * Class names the card renders. Prefixed so they cannot collide with the host
 * page's own (the page ships hashed CSS-module names, but a plugin's sheet is
 * plain global CSS).
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
 * The card's stylesheet. Every color comes from a theme token, so the card
 * follows the light/dark switch without a second rule set.
 */
export const CARD_CSS = `/* dsh-chat-ux - plugin configuration card */
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
