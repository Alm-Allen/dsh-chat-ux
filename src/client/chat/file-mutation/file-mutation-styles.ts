/**
 * 文件变更行自己的样式表。
 *
 * 这一行在 tool.call.toolview 的 edit 与 write 座位上遮蔽了内置的文件变更行，所以内置 ToolRow.module.css
 * 那些规则要在这里重写一份：那套类名带构建期 hash，既拿不到也不能当接口
 *
 * 尺寸与节奏逐条对齐，行高和 leading 由共享的 DisclosureRow 承担，这里只补它没画的那几样
 */
import {REEL_TEXT_CLASS} from "../reel/reel-styles"

// 行 chrome：分别交给 DisclosureRow 的对应 prop，悬停提亮挂在它渲染的那一行上
export const FILE_ROW_CLASS = "dsh-chat-ux-file-root"
export const FILE_ROW_LINE_CLASS = "dsh-chat-ux-file-row"
export const FILE_LEADING_CLASS = "dsh-chat-ux-file-leading"
export const FILE_CHEVRON_CLASS = "dsh-chat-ux-file-chevron"
export const FILE_TITLE_CLASS = "dsh-chat-ux-file-title"

// 折叠态：标题与摘要之间的点、摘要、行尾那一小截统计
export const FILE_SEP_CLASS = "dsh-chat-ux-file-sep"
export const FILE_SUMMARY_CLASS = "dsh-chat-ux-file-summary"
export const FILE_ERROR_CLASS = "dsh-chat-ux-file-error"
export const FILE_STOPPED_CLASS = "dsh-chat-ux-file-stopped"
export const FILE_LINK_CLASS = "dsh-chat-ux-file-link"
export const FILE_SUFFIX_CLASS = "dsh-chat-ux-file-suffix"
export const FILE_STAT_CLASS = "dsh-chat-ux-file-stat"
export const FILE_ADD_CLASS = "dsh-chat-ux-file-add"
export const FILE_DEL_CLASS = "dsh-chat-ux-file-del"

// 展开体：diff 卡片、IN/OUT 卡片与轨迹入口
export const FILE_BODY_CLASS = "dsh-chat-ux-file-body"
export const FILE_DIFF_CLASS = "dsh-chat-ux-file-diff"
export const FILE_IO_CLASS = "dsh-chat-ux-file-io"
export const FILE_IO_SECTION_CLASS = "dsh-chat-ux-file-io-section"
export const FILE_IO_DIVIDER_CLASS = "dsh-chat-ux-file-io-divider"
export const FILE_IO_LABEL_CLASS = "dsh-chat-ux-file-io-label"
export const FILE_IO_TEXT_CLASS = "dsh-chat-ux-file-io-text"
export const FILE_INSPECT_CLASS = "dsh-chat-ux-file-inspect"

// 只给读屏看的运行态标签：状态本身只靠图标与扫光表达
export const FILE_HIDDEN_CLASS = "dsh-chat-ux-file-hidden"

export const FILE_MUTATION_CSS = `
/* 增删色取 dsh 为文件改动标记准备的那一对令牌，而不是 diff 正文用的 state-success/error-primary：
   正文那对的绿只有一种取值，11px 的小字压在浅色画布上偏亮；marker 这一对深浅各有一套，
   正好是小字号要的对比度。想再微调就改下面这两个变量，深浅色各写一份 */
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

/* 行尾那一小截挤在摘要的省略号之外，所以自己带一份同款字级；两个数字之间留一道固定的缝，
   比空格宽，免得 "+12" 和 "-3" 挨成一个数 */
.${FILE_SUFFIX_CLASS} {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin-left: 10px;
  white-space: nowrap;
}

.${FILE_STAT_CLASS} {
  font-family: var(--ds-font-family-code);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  transform: translateY(0.5px);
}

/* 行尾那两个数是数字滚动（见 ../reel/digit-reel），字号与槽高都按这一行的口径重写：reel 自带的是
   次级文字减一号、20px 的行盒，这一行是减两号、24px + delta，半行距差多少基线就偏多少（实测 2px，
   数字会浮到与旁边那个 3KB 不在一条线上）。选择器比 reel 那一份多两层，所以不靠 ALL_CSS 里的先后取胜 */
.${FILE_SUFFIX_CLASS} .${FILE_STAT_CLASS} .${REEL_TEXT_CLASS} {
  --dsh-chat-ux-reel-cell: calc(24px + var(--dsh-content-font-delta, 0px));
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
}

.${FILE_ADD_CLASS} {
  color: var(--dsh-chat-ux-diff-added);
}

.${FILE_DEL_CLASS} {
  color: var(--dsh-chat-ux-diff-deleted);
}

/* 悬停整行提亮，但行尾那两个数字不跟：它们是这一行的结论，颜色本身就是信息，
   跟着变成正文色就等于把结论擦掉 */
.${FILE_ROW_LINE_CLASS}:hover .${FILE_TITLE_CLASS},
.${FILE_ROW_LINE_CLASS}:hover .${FILE_SUMMARY_CLASS}:not(.${FILE_ERROR_CLASS}):not(.${FILE_STOPPED_CLASS}) {
  color: var(--dsw-alias-label-primary);
}

/* 文件路径：点状下划线说明它可点，收缩到文字宽度，行内剩下的空白仍然属于开合目标 */
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

/* 展开体：diff 卡片与 IN/OUT 卡片共用同一份左缩进与行间节奏 */
.${FILE_DIFF_CLASS},
.${FILE_IO_CLASS} {
  margin: 4px 0 4px 4px;
}

/* IN/OUT 卡片：代码块那套表面与圆角，两节各自滚动，中间一道发丝线 */
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

/* 轨迹入口：悬停整行（含标题行）或键盘聚焦时显形，平时不占视觉 */
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

/* 裁到 1px：只给读屏，视觉上不占位 */
.${FILE_HIDDEN_CLASS} {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`;
