/**
 * `run_code` 行进度读数自己的样式。
 *
 * 字号与行高按这一行的口径写：dsh 的 `.summary/.summarySuffix` 用的是「次级文字 + 24px + delta」的
 * 行盒，读数挨着它们站，字号小一号（与文件变更行行尾那截同款），行高跟着同一个表达式，所以它与旁边
 * 的文案严格同一条基线、也不会把这一行顶高。
 *
 * 颜色取 dsh 的三级文字令牌——与文件变更行行尾那一截同一个口径（那里也是 `--dsw-alias-label-caption`）。
 *
 * @module dsh-chat-ux/chat/code-progress/code-progress-styles
 */

/** 挂进行里的读数元素。 */
export const CODE_PROGRESS_CLASS = 'dsh-chat-ux-code-progress'

/**
 * 整份样式，由 `styles.ts` 拼进那张 `<style>`。
 *
 * `flex: none` 不能省：dsh 那一行是 flex，读数若不设它会被压缩、跟随摘要被挤掉。`white-space: nowrap`
 * 也不能省——`flex: none` 只挡得住盒子收缩，挡不住文字折行。
 *
 * 字号与行高按这一行的口径写：内置的 `.summary` 用的是「次级文字 + 24px + delta」的行盒，读数挨着它
 * 站，字号小两号（与文件变更行行尾那一截同一个口径），行高跟着同一个表达式，所以它与旁边的描述严格
 * 同一条基线、也不会把这一行顶高。
 */
export const CODE_PROGRESS_CSS = `
.${CODE_PROGRESS_CLASS} {
  flex: none;
  margin-left: 6px;
  white-space: nowrap;
  font-family: var(--dsw-font-markdown-code-block-small, ui-monospace, monospace);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-caption);
}
`
