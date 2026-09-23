/**
 * 文件变更行自己的样式表。
 *
 * 这一行归 dsh-chat-ux：它在 `tool.call.toolview` 的 edit / write 座位上遮蔽了内置的文件变更行，
 * 所以内置 ToolRow.module.css 里那些规则要在这里重写一份——那套类名带构建期 hash，既拿不到、
 * 也不能当接口。尺寸、令牌与节奏逐条对齐：行高与 leading 由共享的 DisclosureRow 承担，这里只补
 * 它没画的那几样（分隔点、摘要、行尾统计、路径链接、IN/OUT 卡片、轨迹入口）。
 *
 * @module dsh-chat-ux/client/file-mutation-styles
 */

/** 行根节点。 */
export const FILE_ROW_CLASS = 'dsh-chat-ux-file-root'
/** DisclosureRow 的 row 元素：悬停提亮的挂点。 */
export const FILE_ROW_LINE_CLASS = 'dsh-chat-ux-file-row'
/** 图标槽。 */
export const FILE_LEADING_CLASS = 'dsh-chat-ux-file-leading'
/** 开合 chevron。 */
export const FILE_CHEVRON_CLASS = 'dsh-chat-ux-file-chevron'
/** 标题（`编辑` / `写入`）。 */
export const FILE_TITLE_CLASS = 'dsh-chat-ux-file-title'
/** 标题与摘要之间的那个点。 */
export const FILE_SEP_CLASS = 'dsh-chat-ux-file-sep'
/** 摘要文本。 */
export const FILE_SUMMARY_CLASS = 'dsh-chat-ux-file-summary'
/** 摘要上的失败色。 */
export const FILE_ERROR_CLASS = 'dsh-chat-ux-file-error'
/** 摘要上的中断色。 */
export const FILE_STOPPED_CLASS = 'dsh-chat-ux-file-stopped'
/** 可点的文件路径。 */
export const FILE_LINK_CLASS = 'dsh-chat-ux-file-link'
/** 行尾那一小截统计的容器。 */
export const FILE_SUFFIX_CLASS = 'dsh-chat-ux-file-suffix'
/** 统计数字共用的字级。 */
export const FILE_STAT_CLASS = 'dsh-chat-ux-file-stat'
/** 新增数（绿色）。 */
export const FILE_ADD_CLASS = 'dsh-chat-ux-file-add'
/** 删除数（红色）。 */
export const FILE_DEL_CLASS = 'dsh-chat-ux-file-del'
/** 展开体容器。 */
export const FILE_BODY_CLASS = 'dsh-chat-ux-file-body'
/** 展开体里的 diff 卡片。 */
export const FILE_DIFF_CLASS = 'dsh-chat-ux-file-diff'
/** 展开体里的 IN/OUT 卡片。 */
export const FILE_IO_CLASS = 'dsh-chat-ux-file-io'
/** IN/OUT 卡片的一节。 */
export const FILE_IO_SECTION_CLASS = 'dsh-chat-ux-file-io-section'
/** IN/OUT 之间的发丝线。 */
export const FILE_IO_DIVIDER_CLASS = 'dsh-chat-ux-file-io-divider'
/** IN / OUT 两个侧标。 */
export const FILE_IO_LABEL_CLASS = 'dsh-chat-ux-file-io-label'
/** IN / OUT 的正文。 */
export const FILE_IO_TEXT_CLASS = 'dsh-chat-ux-file-io-text'
/** 轨迹入口那颗小胶囊。 */
export const FILE_INSPECT_CLASS = 'dsh-chat-ux-file-inspect'
/** 只给读屏看的运行态标签。 */
export const FILE_HIDDEN_CLASS = 'dsh-chat-ux-file-hidden'

/** 整张样式表，由浏览器半区在安装时拼进那张 `<style>`。 */
export const FILE_MUTATION_CSS = `
/* 增删色：引用 dsh 自己为"文件改动标记"准备的那一对令牌，而不是 diff 卡片正文用的
   state-success/error-primary。理由是这两处要的东西不同：正文那对里绿色只有一种取值
   （深浅两套都是 rgb(34,197,94)），在浅色画布上做 11px 的小字偏亮；marker 这一对天生
   分了两套——浅色 rgb(1,162,65) / rgb(186,39,35)，深色 rgb(65,201,119) / rgb(250,66,62)，
   正好是小字号要的对比度。想再微调就改下面这两个变量，深浅色各写一份即可。 */
body {
  --dsh-chat-ux-diff-added: var(--dsw-alias-file-diff-added-marker);
  --dsh-chat-ux-diff-deleted: var(--dsw-alias-file-diff-deleted-marker);
}

.${FILE_ROW_CLASS} {
  display: flex;
  flex-direction: column;
}

.${FILE_LEADING_CLASS} {
  flex-shrink: 0;
}

.${FILE_CHEVRON_CLASS} {
  color: var(--dsw-alias-label-secondary);
}

.${FILE_TITLE_CLASS} {
  font-weight: 400;
  transition: color 100ms ease;
}

/* 2x2 的点：标题与摘要之间那道轻分隔。 */
.${FILE_SEP_CLASS} {
  flex: none;
  width: 2px;
  height: 2px;
  border-radius: 1px;
  margin: 0 8px;
  background: var(--dsw-alias-label-caption);
}

.${FILE_SUMMARY_CLASS} {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-tertiary);
  transition: color 100ms ease;
}

/* 行尾那一小截：挤在摘要的省略号之外，所以自己带一份同款字级。两个数字之间留一道
   固定的缝——比空格宽，免得 "+12" 和 "-3" 挨成一个数。 */
.${FILE_SUFFIX_CLASS} {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin-left: 10px;
  white-space: nowrap;
}

/* 数字本身：等宽字体、比路径小两号，再用半像素把基线推回行框正中。 */
.${FILE_STAT_CLASS} {
  font-family: var(--ds-font-family-code);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  transform: translateY(0.5px);
}

.${FILE_ADD_CLASS} {
  color: var(--dsh-chat-ux-diff-added);
}

.${FILE_DEL_CLASS} {
  color: var(--dsh-chat-ux-diff-deleted);
}

/* 悬停整行提亮，但行尾那两个数字不跟——它们是这一行的结论，颜色本身就是信息，
   跟着变成正文色就等于把结论擦掉。 */
.${FILE_ROW_LINE_CLASS}:hover .${FILE_TITLE_CLASS},
.${FILE_ROW_LINE_CLASS}:hover .${FILE_SUMMARY_CLASS}:not(.${FILE_ERROR_CLASS}):not(.${FILE_STOPPED_CLASS}) {
  color: var(--dsw-alias-label-primary);
}

/* 文件路径：同字级，点状下划线说明它可点。收缩到文字宽度，行内剩下的空白仍然属于开合目标。 */
.${FILE_LINK_CLASS} {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-secondary);
  text-decoration: underline dotted;
  text-decoration-color: var(--dsw-alias-label-tertiary);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  cursor: pointer;
  transition: color 100ms ease;
}

.${FILE_ROW_LINE_CLASS}:hover .${FILE_LINK_CLASS},
.${FILE_LINK_CLASS}:hover {
  color: var(--dsw-alias-label-primary);
  text-decoration-color: currentColor;
}

.${FILE_ERROR_CLASS} {
  color: var(--dsw-alias-state-error-primary);
}

.${FILE_STOPPED_CLASS} {
  color: var(--dsw-alias-state-warn-label);
}

.${FILE_BODY_CLASS} {
  display: flex;
  flex-direction: column;
}

/* 展开体：diff 卡片与 IN/OUT 卡片共用同一份左缩进，行与行之间也共用同一份节奏。 */
.${FILE_DIFF_CLASS},
.${FILE_IO_CLASS} {
  margin: 4px 0 4px 4px;
}

/* IN/OUT 卡片：代码块那套表面与圆角，两节各自滚动，中间一道发丝线。 */
.${FILE_IO_CLASS} {
  display: flex;
  flex-direction: column;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-markdown-code-block);
  font: var(--dsw-font-markdown-code-block-small);
}

.${FILE_IO_SECTION_CLASS} {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 14px;
  align-items: baseline;
  padding: 12px 16px;
  max-height: 150px;
  overflow-y: auto;
}

.${FILE_IO_DIVIDER_CLASS} {
  flex: none;
  height: 0.5px;
  background: var(--dsw-alias-border-l2);
}

.${FILE_IO_LABEL_CLASS} {
  position: sticky;
  top: 0;
  align-self: start;
  color: var(--dsw-alias-label-caption);
}

.${FILE_IO_TEXT_CLASS} {
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dsw-alias-label-secondary);
}

.${FILE_IO_TEXT_CLASS}[data-error] {
  color: var(--dsw-alias-state-error-primary);
}

/* 轨迹入口：悬停整行（含标题行）或键盘聚焦时显形，平时不占视觉。 */
.${FILE_INSPECT_CLASS} {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 4px;
  margin: 4px 0 2px 4px;
  padding: 2px 8px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 999px;
  corner-shape: round;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 100ms ease;
}

.${FILE_ROW_CLASS}:hover .${FILE_INSPECT_CLASS},
.${FILE_INSPECT_CLASS}:focus-visible {
  opacity: 1;
}

.${FILE_INSPECT_CLASS}:hover {
  background: var(--dsw-alias-interactive-bg-hover-solid);
  color: var(--dsw-alias-label-primary);
}

/* 运行态只靠图标与扫光表达，所以状态本身要有一条给读屏的文本。 */
.${FILE_HIDDEN_CLASS} {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
`;
