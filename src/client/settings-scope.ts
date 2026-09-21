/**
 * The slice of the settings transport this half consumes.
 *
 * The browser half talks to the host-owned `dsh-chat-ux` namespace through the
 * client settings scope (`ctx.settingsScope.bind`). The shapes here are a local
 * restatement of `@deepseek-ai/dsh-client-ui-settings`'s contract rather than an
 * import: the client bundle must stay a single self-contained file, and a
 * platform package is resolved by the module loader at run time, not compiled in.
 *
 * @module dsh-chat-ux/client/settings-scope
 */

/** The section this plugin owns, as the host resolves it. */
export interface ChatUxSection {
  /** Fade duration in milliseconds; the only field in the section. */
  revealMs?: number
}

/**
 * Client-side sync state of one settings namespace. Mirrors the platform's
 * `SettingsScopeSnapshot`, narrowed to the field this plugin reads.
 */
export interface SettingsSnapshot {
  /**
   * `loading` until the first accepted section, `ready` while one stands, and
   * `unavailable` when the namespace is not exposed to this client — which is
   * what a browser sees before the host half has ever been loaded.
   */
  status: 'loading' | 'ready' | 'unavailable'
  /** Last accepted schema-resolved section; undefined before the first acceptance. */
  value: ChatUxSection | undefined
  /** Composition layer the host resolved `value` over. */
  base: unknown
  /** Raw user layer; a field's PRESENCE here is what marks it overridden. */
  user: unknown
  /** Namespace revision fencing the next write. */
  revision: number | undefined
  /** Whether the host document accepts writes. */
  writable: boolean
  /** `host` syncs with the host document; `memory` keeps the page process-local. */
  mode: 'host' | 'memory'
}

/** One namespace's bound scope: read, observe, and write its section. */
export interface SettingsScope {
  getSnapshot(): SettingsSnapshot
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/**
 * The locale service, read through `ctx.reflect` rather than declared as a
 * dependency: a deployment without it leaves the card working on the
 * browser-derived language instead of never mounting at all.
 */
export interface LocaleLike {
  getSnapshot(): { active?: string | null }
  subscribe(listener: () => void): () => void
}
