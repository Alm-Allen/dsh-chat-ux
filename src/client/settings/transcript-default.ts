/**
 * 把工作步骤展示的默认档位补成标准。
 *
 * dsh 按客户端给这一项默认值：桌面端是标准，网页端是详细（见 dsh 的 DEFAULT_TRANSCRIPT_VIEW_MODE）。本插件的
 * 过程组行为是照着标准与简洁两档做的，所以网页端在读者没自己选过时补一次
 *
 * 补进去的是一次普通的用户选择，写的就是读者在设置里点出来的那个字段，所以卸载插件之后它照样留着
 */
import type {ConfigForm} from "./settings-scope"

// dsh 的聊天设置条目，工作步骤展示那一项住在它里面
const CHAT_SETTINGS_NAMESPACE = "ui-chat"

const TRANSCRIPT_VIEW_FIELD = "transcriptView"

const TRANSCRIPT_VIEW_STANDARD = "standard"

// ui-chat 那一条里这一处只读这一个字段
interface ChatSettingsLike {
	// 读者显式选过的档位，缺席时由客户端那侧的默认值说了算
	transcriptView?: string | null | undefined
}

// 表单就绪之前等着，就绪之后写一次就撒手；不可写、或被版本号围栏挡回来时不再纠缠，下次加载页面时再说
export function applyTranscriptViewDefault(forms: {
	get<T>(entryId: string): ConfigForm<T>
}): () => void {
	const form = forms.get<ChatSettingsLike>(CHAT_SETTINGS_NAMESPACE)
	let written = false
	const fillDefaultOnce = (): void => {
		if (written) return
		const snapshot = form.getSnapshot()
		if (snapshot.status !== "ready") return
		if (snapshot.writable === false) return
		const userSection = snapshot.user
		const selectedMode = typeof userSection === "object" && userSection !== null
			? (userSection as Record<string, unknown>)[TRANSCRIPT_VIEW_FIELD] ?? undefined
			: undefined
		// 用户层里写过这个字段就不再动手，写的是 null 也算写过
		if (selectedMode !== undefined) return
		written = true
		void form.set(TRANSCRIPT_VIEW_FIELD, TRANSCRIPT_VIEW_STANDARD)
	}
	// 共享表单常常比插件先到，那一次快照变化就不会再来，所以订阅之前先看一眼
	fillDefaultOnce()
	return form.subscribe(fillDefaultOnce)
}
