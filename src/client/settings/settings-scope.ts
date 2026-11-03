/**
 * 浏览器侧读到的那一小片配置表单传输层。
 *
 * 浏览器侧用 ctx.configForms.get(entryId) 拿到 host 侧 dsh-chat-ux 那一行的共享表单；形状是
 * @deepseek-ai/dsh-client-ui-settings 契约的本地复述，不 import：client bundle 必须保持单文件自包含，
 * 平台包由模块加载器在运行时解析，不参与编译
 */
import type {CaretMotionMode} from "../chat/caret/caret-motion"
import type {AskNotifyMode} from "../chat/notify/ask-notify"
import type {DoneNotifyMode} from "../chat/notify/done-notify"

// 下面每个默认值在 host 侧 src/index.ts 里都有一份，改一处就要改另一处

// 纸感总开关：整页铺一张纸，页面底色也换成这张纸的调子。2026-11-03 起默认关着
export const DEFAULT_PAPER_ON = false

// 纸感要不要接管字族。它在卡片上是纸感底下的子开关，关掉时纸照铺，字回到读者自己那套
export const DEFAULT_PAPER_FONT = true

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

// 发送那一下，整张输入卡片收成落点那条气泡。关掉时气泡直接出现在那里
export const DEFAULT_SEND_FLIGHT = true

// 等读者动手时的系统通知。默认一律弹：它停下来等你这件事本身就要紧，不挑窗口在不在前台
export const DEFAULT_ASK_NOTIFY: AskNotifyMode = "always"

// 任务结束时的系统通知。默认也一律弹：跑完了正是读者想知道的时刻，与「等读者动手」同一档
export const DEFAULT_DONE_NOTIFY: DoneNotifyMode = "always"


// host 解析出来的、本插件占用的那个配置条目
export interface ChatUxSection {
    // 纸感是否开着，关掉时整页回到 dsh 原来的样子
    paperOn?: boolean
    // 纸感是否接管字族。它是纸感底下的子开关，纸感关掉时不起作用
    paperFont?: boolean
    // 纸感被强制关掉那一次留下的标记。卡片上不显示，只由客户端在强关时写一次
    paperOffMigratedAt?: string
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
    // 发送那一下是否整张输入卡片收成落点那条气泡（形变）
    sendFlight?: boolean
    // 等读者动手时的系统通知档位。关掉时一条都不弹
    notifyAsk?: AskNotifyMode
    // 任务结束时的系统通知档位。与上一条共用同一个控件
    notifyDone?: DoneNotifyMode
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

// 一次字段改动。path 是字段名路径，本插件只用单段
export interface ConfigFieldOp {
    op: "set" | "unset"
    path: readonly string[]
    value?: unknown
}

// 一份共享表单：读它、观察它、写它
export interface ConfigForm<T = ChatUxSection> {
    getSnapshot(): ConfigFormSnapshot<T>

    subscribe(listener: () => void): () => void

    // 写入失败不抛错，用返回值判断 host 有没有接受；传输层与版本号的失败都在这下面被吞掉
    set(field: string, value: unknown): Promise<boolean>

    unset(field: string): Promise<boolean>

    // 一次提交多个字段：要么全落，要么一个都不落。强关纸感要「把纸写成关」与「把标记写上去」同时成立
    mutate(ops: readonly ConfigFieldOp[], expectedRevision?: number): Promise<boolean>
}

// locale 服务通过 ctx.reflect 读，而不是声明成依赖：没有它的部署里卡片退化成按浏览器语言显示，而不是不挂载
export interface LocaleLike {
    getSnapshot(): { active?: string | null | undefined }

    subscribe(listener: () => void): () => void
}
