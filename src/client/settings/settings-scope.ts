/**
 * 浏览器侧读到的那一小片配置表单传输层。
 *
 * 浏览器侧用 ctx.configForms.get(entryId) 拿到 host 侧 dsh-chat-ux 那一行的共享表单；形状是
 * @deepseek-ai/dsh-client-ui-settings 契约的本地复述，不 import：client bundle 必须保持单文件自包含，
 * 平台包由模块加载器在运行时解析，不参与编译
 */
import type {CaretMotionMode} from "../chat/caret/caret-motion"

// 下面每个默认值在 host 侧 src/index.ts 里都有一份，改一处就要改另一处

// 思考行与过程组自己开合，这是本插件的主要效果
export const DEFAULT_AUTO_FOLD = true

// 凡是会挪位置的地方都给过渡
export const DEFAULT_CARET_MOTION: CaretMotionMode = "typing"

// 读数只在每次模型结算时才变，一天也滚不了几次
export const DEFAULT_HIT_REEL = true

// 关掉时这一处整块不装，看到的是 dsh 原来那圈环
export const DEFAULT_CONTEXT_PIE = true

// 关掉时前端不往 body 上挂属性，那一整张规则表一条都不命中
export const DEFAULT_COMPOSER_GLASS = true

// 只对直接调用的 write 与 edit 有意义：run_code 里派发的子调用没有准备态
export const DEFAULT_LIVE_DIFF = true

// dsh 自己的跟随在结构时刻会掉队，实测一次 run_code 执行里落后到一百四十像素上下，正好把新出现的行推出视野
export const DEFAULT_FOLLOW_ON_APPEAR = true

// 发出之后那一条从输入框里探出来再升到落点；关掉时气泡直接出现在那里
export const DEFAULT_BUBBLE_RISE = true

/**
 * 冒头那一条动效的参数，与 host 侧 schema 的字段一一对应。
 * 这一套是在 .probe/想实现的气泡动效.html 里试出来的一版；后四个是冒出那一段的缓动曲线
 */
export interface BubbleRiseTuning {
	// 冒出那一段多长，毫秒
	emergeMs: number
	// 冒头起手时气泡缩到多大
	emergeScale: number
	// 冒头那一刻露出输入区上沿多高一截，像素
	reveal: number
	// 起手比聊天列右缘再往外探多少，像素
	outdent: number
	// 冒完到升起之间停多久，毫秒
	hold: number
	// 停顿里先往外送多少
	holdDrift: number
	// 升起那一段多长，毫秒
	riseMs: number
	// 冒头那一刻比落定后大多少
	oversize: number
	// 位置回弹的阻尼比，越小过冲越多
	riseDamping: number
	// 尺寸回弹的阻尼比
	sizeDamping: number
	// 冒出那一段缓动的第一控制点横坐标
	emergeBezierX1: number
	// 冒出那一段缓动的第一控制点纵坐标
	emergeBezierY1: number
	// 冒出那一段缓动的第二控制点横坐标
	emergeBezierX2: number
	// 冒出那一段缓动的第二控制点纵坐标
	emergeBezierY2: number
}

// 一份完整的冒头参数，缺字段时按这一份补齐
export const DEFAULT_BUBBLE_TUNING: BubbleRiseTuning = {
	emergeMs: 210,
	emergeScale: 1.43,
	reveal: 35,
	outdent: 12,
	hold: 100,
	holdDrift: 0.06,
	riseMs: 360,
	oversize: 1.34,
	riseDamping: 0.62,
	sizeDamping: 0.55,
	// 压到最后的缓入：大半程贴地，临了才冲上去
	emergeBezierX1: 0.66,
	emergeBezierY1: 0,
	emergeBezierX2: 0.96,
	emergeBezierY2: 0.17,
}

// host 解析出来的、本插件占用的那个配置条目
export interface ChatUxSection {
	// 思考行与过程组是否自己开合，关掉时两块都整块不装
	autoFold?: boolean
	// 插入符动效的档位
	caretMotion?: CaretMotionMode
	// 命中率读数变化时，变了的那一位是否原地滚到新值
	hitReel?: boolean
	// 上下文占用那圈环是否换成实心饼，关掉时这一处整块不装
	contextPie?: boolean
	// 输入框是否半透明并模糊背后，关掉时那一整张规则表一条都不命中
	composerGlass?: boolean
	// 文件变更行的 +n -m 是否在准备态就显示，并跟着流式内容增长
	liveDiff?: boolean
	// 工具调用与思考行第一次出现时是否把滚动位置补到底，关掉时门控属性不挂，检测规则一条都不命中
	followOnAppear?: boolean
	// 发送之后那一条气泡是否从输入框里冒出来
	bubbleRise?: boolean
	// 冒出那一段多长
	bubbleEmergeMs?: number
	// 冒头起手时气泡缩到多大
	bubbleEmergeScale?: number
	// 冒头那一刻露出输入区上沿多高一截
	bubbleReveal?: number
	// 起手比聊天列右缘再往外探多少
	bubbleOutdent?: number
	// 冒完到升起之间停多久
	bubbleHold?: number
	// 停顿里先往外送多少
	bubbleHoldDrift?: number
	// 升起那一段多长
	bubbleRiseMs?: number
	// 冒头那一刻比落定后大多少
	bubbleOversize?: number
	// 位置回弹的阻尼比
	bubbleRiseDamping?: number
	// 尺寸回弹的阻尼比
	bubbleSizeDamping?: number
	// 冒出那一段缓动的第一控制点横坐标
	bubbleEmergeBezierX1?: number
	// 冒出那一段缓动的第一控制点纵坐标
	bubbleEmergeBezierY1?: number
	// 冒出那一段缓动的第二控制点横坐标
	bubbleEmergeBezierX2?: number
	// 冒出那一段缓动的第二控制点纵坐标
	bubbleEmergeBezierY2?: number
}

// 从表单值里拼出一份完整的冒头参数，缺的按默认值补齐
export function readBubbleTuning(value: ChatUxSection | undefined): BubbleRiseTuning {
	return {
		emergeMs: value?.bubbleEmergeMs ?? DEFAULT_BUBBLE_TUNING.emergeMs,
		emergeScale: value?.bubbleEmergeScale ?? DEFAULT_BUBBLE_TUNING.emergeScale,
		reveal: value?.bubbleReveal ?? DEFAULT_BUBBLE_TUNING.reveal,
		outdent: value?.bubbleOutdent ?? DEFAULT_BUBBLE_TUNING.outdent,
		hold: value?.bubbleHold ?? DEFAULT_BUBBLE_TUNING.hold,
		holdDrift: value?.bubbleHoldDrift ?? DEFAULT_BUBBLE_TUNING.holdDrift,
		riseMs: value?.bubbleRiseMs ?? DEFAULT_BUBBLE_TUNING.riseMs,
		oversize: value?.bubbleOversize ?? DEFAULT_BUBBLE_TUNING.oversize,
		riseDamping: value?.bubbleRiseDamping ?? DEFAULT_BUBBLE_TUNING.riseDamping,
		sizeDamping: value?.bubbleSizeDamping ?? DEFAULT_BUBBLE_TUNING.sizeDamping,
		emergeBezierX1: value?.bubbleEmergeBezierX1 ?? DEFAULT_BUBBLE_TUNING.emergeBezierX1,
		emergeBezierY1: value?.bubbleEmergeBezierY1 ?? DEFAULT_BUBBLE_TUNING.emergeBezierY1,
		emergeBezierX2: value?.bubbleEmergeBezierX2 ?? DEFAULT_BUBBLE_TUNING.emergeBezierX2,
		emergeBezierY2: value?.bubbleEmergeBezierY2 ?? DEFAULT_BUBBLE_TUNING.emergeBezierY2,
	}
}

/**
 * 一份表单在浏览器侧的同步状态，对映平台的 ConfigFormSnapshot，收窄到本插件会读的那些字段
 */
export interface ConfigFormSnapshot<T> {
	// 第一个分节到达之前是 loading，有一个分节立着时是 ready，这一行没有向这个客户端暴露配置时是 unavailable
	// 非回环连接把偏好留在页面进程里时，看到的也是 unavailable
	status: "loading" | "ready" | "unavailable"
	// 最后一次被接受的、经 schema 解析的分节
	value: T | undefined
	// host 解析 value 时叠在上面的组合层
	base: unknown
	// 原始用户层，某个字段在这里存在才是被覆盖的标志
	user: unknown
	// 围栏下一次写入的条目版本号
	revision: number | undefined
	// host 文档是否接受写入
	writable: boolean
	// host 与 host 文档同步；memory 只活在当前页面进程里
	mode: "host" | "memory"
}

// 一份共享表单：读它、观察它、写它
export interface ConfigForm<T = ChatUxSection> {
	getSnapshot(): ConfigFormSnapshot<T>

	subscribe(listener: () => void): () => void

	// 写入失败不抛错，用返回值判断 host 有没有接受；传输层与版本号的失败都在这下面被吞掉
	set(field: string, value: unknown): Promise<boolean>

	unset(field: string): Promise<boolean>
}

// locale 服务通过 ctx.reflect 读，而不是声明成依赖：没有它的部署里卡片退化成按浏览器语言显示，而不是不挂载
export interface LocaleLike {
	getSnapshot(): { active?: string | null | undefined }

	subscribe(listener: () => void): () => void
}
