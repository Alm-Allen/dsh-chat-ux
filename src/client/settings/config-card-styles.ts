/**
 * 插件配置卡片的样式。
 *
 * 与插件管理页表达自己的方式一致：同一套 --dsw-* 令牌、同一套字段节奏与控件几何，一张夹在两张官方
 * 卡片中间的卡片该读起来像这一页自己的一部分
 *
 * 开关本身不在这里画，用的是平台提供的 Switch；这一份只管把标题、说明与控件摆成官方开关行的样子
 * 保持纯文本的理由与聊天区样式表相同：client bundle 单文件自包含，没有资源 URL
 */

// 卡片渲染的类名，带前缀所以不会和宿主页面的类名撞车（那一页用的是带 hash 的 CSS Modules 名，插件的样式表是普通的全局 CSS）
export const CARD_CLASS = {
	form: "dsh-chat-ux-card-form",
	notice: "dsh-chat-ux-card-notice",
	row: "dsh-chat-ux-card-row",
	rowText: "dsh-chat-ux-card-row-text",
	label: "dsh-chat-ux-card-label",
	labelLine: "dsh-chat-ux-card-label-line",
	badges: "dsh-chat-ux-card-badges",
	reset: "dsh-chat-ux-card-reset",
	hint: "dsh-chat-ux-card-hint",
	failed: "dsh-chat-ux-card-failed",
	segment: "dsh-chat-ux-card-segment",
	tuning: "dsh-chat-ux-card-tuning",
	tuningSummary: "dsh-chat-ux-card-tuning-summary",
	tuningActions: "dsh-chat-ux-card-tuning-actions",
	tuner: "dsh-chat-ux-card-tuner",
	tunerLabel: "dsh-chat-ux-card-tuner-label",
	tunerInput: "dsh-chat-ux-card-tuner-input",
	tunerValue: "dsh-chat-ux-card-tuner-value",
	bezier: "dsh-chat-ux-card-bezier",
	bezierPlot: "dsh-chat-ux-card-bezier-plot",
	bezierFrame: "dsh-chat-ux-card-bezier-frame",
	bezierRule: "dsh-chat-ux-card-bezier-rule",
	bezierArm: "dsh-chat-ux-card-bezier-arm",
	bezierCurve: "dsh-chat-ux-card-bezier-curve",
	bezierHandle: "dsh-chat-ux-card-bezier-handle",
	bezierReadout: "dsh-chat-ux-card-bezier-readout",
} as const

// 每种颜色都来自主题令牌，所以卡片跟随深浅色切换，不需要第二套规则
export const CARD_CSS = `/* dsh-chat-ux —— 插件配置卡片 */
.${CARD_CLASS.form} {
  display: flex;
  flex-direction: column;
}

.${CARD_CLASS.notice} {
  margin: 0 0 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.row} {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}

.${CARD_CLASS.rowText} {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.${CARD_CLASS.label} {
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

/* 标签那一行：行内 flex，标签后面再跟什么小标都不会把说明挤下去 */
.${CARD_CLASS.labelLine} {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.${CARD_CLASS.badges} {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.${CARD_CLASS.reset} {
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.${CARD_CLASS.reset}:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}

.${CARD_CLASS.reset}:disabled {
  cursor: default;
}

.${CARD_CLASS.hint} {
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.failed} {
  margin: 0 0 4px;
  color: var(--dsw-alias-label-error);
  font-size: 12px;
  line-height: 1.5;
}

/* 首行之外每一行都带一条分隔线，各行于是有同一个节奏 */
.${CARD_CLASS.row}:not(:first-child) {
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

/* 分段控件由平台自己画（ui-primitives 的 SegmentedControl），这里只保证它不被左侧文字挤扁：
   它是这一行里唯一的控件，宽度该由它自己定 */
.${CARD_CLASS.segment} {
  flex: none;
}

/* 冒头那十根滑杆收在一个折叠块里：卡片本来就长，参数摊开会让别的开关要滚很远才看得到。
   折叠头与卡片上的标签同一档字重，前面的加号自己做——原生三角在各家的深色主题里粗细不一 */
.${CARD_CLASS.tuning} {
  margin-top: 4px;
  padding: 12px 0 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

.${CARD_CLASS.tuningSummary} {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
  cursor: pointer;
  list-style: none;
}

.${CARD_CLASS.tuningSummary}::-webkit-details-marker {
  display: none;
}

.${CARD_CLASS.tuningSummary}::before {
  content: "＋";
  display: inline-block;
  width: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* 折叠头下面那段说明留一点气口，右端别顶到读数的列上 */
.${CARD_CLASS.tuning} > .${CARD_CLASS.hint} {
  margin: 6px 0 10px;
  padding-right: 72px;
}

.${CARD_CLASS.tuning}[open] > .${CARD_CLASS.tuningSummary}::before {
  content: "－";
}

/* 一行三列：名字、滑杆、读数。读数是等宽数字，拖动时不会因为位数变化左右跳 */
.${CARD_CLASS.tuner} {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 60px;
  align-items: center;
  gap: 12px;
  padding: 5px 0;
}

.${CARD_CLASS.tunerLabel} {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.${CARD_CLASS.tunerInput} {
  width: 100%;
  margin: 0;
  accent-color: var(--dsw-alias-label-primary);
}

.${CARD_CLASS.tunerValue} {
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  text-align: right;
}

/* 冒出那一段缓动的曲线图。曲线与两根控制柄是 SVG（整张图横纵都被拉伸，所以线宽走 non-scaling-stroke），
   两个圆点是普通按钮绝对定位在图上——SVG 里的圆会被那层非等比缩放拉成椭圆 */
.${CARD_CLASS.bezier} {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 2px 0 12px;
}

.${CARD_CLASS.bezierPlot} {
  position: relative;
  width: 100%;
  max-width: 460px;
  height: 200px;
  touch-action: none;
  user-select: none;
}

.${CARD_CLASS.bezierPlot} svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.${CARD_CLASS.bezierPlot} svg :is(path, rect) {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

/* 0..1 那一方框：方框上下之外就是回弹的范围 */
.${CARD_CLASS.bezierFrame} {
  stroke: var(--dsw-alias-border-l2);
  stroke-width: 1;
}

/* 匀速那条对角线：曲线压在它下面就是先慢后快 */
.${CARD_CLASS.bezierRule} {
  stroke: var(--dsw-alias-border-l2);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.${CARD_CLASS.bezierArm} {
  stroke: var(--dsw-alias-label-tertiary);
  stroke-width: 1;
}

.${CARD_CLASS.bezierCurve} {
  stroke: var(--dsw-alias-label-primary);
  stroke-width: 2;
}

.${CARD_CLASS.bezierHandle} {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-primary);
  box-shadow: 0 0 0 2px var(--dsw-alias-bg-base, Canvas);
  cursor: grab;
  touch-action: none;
}

.${CARD_CLASS.bezierHandle}:active:not(:disabled) {
  cursor: grabbing;
}

.${CARD_CLASS.bezierHandle}:disabled {
  cursor: default;
  opacity: 0.4;
}

.${CARD_CLASS.bezierReadout} {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
}

.${CARD_CLASS.tuningActions} {
  display: flex;
  justify-content: flex-end;
  padding: 6px 0 2px;
}
`

