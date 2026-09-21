/**
 * dsh-chat-ux - browser half.
 *
 * DSH loads this module through `exports["./client"]`. The artifact is built by
 * `tsc -p tsconfig.client.json` plus `scripts/wrap-client.cjs`, which wraps the
 * CommonJS output into the single-file `window.__ModuleLoader__.load({...})`
 * bundle the client module loader requires.
 *
 * This half owns everything the reader sees: the chat-area stylesheet, the token
 * reveal, and the configuration card the Plugins page renders. It also reads the
 * `dsh-chat-ux` settings namespace the host half registers, which is how a value
 * edited on that page reaches the effect without a reload.
 *
 * @module dsh-chat-ux/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { installComposerMarkdown } from './composer-markdown'
import { COMPOSER_MARKDOWN_CSS } from './composer-markdown-styles'
import { CARD_CSS } from './config-card-styles'
import { ChatUxConfigCard } from './settings-card'
import type { LocaleLike, SettingsScope } from './settings-scope'
import { installReasoningFold } from './reasoning-fold'
import { CSS, STYLE_ID } from './styles'
import { ChatUxUserBubble } from './user-bubble'
import { USER_BUBBLE_CSS } from './user-bubble-styles'
import { DEFAULT_REVEAL_MS, clampRevealMs, installTokenMotion } from './token-motion'

/**
 * This package's npm name. Since dsh 0.1.6 the Plugins page keys
 * `plugins.bundle.config` on the BUNDLE's package name, not on the settings
 * namespace, so the two strings below are both needed and must not be conflated.
 */
const PACKAGE_NAME = 'dsh-chat-ux'

/** Settings namespace; the host half registers it under this exact string. */
const NAMESPACE = 'dsh-chat-ux'

/**
 * Required client services. `settingsScope.bind` reads `connection` and
 * `remote` off the CALLING context, so both are declared alongside the two
 * services this half uses itself; `slots` carries the Plugins page seat.
 *
 * The locale service is deliberately absent: the card reads it through
 * `ctx.reflect`, which returns undefined rather than throwing when no locale
 * plugin is loaded, so a deployment without one still gets a working card.
 */
export const inject: string[] = ['slots', 'settingsScope', 'connection', 'remote']

/** The slot registry, narrowed to the two calls this half makes. */
interface SlotsService {
  inject(name: string, callback: () => () => void): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The settings scope binder, narrowed to `bind`. */
interface SettingsScopeBinder {
  bind(spec: { namespace: string }): SettingsScope
}

/** The platform services this half reaches through the context. */
interface ClientServices {
  slots: SlotsService
  settingsScope: SettingsScopeBinder
  reflect: { get(name: string): unknown }
}

/**
 * Browser-side entry point.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const services = ctx as unknown as ClientServices

  ctx.effect(() => {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.dataset.plugin = 'dsh-chat-ux'
    // One sheet carries every half of the browser side: the chat-area rules,
    // the configuration card's, and the replacement user bubble's.
    style.textContent = CSS + '\n' + CARD_CSS + '\n' + USER_BUBBLE_CSS + '\n' + COMPOSER_MARKDOWN_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'dsh-chat-ux: chat-area stylesheet')

  // The reveal reads its duration through this cell on every painted frame, so
  // a save on the Plugins page reaches the effect without re-installing it —
  // and without dropping the runs already in flight.
  const scope = services.settingsScope.bind({ namespace: NAMESPACE })
  const motion = { revealMs: DEFAULT_REVEAL_MS }
  const sync = (): void => {
    motion.revealMs = clampRevealMs(scope.getSnapshot().value?.revealMs)
  }
  sync()
  ctx.effect(() => scope.subscribe(sync), 'dsh-chat-ux: settings mirror')

  // Reasoning and body both render inside the Markdown layer's streaming
  // container, so one installation covers the whole answer.
  ctx.effect(() => installTokenMotion(() => motion.revealMs), 'dsh-chat-ux: token reveal')

  // dsh ships every reasoning row collapsed and exposes no setting for it, so
  // the row's own control is the only lever. The module documents the phase
  // scoping that keeps a reader's own folds from being overridden.
  ctx.effect(() => installReasoningFold(), 'dsh-chat-ux: reasoning reveal')

  // The composer is a private Lexical editor with no slot, so its decoration
  // works from the outside: one attribute per paragraph, and a stylesheet that
  // reads it. The module documents why the marks stay in the text.
  ctx.effect(() => installComposerMarkdown(), 'dsh-chat-ux: composer markdown')

  // The Plugins page declares `plugins.bundle.config` as a child of its own
  // `main` registration, so the slot exists while that page does. `inject`
  // waits for the declaration instead of throwing, which is also why the
  // registration happens inside the callback rather than at apply time.
  services.slots.inject('plugins.bundle.config', () =>
    services.slots.register(
      {
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        inject: () => ({
          scope,
          locale: services.reflect.get('locale') as LocaleLike | undefined,
        }),
      },
      ChatUxConfigCard,
    ),
  )

  // dsh renders answers through MarkdownText but the reader's own message
  // through projectUserText, which decorates references and parses nothing —
  // so a backticked path stays literal on the reader's own bubble. Both
  // user-authored kinds move to the markdown renderer here.
  //
  // The seat is keyed, and the slot contract renders the LOWEST priority of a
  // cell while the shipped registration passes none (default 0). A negative
  // priority is therefore what makes this a replacement; registering at 0
  // would throw as a same-key, same-priority second occupant.
  for (const key of ['user', 'steering'] as const) {
    services.slots.inject('conversation.chat.node', () =>
      services.slots.register(
        { name: 'conversation.chat.node', key, priority: -1 },
        ChatUxUserBubble,
      ),
    )
  }

  console.log('[dsh-chat-ux] client half loaded')
}
