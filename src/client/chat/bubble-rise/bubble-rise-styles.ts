/**
 * 发送气泡的冒头：样式表这半边只有两条，一条探针、一条先把回声藏起来。
 *
 * 探针是「提交了」这通通知：回声行第一次被渲染时响一次 animationstart，画面上没有任何变化。
 * 它是 1 ms 而不是 0，因为零时长的动画根本不会开始；两帧都写 opacity: 0，于是它与下面那条隐藏规则
 * 叠在同一处，任何时候都不会把回声放出来
 *
 * 隐藏只认 dsh 的两个语义属性：[data-submission-echo] 是提交后本地的回声，
 * [data-pending-steering] 是运行中追加的排队消息，那些照旧显示
 */
import {CHAT_FLOW_SELECTOR} from "../../dom-contract"

// 门控属性：在，说明这一处在工作；摘掉它，下面每一条规则都不命中
export const RISE_ATTRIBUTE = "data-dsh-chat-ux-rise"

// 回声行上那条 1 ms 的检测动画名，监听那一侧按它过滤 animationstart
export const RISE_ECHO_PROBE_NAME = "dsh-chat-ux-rise-echo"

// 回声放出来的标记：等待超时或这一条接不上动画时打在它身上，让读者至少看见自己发的内容
export const RISE_ECHO_HELD_ATTRIBUTE = "data-dsh-chat-ux-rise-held"

// 回声行的那两个语义属性，样式与脚本读同一组字符串
export const SUBMISSION_ECHO_ATTRIBUTE = "data-submission-echo"
export const PENDING_STEERING_ATTRIBUTE = "data-pending-steering"

// 这一处的全部 CSS：一条探针、一条隐藏
export const BUBBLE_RISE_CSS = `
/* 回声出现的通知：从 0 到 0，只为一个 animationstart，不留任何可见痕迹 */
@keyframes ${RISE_ECHO_PROBE_NAME} {
  from { opacity: 0; }
  to { opacity: 0; }
}

[${RISE_ATTRIBUTE}] ${CHAT_FLOW_SELECTOR} [${SUBMISSION_ECHO_ATTRIBUTE}]:not([${PENDING_STEERING_ATTRIBUTE}]) {
  animation: ${RISE_ECHO_PROBE_NAME} 1ms linear;
}

/* 真实行到达之前，回声不该先在落点闪一下：它被藏起来，占位照旧，读者的气泡从输入框里冒出来。
   超时或接不上动画时脚本会补上那个标记，这一条就不再命中 */
[${RISE_ATTRIBUTE}] ${CHAT_FLOW_SELECTOR} [${SUBMISSION_ECHO_ATTRIBUTE}]:not([${PENDING_STEERING_ATTRIBUTE}]):not([${RISE_ECHO_HELD_ATTRIBUTE}]) {
  opacity: 0;
  pointer-events: none;
}
`
