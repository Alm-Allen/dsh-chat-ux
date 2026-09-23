/**
 * 插件管理页上的插件配置卡片。
 *
 * dsh >= 0.1.6 会把一个 bundle 自己的配置渲染在 bundle 的页面上、`plugins.bundle.config` 座位里、
 * 按包名 keyed，位置在包描述和它下面那些行之间。标题、图标和面包屑由页面画；这个组件只是表单本身，
 * 也就是 `view: 'page'` 要的东西。
 *
 * 它是用页面自己的配置卡片所用的同一批零件搭出来的：覆盖徽标用 `dsh-client-ui-primitives` 里共享
 * 的 `Tag`，字段节奏、控件几何和 `--dsw-*` 令牌来自官方插件配置页（见 `config-card-styles.ts`）。
 * 这里没有任何东西是从零设计的，因为一张夹在两张官方卡片中间的卡片不该看起来像来自别处。
 *
 * 按下保存之前什么都不写。草稿是文本，所以输入框显示什么、保存就存什么，而离开页面就把它丢掉
 * （页面会卸载这一项，所以没有「放弃」控件可提供）。值是否被接受是从 host 读回来的，而不是预测
 * 出来的：写入在设计上就会吞掉传输层与版本号的失败。
 *
 * @module dsh-chat-ux/client/settings-card
 */
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ReactElement } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { CARD_CLASS } from './config-card-styles'
import { MAX_REVEAL_MS, MIN_REVEAL_MS, clampRevealMs } from './token-motion'
import type { LocaleLike, SettingsScope } from './settings-scope'

/** 设置分节里的字段名；必须与 host 侧的 schema 一致。 */
const FIELD_NAME = 'revealMs'

/** 把 label 和它的控件绑在一起的那个固定 id。 */
const FIELD_INPUT_ID = 'dsh-chat-ux-reveal-ms'

/** 把控件和它下面那条消息绑在一起的那个固定 id。 */
const FIELD_MESSAGE_ID = 'dsh-chat-ux-reveal-ms-message'

/** 一种语言的文案。 */
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

const ZH_COPY: Copy = {
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

const EN_COPY: Copy = {
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

/** 插件管理页为一条 `plugins.bundle.config` 记录绑定的 props。 */
export interface ChatUxConfigCardProps {
  /** 绑定在 `dsh-chat-ux` 命名空间上的 scope。 */
  scope: SettingsScope
  /** locale 服务，部署里有的话。 */
  locale?: LocaleLike
  /** `'page'` 是要表单；`'summary'` 是标题下面那一行摘要。 */
  view?: 'summary' | 'page'
}

/**
 * 渲染这个插件的配置：一个分阶段的数字输入框，和它的保存。
 * @param props - 绑定好的设置 scope、locale 服务，以及视图。
 * @returns 那个表单，或者页面要的一行摘要。
 */
export function ChatUxConfigCard({ scope, locale, view }: ChatUxConfigCardProps): ReactElement {
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
    () => scope.getSnapshot(),
  )
  // 跟着 host 的语言偏好走，每次切换都重新渲染；locale 服务缺席时退回浏览器语言——和 locale
  // 插件给全新浏览器用的那条主语言子标签规则一样。
  const activeLanguage = useSyncExternalStore(
    useCallback((listener: () => void) => (locale ? locale.subscribe(listener) : () => {}), [locale]),
    useCallback(() => (locale ? locale.getSnapshot().active : null), [locale]),
  )
  const browserLanguage: 'zh' | 'en' =
    typeof navigator !== 'undefined' && (navigator.language || '').toLowerCase().split('-')[0] === 'en' ? 'en' : 'zh'
  const language = activeLanguage === 'en' || activeLanguage === 'zh' ? activeLanguage : browserLanguage
  const copy = language === 'en' ? EN_COPY : ZH_COPY
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  // 存着的值一律过一遍 clamp，所以 host 那边无论塞进来什么形状的东西，这里都有个能用的数。
  const stored = clampRevealMs(snapshot.value?.revealMs)
  const overridden = userLayerHasField(snapshot.user, FIELD_NAME)
  const text = draft ?? String(stored)
  // `Number('')` 是 0，会被误当成一个合法数字，所以空草稿先顶成 NaN。
  const typedValue = text.trim() === '' ? Number.NaN : Number(text.trim())
  const parsed = Number.isFinite(typedValue) && typedValue >= MIN_REVEAL_MS && typedValue <= MAX_REVEAL_MS
    ? Math.round(typedValue)
    : null
  const invalid = parsed === null
  const dirty = draft !== null && parsed !== stored
  const unavailable = snapshot.status === 'unavailable'
  const readOnly = snapshot.writable === false
  const controlsDisabled = saving || unavailable || readOnly

  if (view === 'summary') return <>{copy.summary(stored)}</>
  // 一个没有东西服务的命名空间，给的是页面自己那些卡片给的同一行回答，而不是 host 会拒绝的控件。
  if (unavailable) return <p className={CARD_CLASS.notice} role="status">{copy.unavailable}</p>

  /** 保存草稿，然后从 host 读回来确认它真的落地了。 */
  const save = async (): Promise<void> => {
    if (parsed === null) return
    setSaving(true)
    setFailed(false)
    await scope.set(FIELD_NAME, parsed)
    // host 读回来的那个值，才是「落地了」的唯一权威。
    const landed = clampRevealMs(scope.getSnapshot().value?.revealMs) === parsed
    if (landed) setDraft(null)
    setFailed(!landed)
    setSaving(false)
  }

  /** 清掉用户层里的覆盖，让取值退回默认层。 */
  const reset = async (): Promise<void> => {
    setSaving(true)
    setFailed(false)
    await scope.unset(FIELD_NAME)
    const stillOverridden = userLayerHasField(scope.getSnapshot().user, FIELD_NAME)
    setFailed(stillOverridden)
    if (!stillOverridden) setDraft(null)
    setSaving(false)
  }

  // 输入框下面那行字：草稿不合法时报错，否则给提示。
  const messageClass = invalid ? CARD_CLASS.invalid : CARD_CLASS.hint
  const messageText = invalid ? copy.invalid : copy.fieldHint
  const saveLabel = saving ? copy.saving : copy.save

  return (
    <div className={CARD_CLASS.form} data-plugin-config-form="dsh-chat-ux">
      {readOnly && <p className={CARD_CLASS.notice} role="status">{copy.readOnly}</p>}
      <div className={CARD_CLASS.field}>
        <div className={CARD_CLASS.head}>
          <div className={CARD_CLASS.labelGroup}>
            <label className={CARD_CLASS.label} htmlFor={FIELD_INPUT_ID}>{copy.fieldLabel}</label>
          </div>
          {overridden && (
            <span className={CARD_CLASS.badges}>
              <Tag tone="neutral">{copy.overridden}</Tag>
              <button
                type="button"
                className={CARD_CLASS.reset}
                disabled={controlsDisabled}
                onClick={() => void reset()}
              >
                {copy.reset}
              </button>
            </span>
          )}
        </div>
        <input
          id={FIELD_INPUT_ID}
          className={CARD_CLASS.input}
          type="text"
          inputMode="numeric"
          aria-invalid={invalid || undefined}
          aria-describedby={FIELD_MESSAGE_ID}
          value={text}
          disabled={controlsDisabled}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setDraft(event.target.value)
            setFailed(false)
          }}
        />
        <p id={FIELD_MESSAGE_ID} className={messageClass}>{messageText}</p>
      </div>
      <div className={CARD_CLASS.footer}>
        {failed && <p className={CARD_CLASS.failed} role="status">{copy.failed}</p>}
        <button
          type="button"
          className={CARD_CLASS.save}
          disabled={controlsDisabled || invalid || !dirty}
          onClick={() => void save()}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

/**
 * 原始用户层里有没有这个字段。标记「已覆盖」看的是「在不在」，而不是值比不比得上默认值：
 * 一个恰好等于默认值的覆盖，仍然是覆盖。
 * @param user - 原始的用户分节，形状未知。
 * @param field - 要找的字段名。
 * @returns 用户层里点名了这个字段时为真。
 */
function userLayerHasField(user: unknown, field: string): boolean {
  if (typeof user !== 'object' || user === null) return false
  return field in (user as Record<string, unknown>)
}
