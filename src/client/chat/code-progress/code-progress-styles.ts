/**
 * `run_code` 行进度读数与预览清单自己的样式。
 *
 * 读数：字号与行高按这一行的口径写。dsh 的 `.summary/.summarySuffix` 用的是「次级文字 + 24px + delta」的
 * 行盒，读数挨着它们站，字号小一号（与文件变更行行尾那截同款），行高跟着同一个表达式，所以它与旁边的
 * 文案严格同一条基线、也不会把这一行顶高。
 *
 * 预览清单：展开体最上面那一块，说明「下面这些调用还没执行」。它与正式的工具行**必须一眼分得开**——那
 * 一族是实线卡片加状态色，这一块只是预告，所以走虚线边框、小一号的字、没有状态色，也不要自己的背景：
 * 读者不该把一处预览当成一次已经发生的改动。
 *
 * @module dsh-chat-ux/chat/code-progress/code-progress-styles
 */
import {REEL_TEXT_CLASS} from '../reel/reel-styles'

/** 挂进行里的读数元素。 */
export const CODE_PROGRESS_CLASS = 'dsh-chat-ux-code-progress'

/**
 * 折叠态那一截预告：认出子调用之后，**不用展开**就能看见要写哪份文件。
 *
 * 它和 `CODE_PROGRESS_CLASS` 是两种东西：那个说「程序写到哪了」，这个说「接下来要动什么」——后者才是
 * 读者真正在等的信息，所以它必须出现在折叠态，而不是藏在展开体里。
 */
export const PREVIEW_SUMMARY_CLASS = 'dsh-chat-ux-preview-summary'

/** 折叠态预告里那一截路径（比数字显眼一档：读者先认文件，再看行数）。 */
export const PREVIEW_SUMMARY_PATH_CLASS = 'dsh-chat-ux-preview-summary-path'

/** 预览清单的容器。 */
export const PREVIEW_BOX_CLASS = 'dsh-chat-ux-preview'
/** 预览清单的头一行（标签 + 那句说明）。 */
export const PREVIEW_HEAD_CLASS = 'dsh-chat-ux-preview-head'
/** 「预览」这枚小标签。 */
export const PREVIEW_TAG_CLASS = 'dsh-chat-ux-preview-tag'
/** 那句「还没执行」。 */
export const PREVIEW_NOTE_CLASS = 'dsh-chat-ux-preview-note'
/** 一处目标。 */
export const PREVIEW_ROW_CLASS = 'dsh-chat-ux-preview-row'
/** 目标那一行的图标槽。 */
export const PREVIEW_ICON_CLASS = 'dsh-chat-ux-preview-icon'
/** 目标路径。 */
export const PREVIEW_PATH_CLASS = 'dsh-chat-ux-preview-path'
/** 行尾那个数的容器。 */
export const PREVIEW_STAT_CLASS = 'dsh-chat-ux-preview-stat'
/** 新增数（绿色）。 */
export const PREVIEW_ADD_CLASS = 'dsh-chat-ux-preview-add'
/** 删除数（红色）。 */
export const PREVIEW_DEL_CLASS = 'dsh-chat-ux-preview-del'

/**
 * 整份样式，由 `styles.ts` 拼进那张 `<style>`。
 *
 * `flex: none` 不能省：dsh 那一行是 flex，读数若不设它会被压缩、跟随摘要被挤掉。`white-space: nowrap`
 * 也不能省——`flex: none` 只挡得住盒子收缩，挡不住文字折行。
 *
 * 增删色借用 `--dsh-chat-ux-diff-added/deleted`（定义在文件变更行的样式里，挂在 `body` 上），与行尾那
 * 两个数同一个取值——同一件事不该有两套绿。
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

/* 读数里的数也走数字轮，槽高按这一行的 24px 行盒重写——与文件变更行行尾那一截同一个坑。 */
.${CODE_PROGRESS_CLASS} .${REEL_TEXT_CLASS} {
  --dsh-chat-ux-reel-cell: calc(24px + var(--dsh-content-font-delta, 0px));
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
}

/* 虚线是这一块与正式工具行唯一的分界，不能换成实线：实线卡片在这一族里的意思是「这是一次改动」。 */
.${PREVIEW_BOX_CLASS} {
  display: flex;
  flex-direction: column;
  margin: 4px 0 4px 4px;
  padding: 6px 10px 8px;
  border: 0.5px dashed var(--dsw-alias-border-l2);
  border-radius: 10px;
}

.${PREVIEW_HEAD_CLASS} {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 3px;
}

.${PREVIEW_TAG_CLASS} {
  flex: none;
  padding: 0 5px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-caption);
}

.${PREVIEW_NOTE_CLASS} {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-caption);
}

.${PREVIEW_ROW_CLASS} {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-family: var(--dsw-font-markdown-code-block-small, ui-monospace, monospace);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  line-height: 18px;
}

.${PREVIEW_ICON_CLASS} {
  flex: none;
  display: inline-flex;
  align-self: center;
  color: var(--dsw-alias-label-caption);
}

.${PREVIEW_PATH_CLASS} {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}

.${PREVIEW_STAT_CLASS} {
  flex: none;
  font-family: var(--ds-font-family-code);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
  line-height: 18px;
}

/* 数字轮自己那个 20px 的槽高要按这一处的 18px 行盒重写，否则它的基线按别的行盒算、数字会浮起来
   （与文件变更行行尾那一截遇到的是同一件事）。 */
.${PREVIEW_STAT_CLASS} .${REEL_TEXT_CLASS} {
  --dsh-chat-ux-reel-cell: 18px;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
}

.${PREVIEW_ADD_CLASS} {
  color: var(--dsh-chat-ux-diff-added);
}

.${PREVIEW_DEL_CLASS} {
  color: var(--dsh-chat-ux-diff-deleted);
}

/* 折叠态那一截预告。与读数同一口径（同一行盒、同一末级字色），但路径那一截用次级色——读者扫一眼要
   先认出「写到哪份文件」，数字是其次。flex: none 与 white-space: nowrap 两个都不能省，理由同读数那里。 */
.${PREVIEW_SUMMARY_CLASS} {
  flex: none;
  margin-left: 6px;
  white-space: nowrap;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  color: var(--dsw-alias-label-caption);
}

.${PREVIEW_SUMMARY_CLASS} > .${PREVIEW_SUMMARY_PATH_CLASS} {
  font-family: var(--dsw-font-markdown-code-block-small, ui-monospace, monospace);
  color: var(--dsw-alias-label-secondary);
}

.${PREVIEW_SUMMARY_CLASS} > .${PREVIEW_ADD_CLASS},
.${PREVIEW_SUMMARY_CLASS} > .${PREVIEW_DEL_CLASS} {
  font-family: var(--ds-font-family-code);
}

/* 折叠态预告里那两个数也走数字轮，所以槽高要按这一行的 24px 行盒重写一遍——与文件变更行行尾那一截
   遇到的是同一件事，不重写就会浮起来 2px。 */
.${PREVIEW_SUMMARY_CLASS} .${REEL_TEXT_CLASS} {
  --dsh-chat-ux-reel-cell: calc(24px + var(--dsh-content-font-delta, 0px));
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 2px);
}
`
