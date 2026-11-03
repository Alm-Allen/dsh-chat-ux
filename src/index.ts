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

// 纸感总开关：整页铺一张纸，页面底色与左侧栏也跟着换成这张纸的调子。默认关着。
// 开着时纸感这一整块都在（纸、令牌、羽毛、侧栏那层纹理），关掉就一处不剩。
// 2026-11-03 从开改成关：整页材质的改动太大，不该是装完插件就落下来的默认状态。
// 老读者的配置里已经写着 paperOn: true，改默认值盖不到它，那一次强关由浏览器侧做（见 PAPER_OFF_MIGRATION_TAG）
export const DEFAULT_PAPER_ON = false

// 纸感要不要接管字族（正文与代码那两栈）。默认开着；关掉时纸照铺，字回到 dsh 自己的或读者自己配的那套
export const DEFAULT_PAPER_FONT = true

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

// 发送气泡的形变：提交那一下整张输入卡片收成落点那条气泡。默认开着
export const DEFAULT_SEND_FLIGHT = true

// 等读者动手时的系统通知：off 不弹，unfocused 只在窗口没聚焦时弹，always 任何时候都弹
export type AskNotifyMode = "off" | "unfocused" | "always"

// 任务结束时的系统通知档位。取值与上一条一样，只是分成两个字段存：两条通道各自可关
export type DoneNotifyMode = "off" | "unfocused" | "always"

// 默认一律弹。三档里「关闭」与「未聚焦时」都留给了不想被它打断的人
export const DEFAULT_ASK_NOTIFY: AskNotifyMode = "always"

// 任务结束时的系统通知。卡片上与上一条共用同一个三档控件（那个控件同时写这两个字段），
// 默认值同样是一律弹
export const DEFAULT_DONE_NOTIFY: DoneNotifyMode = "always"

// 这个插件拥有的配置字段
export interface Config {
    // 纸感是否开着。关掉时整页回到 dsh 原来的样子，纸层与它接管的两条底色令牌一起撤掉
    paperOn: Volatile<boolean>
    // 纸感是否接管字族。它挂在纸感底下：纸感关掉时这一项不起作用
    paperFont: Volatile<boolean>
    // 纸感被强制关掉那一次留下的标记，由浏览器侧写一次。它不是设置项，只用来让那次强关只发生一次
    paperOffMigratedAt: string
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
    // 发送那一下是否整张输入卡片收成落点那条气泡（形变）
    sendFlight: Volatile<boolean>
    // 等读者动手时是否弹系统通知，以及什么时候弹
    notifyAsk: Volatile<AskNotifyMode>
    // 任务结束时是否弹系统通知，以及什么时候弹。它与上一条共用卡片上那一个控件
    notifyDone: Volatile<DoneNotifyMode>
}

// 设置表单只投影标了 .volatile() 的字段，也只对带这类字段的条目暴露表单，插件管理页正是靠这一点认出这个条目
export const Config = Schema.object({
    paperOn: Schema.boolean().default(DEFAULT_PAPER_ON).volatile(),
    paperFont: Schema.boolean().default(DEFAULT_PAPER_FONT).volatile(),
    // 必须带 volatile：settings 服务只允许写 volatile 字段（非 volatile 的写入直接被拒）。
    // 它不会出现在设置卡片上——那张卡片由浏览器侧自己渲染，只画写死的那几行
    paperOffMigratedAt: Schema.string().default("").volatile(),
    autoFold: Schema.boolean().default(DEFAULT_AUTO_FOLD).volatile(),
    caretMotion: Schema.union(["off", "move", "typing"] as const).default(DEFAULT_CARET_MOTION).volatile(),
    hitReel: Schema.boolean().default(DEFAULT_HIT_REEL).volatile(),
    contextPie: Schema.boolean().default(DEFAULT_CONTEXT_PIE).volatile(),
    composerGlass: Schema.boolean().default(DEFAULT_COMPOSER_GLASS).volatile(),
    liveDiff: Schema.boolean().default(DEFAULT_LIVE_DIFF).volatile(),
    followOnAppear: Schema.boolean().default(DEFAULT_FOLLOW_ON_APPEAR).volatile(),
    sendFlight: Schema.boolean().default(DEFAULT_SEND_FLIGHT).volatile(),
    notifyAsk: Schema.union(["off", "unfocused", "always"] as const).default(DEFAULT_ASK_NOTIFY).volatile(),
    notifyDone: Schema.union(["off", "unfocused", "always"] as const).default(DEFAULT_DONE_NOTIFY).volatile(),
})

// host 侧入口。这一半不持有运行时状态，配置值全部由浏览器侧读写
export function apply(): void {
    // 这里刻意什么都不做：这一半只声明 schema，投影由设置服务自己按 volatile 字段完成
}
