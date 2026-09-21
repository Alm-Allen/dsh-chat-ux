/**
 * 用户气泡替换渲染器的样式表。
 *
 * 官方气泡自己的样式表是 ui-chat 里的一个 CSS Module，那套带 hash 的类名插件够不着。
 * 这里的每一条规则都是对那张表所载度量的重述——同样的令牌、同样的数字——只是换了
 * `dsh-chat-ux-ub-` 前缀，不可能和它撞车。
 *
 * 有两条规则是刻意不照抄的：
 *
 *   - 操作行的显隐改挂在 `data-chat-flow-kind` 上，也就是官方选择器同样会看的那条
 *     ChatView 行属性。官方那条规则点名的是带 hash 的 `.actions` 类，跟这套标记对不上，
 *     所以这里是把行为重述一遍，而不是继承它。
 *   - markdown 分支去掉了 `white-space: pre-wrap`：MarkdownText 吐出的块级元素自带换行，
 *     留着源文本的换行会把每个空行都翻倍。引用投影那条分支保留它，因为那里确实是一段行内文本。
 */

/** 类名表，让组件和这张样式表不会各走各的。 */
export const USER_BUBBLE_CLASS = {
  row: 'dsh-chat-ux-ub-row',
  stack: 'dsh-chat-ux-ub-stack',
  bubble: 'dsh-chat-ux-ub-bubble',
  plain: 'dsh-chat-ux-ub-plain',
  markdown: 'dsh-chat-ux-ub-md',
  attachments: 'dsh-chat-ux-ub-attachments',
  file: 'dsh-chat-ux-ub-file',
  fileIcon: 'dsh-chat-ux-ub-file-icon',
  fileContent: 'dsh-chat-ux-ub-file-content',
  fileName: 'dsh-chat-ux-ub-file-name',
  fileMeta: 'dsh-chat-ux-ub-file-meta',
  refs: 'dsh-chat-ux-ub-refs',
  actions: 'dsh-chat-ux-ub-actions',
  time: 'dsh-chat-ux-ub-time',
  action: 'dsh-chat-ux-ub-action',
} as const

/** 替换渲染器样式表里气泡那一半。 */
export const USER_BUBBLE_CSS = `
/* 右对齐的一列：气泡栈，然后是操作行。 */
.${USER_BUBBLE_CLASS.row} {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.${USER_BUBBLE_CLASS.stack} {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
  /* 官方的 525px 上限改成内容轴的一个比例，这样拖宽列时气泡跟着变宽，
     列窄时也不会失控。 */
  max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%);
}

.${USER_BUBBLE_CLASS.bubble} {
  max-width: 100%;
  background: var(--dsw-specific-bubble);
  border-radius: 22px;
  padding: 10px 16px;
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-primary);
  word-break: break-word;
}

/* 引用投影：一段行内文本，所以源文本自己的换行照样成立。 */
.${USER_BUBBLE_CLASS.plain} {
  white-space: pre-wrap;
}

/* markdown：块级节奏由渲染器自己掌握，这里只收紧气泡自己的上下边缘——
   一段话的消息不该凭空多出纯文本气泡从来没有的首尾间距。 */
.${USER_BUBBLE_CLASS.markdown} {
  white-space: normal;
}
.${USER_BUBBLE_CLASS.markdown} > :first-child > :first-child { margin-top: 0; }
.${USER_BUBBLE_CLASS.markdown} > :first-child > :last-child { margin-bottom: 0; }

.${USER_BUBBLE_CLASS.attachments} {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
  gap: 8px;
}

.${USER_BUBBLE_CLASS.file} {
  display: inline-flex;
  flex: 0 0 240px;
  align-items: center;
  gap: 10px;
  width: 240px;
  min-height: 64px;
  padding: 8px 12px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  border-radius: 16px;
  background: var(--dsw-specific-input-major, transparent);
  box-sizing: border-box;
}

.${USER_BUBBLE_CLASS.fileIcon} { flex: none; width: 28px; height: 28px; }

.${USER_BUBBLE_CLASS.fileContent} { display: flex; flex: 1; flex-direction: column; min-width: 0; }

.${USER_BUBBLE_CLASS.fileName} {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.${USER_BUBBLE_CLASS.fileMeta} {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.45));
  font-size: 12px;
  line-height: 15px;
}

.${USER_BUBBLE_CLASS.refs} {
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(18px + var(--dsh-content-font-delta-secondary, 0px));
}

.${USER_BUBBLE_CLASS.actions} {
  display: flex;
  align-items: center;
  gap: 8px;
  height: calc(28px + var(--dsh-content-font-delta, 0px));
}

.${USER_BUBBLE_CLASS.time} {
  padding-right: 12px;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.${USER_BUBBLE_CLASS.action} {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(28px + var(--dsh-content-font-delta, 0px));
  height: calc(28px + var(--dsh-content-font-delta, 0px));
  padding: 6px;
  border: none;
  border-radius: 28px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.${USER_BUBBLE_CLASS.action} svg {
  width: calc(15px + var(--dsh-content-font-delta, 0px));
  height: calc(15px + var(--dsh-content-font-delta, 0px));
}

.${USER_BUBBLE_CLASS.action}:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

/* 官方规则会把后面还跟着 user/steering 行的那些行上的操作行藏起来，悬停或聚焦时才显示。
   这里重述一遍，因为官方选择器点名的那个带 hash 的类，这套标记并不带。
   没有悬停能力的设备上，每一行的操作行都保持可见。 */
@media (hover: hover) {
  :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering']):has(
    ~ :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering'])
  ) .${USER_BUBBLE_CLASS.actions} {
    opacity: 0;
    transition: opacity 80ms ease;
  }

  :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering']):has(
    ~ :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering'])
  ):hover .${USER_BUBBLE_CLASS.actions},
  :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering']):has(
    ~ :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering'])
  ):focus-within .${USER_BUBBLE_CLASS.actions} {
    opacity: 1;
  }
}
`
