/**
 * dsh 聊天区的 DOM 契约。
 *
 * 这里全是 dsh 自己发出的**语义**属性：它的 class 名每次都带构建期 hash，认了就等着随 dsh 发版
 * 而坏，所以本插件只认这些属性。一个契约被两个以上的模块读到就放到这里——散在各处各写一份，
 * 改一处就会漏一处。
 *
 * @module dsh-chat-ux/client/dom-contract
 */

/** 每个流块带一个。新块插进来，就是这一段流又往前走了。 */
export const FLOW_BLOCK_SELECTOR = '[data-chat-flow-key]'

/** 聊天列。 */
export const CHAT_FLOW_SELECTOR = '[data-chat-flow]'

/** 每一行思考行；它的阶段看 `data-state`。 */
export const THINK_ROW_SELECTOR = '[data-variant="think"]'

/** 模型还在思考、过程还在跑时的阶段值。 */
export const RUNNING_STATE = 'running'

/**
 * Markdown 层在助手消息流式期间标记的容器；新字符的淡入按它扫描。
 *
 * 属性名与选择器两种形式各有人用（前者喂 `MutationObserver` 的 `attributeFilter`，后者查页面），
 * 所以两个都写在这里：各自就地拼字符串的话，改一处就会漏一处。
 */
export const STREAMING_ATTRIBUTE = 'data-streaming'

/** 同一个契约的选择器形式。 */
export const STREAMING_SELECTOR = '[' + STREAMING_ATTRIBUTE + ']'

/** TextShimmer 正在扫光的元素。它挂着，就说明这一段内容还在动。 */
export const SHIMMER_SELECTOR = '[data-text-shimmer]'

/** 聊天列的滚动容器。dsh 的跟随逻辑挂在它身上，程序化焦点不该把它带动。 */
export const CONVERSATION_SCROLL_SELECTOR = '[data-conversation-scroll]'

/**
 * 跟随开着时 dsh 挂在聊天框架上的语义属性；它没了，就说明跟随已经被关掉。
 *
 * 属性名与选择器两种形式各有人用（前者喂 `attributeFilter`，后者查页面），所以两个都写在这里：
 * 各自就地拼字符串的话，改一处就会漏一处。
 */
export const FOLLOWING_TAIL_ATTRIBUTE = 'data-chat-following-tail'

/** 同一个契约的选择器形式。 */
export const FOLLOWING_TAIL_SELECTOR = '[' + FOLLOWING_TAIL_ATTRIBUTE + ']'

/**
 * 读者离底部多近才算「贴着底部」，取 dsh 自己的 `FOLLOW_THRESHOLD + 1`。
 *
 * 那条线以内，dsh 把内容增长当成「跟着尾巴走」：尺寸一变就瞬时滚到底。
 */
export const FOLLOW_THRESHOLD_PX = 25

/** 输入区。落在它里面的指针与按键是读者在打字，不是在接管滚动。 */
export const COMPOSER_SELECTOR = '[data-composer-seat]'

/** 输入框那层可编辑面。它是 contenteditable，插入符动效按它定位，发送气泡按它取起点。 */
export const COMPOSER_INPUT_SELECTOR = '[data-composer-input]'

/** 输入卡片（那条胶囊）。落在它里面的点击可能是提交。 */
export const COMPOSER_CARD_SELECTOR = '[data-composer-card]'

/**
 * 提交之后 dsh 立刻挂上来的那条「即发即显」回显行；发送气泡的落点就是它。
 *
 * 排队的那一条落在队列坞里、也带这个属性，所以要飞的那条必须连同聊天列一起认（见 `send-flight.ts`）。
 */
export const SUBMISSION_ECHO_SELECTOR = '[data-submission-echo]'

/** 会滚动视口的按键；其余的（打字、复制）与滚动无关。与 dsh 自己认的那一组一致。 */
export const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/** dsh 给每一个过程组放的属性。 */
export const PROCESS_GROUP_SELECTOR = '[data-step-process]'

/** 过程组体；收起时带 `hidden`。 */
export const PROCESS_BODY_SELECTOR = '[data-step-process-body]'

/** 过程组体里的内容层；组体滚的就是它。 */
export const PROCESS_CONTENT_SELECTOR = '[data-step-process-content]'
