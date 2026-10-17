/**
 * 「工具行出现了」这条探针：一条 1 ms 的动画，只为让 animationstart 响一次。
 *
 * 两帧都写 opacity: 1，所以画面上什么都不变；是 1 ms 而不是 0，是因为零时长的动画根本不会开始、
 * 也就不会派发事件。
 *
 * 整条规则收在门控属性下（挂在 documentElement 上，见 call-appeared.ts）：开关关着时属性不在，
 * 这条规则一条都不命中。作用域再收一层到聊天列——聊天区以外的元素在样式匹配时被祖先过滤直接跳过，
 * 这是[性能风险](<文档/开发/性能风险.md>)里量过的那个差别；流式期间是增量重算，只对新节点匹配。
 *
 * @module dsh-chat-ux/client/chat/follow/follow-probe-styles
 */
import {CALL_ROW_SELECTOR, CHAT_FLOW_SELECTOR, THINK_ROW_SELECTOR} from '../../dom-contract'

/** 门控属性：在，就说明这一处在工作。关掉时摘掉它，探针一次都不跑。 */
export const APPEAR_ATTRIBUTE = 'data-dsh-chat-ux-follow'

/** 探针动画的名字；监听那一侧按它过滤 animationstart。 */
export const APPEAR_PROBE_NAME = 'dsh-chat-ux-appear'

/** 探针规则：工具调用行（含 run_code 里派发出去的子调用）与思考行。 */
export const FOLLOW_PROBE_CSS = `
/* 这两族行第一次被渲染时各响一次 animationstart——那是浏览器「这个元素出现了」的一次性通知，
   不是轮询也不是观察者。监听那一头在 call-appeared.ts：它把所在的滚动器补到底，然后静静等着
   下一次。两帧之间画面上没有任何变化，所以这条规则只花一次动画对象。 */
@keyframes ${APPEAR_PROBE_NAME} {
  from { opacity: 1; }
  to { opacity: 1; }
}

[${APPEAR_ATTRIBUTE}] ${CHAT_FLOW_SELECTOR} ${CALL_ROW_SELECTOR},
[${APPEAR_ATTRIBUTE}] ${CHAT_FLOW_SELECTOR} ${THINK_ROW_SELECTOR} {
  animation: ${APPEAR_PROBE_NAME} 1ms linear;
}
`
