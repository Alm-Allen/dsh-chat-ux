/**
 * Chat-area stylesheets, kept as plain text so the client bundle stays a single
 * self-contained file (the DSH client module loader serves no asset URLs).
 *
 * The injected sheet owns two things: the plugin's own chat-area rules, and the
 * stepped color rules the token reveal drives (see \`token-motion.ts\`).
 */

import { HIGHLIGHT_PREFIX, REVEAL_STEPS } from './token-motion'

/** Stable id of the injected stylesheet, used for teardown and debugging. */
export const STYLE_ID = 'dsh-chat-ux-style'

/**
 * One rule per fade step. Step 0 is the full highlight color, the last step is
 * the text's own color. \`currentColor\` resolves against the highlighted element,
 * so no step has to know the transcript's theme, variant, or typography.
 */
const stepRules = Array.from({ length: REVEAL_STEPS }, (_, step) => {
  const weight = Math.round(((REVEAL_STEPS - 1 - step) / (REVEAL_STEPS - 1)) * 100)
  return [
    '::highlight(' + HIGHLIGHT_PREFIX + step + ') {',
    '  color: color-mix(in srgb, var(--dsh-chat-ux-token-highlight) ' + weight + '%, currentColor);',
    '}',
  ].join('\n')
}).join('\n\n')

/** The chat-area stylesheet. */
export const CSS = `/* dsh-chat-ux - chat area */
:root {
  /* Where a freshly revealed token starts on the light canvas. */
  --dsh-chat-ux-token-highlight: var(--dsw-static-deepseek-500, #4d6bfe);
}

body[data-ds-dark-theme] {
  /* Dark canvas: start from a light tint and settle back into the body color. */
  --dsh-chat-ux-token-highlight: var(--dsw-static-deepseek-200, #b9c6ff);
}

${stepRules}
`
