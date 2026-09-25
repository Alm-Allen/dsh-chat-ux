/**
 * 插件管理页上的插件配置卡片。
 *
 * dsh >= 0.1.6 会把一个 bundle 自己的配置渲染在 bundle 的页面上、`plugins.bundle.config` 座位里、
 * 按包名 keyed，位置在包描述和它下面那些行之间。标题、图标和面包屑由页面画；这个组件只是表单本身，
 * 也就是 `view: 'page'` 要的东西。
 *
 * 它是用页面自己的配置卡片所用的同一批零件搭出来的：开关是 `dsh-client-ui-primitives` 里共享的
 * `Switch`（dsh 设置页里那些开关都是它），覆盖徽标是同一个包里的 `Tag`，字段节奏、控件几何和
 * `--dsw-*` 令牌来自官方插件配置页（见 `config-card-styles.ts`）。这里没有任何东西是从零设计的，
 * 因为一张夹在两张官方卡片中间的卡片不该看起来像来自别处。
 *
 * 开关**即时写入**：点一下就存，和 dsh 自己的开关一样，没有「保存」那一步。写入在途时控件禁用，
 * 之后从 host 读回来的值才是「落地了」的权威——写入在设计上就会吞掉传输层与版本号的失败。
 *
 * @module dsh-chat-ux/client/settings-card
 */
import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { CARD_CLASS } from './config-card-styles'
import { DEFAULT_ENHANCED_FOLLOW } from './settings-scope'
import type { ChatUxSection, ConfigForm, LocaleLike } from './settings-scope'

/** 设置分节里的字段名；必须与 host 侧的 schema 一致。 */
const FIELD_NAME = 'enhancedFollow'

/** 一种语言的文案。 */
interface Copy {
  summary: (on: boolean) => string
  fieldLabel: string
  fieldHint: string
  overridden: string
  reset: string
  failed: string
  unavailable: string
  readOnly: string
}

const ZH_COPY: Copy = {
  summary: (on) => '思考结束、发起工具调用时把聊天区拉回底部：' + (on ? '开。' : '关。'),
  fieldLabel: '增强跟随',
  fieldHint:
    '模型开始新的动作（思考结束、发起工具调用）时，把聊天区刻意拉回底部，修掉跟随偶尔的丢失。'
    + '读者自己滚动离开底部的那段时间一概不动手——那一段交给你。',
  overridden: '已覆盖',
  reset: '重置',
  failed: '保存未生效，请重试。',
  unavailable: '当前 dsh 没有向这个页面提供 dsh-chat-ux 的配置：这一行可能没在这个 profile 里启用，或者连接把偏好留在页面进程里。',
  readOnly: '当前设置文档是只读的，改动无法保存。',
}

const EN_COPY: Copy = {
  summary: (on) => 'Pull the transcript back to the tail when thinking ends or a tool call starts: ' + (on ? 'on.' : 'off.'),
  fieldLabel: 'Enhanced follow',
  fieldHint:
    'Pull the transcript back to the bottom when the model starts something new (thinking ends, a tool call '
    + 'begins), which fixes the occasional lost follow. A reader who scrolls away from the bottom is left alone.',
  overridden: 'Overridden',
  reset: 'Reset',
  failed: 'The save did not take effect. Please try again.',
  unavailable:
    'This dsh does not expose dsh-chat-ux configuration to this page: the entry may be disabled in this profile, or the connection keeps preferences inside the page process.',
  readOnly: 'The settings document is read-only, so changes cannot be saved.',
}

/** 插件管理页为一条 `plugins.bundle.config` 记录绑定的 props。 */
export interface ChatUxConfigCardProps {
  /** `dsh-chat-ux` 这一行的共享配置表单。 */
  scope: ConfigForm<ChatUxSection>
  /** locale 服务，部署里有的话。 */
  locale?: LocaleLike
  /** `'page'` 是要表单；`'summary'` 是标题下面那一行摘要。 */
  view?: 'summary' | 'page'
}

/**
 * 渲染这个插件的配置：一行「增强跟随」的开关。
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
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const enabled = snapshot.value?.enhancedFollow ?? DEFAULT_ENHANCED_FOLLOW
  const overridden = userLayerHasField(snapshot.user, FIELD_NAME)
  const unavailable = snapshot.status === 'unavailable'
  const readOnly = snapshot.writable === false
  const controlsDisabled = saving || unavailable || readOnly

  if (view === 'summary') return <>{copy.summary(enabled)}</>
  // 一个没有东西服务的命名空间，给的是页面自己那些卡片给的同一行回答，而不是 host 会拒绝的控件。
  if (unavailable) return <p className={CARD_CLASS.notice} role="status">{copy.unavailable}</p>

  /** 写入新的开关值，然后从 host 读回来确认它真的落地了。 */
  const toggle = async (next: boolean): Promise<void> => {
    setSaving(true)
    setFailed(false)
    const accepted = await scope.set(FIELD_NAME, next)
    const landed = accepted && (scope.getSnapshot().value?.enhancedFollow ?? DEFAULT_ENHANCED_FOLLOW) === next
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
    setSaving(false)
  }

  return (
    <div className={CARD_CLASS.form} data-plugin-config-form="dsh-chat-ux">
      {readOnly && <p className={CARD_CLASS.notice} role="status">{copy.readOnly}</p>}
      <div className={CARD_CLASS.row}>
        <div className={CARD_CLASS.rowText}>
          <div className={CARD_CLASS.label}>{copy.fieldLabel}</div>
          <p className={CARD_CLASS.hint}>{copy.fieldHint}</p>
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
        <Switch
          checked={enabled}
          disabled={controlsDisabled}
          label={copy.fieldLabel}
          onChange={(next: boolean) => void toggle(next)}
        />
      </div>
      {failed && <p className={CARD_CLASS.failed} role="status">{copy.failed}</p>}
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
