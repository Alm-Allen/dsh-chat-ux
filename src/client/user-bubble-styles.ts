/**
 * Stylesheet for the user-bubble replacement renderer.
 *
 * The shipped bubble's own sheet is a CSS Module inside ui-chat, so its hashed
 * class names are unreachable from a plugin. Every rule here is a re-statement
 * of the measurements that sheet carries — the same tokens, the same numbers —
 * under a `dsh-chat-ux-ub-` prefix that cannot collide with it.
 *
 * Two rules are deliberately NOT copied verbatim:
 *
 *   - The action row's reveal is re-expressed against `data-chat-flow-kind`,
 *     the ChatView row attribute the shipped selector also keys on. Its own
 *     rule names the hashed `.actions` class, which does not match this
 *     renderer's markup, so the behaviour is restated rather than inherited.
 *   - The markdown branch drops `white-space: pre-wrap`: the block elements
 *     MarkdownText emits own their own line breaks, and keeping the source's
 *     would double every blank line. The reference-projection branch keeps it,
 *     because there the text really is inline runs.
 */

/** Class names, so the component and this sheet cannot drift apart. */
export const UB = {
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

/** The bubble half of the replacement renderer's sheet. */
export const USER_BUBBLE_CSS = `
/* Right-aligned column: the bubble stack, then the action row. */
.${UB.row} {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.${UB.stack} {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
  /* The shipped 525px cap held as a share of the content axis, so the bubble
     widens with a dragged column and stays sane in a narrow one. */
  max-width: min(calc(var(--dsh-chat-content-width, 748px) * 0.702), 82%);
}

.${UB.bubble} {
  max-width: 100%;
  background: var(--dsw-specific-bubble);
  border-radius: 22px;
  padding: 10px 16px;
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(22px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-primary);
  word-break: break-word;
}

/* Reference projection: inline runs, so the source's own line breaks stand. */
.${UB.plain} {
  white-space: pre-wrap;
}

/* Markdown: the renderer's block rhythm owns spacing, so only the bubble's
   own edges are tightened — a one-paragraph message must not gain a leading
   and trailing gap the plain bubble never had. */
.${UB.markdown} {
  white-space: normal;
}
.${UB.markdown} > :first-child > :first-child { margin-top: 0; }
.${UB.markdown} > :first-child > :last-child { margin-bottom: 0; }

.${UB.attachments} {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
  gap: 8px;
}

.${UB.file} {
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

.${UB.fileIcon} { flex: none; width: 28px; height: 28px; }

.${UB.fileContent} { display: flex; flex: 1; flex-direction: column; min-width: 0; }

.${UB.fileName} {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
}

.${UB.fileMeta} {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, 0.45));
  font-size: 12px;
  line-height: 15px;
}

.${UB.refs} {
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(18px + var(--dsh-content-font-delta-secondary, 0px));
}

.${UB.actions} {
  display: flex;
  align-items: center;
  gap: 8px;
  height: calc(28px + var(--dsh-content-font-delta, 0px));
}

.${UB.time} {
  padding-right: 12px;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

.${UB.action} {
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

.${UB.action} svg {
  width: calc(15px + var(--dsh-content-font-delta, 0px));
  height: calc(15px + var(--dsh-content-font-delta, 0px));
}

.${UB.action}:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}

/* The shipped rule hides the action row on every user/steering row that has a
   later one, and reveals it on hover or focus. Restated here because the
   shipped selector names a hashed class this markup does not carry. Devices
   without hover keep every row visible. */
@media (hover: hover) {
  :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering']):has(
    ~ :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering'])
  ) .${UB.actions} {
    opacity: 0;
    transition: opacity 80ms ease;
  }

  :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering']):has(
    ~ :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering'])
  ):hover .${UB.actions},
  :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering']):has(
    ~ :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering'])
  ):focus-within .${UB.actions} {
    opacity: 1;
  }
}
`
