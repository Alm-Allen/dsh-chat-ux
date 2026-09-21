/**
 * dsh-chat-ux - host half.
 *
 * The chat area itself is rendered by the browser half (see `src/client/`),
 * which DSH loads from `exports["./client"]` because this package declares
 * `dsh.client`. This half owns what only the host can own: the settings
 * namespace that carries the chat-area preferences, so the Plugins page can
 * edit them and `settings.yaml` can keep them.
 *
 * The two halves agree on two strings — the namespace and the field names —
 * and on nothing else. The browser half reads the namespace through its
 * settings scope; this half registers it with the settings service and never
 * looks at the values, because every consumer of them is in the browser.
 *
 * @module dsh-chat-ux
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

/** Plugin name reported to the loader; also the settings namespace it owns. */
export const name = 'dsh-chat-ux'

/**
 * Settings namespace this plugin owns. The browser half binds its settings
 * scope to this exact string, so the two halves must spell it identically.
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-ux'

/** Default time one revealed character takes to settle back to the text color. */
export const DEFAULT_REVEAL_MS = 120

/**
 * Bounds of the fade duration. The browser half clamps to the same range, so a
 * value edited straight into `settings.yaml` cannot ask for a fade the stepped
 * highlight rules cannot sample smoothly: at `MAX_REVEAL_MS` one step still
 * lasts about one display frame.
 */
export const MIN_REVEAL_MS = 30
export const MAX_REVEAL_MS = 600

/** The settings section this plugin owns. */
export interface Config {
  /**
   * How long one freshly revealed character takes to fade from the highlight
   * color back to the text's own color. Smaller is faster.
   */
  revealMs: number
}

/**
 * Schema the settings service resolves this namespace with. The defaults here
 * are what a reader sees before anyone edits the section.
 */
export const Config: Schema<Config> = Schema.object({
  revealMs: Schema.number().min(MIN_REVEAL_MS).max(MAX_REVEAL_MS).default(DEFAULT_REVEAL_MS),
})

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Settings service; absent on a deployment that mounts no provider. */
    settings: {
      installSection(
        owner: Context,
        ns: string,
        schema: unknown,
        entry: unknown,
        hooks: { setSource: (source: () => unknown) => void; onChange: () => void },
      ): void
    }
  }
}

/**
 * Host-side entry point.
 *
 * Registering the namespace is the whole host-side job: the settings service
 * merges the schema default, this row's composition config, and the user layer,
 * and serves the result to every configuration surface. Without the service the
 * plugin still loads and the browser half simply falls back to its own default.
 *
 * @param ctx - host root context.
 * @param config - this row's composition config, used as the `base` layer.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, Config, config, {
      // The host reads nothing out of the section: the browser half is the only
      // consumer, and it reads through its own settings scope.
      setSource: () => {},
      onChange: () => {},
    })
  })
  console.log('[dsh-chat-ux] host half loaded')
}
