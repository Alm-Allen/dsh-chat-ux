/**
 * 把「工作步骤展示」的默认档位补成「标准」。
 *
 * dsh 自己按客户端给这一项默认值：桌面端是「标准」，网页端是「详细」（dsh 的
 * `DEFAULT_TRANSCRIPT_VIEW_MODE`）。这个插件的过程组行为——运行中自动展开、这一段结束再收起、
 * 组体跟随——本来就是照着「标准」与「简洁」两档设计的，所以在网页端把缺省补成「标准」，读者装上
 * 插件看到的就是它。
 *
 * **只在读者自己没选过的时候补一次。** `ui-chat` 那一条的用户层里一旦写下 `transcriptView`
 * （读者在 设置 → 通用 → 工作步骤展示 里点过那一下），这里就一次都不再动手——写进去的是一次普通的
 * 用户选择，与读者自己点出来的是同一个字段，所以卸载插件之后它照样留着。
 *
 * 只试一次：表单不可写、或写入被版本号围栏挡回来，都不再纠缠，下一次加载页面时再说。
 *
 * @module dsh-chat-ux/client/settings/transcript-default
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
 * @param forms - 客户端 context 上的 `configForms` 服务。
 * @returns 卸下订阅用的函数。
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
        void form.set(TRANSCRIPT_VIEW_FIELD, TRANSCRIPT_VIEW_STANDARD)
    }
    // 订阅之前先看一眼：共享表单常常比插件先到，那一次快照变化就不会再来了。
    check()
    return form.subscribe(check)
}

/**
 * 这一刻该不该补。
 * @param snapshot - 共享表单的当前状态。
 * @returns 表单已就绪、可写，且用户层里没有显式档位时为真。
 */
function needsStandard(snapshot: ConfigFormSnapshot<ChatSettingsLike>): boolean {
    if (snapshot.status !== 'ready') return false
    if (snapshot.writable === false) return false
    return savedMode(snapshot.user) === undefined
}

/**
 * 用户层里显式写下的档位。
 * @param user - 原始用户分节，形状未知。
 * @returns 显式写下的值；没写过、或写的是 `null` 时为空。
 */
function savedMode(user: unknown): unknown {
    if (typeof user !== 'object' || user === null) return undefined
    return (user as Record<string, unknown>)[TRANSCRIPT_VIEW_FIELD] ?? undefined
}
