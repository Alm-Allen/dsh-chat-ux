/**
 * 字体接管：让 dsh 的字体跟随浏览器的字体设置。
 *
 * dsh 自己写死了一套按平台挑原生 UI 字体的栈（ui-theme/src/styles/base.css 里的
 * --dsw-font-family 与 --ds-font-family-code），并以
 * `body { font-family: var(--dsw-font-family, …) }`（packages/client/web/src/base.css）落地。
 * 那串栈里的具体字体名在 Windows 上几乎总能命中，末尾的 sans-serif 永远轮不到，
 * 所以浏览器「自定义字体」里的 Sans-serif 与宽度固定两项对 dsh 一直是无效的。
 *
 * ui-theme 把这两个变量声明在 :root 上，这里声明在 body 上——更近的祖先赢，与注入顺序
 * 无关。所有 --dsw-font-markdown-* / --dsw-font-* 复合 token 都由 var(--dsw-font-family)
 * 拼成、在 body 上求值，会一起跟着换；表单控件靠 base.css 的 `font-family: inherit` 跟随。
 *
 * --dsw-font-mono 被引用七次却从未定义（插件管理页、agent preset、文本预览），它一律走
 * `var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)` 的内联兜底，而那三个
 * 具体字体全是 macOS 的。这里一并补上，让那几处也走同一套。
 *
 * 等宽那两行末尾挂的 CJK 字体名是有意的：dsh 源码注明裸 monospace 尾巴在 Windows 上会让
 * 中文掉到 SimSun。通用族排在最前，所以「宽度固定的字体」照常生效，只有它本身缺中文字形
 * 时才轮到雅黑／苹方——若浏览器把中文等宽设成了别的字体，那个字体有字形就先命中。
 *
 * 接管不到的两项：标准字体只在元素完全不指定 font-family 时生效，而 dsh 处处显式指定；
 * 字号同理——dsh 用自己的 --dsh-content-font-size（12–17px），与浏览器的字号设置是两套。
 *
 * @module dsh-chat-ux/client/font-styles
 */

/** 把 dsh 的两个字体变量换成裸通用族，并补上从未定义的 --dsw-font-mono。 */
export const FONT_CSS = `
body {
  --dsw-font-family: sans-serif;
  --ds-font-family-code: monospace, 'Microsoft YaHei', 'PingFang SC';
  --dsw-font-mono: monospace, 'Microsoft YaHei', 'PingFang SC';
}
`
