/**
 * dsh-chat-ux 的 host 侧。
 *
 * 聊天区由前端渲染（见 client/），DSH 从 exports["./client"] 加载它，因为包声明了 dsh.client。
 * 这一半只做两件事：把插件名报给加载器，把设置服务要投影的字段声明清楚
 */
import type {Volatile} from "@deepseek-ai/cordis"
import Schema from "@deepseek-ai/schemastery"

// 报给加载器的插件名，也是这个条目在 profile 里的 id
export const name = "dsh-chat-ux"

// 前端绑定 config form 用的字符串。设置服务按 profile 条目 id 标识一份表单，那个 id 就是上面的插件名，
// 所以前后端必须拼出同一个字符串
export const SETTINGS_NAMESPACE = "dsh-chat-ux"

// 下面每个默认值在前端 client/settings/settings-scope.ts 里都有一份，改一处就要改另一处

// 思考行与过程组自己开合。默认开着：这两块自己开合是本插件的主要效果，关掉时两块都整块不装，
// 读者自己点开收起照常，高度过渡仍留给手动点击
export const DEFAULT_AUTO_FOLD = true

// 插入符动效的档位。off 不动手，用浏览器自己的插入符；move 只给方向键与点击这类显式移动放过渡，
// 打字瞬时；typing 连打字也放过渡
export type CaretMotionMode = "off" | "move" | "typing"

// 插入符动效的默认档位：凡是会挪位置的都给过渡
export const DEFAULT_CARET_MOTION: CaretMotionMode = "typing"

// 命中率读数变化时，变了的那一位原地滚到新值。默认开着：读数只在每次模型结算时才变，一天也滚不了几次
export const DEFAULT_HIT_REEL = true

// 上下文占用那圈环换成按占用取色的实心饼图，已占用那一角沿折线切开、推开一点。默认开着，
// 关掉时这一处整块不装，看到的就是 dsh 原来的环
export const DEFAULT_CONTEXT_PIE = true

// 输入框整块半透明、背后模糊。默认开着，关掉时前端不往 body 上挂属性，那一整张规则表一条都不命中
export const DEFAULT_COMPOSER_GLASS = true

// 文件变更行的 +n -m 在准备态就跟着参数流长出来。默认开着。
// 它只在直接调用的 write 与 edit 上有意义：run_code 里派发的子调用没有准备态，参数由程序在运行时一次给齐
export const DEFAULT_LIVE_DIFF = true

// 工具调用与思考行第一次出现时把滚动位置补到底。默认开着：dsh 自己的跟随在结构时刻会掉队，
// 实测一次 run_code 执行里有两回落后到一百四十像素上下，正好把新出现的思考推出视野
export const DEFAULT_FOLLOW_ON_APPEAR = true

// 发送气泡的形变：提交那一下整张输入卡片收成落点那条气泡。默认开着。
// 它与下面那一套冒头互斥：这个开着时冒头不装
export const DEFAULT_SEND_FLIGHT = true

// 发送气泡的冒头。默认开着：发出之后那一条从输入框里探出来再升到落点，而不是直接出现在那里。
// 关掉时这一处整块不装，气泡就是 dsh 原来的样子
export const DEFAULT_BUBBLE_RISE = true

// 冒头那一条动效：四个旋钮加一条行程曲线。这一套是在 .probe/想实现的气泡动效.html 里调出来的
// （2026-10-30 那一版）：起手缩到 0.8 倍，一下探出输入框、微微一沉，再冲过落点落回来
// 它们只在气泡动画播一次时读一次，所以卡片上改完，下一次发送就按新的走
export const DEFAULT_BUBBLE_EMERGE_SCALE = 0.8
export const DEFAULT_BUBBLE_REVEAL = 16
export const DEFAULT_BUBBLE_OUTDENT = 0
export const DEFAULT_BUBBLE_TOTAL_MS = 800

// 行程曲线是一条七次贝塞尔：八个控制点，首尾钉在 (0,0) 与 (1,1)，中间六个横纵都能动。
// 横轴是整段走了几成，纵轴是行程——0 还整个藏在输入区后面，1 是落点，越过 1 就是冲过落点。
// 这一条是先快、再往后沉一点、末了猛冲上去的写法
export const DEFAULT_BUBBLE_CURVE_X = [0, 0.02, 0.245, 0.462, 0.539, 0.559, 0.579, 1]
export const DEFAULT_BUBBLE_CURVE_Y = [0, 0.485, 0.438, 0.314, 0.162, 1.15, 1.15, 1]

// 这个插件拥有的配置字段
export interface Config {
	// 思考行与过程组是否自己开合。关掉时两块都整块不装
	autoFold: Volatile<boolean>
	// 插入符动效的档位
	caretMotion: Volatile<CaretMotionMode>
	// 命中率读数变化时，变了的那一位是否原地滚到新值。关掉时数字直接换掉
	hitReel: Volatile<boolean>
	// 上下文占用那圈环是否换成实心饼图
	contextPie: Volatile<boolean>
	// 输入框是否半透明并模糊背后。它在前端只是一层 DOM 状态（body 上的属性）
	composerGlass: Volatile<boolean>
	// 文件变更行的 +n -m 是否在准备态就显示，并跟着流式内容增长
	liveDiff: Volatile<boolean>
	// 工具调用与思考行第一次出现时是否把滚动位置补到底
	followOnAppear: Volatile<boolean>
	// 发送之后那一条气泡是否从输入框里冒出来（冒头）
	bubbleRise: Volatile<boolean>
	// 发送那一下是否整张输入卡片收成落点那条气泡（形变）
	sendFlight: Volatile<boolean>
	// 冒头起手时气泡缩到多大
	bubbleEmergeScale: Volatile<number>
	// 冒头那一刻露出输入区上沿多高一截
	bubbleReveal: Volatile<number>
	// 起手比聊天列右缘再往外探多少
	bubbleOutdent: Volatile<number>
	// 整段多长
	bubbleTotalMs: Volatile<number>
	// 行程曲线的八个控制点横坐标
	bubbleCurveX: Volatile<number[]>
	// 行程曲线的八个控制点纵坐标
	bubbleCurveY: Volatile<number[]>
}

// 设置表单只投影标了 .volatile() 的字段，也只对带这类字段的条目暴露表单，插件管理页正是靠这一点认出这个条目
export const Config = Schema.object({
	autoFold: Schema.boolean().default(DEFAULT_AUTO_FOLD).volatile(),
	caretMotion: Schema.union(["off", "move", "typing"] as const).default(DEFAULT_CARET_MOTION).volatile(),
	hitReel: Schema.boolean().default(DEFAULT_HIT_REEL).volatile(),
	contextPie: Schema.boolean().default(DEFAULT_CONTEXT_PIE).volatile(),
	composerGlass: Schema.boolean().default(DEFAULT_COMPOSER_GLASS).volatile(),
	liveDiff: Schema.boolean().default(DEFAULT_LIVE_DIFF).volatile(),
	followOnAppear: Schema.boolean().default(DEFAULT_FOLLOW_ON_APPEAR).volatile(),
	bubbleRise: Schema.boolean().default(DEFAULT_BUBBLE_RISE).volatile(),
	sendFlight: Schema.boolean().default(DEFAULT_SEND_FLIGHT).volatile(),
	// 下面这几个数不设 min / max / step。它们只在本地调手感，可拖的范围由卡片上那几根滑杆卡住；
	// 而 schema 一旦收紧，读者存过的旧值就会让整份配置判成非法，插件在管理页上直接变成「异常」——
	// 右探出的上限从 40 收到 16 时就是这么坏掉的（invalid config: expected number <= 16 but got 40），
	// 一个滑块的历史值能把整个插件锁在外面，代价远大于那点约束力。运行时的兜底在 bubble-rise：
	// 段长兜到至少 1 ms，右探出再大也只按滚动器的内边距（16px）算，曲线点数不对就退回默认那一条
	bubbleEmergeScale: Schema.number().default(DEFAULT_BUBBLE_EMERGE_SCALE).volatile(),
	bubbleReveal: Schema.number().default(DEFAULT_BUBBLE_REVEAL).volatile(),
	bubbleOutdent: Schema.number().default(DEFAULT_BUBBLE_OUTDENT).volatile(),
	bubbleTotalMs: Schema.number().default(DEFAULT_BUBBLE_TOTAL_MS).volatile(),
	// 曲线那两个数组同样不校验长度：长度与单调性都归 bubble-rise 兜底
	bubbleCurveX: Schema.array(Schema.number()).default(DEFAULT_BUBBLE_CURVE_X).volatile(),
	bubbleCurveY: Schema.array(Schema.number()).default(DEFAULT_BUBBLE_CURVE_Y).volatile(),
})

// host 侧入口。这一半不持有运行时状态，配置值全部由浏览器侧读写
export function apply(): void {
	console.log("[dsh-chat-ux] host 侧已加载")
}
