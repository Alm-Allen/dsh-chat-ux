/**
 * 字体接管：让 dsh 用插件自带的两套字体，或者用读者自己填的那一套。
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
 * 三条都声明在 body 上，且**只在 `FONT_ATTRIBUTE` 挂着时**：ui-theme 把变量声明在 :root，更近的
 * 祖先赢，与注入顺序无关。属性不在（读者关掉了这个开关）时这一条不命中，dsh 自己那套原样生效——
 * 不需要第二份「什么都不做」的规则。
 *
 * 后面的本名不是装饰：自带的只是子集（GB2312 全集与常用符号），生僻字要靠本名接住——装了字体的人
 * 由系统那份接，没装的人由本名后面的通用族接。
 *
 * 接管不到的两项：标准字体只在元素完全不指定 font-family 时生效，而 dsh 处处显式指定；
 * 字号同理——dsh 用自己的 --dsh-content-font-size（12–17px），与浏览器的字号设置是两套。
 *
 * @module dsh-chat-ux/client/font-styles
 */

/**
 * 自带字体那一条规则认的属性。它由 `font-override.ts` 按开关写上或摘掉，所以「用不用自带字体」
 * 这件事不必重新生成样式表。
 */
export const FONT_ATTRIBUTE = 'data-chat-ux-fonts'

/** dsh 声明正文字体的那个自定义属性。 */
export const SANS_VARIABLE = '--dsw-font-family'

/** dsh 声明代码字体的那个自定义属性。 */
export const CODE_VARIABLE = '--ds-font-family-code'

/** dsh 引用七次、却从未定义的那个等宽属性；这里补上同一套。 */
export const MONO_VARIABLE = '--dsw-font-mono'

/**
 * 自带的正文栈与等宽栈。样式表拿它们写默认值，`font-override.ts` 拿它们给读者填的那一串收尾——
 * 两处必须是同一个字符串，所以只写在这里。
 */
export const EMBEDDED_SANS = "'Chat UX Sans', 'HarmonyOS Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif"

export const EMBEDDED_MONO = "'Chat UX Mono', 'Maple Mono NF CN', Consolas, monospace"

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
body[${FONT_ATTRIBUTE}] {
  ${SANS_VARIABLE}: ${EMBEDDED_SANS};
  ${CODE_VARIABLE}: ${EMBEDDED_MONO};
  ${MONO_VARIABLE}: ${EMBEDDED_MONO};
}
`
