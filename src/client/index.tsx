/**
 * dsh-chat-ux - browser half.
 *
 * DSH loads this module through `exports["./client"]`. The artifact is built by
 * `tsc -p tsconfig.client.json` plus `scripts/wrap-client.cjs`, which wraps the
 * CommonJS output into the single-file `window.__ModuleLoader__.load({...})`
 * bundle the client module loader requires.
 *
 * Chat-area UX work lives here: register into the conversation slots through
 * `ctx.slots`, and keep every stylesheet in `styles.ts` so one `ctx.effect`
 * owns the whole style lifetime. React is resolved from the loader's module
 * table, so components import it normally.
 *
 * @module dsh-chat-ux/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { CSS, STYLE_ID } from './styles'
import { installTokenMotion } from './token-motion'

/**
 * Required client services. Chat-area slots come from the platform client
 * packages; name them here (and in `dsh.client.inject` in package.json) once a
 * slot is actually used, so the loader waits for their factories first.
 */
export const inject: string[] = []

/**
 * Browser-side entry point.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.dataset.plugin = 'dsh-chat-ux'
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'dsh-chat-ux: chat-area stylesheet')

  // Reasoning and body both render inside the Markdown layer's streaming
  // container, so one installation covers the whole answer.
  ctx.effect(() => installTokenMotion(), 'dsh-chat-ux: token reveal')

  console.log('[dsh-chat-ux] client half loaded')
}
