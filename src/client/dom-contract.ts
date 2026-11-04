/**
 * dsh 聊天区的 DOM 契约。
 *
 * 这里全是 dsh 自己发出的语义属性。它的 class 名每次都带构建期 hash，认了就等着随 dsh 发版而坏，
 * 所以本插件只认这些属性。一个契约被两个以上的模块读到就放到这里，散在各处各写一份，改一处就会漏一处
 */

// 聊天列
export const CHAT_FLOW_SELECTOR = "[data-chat-flow]"

// 每一行思考行；它的阶段看 data-state
export const THINK_ROW_SELECTOR = `[data-variant="think"]`

/**
 * 每一次工具调用的包装层：根调用与 run_code 里派发出去的子调用都带它，卡片三个阶段复用同一个节点。
 * 它与思考行是结构时刻的两个锚点，它们第一次渲染时 dsh 的跟随最容易掉队
 */
export const CALL_ROW_SELECTOR = "[data-chat-call-id]"

// 模型还在思考、过程还在跑时的阶段值
export const RUNNING_STATE = "running"

/**
 * TextShimmer 正在扫光的元素：它在，就说明这一段内容还在动。
 * 2026-09 起这个属性叫 data-shimmer，2026-10-17 起不再认旧名 data-text-shimmer
 */
export const SHIMMER_SELECTOR = "[data-shimmer]"

// 同一个契约的属性名形式，喂 attributeFilter 用
export const SHIMMER_ATTRIBUTE = "data-shimmer"

// 聊天列的滚动容器。dsh 的跟随逻辑挂在它身上，程序化焦点不该把它带动
export const CONVERSATION_SCROLL_SELECTOR = "[data-conversation-scroll]"

/**
 * 跟随开着时 dsh 挂在聊天框架上的语义属性；它没了，就说明跟随已经被关掉。
 * 属性名与选择器两种形式各有人用：前者喂 attributeFilter，后者查页面，两个都写在这里
 */
export const FOLLOWING_TAIL_ATTRIBUTE = "data-chat-following-tail"

// 同一个契约的选择器形式
export const FOLLOWING_TAIL_SELECTOR = "[" + FOLLOWING_TAIL_ATTRIBUTE + "]"

/**
 * 读者离底部多近才算贴着底部，取 dsh 自己的 FOLLOW_THRESHOLD + 1。
 * 那条线以内，dsh 把内容增长当成跟着尾巴走：尺寸一变就瞬时滚到底
 */
export const FOLLOW_THRESHOLD_PX = 25

// 输入区。落在它里面的指针与按键是读者在打字，不是在接管滚动
export const COMPOSER_SELECTOR = "[data-composer-seat]"

// 输入框那层可编辑面。它是 contenteditable，插入符动效按它定位
export const COMPOSER_INPUT_SELECTOR = "[data-composer-input]"

// 输入卡片（那条胶囊）。落在它里面的点击可能是提交
export const COMPOSER_CARD_SELECTOR = "[data-composer-card]"

/**
 * 提交之后 dsh 立刻挂上来的那条「即发即显」回显行；发送气泡的落点就是它。
 * 排队的那一条落在队列坞里、也带这个属性，所以要飞的那条必须连同聊天列一起认
 */
export const SUBMISSION_ECHO_SELECTOR = "[data-submission-echo]"

/**
 * 输入区里的纯文本框：提问卡片的作答框，以及排队消息的行内编辑框（子智能体跑着时追加的那几条在这里改）。
 * 两者都是 textarea，都住在输入区座位里，主会话与侧栏里的子智能体会话都一样
 */
export const COMPOSER_TEXTAREA_SELECTOR = "[data-composer-seat] textarea"

/**
 * 输入框下方的统计坞那一层：统计胶囊与上下文比例圆都住在它里面。
 * 认坞只认它，不认类名——类名带构建期 hash
 */
export const COMPOSER_DOCK_SELECTOR = "[data-composer-dock]"

// 会滚动视口的按键；其余的（打字、复制）与滚动无关。与 dsh 自己认的那一组一致
export const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])

// dsh 给每一个过程组放的属性
export const PROCESS_GROUP_SELECTOR = "[data-step-process]"

/**
 * 过程组根上的档位标记：在，就说明这一档不收纳组体（详细与完全展开两档）。
 * 这两档里组头仍在 DOM，只是被 dsh 裹进一个带 hidden 的壳，所以判档位只能靠它，不能靠找不到组头
 */
export const PROCESS_EXPANDED_MODE_ATTRIBUTE = "data-group-expanded-mode"

/**
 * dsh 的折叠动效正在驱动这一行：collapse 是收起中，reveal 是展开中。
 * 官方批量折叠与展开期间，插件的过程组自动开合与高度动画都要让开：同一行上叠两套高度动画只会互相打架。
 * 列上的作用域标记（data-chat-motion=""）不算，只认这两个值
 */
export const MOTION_ROW_SELECTOR = `[data-chat-motion="collapse"], [data-chat-motion="reveal"]`

/**
 * 同一个契约的属性名形式。列上那个空值标记（data-chat-motion=""）表示「这一轮的开合动效归 dsh 管」，
 * 与上面那两个值不是一回事：认行上的动效请用 MOTION_ROW_SELECTOR
 */
export const MOTION_ATTRIBUTE = "data-chat-motion"

// 过程组体；收起时带 hidden
export const PROCESS_BODY_SELECTOR = "[data-step-process-body]"

// 过程组体里的内容层；组体滚的就是它
export const PROCESS_CONTENT_SELECTOR = "[data-step-process-content]"

/**
 * DisclosureRow 的被点那一行。展开体不在它身上，而在外层 header 的兄弟位置上，见下面那条
 */
export const DISCLOSURE_ROW_SELECTOR = "[data-disclosure-row]"

/**
 * DisclosureRow 的外层头：把被点行与 headerAccessory 槽位一起裹住，展开体是它的兄弟。
 * 取展开体必须先认它——只认被点行的话取到的是那个空槽位，不报错、只是不动了
 */
export const DISCLOSURE_HEADER_SELECTOR = "[data-disclosure-header]"

/**
 * dsh 把配色方案投影到 body 上的属性：在就是深色。
 * 纸的明暗与光标的颜色都按它分，宿主切主题时只动这一个属性（从无到有、从有到无）
 */
export const DARK_THEME_ATTRIBUTE = "data-ds-dark-theme"
