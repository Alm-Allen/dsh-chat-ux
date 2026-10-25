/**
 * 在网页端把「工作步骤展示」的默认档位补成「标准」。
 *
 * 只在表单就绪、可写且用户层没有显式选择时写一次；写入失败或版本围栏拒绝后不再重试。
 */
import type {ConfigForm, ConfigFormSnapshot} from './settings-scope'

/** `ui-chat` 这一条的命名空间；dsh 的聊天设置住在它里面。 */
const CHAT_SETTINGS_NAMESPACE = 'ui-chat'

/** 「工作步骤展示」那一项的字段名。 */
const TRANSCRIPT_VIEW_FIELD = 'transcriptView'

/** 要补的那一档。 */
const TRANSCRIPT_VIEW_STANDARD = 'standard'

/** `ui-chat` 那一条里这一处只读这一个字段。 */
interface ChatSettingsLike {
    /** 读者显式选过的档位；缺席时由客户端那侧的默认值说了算。 */
    transcriptView?: string | null | undefined
}

/**
 * 补上这一次默认：表单就绪之前等着，就绪之后写一次就撒手。
 */
export function applyTranscriptViewDefault(forms: {
    get<T>(entryId: string): ConfigForm<T>
}): () => void {
    const form = forms.get<ChatSettingsLike>(CHAT_SETTINGS_NAMESPACE)
    let done = false
    const check = (): void => {
        if (done) return
        if (!needsStandard(form.getSnapshot())) return
        done = true
        void form.set(TRANSCRIPT_VIEW_FIELD, TRANSCRIPT_VIEW_STANDARD).catch(() => undefined)
    }
    // 订阅之前先看一眼：共享表单常常比插件先到，那一次快照变化就不会再来了。
    check()
    return form.subscribe(check)
}

/**
 * 这一刻该不该补。
 */
function needsStandard(snapshot: ConfigFormSnapshot<ChatSettingsLike>): boolean {
    if (snapshot.status !== 'ready') return false
    if (snapshot.writable === false) return false
    return savedMode(snapshot.user) === undefined
}

/** 用户层里显式写下的档位。 */
function savedMode(user: unknown): unknown {
    if (!isRecord(user)) return undefined
    return user[TRANSCRIPT_VIEW_FIELD] ?? undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
