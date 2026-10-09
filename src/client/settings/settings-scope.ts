/**
 * 这个半区消费的那一小片配置表单传输层。
 *
 * 浏览器半区通过 `ctx.configForms.get(entryId)` 拿到 host 侧 `dsh-chat-ux` 这一行的共享表单。
 * 这里的形状是 `@deepseek-ai/dsh-client-ui-settings` 契约的本地复述，而不是 import：client
 * bundle 必须保持单文件自包含，平台包由模块加载器在运行时解析，不参与编译。
 *
 * @module dsh-chat-ux/client/settings/settings-scope
 */
import type {CaretMotionMode} from '../chat/caret/caret-motion'

/**
 * 增强跟随的默认值。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认开着，理由与那一处相同：它修的是读者没碰过键鼠时的那一类丢失。
 */
export const DEFAULT_ENHANCED_FOLLOW = true

/**
 * 自动开合默认是否生效。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认开着，理由与那一处相同：思考行与过程组自己开合是这个插件的主效果之一。
 */
export const DEFAULT_AUTO_FOLD = true

/**
 * 自带字体是否默认接管界面。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认开着，理由与那一处相同：两端一致，且装插件的人不必自己装字体。
 */
export const DEFAULT_EMBEDDED_FONTS = true

/**
 * 自定义字体栈的默认值。空串是「没有自定义」。host 侧有一份同样的常量。
 */
export const DEFAULT_FONT_FAMILY = ''

/**
 * 插入符动效的默认档位。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认是「打字也动」：要的是「凡是会挪窝的都给过渡」。
 */
export const DEFAULT_CARET_MOTION: CaretMotionMode = 'typing'

/**
 * 聊天气泡动效默认是否生效。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认开着，理由与那一处相同：这一段已经调定，卡片上不再标 beta。
 */
export const DEFAULT_SEND_FLIGHT = true

/**
 * token 淡入默认是否生效。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认开着。关掉之后新字符直接以本色出现，那套档位规则也整张不挂——它同时是性能对照的一根杆。
 */
export const DEFAULT_TOKEN_FADE = true

/**
 * 命中率转轮默认是否生效。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认开着：读数只在每次模型结算时才变，转轮一天也转不了几次。
 */
export const DEFAULT_HIT_REEL = true

/**
 * 上下文占用那枚饼默认是否把切开的那一块推出去。host 侧 `src/index.ts` 里有一份同样的常量，改一处
 * 就要改另一处。
 *
 * 默认推出去：「从盘子里切下来一块」比一道切口更能说明已占用多少。
 */
export const DEFAULT_PIE_PUSH = true

/**
 * 输入框那块玻璃默认是否生效。host 侧 `src/index.ts` 里有一份同样的常量，改一处就要改另一处。
 *
 * 默认开着：它就是读者要的那一层磨砂。关掉后 body 上不挂属性，那一整张规则表一条都不命中。
 */
export const DEFAULT_COMPOSER_GLASS = true

/** host 解析出来的、本插件占用的那个条目。 */
export interface ChatUxSection {
    /** 增强跟随：思考结束、出现工具调用这些时刻把聊天区拉回底部。 */
    enhancedFollow?: boolean
    /** 思考行与过程组是否自己开合；关掉时两块都整块不装。 */
    autoFold?: boolean
    /** 插入符动效的档位。 */
    caretMotion?: CaretMotionMode
    /** 自带字体是否接管界面；关掉时 dsh 自己的字体栈原样生效。 */
    fonts?: boolean
    /** 自定义正文字体栈；空串用自带的。 */
    fontSans?: string
    /** 自定义等宽字体栈；空串用自带的。 */
    fontCode?: string
    /** 提交之后气泡是否从输入框起飞；默认开着。时长不是一个设置项，见 `send-morph.ts` 的 `FLIGHT_MS`。 */
    sendFlight?: boolean
    /** 流式回答里新出现的字符是否先淡后实；默认开着。 */
    tokenFade?: boolean
    /** 命中率读数变化时，每一位数字是否滚到新值；默认开着。 */
    hitReel?: boolean
    /** 上下文占用那枚饼是否把切开的那一块推出去；默认开着。关掉就只留一道切口。 */
    piePush?: boolean
    /** 输入框那块玻璃是否生效；默认开着。关掉时那整张规则表一条都不命中。 */
    composerGlass?: boolean
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

    /** @param field - 条目内的字段名。 @returns host 是否接受这次写入。 */
    set(field: string, value: unknown): Promise<boolean>

    /** @param field - 条目内的字段名。 @returns host 是否接受这次清除。 */
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
