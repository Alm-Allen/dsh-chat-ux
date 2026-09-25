/**
 * 字体接管：让 dsh 用插件自带的两套字体。
 *
 * 这里原本把 --dsw-font-family 换成裸通用族，让字体跟随浏览器的字体设置。通用族在浏览器里由
 * 「设置 → 外观 → 自定义字体」决定，而那个设置只有浏览器有：桌面 App 用的是 Electron 自己的
 * 用户目录，没有字体设置界面，通用族于是落到 Chromium 的内置默认（中文 Windows 上是 Noto Sans SC
 * 与 NSimSun）。要两端一致、还要让没装字体的人一装插件就有，就得自己带字。
 *
 * 所以这里声明 5 条 @font-face，指向 host 半区挂在 dsh web 服务器上的子集
 * （`/dsh-chat-ux/fonts/`，见 src/index.ts）：HarmonyOS Sans SC 的 400/500/700，Maple Mono NF CN
 * 的 400/700。浏览器只在真正用到某个字重时才取那一份，取过的按一天缓存。
 *
 * face 名不叫字体的本名，而是自起的两个名字，后面再跟上本名：
 *
 * - `--dsw-font-family` —— ui-theme 在 :root 上写的原生 UI 字体栈，这里是正文。
 * - `--ds-font-family-code` —— 代码字体。dsh 原栈末尾没有裸 monospace，正是为了避开 Windows 上
 *   中文掉到 SimSun；这里换成自带的中文等宽，中文与拉丁同一套。
 * - `--dsw-font-mono` —— 被引用七次却从未定义，一律走内联兜底；这里补上同一套。
 *
 * 声明在 body 上：ui-theme 把变量声明在 :root，更近的祖先赢，与注入顺序无关。所有
 * --dsw-font-markdown-* / --dsw-font-* 复合 token 都由 var(--dsw-font-family) 拼成、在 body 上求值，
 * 会一起跟着换；表单控件靠 base.css 的 `font-family: inherit` 跟随。
 *
 * 后面的本名不是装饰：自带的只是子集（GB2312 全集与常用符号），生僻字要靠本名接住——装了字体的人
 * 由系统那份接，没装的人由本名后面的通用族接。
 *
 * 接管不到的两项：标准字体只在元素完全不指定 font-family 时生效，而 dsh 处处显式指定；
 * 字号同理——dsh 用自己的 --dsh-content-font-size（12–17px），与浏览器的字号设置是两套。
 *
 * @module dsh-chat-ux/client/font-styles
 */

/** 内嵌字体的全部 CSS。路径前缀必须与 host 半区的 FONT_ROUTE_PATH 一致。 */
export const FONT_CSS = `
@font-face {
  font-family: 'Chat UX Sans';
  src: url(/dsh-chat-ux/fonts/harmonyos-sans-sc-regular.woff2) format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Chat UX Sans';
  src: url(/dsh-chat-ux/fonts/harmonyos-sans-sc-medium.woff2) format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Chat UX Sans';
  src: url(/dsh-chat-ux/fonts/harmonyos-sans-sc-bold.woff2) format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Chat UX Mono';
  src: url(/dsh-chat-ux/fonts/maple-mono-nf-cn-regular.woff2) format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Chat UX Mono';
  src: url(/dsh-chat-ux/fonts/maple-mono-nf-cn-bold.woff2) format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
body {
  --dsw-font-family: 'Chat UX Sans', 'HarmonyOS Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif;
  --ds-font-family-code: 'Chat UX Mono', 'Maple Mono NF CN', Consolas, monospace;
  --dsw-font-mono: 'Chat UX Mono', 'Maple Mono NF CN', Consolas, monospace;
}
`
