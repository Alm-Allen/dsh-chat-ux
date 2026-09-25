/**
 * 插件管理页上的插件配置卡片。
 *
 * dsh >= 0.1.6 会把一个 bundle 自己的配置渲染在 bundle 的页面上、`plugins.bundle.config` 座位里、
 * 按包名 keyed，位置在包描述和它下面那些行之间。标题、图标和面包屑由页面画；这个组件只是表单本身，
 * 也就是 `view: 'page'` 要的东西。
 *
 * 它是用页面自己的配置卡片所用的同一批零件搭出来的：开关是 `dsh-client-ui-primitives` 里共享的
 * `Switch`（dsh 设置页里那些开关都是它），光标那三档是同一个包里的 `SegmentedControl`，覆盖徽标
 * 是同一个包里的 `Tag`，字段节奏、控件几何和 `--dsw-*` 令牌来自官方插件配置页（见
 * `config-card-styles.ts`）。这里没有任何东西是从零设计的，因为一张夹在两张官方卡片中间的卡片
 * 不该看起来像来自别处。
 *
 * 开关与档位**即时写入**：点一下就存，和 dsh 自己的开关一样，没有「保存」那一步；写入在途时控件
 * 禁用，之后从 host 读回来的值才是「落地了」的权威——写入在设计上就会吞掉传输层与版本号的失败。
 *
 * 两个字体输入框多一道提交（回车或失焦才写）：它们要等读者把名字打完，而每敲一个字符都是一次设置
 * 文档写入。打完之前的那串字只活在这个组件里，不合法的那串一个字都不写。
 *
 * @module dsh-chat-ux/client/settings-card
 */
import { useCallback, useId, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { SegmentedControl, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CaretMotionMode } from './caret-motion'
import { CARD_CLASS } from './config-card-styles'
import { isFontFamilyValue } from './font-override'
import { DEFAULT_CARET_MOTION, DEFAULT_EMBEDDED_FONTS, DEFAULT_ENHANCED_FOLLOW, DEFAULT_FONT_FAMILY } from './settings-scope'
import type { ChatUxSection, ConfigForm, LocaleLike } from './settings-scope'

/** 设置分节里的字段名；必须与 host 侧的 schema 一致。 */
const FOLLOW_FIELD = 'enhancedFollow'
const CARET_FIELD = 'caretMotion'
const FONTS_FIELD = 'fonts'
const FONT_SANS_FIELD = 'fontSans'
const FONT_CODE_FIELD = 'fontCode'

/** 卡片文案的语种：这一张卡片只有中英两套。 */
type CopyLanguage = 'zh' | 'en'

/** 一种语言的文案。 */
interface Copy {
  summary: (followOn: boolean) => string
  followLabel: string
  followHint: string
  caretLabel: string
  caretHint: string
  caretOff: string
  caretMove: string
  caretTyping: string
  fontsLabel: string
  fontsHint: string
  fontsOffHint: string
  sansLabel: string
  sansHint: string
  sansPlaceholder: string
  codeLabel: string
  codeHint: string
  codePlaceholder: string
  invalid: string
  overridden: string
  reset: string
  failed: string
  unavailable: string
  readOnly: string
}

const ZH_COPY: Copy = {
  summary: (followOn) => '跟随守护：' + (followOn ? '开' : '关') + '。光标动效、自带字体与你自己填的字体栈也在这里调。',
  followLabel: '增强跟随',
  followHint:
    '模型开始新的动作（思考结束、发起工具调用）时，把聊天区刻意拉回底部，修掉跟随偶尔的丢失。'
    + '读者自己滚动离开底部的那段时间一概不动手——那一段交给你。',
  caretLabel: '光标动效',
  caretHint:
    '把浏览器那根插入符换成自绘的，位移走 80 ms 过渡。「移动时」只在方向键、点击这类显式移动上放过渡，'
    + '打字瞬时；「无论何时」连打字也滑过去。关掉就用回浏览器原来的那根。',
  caretOff: '关',
  caretMove: '移动时',
  caretTyping: '无论何时',
  fontsLabel: '自带字体',
  fontsHint:
    '用插件自带的两套字体接管界面：正文 HarmonyOS Sans SC，等宽 Maple Mono NF CN。'
    + '关掉就回到 dsh 自己的字体栈，下面两项随之停用。',
  fontsOffHint: '自带字体关着，这一项现在不生效。',
  sansLabel: '正文字体',
  sansHint:
    '填你想要的字体名，它会排在整个字体栈的最前面；系统里没有的名字由自带字体接住，写错了也不会比不填更差。'
    + '留空用自带的。',
  sansPlaceholder: '例如 Microsoft YaHei, sans-serif',
  codeLabel: '代码字体',
  codeHint: '等宽字体，代码块、行内代码与界面里的等宽文本都用它。留空用自带的。',
  codePlaceholder: '例如 JetBrains Mono, monospace',
  invalid: '这不是一个合法的字体名，回车不会保存。',
  overridden: '已覆盖',
  reset: '重置',
  failed: '保存未生效，请重试。',
  unavailable: '当前 dsh 没有向这个页面提供 dsh-chat-ux 的配置：这一行可能没在这个 profile 里启用，或者连接把偏好留在页面进程里。',
  readOnly: '当前设置文档是只读的，改动无法保存。',
}

const EN_COPY: Copy = {
  summary: (followOn) =>
    'Follow guard: ' + (followOn ? 'on' : 'off') + '. Caret motion, the bundled fonts and your own font stacks are adjustable here.',
  followLabel: 'Enhanced follow',
  followHint:
    'Pull the transcript back to the bottom when the model starts something new (thinking ends, a tool call '
    + 'begins), which fixes the occasional lost follow. A reader who scrolls away from the bottom is left alone.',
  caretLabel: 'Caret motion',
  caretHint:
    'Redraw the caret so it slides over 80 ms. "On move" animates explicit moves only — arrow keys, clicks — and '
    + 'leaves typing instant; "On typing" animates every keystroke too. Off keeps the browser\'s own caret.',
  caretOff: 'Off',
  caretMove: 'On move',
  caretTyping: 'On typing',
  fontsLabel: 'Bundled fonts',
  fontsHint:
    'Take over the interface with the two bundled families: HarmonyOS Sans SC for text, Maple Mono NF CN for '
    + 'code. Turning this off restores dsh\'s own font stacks and disables the two fields below.',
  fontsOffHint: 'Bundled fonts are off, so this field has no effect right now.',
  sansLabel: 'Text font',
  sansHint:
    'A family you want, placed at the very front of the stack. A name this machine lacks falls through to the '
    + 'bundled fonts, so a typo is never worse than leaving it blank. Leave blank to use the bundled one.',
  sansPlaceholder: 'e.g. Georgia, serif',
  codeLabel: 'Code font',
  codeHint: 'The monospace family used by code blocks, inline code, and monospace text in the interface. Leave blank to use the bundled one.',
  codePlaceholder: 'e.g. JetBrains Mono, monospace',
  invalid: 'That is not a valid font family, so Enter will not save it.',
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
 * 渲染这个插件的配置：两个开关、光标动效的三档，以及两条自定义字体栈。
 * @param props - 绑定好的设置 scope、locale 服务，以及视图。
 * @returns 那个表单，或者页面要的一行摘要。
 */
export function ChatUxConfigCard({ scope, locale, view }: ChatUxConfigCardProps): ReactElement {
  const snapshot = useSyncExternalStore(
    useCallback((listener: () => void) => scope.subscribe(listener), [scope]),
    () => scope.getSnapshot(),
  )
  // 跟着 host 的语言偏好走，每次切换都重新渲染；locale 服务缺席时问浏览器，认不出英文就落中文。
  const activeLanguage = useSyncExternalStore(
    useCallback((listener: () => void) => (locale ? locale.subscribe(listener) : () => {}), [locale]),
    useCallback(() => (locale ? locale.getSnapshot().active : null), [locale]),
  )
  const browserLanguage = typeof navigator === 'undefined' ? null : navigator.language
  const copy = resolveCopyLanguage(activeLanguage, browserLanguage) === 'en' ? EN_COPY : ZH_COPY
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  // 两个输入框各留一份草稿：null 是「没有本地编辑」，显示的就是 host 上的值。提交成功后草稿与
  // host 值相同，所以不必清；只有「重置」要把草稿丢掉，否则它会盖住刚被清掉的字段。
  const [sansDraft, setSansDraft] = useState<string | null>(null)
  const [codeDraft, setCodeDraft] = useState<string | null>(null)
  const fieldId = useId()

  const followOn = storedFollow(snapshot.value)
  const caretMode = storedCaret(snapshot.value)
  const fontsOn = storedFonts(snapshot.value)
  const sans = sansDraft ?? storedSans(snapshot.value)
  const code = codeDraft ?? storedCode(snapshot.value)
  const unavailable = snapshot.status === 'unavailable'
  const readOnly = snapshot.writable === false
  const controlsDisabled = saving || unavailable || readOnly
  const caretOptions: readonly SegmentedControlOption<CaretMotionMode>[] = [
    { value: 'off', label: copy.caretOff },
    { value: 'move', label: copy.caretMove },
    { value: 'typing', label: copy.caretTyping },
  ]

  if (view === 'summary') return <>{copy.summary(followOn)}</>
  // 一个没有东西服务的命名空间，给的是页面自己那些卡片给的同一行回答，而不是 host 会拒绝的控件。
  if (unavailable) return <p className={CARD_CLASS.notice} role="status">{copy.unavailable}</p>

  /** 写入一个字段，然后从 host 读回来确认它真的落地了。 */
  const writeField = async <T,>(
    field: string,
    next: T,
    readBack: (value: ChatUxSection | undefined) => T,
  ): Promise<void> => {
    setSaving(true)
    setFailed(false)
    const accepted = await scope.set(field, next)
    const landed = accepted && readBack(scope.getSnapshot().value) === next
    setFailed(!landed)
    setSaving(false)
  }

  /** 提交一个字体字段：留空写的是清除（回到默认层），有值就写那串字。 */
  const commitFont = async (
    field: string,
    draft: string,
    readBack: (value: ChatUxSection | undefined) => string,
  ): Promise<void> => {
    const text = draft.trim()
    // 不合法的那串一个字都不写：输入框下面已经说了它不合法，写进去只会让界面悄悄回落到自带字体。
    if (text !== '' && !isFontFamilyValue(text)) return
    setSaving(true)
    setFailed(false)
    const accepted = text === '' ? await scope.unset(field) : await scope.set(field, text)
    const landed = accepted && readBack(scope.getSnapshot().value) === (text === '' ? DEFAULT_FONT_FAMILY : text)
    setFailed(!landed)
    setSaving(false)
  }

  /** 清掉用户层里的覆盖，让取值退回默认层。 */
  const reset = async (field: string): Promise<void> => {
    setSaving(true)
    setFailed(false)
    await scope.unset(field)
    const stillOverridden = userLayerHasField(scope.getSnapshot().user, field)
    setFailed(stillOverridden)
    setSaving(false)
  }

  /** 一行「标签 + 说明 + 覆盖徽标 + 控件」的骨架，四种字段共用。 */
  const rowChrome = (field: string, label: string, hint: string, control: ReactElement): ReactElement => (
    <div className={CARD_CLASS.row}>
      <div className={CARD_CLASS.rowText}>
        <div className={CARD_CLASS.label}>{label}</div>
        <p className={CARD_CLASS.hint}>{hint}</p>
      </div>
      {userLayerHasField(snapshot.user, field) && (
        <span className={CARD_CLASS.badges}>
          <Tag tone="neutral">{copy.overridden}</Tag>
          <button
            type="button"
            className={CARD_CLASS.reset}
            disabled={controlsDisabled}
            onClick={() => void reset(field)}
          >
            {copy.reset}
          </button>
        </span>
      )}
      {control}
    </div>
  )

  return (
    <div className={CARD_CLASS.form} data-plugin-config-form="dsh-chat-ux">
      {readOnly && <p className={CARD_CLASS.notice} role="status">{copy.readOnly}</p>}
      {rowChrome(FOLLOW_FIELD, copy.followLabel, copy.followHint, (
        <Switch
          checked={followOn}
          disabled={controlsDisabled}
          label={copy.followLabel}
          onChange={(next: boolean) => void writeField(FOLLOW_FIELD, next, storedFollow)}
        />
      ))}
      {rowChrome(CARET_FIELD, copy.caretLabel, copy.caretHint, (
        <SegmentedControl
          id={fieldId + '-caret'}
          value={caretMode}
          options={caretOptions}
          onChange={(next) => void writeField(CARET_FIELD, next, storedCaret)}
          label={copy.caretLabel}
          disabled={controlsDisabled}
          className={CARD_CLASS.segment}
        />
      ))}
      {rowChrome(FONTS_FIELD, copy.fontsLabel, copy.fontsHint, (
        <Switch
          checked={fontsOn}
          disabled={controlsDisabled}
          label={copy.fontsLabel}
          onChange={(next: boolean) => void writeField(FONTS_FIELD, next, storedFonts)}
        />
      ))}
      <FontField
        id={fieldId + '-sans'}
        label={copy.sansLabel}
        hint={fontsOn ? copy.sansHint : copy.fontsOffHint}
        placeholder={copy.sansPlaceholder}
        value={sans}
        overridden={userLayerHasField(snapshot.user, FONT_SANS_FIELD)}
        disabled={controlsDisabled || !fontsOn}
        copy={copy}
        onEdit={setSansDraft}
        onCommit={() => void commitFont(FONT_SANS_FIELD, sans, storedSans)}
        onReset={() => { setSansDraft(null); void reset(FONT_SANS_FIELD) }}
      />
      <FontField
        id={fieldId + '-code'}
        label={copy.codeLabel}
        hint={fontsOn ? copy.codeHint : copy.fontsOffHint}
        placeholder={copy.codePlaceholder}
        value={code}
        overridden={userLayerHasField(snapshot.user, FONT_CODE_FIELD)}
        disabled={controlsDisabled || !fontsOn}
        copy={copy}
        onEdit={setCodeDraft}
        onCommit={() => void commitFont(FONT_CODE_FIELD, code, storedCode)}
        onReset={() => { setCodeDraft(null); void reset(FONT_CODE_FIELD) }}
      />
      {failed && <p className={CARD_CLASS.failed} role="status">{copy.failed}</p>}
    </div>
  )
}

/** 一行字体输入：标签、覆盖徽标、输入框与说明。回车或失焦才提交。 */
function FontField(props: {
  id: string
  label: string
  hint: string
  placeholder: string
  value: string
  overridden: boolean
  disabled: boolean
  copy: Copy
  onEdit: (text: string) => void
  onCommit: () => void
  onReset: () => void
}): ReactElement {
  const { copy } = props
  // 空串是「没有自定义」，不是一个不合法的值：它不该标红。
  const invalid = props.value.trim() !== '' && !isFontFamilyValue(props.value)
  const inputId = props.id + '-input'
  const hintId = props.id + '-hint'
  return (
    <div className={CARD_CLASS.field}>
      <div className={CARD_CLASS.fieldHead}>
        <label className={CARD_CLASS.label} htmlFor={inputId}>{props.label}</label>
        {props.overridden && (
          <span className={CARD_CLASS.badges}>
            <Tag tone="neutral">{copy.overridden}</Tag>
            <button type="button" className={CARD_CLASS.reset} disabled={props.disabled} onClick={props.onReset}>
              {copy.reset}
            </button>
          </span>
        )}
      </div>
      <input
        id={inputId}
        className={CARD_CLASS.input}
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder={props.placeholder}
        value={props.value}
        disabled={props.disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        onChange={(event) => { props.onEdit(event.target.value) }}
        onBlur={props.onCommit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          props.onCommit()
        }}
      />
      <p id={hintId} className={invalid ? CARD_CLASS.invalid : CARD_CLASS.hint}>
        {invalid ? copy.invalid : props.hint}
      </p>
    </div>
  )
}

/** 从 host 的值里读增强跟随。 */
function storedFollow(value: ChatUxSection | undefined): boolean {
  return value?.enhancedFollow ?? DEFAULT_ENHANCED_FOLLOW
}

/** 从 host 的值里读光标动效档位。 */
function storedCaret(value: ChatUxSection | undefined): CaretMotionMode {
  return value?.caretMotion ?? DEFAULT_CARET_MOTION
}

/** 从 host 的值里读自带字体开关。 */
function storedFonts(value: ChatUxSection | undefined): boolean {
  return value?.fonts ?? DEFAULT_EMBEDDED_FONTS
}

/** 从 host 的值里读自定义正文字体栈。 */
function storedSans(value: ChatUxSection | undefined): string {
  return value?.fontSans ?? DEFAULT_FONT_FAMILY
}

/** 从 host 的值里读自定义等宽字体栈。 */
function storedCode(value: ChatUxSection | undefined): string {
  return value?.fontCode ?? DEFAULT_FONT_FAMILY
}

/**
 * 定这一张卡片说哪种语言。
 *
 * dsh 的活跃语言优先，认得就跟着它——`zh-Hant` 这类子标签按主语言子标签归到中文。它缺席
 * （没有 locale 服务）或拿不出内容时问浏览器语言；两条都认不出英文就用中文，中文在这里是
 * 兜底，而不是"非英文即中文"的巧合。dsh 自己把认不出的语言落回英文，这一张卡片不跟它：
 * 中文是这套文案的主要读者。
 * @param active - locale 服务报的活跃语言 id；服务缺席时是 null。
 * @param browserLanguage - `navigator.language`；非浏览器运行里是 null。
 * @returns 读哪一套文案。
 */
function resolveCopyLanguage(active: string | null | undefined, browserLanguage: string | null | undefined): CopyLanguage {
  const language = nonEmpty(active) ?? nonEmpty(browserLanguage) ?? 'zh'
  return language.toLowerCase().split('-')[0] === 'en' ? 'en' : 'zh'
}

/**
 * 只放行非空字符串。
 * @param value - 可能是 null、undefined 或空串的候选。
 * @returns 能用的那串字，或 undefined。
 */
function nonEmpty(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  return value
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
