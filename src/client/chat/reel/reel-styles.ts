/**
 * 数字轮自己的样式：一格一格翻的那几位数字。
 *
 * 两处都用它——「缓存命中」那枚胶囊的读数（座位里由 React 渲染）与上下文占用那串百分比（dsh 自己
 * 渲染的文本，插件从 DOM 上接管）。两处形状不同（一个带一位小数、一个是整数），但一格怎么裁、怎么
 * 翻、终态落在哪里完全一样，所以类名与规则只有这一份。
 *
 * 接管那一处的规矩：读数原文本留在 DOM 里、读屏照旧读得到，只是让出视觉位置（由接管方把字号归零），
 * 轮子挂在同一个父节点下。这样 dsh 重渲染它自己那个文本节点时碰不到我们，读屏也不会读到两遍。
 *
 * @module dsh-chat-ux/chat/reel/reel-styles
 */

/** 一次翻动用多久。与下面那两条关键帧的时长是同一个数，改一处就要改另一处。 */
export const REEL_TURN_MS = 220

/** 低位比高位晚这么多起手，动起来的次序从左往右。 */
export const REEL_STAGGER_MS = 15

/** 这一截的容器：几位数字、小数点、百分号并排。 */
export const REEL_TEXT_CLASS = 'dsh-chat-ux-reel-text'

/** 一个数字位：一格窗口，只负责裁。 */
export const REEL_CLASS = 'dsh-chat-ux-reel'

/** 窗口里现在的那个数字：从下面一格上来，终态零位移。 */
export const REEL_CELL_CLASS = 'dsh-chat-ux-reel-cell'

/** 上一个数字：往上面一格走。 */
export const REEL_WAS_CLASS = 'dsh-chat-ux-reel-was'

/** 读数里的小数点与百分号：不滚，与数字轮并排。 */
export const REEL_STATIC_CLASS = 'dsh-chat-ux-reel-static'

/** 给读屏的那一份读数，视觉上藏起来。 */
export const REEL_SPOKEN_CLASS = 'dsh-chat-ux-reel-spoken'

/** 挂在被接管的那一截读数上：原文本让位，数字轮接手。 */
export const REEL_TAKEOVER_ATTRIBUTE = 'data-dsh-chat-ux-reel'

/**
 * 接手方自己那层容器：挂在被接管那一截读数的**父级**里（不是它里面，原因见 reel-host）。
 *
 * 带类名是为了能认：排查时一眼看得出这一层是本插件的，卸载时也靠它定位。
 */
export const REEL_HOST_CLASS = 'dsh-chat-ux-reel-host'

/**
 * 整份样式，由 `styles.ts` 拼进那张 `<style>`。
 *
 * 一格的高写死 20px：字形盒 17px 放在里面，上下各余一点，读者换字体也裁不到；小数点与百分号跟着用
 * 同一个行高，所以数字与它们必然齐平，不靠对齐属性去凑。翻动的位移**不用**这个数——它是相对各自行盒
 * 的百分比（下面那两条关键帧），所以这一处没有「算一格」的地方。
 */
export const REEL_CSS = `
/* 字号写在这一层自己身上，不靠父级给。接管那一处的父级是 dsh 的按钮，它的字号 dsh 自己会按主题与
   字号档位重算，靠继承就意味着「读者把正文调大之后，接管方必须跟着重算」；自带一份反而稳：两处
   （命中率胶囊与上下文占用）本来就都是「次级文字再减一档」，与 dsh 在那两处用的表达式同值。 */
.${REEL_TEXT_CLASS} {
  --dsh-chat-ux-reel-cell: 20px;
  display: inline-flex;
  align-items: center;
  height: var(--dsh-chat-ux-reel-cell);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
}

/* 一个数字位：一格的窗口，只负责裁。position 定在这里，好让上一个数字压在同一格上。 */
.${REEL_CLASS} {
  display: block;
  position: relative;
  /* 胶囊挤的时候，这一格也不许被压窄。 */
  flex: none;
  overflow: hidden;
  height: var(--dsh-chat-ux-reel-cell);
}

/* 新数字从下面一格上来：位移是相对**这一格自己的行盒**的百分比，所以一格有多高、字号多大、
   页面缩放多少都不参与；而终态是零位移——动画走完，数字就落在它本来的位置上，没有可歪的余地。 */
.${REEL_CELL_CLASS} {
  display: block;
  height: var(--dsh-chat-ux-reel-cell);
  line-height: var(--dsh-chat-ux-reel-cell);
  text-align: center;
  animation: dsh-chat-ux-reel-in ${REEL_TURN_MS}ms cubic-bezier(0.22, 0.61, 0.24, 1) both;
}

/* 上一个数字往上面一格走；走完停在窗口外，被列口裁着，不碍事。
   它必须**脱离文档流**压在同一个格上：两个 display: block 上下排的话，新数字会被推到下一格，
   正好落在窗口外面——那样读者只会看到旧数字往上走、新数字永远不出现。 */
.${REEL_WAS_CLASS} {
  display: block;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: var(--dsh-chat-ux-reel-cell);
  line-height: var(--dsh-chat-ux-reel-cell);
  text-align: center;
  animation: dsh-chat-ux-reel-out ${REEL_TURN_MS}ms cubic-bezier(0.22, 0.61, 0.24, 1) both;
}

@keyframes dsh-chat-ux-reel-in {
  from { transform: translateY(100%); }
  to { transform: none; }
}

@keyframes dsh-chat-ux-reel-out {
  from { transform: none; }
  to { transform: translateY(-100%); }
}

/* 系统说「减少动态效果」：两个数字都不动，上一个直接不显示。 */
@media (prefers-reduced-motion: reduce) {
  .${REEL_CELL_CLASS},
  .${REEL_WAS_CLASS} {
    animation: none;
  }

  .${REEL_WAS_CLASS} {
    display: none;
  }
}

/* 小数点与百分号也进同一个行盒：三处行高相同，数字与它们必然齐平。
   flex: none 不能省：胶囊挤的时候，flex 会先把没有固定尺寸的小数点压成零宽——读者那边就是
   「小数点不见了」。 */
.${REEL_STATIC_CLASS} {
  display: block;
  flex: none;
  height: var(--dsh-chat-ux-reel-cell);
  line-height: var(--dsh-chat-ux-reel-cell);
}

/* 给读屏的那一份读数：视觉上藏起来，读出来还是「97.3%」。 */
.${REEL_SPOKEN_CLASS} {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`
