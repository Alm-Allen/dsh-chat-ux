/**
 * 发送气泡起飞时的样式。
 *
 * 只有一条：飞行期间那条回显行先藏着，而且**只藏**它——盒子仍然参与布局，替身靠它逐帧量终点。
 * 输入卡片不在这条规则的范围里：它自始至终都在，气泡就是从它上面升起来的。
 * 替身自己那几层是行内写死的（见 `send-morph.ts`），样式表里一条都不挂。
 *
 * 那个属性由 `send-flight.ts` 的 `FLYING_ATTRIBUTE` 挂上，两边必须一字不差。
 */

/** 整份样式，由 `styles.ts` 拼进那张 `<style>`。 */
export const SEND_FLIGHT_CSS = `/* dsh-chat-ux —— 发送气泡的起飞 */
[data-chat-ux-send-flight] {
  visibility: hidden;
}
`
