/**
 * 用户气泡的底色。
 *
 * dsh 给气泡画的底是 `var(--dsw-specific-bubble)`（ui-primitives 的 UserMessageBubble），浅色是
 * deepseek-50、深色是 neutral-bluish-850——一块浮在页面上的白（或蓝黑）卡片。纸盖上来之后它就成了
 * 整张纸里唯一一处"不是纸"的面，所以这里按纸重算。
 *
 * **算的方向是「朝输入卡片那块玻璃」，不是「朝墨」。** 读者按过的那张输入卡片是毛玻璃（浅色是一块
 * 偏冷的白、深色是一块偏冷的近黑），气泡要与它对上，才像同一种材质写出来的两张面；朝墨混出来的是
 * 一张更暗的纸，与那张卡片对不上，落定那一下看起来就像换了个控件。
 *
 * 为什么写在这一条而不是另起一条自己的变量：气泡的底由 dsh 自己那条规则直接吃令牌，
 * 本插件拿不到那个元素，只能改写令牌。这是继整页底色与文字之后的又一条，与它们同性质。
 *
 * **只写一条。** `--dsw-specific-bubble-highlight` 与它挨着定义、名字也像，但 dsh 里用它的是
 * 会话检查器那圈高亮框（experimental/session-inspector 的 .chatReveal），气泡自己一个都没用；
 * 改写它只会让那圈框跟着变色，换来的是没有收益的副作用。
 *
 * 深浅两档只算一次色：glassColor 的两支目标色按明暗二选一，于是同一条公式在暗档上自动变成
 * "比纸更深的冷面"。哪一档由调用方传进来，这个函数不认识 dsh 的主题
 */
import {setOwned} from "./paper-tokens"
import {glassColor} from "./paper-tables"
import type {PaperMode} from "./paper-tables"

/**
 * 气泡朝玻璃实色混多少。
 *
 * 比 surfaceColor 在 nocturne 那边的 7% 高一截：那个混的是墨，混多了发脏；这里混的是「输入卡片的那块底」，
 * 混六成才真的像同一块玻璃。取 0.62 是让气泡仍带着纸的温度、又不至于被纸吃掉一档
 */
const BUBBLE_MIX = 0.62

// 宿主画气泡底的那条令牌
const HOST_BUBBLE_PROPERTY = "--dsw-specific-bubble"

/**
 * 气泡那一层色自己的一笔，落在本插件的前缀里。
 *
 * 目前只有一个读法：发送替身的起手色（send-flight-styles.ts 的纸感那一段读它）。
 * 之所以另存这一笔、而不是让那段 CSS 直接读 --dsw-specific-bubble：替身那片的变量定义在 body 上，
 * 读别人的令牌要绕一圈，而且宿主那条随时可能被别的皮肤抢走，替身的起手色不该跟着变
 */
export const PAPER_BUBBLE_PROPERTY = "--dsh-chat-ux-paper-bubble"

/**
 * 把气泡的底色落到纸上。
 *
 * mode 必须是当下那一档（与 paperTokenSet 的入参同源），否则切主题时两处会分叉：
 * 令牌这边换了档，气泡还停在上一档。重复调用是幂等的——setOwned 只在值变了时才真的写 DOM，
 * 而改一条 custom property 会让整篇文档的样式重算，那是这个插件最贵的一次操作
 */
export function applyPaperBubble(mode: PaperMode): void {
    const color = glassColor(mode, BUBBLE_MIX)
    // 自己那一笔先写，而且不依赖 body 在不在：发送替身那截 CSS 读的是它，那一层要的首帧就有值。
    // 写在根元素上：没有别人定义过它，继承就能到每个元素
    setOwned(document.documentElement, PAPER_BUBBLE_PROPERTY, color)
    // 宿主那条必须写在 body 上：ui-theme 把 --dsw-specific-bubble 定义在 body 自己的规则里，
    // 内联写在根元素上只算"根元素的声明"，输给 body 的本地声明（与整页底色同一条坑）。
    // body 还没建出来时这一条先跳过，下一次 refresh 会再来
    if (document.body === null) return
    setOwned(document.body, HOST_BUBBLE_PROPERTY, color)
}
