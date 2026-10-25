/**
 * 浏览器半区使用的配置表单传输契约。
 *
 * 这是平台契约的本地复述：client bundle 必须单文件自包含，平台包由运行时解析，不参与编译。
 */
import type {CaretMotionMode} from '../chat/caret/caret-motion'

// ⚠️ 以下默认值与 host 的 src/index.ts 一一对应，改一处必须同步另一处
export const DEFAULT_AUTO_FOLD = true
export const DEFAULT_CARET_MOTION: CaretMotionMode = 'typing'
export const DEFAULT_SEND_FLIGHT = true
export const DEFAULT_HIT_REEL = true
export const DEFAULT_CONTEXT_PIE = true
export const DEFAULT_COMPOSER_GLASS = true
export const DEFAULT_LIVE_DIFF = true
export const DEFAULT_FOLLOW_ON_APPEAR = true

/** host 解析出来的、本插件占用的那个条目。 */
export interface ChatUxSection {
    /** 思考行与过程组是否自己开合；关掉时两块都整块不装。 */
    autoFold?: boolean
    /** 插入符动效的档位。 */
    caretMotion?: CaretMotionMode
    /** 提交之后气泡是否从输入框起飞；默认开着。时长不是一个设置项，见 `send-morph.ts` 的 `FLIGHT_MS`。 */
    sendFlight?: boolean
    /** 命中率读数变化时，变了的那一位是否原地弹到新值；默认开着。 */
    hitReel?: boolean
    /** 上下文占用那圈环是否换成一枚实心饼；默认开着。关掉时这一处整块不装。 */
    contextPie?: boolean
    /** 输入框那块玻璃是否生效；默认开着。关掉时那整张规则表一条都不命中。 */
    composerGlass?: boolean
    /** 文件变更行的 `+n -m` 是否在准备态就显示并跟着流式内容增长；默认开着。 */
    liveDiff?: boolean
    /** 工具调用与思考行第一次出现时是否把滚动位置补到底；默认开着。关掉时门控属性不挂，探针一条都不命中。 */
    followOnAppear?: boolean
}

/**
 * 一份表单在客户端的同步状态。对映平台的 `ConfigFormSnapshot`，收窄到本插件会读的那些字段。
 */
export interface ConfigFormSnapshot<T> {
    /**
     * 第一个被接受的分节到达之前是 `loading`，有一个分节立着时是 `ready`，这一行没有向这个客户端
     * 暴露配置时是 `unavailable`——非回环连接把偏好留在页面进程里时看到的也是它。
     */
    status: 'loading' | 'ready' | 'unavailable'
    /** 最后一次被接受的、经 schema 解析的分节；第一次接受之前是 undefined。 */
    value: T | undefined
    /** host 解析 `value` 时叠在上面的组合层。 */
    base: unknown
    /** 原始用户层；某个字段在这里「存在」才是被覆盖的标志。 */
    user: unknown
    /** 围栏下一次写入的条目版本号。 */
    revision: number | undefined
    /** host 文档是否接受写入。 */
    writable: boolean
    /** `host` 与 host 文档同步；`memory` 只活在当前页面进程里。 */
    mode: 'host' | 'memory'
}

/** 一份共享表单：读它、观察它、写它。 */
export interface ConfigForm<T = ChatUxSection> {
    getSnapshot(): ConfigFormSnapshot<T>

    subscribe(listener: () => void): () => void


    set(field: string, value: unknown): Promise<boolean>


    unset(field: string): Promise<boolean>
}

/**
 * locale 服务，通过 `ctx.reflect` 读取，而不是声明成依赖：没有它的部署里，
 * 卡片退化成按浏览器语言显示，而不是干脆不挂载。
 */
export interface LocaleLike {
    getSnapshot(): { active?: string | null | undefined }

    subscribe(listener: () => void): () => void
}
