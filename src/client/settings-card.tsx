/**
 * The plugin's configuration card on the dsh Plugins page.
 *
 * dsh >= 0.1.6 renders a bundle's own configuration on the bundle's page, in the
 * `plugins.bundle.config` slot keyed by package name, between the package
 * description and its rows. The page draws the title, icon and breadcrumb; this
 * component is only the form, which is what `view: 'page'` asks for.
 *
 * It is built out of the same parts the page's own configuration cards are: the
 * shared `Tag` from `dsh-client-ui-primitives` for the override badge, and the
 * field rhythm, control geometry and `--dsw-*` tokens of the shipped plugin
 * configuration pages (see `config-card-styles.ts`). Nothing here is styled
 * from scratch, because a card sitting between two shipped ones should not look
 * like it came from somewhere else.
 *
 * Nothing writes until Save is pressed. The draft is text, so what the input
 * shows is exactly what a save would store, and leaving the page drops it (the
 * page unmounts the entry, so there is no discard control to offer). Whether a
 * value was accepted is read back from the host rather than predicted: writes
 * swallow transport and revision failures by design.
 *
 * @module dsh-chat-ux/client/settings-card
 */
import * as React from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { CARD_CLASS } from './config-card-styles'
import {
  MAX_REVEAL_MS,
  MIN_REVEAL_MS,
  clampRevealMs,
} from './token-motion'
import type { LocaleLike, SettingsScope } from './settings-scope'

/** Field name inside the settings section; must match the host schema. */
const FIELD = 'revealMs'

/** Stable id tying the label to its control. */
const FIELD_ID = 'dsh-chat-ux-reveal-ms'

/** Stable id tying the control to the message under it. */
const MESSAGE_ID = 'dsh-chat-ux-reveal-ms-message'

/** Copy for one language. */
interface Copy {
  summary: (ms: number) => string
  fieldLabel: string
  fieldHint: string
  invalid: string
  overridden: string
  save: string
  saving: string
  reset: string
  failed: string
  unavailable: string
  readOnly: string
}

const zh: Copy = {
  summary: (ms) => '新出现的字符从 ' + MIN_REVEAL_MS + ' 起的淡入，' + ms + ' ms 后完全不透明。',
  fieldLabel: '渐变时长',
  fieldHint:
    '每个新出现的字符从半透明变到完全不透明所用的时间，越小越快。可填 ' +
    MIN_REVEAL_MS +
    '–' +
    MAX_REVEAL_MS +
    ' 毫秒，默认 120。',
  invalid: '请输入 ' + MIN_REVEAL_MS + ' 到 ' + MAX_REVEAL_MS + ' 之间的数字。',
  overridden: '已覆盖',
  save: '保存',
  saving: '保存中…',
  reset: '重置',
  failed: '保存未生效，请重试。',
  unavailable: '当前 dsh 还没有服务这个配置命名空间：host 半尚未加载，重启 dsh 后即可编辑。',
  readOnly: '当前设置文档是只读的，改动无法保存。',
}

const en: Copy = {
  summary: (ms) => 'New characters fade in and reach full opacity after ' + ms + ' ms.',
  fieldLabel: 'Fade duration',
  fieldHint:
    'How long one freshly revealed character takes to go from faint to fully opaque. Smaller is faster. Accepts ' +
    MIN_REVEAL_MS +
    '–' +
    MAX_REVEAL_MS +
    ' ms; the default is 120.',
  invalid: 'Enter a number between ' + MIN_REVEAL_MS + ' and ' + MAX_REVEAL_MS + '.',
  overridden: 'Overridden',
  save: 'Save',
  saving: 'Saving…',
  reset: 'Reset',
  failed: 'The save did not take effect. Please try again.',
  unavailable:
    'This dsh does not serve the settings namespace yet: the host half has not been loaded. Restart dsh to edit it here.',
  readOnly: 'The settings document is read-only, so changes cannot be saved.',
}

/** The same primary-subtag rule the locale plugin uses for a fresh browser. */
function browserLang(): 'zh' | 'en' {
  if (typeof navigator === 'undefined') return 'zh'
  return (navigator.language || '').toLowerCase().split('-')[0] === 'en' ? 'en' : 'zh'
}

/** Follow the host's language preference, re-rendering on every switch. */
function useLang(locale: LocaleLike | undefined): 'zh' | 'en' {
  const active = React.useSyncExternalStore(
    React.useCallback(
      (listener: () => void) => (locale ? locale.subscribe(listener) : () => {}),
      [locale],
    ),
    React.useCallback(() => (locale ? locale.getSnapshot().active : null), [locale]),
  )
  return active === 'en' || active === 'zh' ? active : browserLang()
}

/**
 * Parse one draft into the value a save would write.
 * @param text - what the input currently holds.
 * @returns the whole number of milliseconds, or null when the draft is not one.
 */
function parseDraft(text: string): number | null {
  if (text.trim().length === 0) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  if (value < MIN_REVEAL_MS || value > MAX_REVEAL_MS) return null
  return Math.round(value)
}

/**
 * Whether the raw user layer carries this field. Presence, not a value
 * comparison, is what marks a field overridden: an override equal to the
 * default is still an override.
 * @param user - the raw user section, of unknown shape.
 * @param field - field name to look for.
 * @returns true when the user layer names the field.
 */
function hasUserField(user: unknown, field: string): boolean {
  return typeof user === 'object' && user !== null && field in (user as Record<string, unknown>)
}

/** Props the Plugins page binds for one `plugins.bundle.config` entry. */
export interface ChatUxConfigCardProps {
  /** The bound scope over the `dsh-chat-ux` namespace. */
  scope: SettingsScope
  /** Locale service, when the deployment ships one. */
  locale?: LocaleLike
  /** `'page'` for the form; `'summary'` for the one-liner under the title. */
  view?: 'summary' | 'page'
}

/**
 * Render the plugin's configuration: one staged number field and its save.
 * @param props - the bound settings scope, the locale service, and the view.
 * @returns the form, or the one-line summary the page asks for.
 */
export function ChatUxConfigCard({ scope, locale, view }: ChatUxConfigCardProps): React.ReactElement {
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
    () => scope.getSnapshot(),
  )
  const lang = useLang(locale)
  const t = lang === 'en' ? en : zh
  const [draft, setDraft] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const stored = clampRevealMs(snapshot.value?.[FIELD])
  const overridden = hasUserField(snapshot.user, FIELD)
  const text = draft ?? String(stored)
  const parsed = parseDraft(text)
  const invalid = parsed === null
  const dirty = draft !== null && parsed !== stored
  const unavailable = snapshot.status === 'unavailable'
  const readOnly = snapshot.writable === false
  const disabled = saving || unavailable || readOnly

  if (view === 'summary') return React.createElement(React.Fragment, null, t.summary(stored))
  // A namespace nothing serves gets the same one-line answer the page's own
  // cards give, rather than controls the host would refuse.
  if (unavailable) {
    return React.createElement('p', { className: CARD_CLASS.notice, role: 'status' }, t.unavailable)
  }

  const save = async (): Promise<void> => {
    if (parsed === null) return
    setSaving(true)
    setFailed(false)
    await scope.set(FIELD, parsed)
    // The host's readback is the only authority on what landed.
    const landed = clampRevealMs(scope.getSnapshot().value?.[FIELD]) === parsed
    if (landed) setDraft(null)
    else setFailed(true)
    setSaving(false)
  }

  const reset = async (): Promise<void> => {
    setSaving(true)
    setFailed(false)
    await scope.unset(FIELD)
    if (hasUserField(scope.getSnapshot().user, FIELD)) setFailed(true)
    else setDraft(null)
    setSaving(false)
  }

  const head = React.createElement(
    'div',
    { key: 'head', className: CARD_CLASS.head },
    React.createElement(
      'div',
      { className: CARD_CLASS.labelGroup },
      React.createElement('label', { className: CARD_CLASS.label, htmlFor: FIELD_ID }, t.fieldLabel),
    ),
    overridden
      ? React.createElement(
          'span',
          { className: CARD_CLASS.badges },
          React.createElement(Tag, { key: 'tag', tone: 'neutral' }, t.overridden),
          React.createElement(
            'button',
            {
              key: 'reset',
              type: 'button',
              className: CARD_CLASS.reset,
              disabled: disabled || saving,
              onClick: () => void reset(),
            },
            t.reset,
          ),
        )
      : null,
  )

  const field = React.createElement(
    'div',
    { key: 'field', className: CARD_CLASS.field },
    head,
    React.createElement('input', {
      id: FIELD_ID,
      className: CARD_CLASS.input,
      type: 'text',
      inputMode: 'numeric',
      'aria-invalid': invalid ? true : undefined,
      'aria-describedby': MESSAGE_ID,
      value: text,
      disabled,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setDraft(event.target.value)
        setFailed(false)
      },
    }),
    React.createElement(
      'p',
      { id: MESSAGE_ID, className: invalid ? CARD_CLASS.invalid : CARD_CLASS.hint },
      invalid ? t.invalid : t.fieldHint,
    ),
  )

  const footer = React.createElement(
    'div',
    { key: 'footer', className: CARD_CLASS.footer },
    failed ? React.createElement('p', { className: CARD_CLASS.failed, role: 'status' }, t.failed) : null,
    React.createElement(
      'button',
      {
        type: 'button',
        className: CARD_CLASS.save,
        disabled: disabled || invalid || !dirty,
        onClick: () => void save(),
      },
      saving ? t.saving : t.save,
    ),
  )

  return React.createElement(
    'div',
    { className: CARD_CLASS.form, 'data-plugin-config-form': 'dsh-chat-ux' },
    readOnly
      ? React.createElement('p', { key: 'readonly', className: CARD_CLASS.notice, role: 'status' }, t.readOnly)
      : null,
    field,
    footer,
  )
}
