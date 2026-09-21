/**
 * Chat-area stylesheets, kept as plain text so the client bundle stays a single
 * self-contained file (the DSH client module loader serves no asset URLs).
 *
 * The injected sheet owns two things: the plugin's own chat-area rules, and the
 * stepped rules the token reveal drives (see `token-motion.ts`).
 *
 * The reveal is a fade-in, not a color change: every step paints the text in
 * the transcript's own label color at some alpha, from `TOKEN_MIN_OPACITY` up
 * to fully opaque. Two constraints shape how that is expressed:
 *
 *   - `opacity` is not available. A highlight pseudo-element accepts only a
 *     small property set (color, background-color, the text decorations,
 *     text-shadow), so the transparency rides on the alpha channel of `color`
 *     instead — which is exactly what `color-mix(in srgb, C p%, transparent)`
 *     yields: mixing against `transparent` weights the result's alpha by `p`
 *     and leaves the hue alone.
 *   - `currentColor` is not available either. Inside `::highlight()` Chromium
 *     does not resolve it against the originating element, it collapses to the
 *     initial color: measured on a `rgb(21, 21, 23)` canvas under
 *     `color-scheme: dark`, a rule whose only color was `currentColor` painted
 *     `rgb(0, 0, 0)` — invisible on that canvas, and so a black flash on every
 *     character right before the highlight was dropped. Hence an explicit
 *     variable, calibrated once per theme.
 */
import { HIGHLIGHT_PREFIX, REVEAL_STEPS, TOKEN_MIN_OPACITY } from './token-motion'

/** Stable id of the injected stylesheet, used for teardown and debugging. */
export const STYLE_ID = 'dsh-chat-ux-style'

/**
 * One rule per step. Step 0 is the faintest a character ever gets and the last
 * step is fully opaque, so the text reaches its settled color exactly when the
 * run leaves the highlight registry.
 *
 * The alpha is written to two decimals rather than as a whole percentage.
 * `REVEAL_STEPS` is far wider than the 31 whole values between
 * `TOKEN_MIN_OPACITY` and 1, so rounding would give long runs of steps the same
 * color and the ramp would come back as a staircase — the very thing the extra
 * steps are there to remove.
 */
const stepRules = Array.from({ length: REVEAL_STEPS }, (_, step) => {
  const alpha = Number(
    ((TOKEN_MIN_OPACITY + (1 - TOKEN_MIN_OPACITY) * (step / (REVEAL_STEPS - 1))) * 100).toFixed(2),
  )
  return [
    '::highlight(' + HIGHLIGHT_PREFIX + step + ') {',
    '  color: color-mix(in srgb, var(--dsh-chat-ux-token-settle) ' + alpha + '%, transparent);',
    '}',
  ].join('\n')
}).join('\n\n')

/** The chat-area stylesheet. */
export const CSS = `/* dsh-chat-ux - chat area */
body {
  /* The color a revealed character settles at — and the hue its faint state
     shares. Follows the theme through the transcript's own token. */
  --dsh-chat-ux-token-settle: var(--dsw-alias-label-primary, #0f1115);
}

body[data-ds-dark-theme] {
  /* Dark canvas: the same token resolves light, so the fade reads the same way. */
  --dsh-chat-ux-token-settle: var(--dsw-alias-label-primary, #f9fafb);
}

${stepRules}
`
