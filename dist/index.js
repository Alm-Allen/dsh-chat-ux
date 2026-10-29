import Schema from "@deepseek-ai/schemastery";
// 报给加载器的插件名，也是这个条目在 profile 里的 id
export const name = "dsh-chat-ux";
// 前端绑定 config form 用的字符串。设置服务按 profile 条目 id 标识一份表单，那个 id 就是上面的插件名，
// 所以前后端必须拼出同一个字符串
export const SETTINGS_NAMESPACE = "dsh-chat-ux";
// 下面每个默认值在前端 client/settings/settings-scope.ts 里都有一份，改一处就要改另一处
// 思考行与过程组自己开合。默认开着：这两块自己开合是本插件的主要效果，关掉时两块都整块不装，
// 读者自己点开收起照常，高度过渡仍留给手动点击
export const DEFAULT_AUTO_FOLD = true;
// 插入符动效的默认档位：凡是会挪位置的都给过渡
export const DEFAULT_CARET_MOTION = "typing";
// 命中率读数变化时，变了的那一位原地滚到新值。默认开着：读数只在每次模型结算时才变，一天也滚不了几次
export const DEFAULT_HIT_REEL = true;
// 上下文占用那圈环换成按占用取色的实心饼图，已占用那一角沿折线切开、推开一点。默认开着，
// 关掉时这一处整块不装，看到的就是 dsh 原来的环
export const DEFAULT_CONTEXT_PIE = true;
// 输入框整块半透明、背后模糊。默认开着，关掉时前端不往 body 上挂属性，那一整张规则表一条都不命中
export const DEFAULT_COMPOSER_GLASS = true;
// 文件变更行的 +n -m 在准备态就跟着参数流长出来。默认开着。
// 它只在直接调用的 write 与 edit 上有意义：run_code 里派发的子调用没有准备态，参数由程序在运行时一次给齐
export const DEFAULT_LIVE_DIFF = true;
// 工具调用与思考行第一次出现时把滚动位置补到底。默认开着：dsh 自己的跟随在结构时刻会掉队，
// 实测一次 run_code 执行里有两回落后到一百四十像素上下，正好把新出现的思考推出视野
export const DEFAULT_FOLLOW_ON_APPEAR = true;
// 发送气泡的冒头。默认开着：发出之后那一条从输入框里探出来再升到落点，而不是直接出现在那里。
// 关掉时这一处整块不装，气泡就是 dsh 原来的样子
export const DEFAULT_BUBBLE_RISE = true;
// 冒头那一条动效的十个参数。这一套是在 .probe/想实现的气泡动效.html 里试出来的一版（2026-10-30），
// 起手比落点大出不少、露出也高，靠的是「挤出来」那一口的劲，而不是慢慢长出来
// 它们只在气泡动画播一次时读一次，所以卡片上改完，下一次发送就按新的走
export const DEFAULT_BUBBLE_EMERGE_MS = 210;
export const DEFAULT_BUBBLE_EMERGE_SCALE = 1.43;
export const DEFAULT_BUBBLE_REVEAL = 35;
export const DEFAULT_BUBBLE_OUTDENT = 12;
export const DEFAULT_BUBBLE_HOLD = 100;
export const DEFAULT_BUBBLE_HOLD_DRIFT = 0.06;
export const DEFAULT_BUBBLE_RISE_MS = 360;
export const DEFAULT_BUBBLE_OVERSIZE = 1.34;
export const DEFAULT_BUBBLE_RISE_DAMPING = 0.62;
export const DEFAULT_BUBBLE_SIZE_DAMPING = 0.55;
// 冒出那一段的缓动，写成一条三次贝塞尔的四个控制点。默认值 (0.66, 0, 0.96, 0.17)
// 是一条压到最后的缓入：大半程都贴着地走，临了才一下冲上去，配上 1.43 的起点，冒头那一下是「挤出来」的
// X 只取 0 到 1，取到界外曲线就不再单调；Y 放开到 -1 到 2，超出这一段会先退后进或先冲过头
export const DEFAULT_BUBBLE_EMERGE_BEZIER_X1 = 0.66;
export const DEFAULT_BUBBLE_EMERGE_BEZIER_Y1 = 0;
export const DEFAULT_BUBBLE_EMERGE_BEZIER_X2 = 0.96;
export const DEFAULT_BUBBLE_EMERGE_BEZIER_Y2 = 0.17;
// 设置表单只投影标了 .volatile() 的字段，也只对带这类字段的条目暴露表单，插件管理页正是靠这一点认出这个条目
export const Config = Schema.object({
    autoFold: Schema.boolean().default(DEFAULT_AUTO_FOLD).volatile(),
    caretMotion: Schema.union(["off", "move", "typing"]).default(DEFAULT_CARET_MOTION).volatile(),
    hitReel: Schema.boolean().default(DEFAULT_HIT_REEL).volatile(),
    contextPie: Schema.boolean().default(DEFAULT_CONTEXT_PIE).volatile(),
    composerGlass: Schema.boolean().default(DEFAULT_COMPOSER_GLASS).volatile(),
    liveDiff: Schema.boolean().default(DEFAULT_LIVE_DIFF).volatile(),
    followOnAppear: Schema.boolean().default(DEFAULT_FOLLOW_ON_APPEAR).volatile(),
    bubbleRise: Schema.boolean().default(DEFAULT_BUBBLE_RISE).volatile(),
    // 下面这十四个数不设 min / max / step。它们只在本地调手感，可拖的范围由卡片上那几根滑杆卡住；
    // 而 schema 一旦收紧，读者存过的旧值就会让整份配置判成非法，插件在管理页上直接变成「异常」——
    // 右探出的上限从 40 收到 16 时就是这么坏掉的（invalid config: expected number <= 16 but got 40），
    // 一个滑块的历史值能把整个插件锁在外面，代价远大于那点约束力。运行时的兜底在 bubble-rise：
    // 段长兜到至少 1 ms，阻尼贴着 1 也夹住，右探出再大也只按滚动器的内边距（16px）算
    bubbleEmergeMs: Schema.number().default(DEFAULT_BUBBLE_EMERGE_MS).volatile(),
    bubbleEmergeScale: Schema.number().default(DEFAULT_BUBBLE_EMERGE_SCALE).volatile(),
    bubbleReveal: Schema.number().default(DEFAULT_BUBBLE_REVEAL).volatile(),
    bubbleOutdent: Schema.number().default(DEFAULT_BUBBLE_OUTDENT).volatile(),
    bubbleHold: Schema.number().default(DEFAULT_BUBBLE_HOLD).volatile(),
    bubbleHoldDrift: Schema.number().default(DEFAULT_BUBBLE_HOLD_DRIFT).volatile(),
    bubbleRiseMs: Schema.number().default(DEFAULT_BUBBLE_RISE_MS).volatile(),
    bubbleOversize: Schema.number().default(DEFAULT_BUBBLE_OVERSIZE).volatile(),
    bubbleRiseDamping: Schema.number().default(DEFAULT_BUBBLE_RISE_DAMPING).volatile(),
    bubbleSizeDamping: Schema.number().default(DEFAULT_BUBBLE_SIZE_DAMPING).volatile(),
    // 冒出那一段的缓动：一条三次贝塞尔，两个控制点。卡片把 X 卡在 0 到 1、Y 放到 -1 到 2；
    // 这里同样不校验——曲线在没有这几条约束时也只是形状古怪，不会算不出值
    bubbleEmergeBezierX1: Schema.number().default(DEFAULT_BUBBLE_EMERGE_BEZIER_X1).volatile(),
    bubbleEmergeBezierY1: Schema.number().default(DEFAULT_BUBBLE_EMERGE_BEZIER_Y1).volatile(),
    bubbleEmergeBezierX2: Schema.number().default(DEFAULT_BUBBLE_EMERGE_BEZIER_X2).volatile(),
    bubbleEmergeBezierY2: Schema.number().default(DEFAULT_BUBBLE_EMERGE_BEZIER_Y2).volatile(),
});
// host 侧入口。这一半不持有运行时状态，配置值全部由浏览器侧读写
export function apply() {
    console.log("[dsh-chat-ux] host 侧已加载");
}
