/**
 * 数字滚动自己的样式：变了的那一位原地弹一下，一位上最多两个数字落在同一个槽位上各播一段短动画，
 * 新的从下方 6px 处淡入、旧的朝反方向淡出，两条同用一条带过冲的曲线。
 *
 * 位移只有 6px，那 45% 的过冲也就是 2.7px，槽位四周接得住，不需要裁切窗口；两条动画里只有 transform
 * 与 opacity，一件非合成属性的活都没有。
 * 接管那一处：原文本留在 DOM 里、读屏照旧读得到，只让开视觉位置，滚动那一截挂在同一父节点下
 */

// 一次弹动多久：常规那一档。两条关键帧的 animation 读的是 --dsh-chat-ux-reel-turn，这个常量就是它在容器上的
// 默认值，改一处就要改另一处。500 ms 与下面那个 70 ms 都照参考卡取：280 ms 那一版在真机上「动完了但没看见」，
// 一位数字的位移只有 6px，时间一短就只剩一次闪烁；时长与起手延后是一对，一起改
export const REEL_TURN_MS = 500

// 高频那一档，配着节拍用：调用方（file-mutation-row 的 usePacedTotals）把换数压到比这一轮完整周期还长
// （220 ms 落回来加低位最多 70 ms 起手，节拍 300 ms），每一轮动画才走得完整。500 ms 那一档做不到——
// 读数每一两百毫秒就跳一次，一位上会挂着一串残影，读数糊在一起
export const REEL_TURN_FAST_MS = 220

// 低位比高位晚这么多起手，动起来的次序从左往右；同样对齐那张参考卡
export const REEL_STAGGER_MS = 70

// 进场的起点：从下方这么多像素落回来
const REEL_RISE = "6px"

// 那一条曲线：中段冲过终点、末尾弹回来；过冲量是位移的 45%，所以位移必须小
const REEL_EASE = "cubic-bezier(0.34, 1.45, 0.64, 1)"

// 这一截的容器：几位数字、小数点与百分号并排
export const REEL_TEXT_CLASS = "dsh-chat-ux-reel-text"

// 高频那一档挂在这一截的容器上：时长经自定义属性往下传，内联 style 定不了关键帧的时长
export const REEL_FAST_CLASS = "dsh-chat-ux-reel-fast"

// 一位数占的槽位：现在的数字在文档流里，上一个压在它上面
export const REEL_SLOT_CLASS = "dsh-chat-ux-reel-slot"

// 槽位里现在的那个数字：从下方落回来，终态零位移
export const REEL_CELL_CLASS = "dsh-chat-ux-reel-cell"

// 上一个数字：朝反方向淡出
export const REEL_WAS_CLASS = "dsh-chat-ux-reel-was"

// 读数里的小数点与百分号不弹，与数字位并排
export const REEL_STATIC_CLASS = "dsh-chat-ux-reel-static"

// 给读屏的那一份读数，视觉上藏起来
export const REEL_SPOKEN_CLASS = "dsh-chat-ux-reel-spoken"

// 挂在被接管的那一截读数上：原文本让开，数字滚动接手
export const REEL_TAKEOVER_ATTRIBUTE = "data-dsh-chat-ux-reel"

// 接手方自己那层容器：挂在被接管那一截读数的父级里（不是它里面，原因见 reel-host）；带类名是为了排查与卸载时认得出
export const REEL_HOST_CLASS = "dsh-chat-ux-reel-host"

// 整份样式，由 styles.ts 拼进那张 style。行高只写一个数（20px）：字形盒 17px 放在里面，上下各余一点，
// 读者换字体也裁不到；小数点与百分号跟着用同一个行高，所以数字与它们必然齐平，不靠对齐属性去凑
export const REEL_CSS = `
/* 字号写在这一层自己身上，不靠父级给。接管那一处的父级是 dsh 的按钮，它的字号 dsh 自己会按主题与字号
   档位重算，靠继承就意味着「读者把正文调大之后，接管方必须跟着重算」；自带一份反而稳：两处（命中率胶囊
   与上下文占用）本来就都是「次级文字再减一档」，与 dsh 在那两处的表达式同值 */
.${REEL_TEXT_CLASS} {
  --dsh-chat-ux-reel-cell: 20px;
  --dsh-chat-ux-reel-turn: ${REEL_TURN_MS}ms;
  display: inline-flex;
  align-items: center;
  height: var(--dsh-chat-ux-reel-cell);
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
}

/* 高频那一档：只换时长，位移、曲线与错峰起手都不动 */
.${REEL_FAST_CLASS} {
  --dsh-chat-ux-reel-turn: ${REEL_TURN_FAST_MS}ms;
}

/* 一位数：一个槽位。现在的数字在文档流里（槽宽由它决定），上一个数字绝对定位压在同一个位置上 */
.${REEL_SLOT_CLASS} {
  display: block;
  position: relative;
  /* 胶囊挤的时候，这一位也不许被压窄 */
  flex: none;
  height: var(--dsh-chat-ux-reel-cell);
}

/* 现在的那个数字：从下方落回来，终态零位移——动画走完，数字就落在它本来的位置上（位移不参与排版，
   只是一个 transform）。

   用 backwards 而不是 both：填满终态会把动画里那套声明一直挂在元素上，它与没动过的那几位（小数点、
   百分号、没变的数字）就不是同一条渲染路径了，试过带模糊的那一版，落定之后看着像没落在同一条线上。

   will-change 常驻：切会话时这一位是新挂载的，动画起手那一刻正是主线程最忙的时候，等那时才决定建层
   就晚了，实测画面会在长任务期间整段不动 */
.${REEL_CELL_CLASS} {
  display: block;
  height: 100%;
  line-height: var(--dsh-chat-ux-reel-cell);
  text-align: center;
  will-change: transform, opacity;
  animation: dsh-chat-ux-reel-in var(--dsh-chat-ux-reel-turn) ${REEL_EASE} backwards;
}

/* 上一个数字：朝反方向淡出，走完停在自己的零透明度上，不碍事。它必须脱离文档流压在同一个槽位上：
   两个 display: block 上下排的话，槽位会被撑成两格高，读数整行跟着长高 */
.${REEL_WAS_CLASS} {
  display: block;
  position: absolute;
  inset: 0;
  line-height: var(--dsh-chat-ux-reel-cell);
  text-align: center;
  will-change: transform, opacity;
  animation: dsh-chat-ux-reel-out var(--dsh-chat-ux-reel-turn) ${REEL_EASE} both;
}

@keyframes dsh-chat-ux-reel-in {
  from {
	transform: translateY(${REEL_RISE});
	opacity: 0;
  }
  to {
	transform: none;
	opacity: 1;
  }
}

@keyframes dsh-chat-ux-reel-out {
  from {
	transform: none;
	opacity: 1;
  }
  to {
	transform: translateY(-${REEL_RISE});
	opacity: 0;
  }
}

/* 系统说「减少动态效果」：两个数字都不动，上一个直接不显示 */
@media (prefers-reduced-motion: reduce) {
  .${REEL_CELL_CLASS},
  .${REEL_WAS_CLASS} {
	animation: none;
  }

  .${REEL_WAS_CLASS} {
	display: none;
  }
}

/* 小数点与百分号也进同一个行盒：三处行高相同，数字与它们必然齐平。flex: none 不能省：胶囊挤的时候，
   flex 会先把没有固定尺寸的小数点压成零宽——读者那边就是「小数点不见了」 */
.${REEL_STATIC_CLASS} {
  display: block;
  flex: none;
  height: var(--dsh-chat-ux-reel-cell);
  line-height: var(--dsh-chat-ux-reel-cell);
}

/* 给读屏的那一份读数：视觉上藏起来，读出来还是「97.3%」 */
.${REEL_SPOKEN_CLASS} {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`
