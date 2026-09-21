/**
 * dsh-chat-ux - host half.
 *
 * The chat area is rendered by the browser half (see `src/client/`), which DSH
 * loads from `exports["./client"]` because this package declares `dsh.client`.
 * This half is the Node-side entry the bundle patch mounts: it carries whatever
 * the plugin needs on the host (settings defaults, session events, tool
 * registration) and exists from the start so the package has a complete,
 * loadable shape.
 *
 * @module dsh-chat-ux
 */
import type { Context } from '@deepseek-ai/cordis'

/** Plugin name reported to the loader. */
export const name = 'dsh-chat-ux'

/**
 * Host-side entry point.
 * @param ctx - host root context.
 */
export function apply(ctx: Context): void {
  // Nothing host-side yet: every chat-area change belongs to the browser half.
  // The entry stays so host capabilities can be mounted here later.
  void ctx
  console.log('[dsh-chat-ux] host half loaded')
}
