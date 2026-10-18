/**
 * 发送气泡起飞时的样式。
 *
 * 两条规则。第一条：真实那一行在替身飞行期间藏着。用 `visibility` 而不是 `display`——藏起来的那一行
 * 必须**保留布局盒**，替身每一帧都要从它身上量终点在哪里。
 *
 * 第二条：「深度求索中，用时 N 秒」那一行（鲸鱼尾巴 + 流光的运行指示）的**占位**，静态那一半。
 * 它只放两条常驻声明（min-height 与 overflow），把这一行从「flex item 的自动最小尺寸」里解放
 * 出来；高度与行前那道 gap 的动画在 running-entry.ts 里做。为什么 CSS 只能扫干净地、不能自己
 * 做这件事，见下面那道规则上方的注释。
 *
 * **没有淡入**（2026-10-18 读者点名去掉）：这一行的到达只靠长出来，不靠透明度，也没有位移。
 *
 * 属性名与 `send-flight.ts` 的 `FLYING_ATTRIBUTE`、以及 `index.tsx` 写门控属性的那两行必须一字不差。
 */

/** 门控属性：跟着「聊天气泡动效」这个开关挂上与摘掉。 */
export const SEND_ON_ATTRIBUTE = 'data-chat-ux-send-on'

/** 整份样式，由 `styles.ts` 拼进那张 `<style>`。 */
export const SEND_FLIGHT_CSS = `/* dsh-chat-ux —— 发送气泡的起飞 */
[data-chat-ux-send-flight] {
  visibility: hidden;
}

/* 「深度求索中，用时 N 秒」那一行的占位——静态那一半。门控属性跟着「聊天气泡动效」这个开关
   走：没有让位时它本来就看不出突变，关掉就回到 dsh 原样。

   只放两条常驻声明，高度与行前那道 gap 的动画在 running-entry.ts 里做。CSS 做不干净，两处：

   1. [data-chat-flow] 是 flex 列，这一行是它的 flex item。flex item 的 min-height: auto
      解析成内容最小高度，height: 0 会被撑回 22 px；只有 overflow 不是 visible 时才归零，而
      overflow: clip 在 Chromium 里并不触发那一条（实测 min-height 仍是 auto，插进去就是满高，
      整条 height 过渡一次都没跑过）。所以显式写 min-height: 0。
   2. 行前那道 gap 是 dsh 给这一行的 margin-top: 12px。dsh 那条规则的特异性是 0,7,0，这里
      0,3,0 压不住——@starting-style 里的 margin 起始值实测被丢弃。只能内联写。

   overflow 常驻：零高时把内容裁掉，这一行本来就没有溢出，留着无害。 */
[data-chat-ux-send-on] [data-chat-flow] [data-chat-running] {
  min-height: 0;
  overflow: clip;
}
`
