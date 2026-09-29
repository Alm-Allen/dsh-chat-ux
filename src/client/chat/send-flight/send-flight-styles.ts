/**
 * 发送气泡起飞时的样式。
 *
 * 只有一条规则：真实那一行在替身飞行期间藏着。用 `visibility` 而不是 `display`——藏起来的那一行
 * 必须**保留布局盒**，替身每一帧都要从它身上量终点在哪里。
 *
 * 属性名与 `send-flight.ts` 的 `FLYING_ATTRIBUTE` 必须一字不差。
 */
export const SEND_FLIGHT_CSS = `/* dsh-chat-ux —— 发送气泡的起飞 */
[data-chat-ux-send-flight] {
  visibility: hidden;
}
`
