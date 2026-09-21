/**
 * Chat-area stylesheets, kept as plain text so the client bundle stays a single
 * self-contained file (the DSH client module loader serves no asset URLs).
 *
 * The injected sheet owns two things: the plugin's own chat-area rules, and the
 * stepped color rules the token reveal drives (see `token-motion.ts`).
 */

import { HIGHLIGHT_PREFIX, REVEAL_STEPS } from './token-motion'

/** Stable id of the injected stylesheet, used for teardown and debugging. */
export const STYLE_ID = 'dsh-chat-ux-style'

/**
 * One rule per fade step. Step 0 is the full highlight color and the last step
 * is the color the text settles at.
 *
 * Both endpoints are variables rather than `currentColor` on purpose:
 * `currentColor` inside `::highlight()` does not resolve against the
 * originating element in Chromium, it collapses to the initial color. Measured on
 * a `rgb(21, 21, 23)` canvas under `color-scheme: dark`, a rule whose only
 * endpoint was `currentColor` settled at `rgb(0, 0, 0)`, which is invisible
 * on that canvas and reads as a black flash on every character right before the
 * highlight is dropped. On the light canvas the same collapse went unnoticed,
 * because the body color there (`rgb(15, 17, 21)`) is black for all practical
 * purposes.
 */
const stepRules = Array.from({ length: REVEAL_STEPS }, (_, step) => {
  const weight = Math.round(((REVEAL_STEPS - 1 - step) / (REVEAL_STEPS - 1)) * 100)
  return [
    '::highlight(' + HIGHLIGHT_PREFIX + step + ') {',
    '  color: color-mix(in srgb, var(--dsh-chat-ux-token-highlight) ' + weight + '%, var(--dsh-chat-ux-token-settle));',
    '}',
  ].join('\n')
}).join('\n\n')

/** The chat-area stylesheet. */
export const CSS = `/* dsh-chat-ux - chat area */
body {
  /* Where a freshly revealed token starts on the light canvas. */
  --dsh-chat-ux-token-highlight: var(--dsw-static-deepseek-500, #4d6bfe);
  /* Where it settles. Follows the theme through the transcript's own token. */
  --dsh-chat-ux-token-settle: var(--dsw-alias-label-primary, #0f1115);
}

body[data-ds-dark-theme] {
  /* Dark canvas: start from a light tint and settle back into the body color. */
  --dsh-chat-ux-token-highlight: var(--dsw-static-deepseek-200, #b9c6ff);
  --dsh-chat-ux-token-settle: var(--dsw-alias-label-primary, #f9fafb);
}

${stepRules}
`
