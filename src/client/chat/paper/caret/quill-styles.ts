/**
 * 羽毛光标的样式
 *
 * 整张表都拿「根元素上有纸感标记 + 那根自绘插入符上带着 QUILL_ATTRIBUTE」当前提。这两个条件缺一个，
 * 下面一条都不命中，那根仍是 caret-motion-styles 里的 2px 条——纸感关掉、纸还没挂上、脚本半路停了，
 * 读者看到的都是原来那根光标，不存在「什么都没有」的那一帧
 *
 * 为什么要两个条件都认：QUILL_ATTRIBUTE 是脚本写的，摘掉它的那一瞬间纸感可能已经先关了（配置先落、
 * 下一帧才重建光标）。只有纸感标记也当前提，那种中间态下底色才会回到 2px 条的那一支，而不是留在
 * 「被撤掉的底色」上
 *
 * 颜色从纸感的两个变量派生（--dsh-chat-ux-paper-ink 与 --dsh-chat-ux-paper-paper），不写死色值：
 * 换纸、换房间时羽毛自然跟着走。描金与角质笔杆是定值，它们不该随纸变
 */
import {CARET_BLINK_NAME, CARET_COLOR_PROPERTY, CARET_LAYER_ATTRIBUTE} from "../../caret/caret-motion"
import {PAPER_ROOT_ATTRIBUTE} from "../paper-tokens"
import {QUILL_ATTRIBUTE, QUILL_ID, QUILL_ROOT_CLASS} from "./quill"

// 呼吸动画的名字。周期与 caret-motion-styles 的闪烁一样，只是「灭」换成了「淡下去」
const QUILL_BREATHE_NAME = "dsh-chat-ux-paper-quill-breathe"

// 笔尖那一点光的名字
const QUILL_GLINT_NAME = "dsh-chat-ux-paper-quill-glint"

// 纸感标记在根元素上时的选择器前缀
const ROOT_SCOPE = "html[" + PAPER_ROOT_ATTRIBUTE + "]"

/**
 * 装载羽毛的那根自绘插入符，三个属性写作 0-3-1
 *
 * 要压过 caret-motion-styles 里那份 0-2-0：它给这根写了 background 与 width，
 * 羽毛模式下这根只剩一个装着笔的盒子，那两样都得让掉
 */
const LAYER = ROOT_SCOPE + " [" + CARET_LAYER_ATTRIBUTE + "][" + QUILL_ATTRIBUTE + "]"

// 羽毛根
const ROOT = "." + QUILL_ROOT_CLASS

/**
 * 羽毛光标那一整张表。
 *
 * 由 caret-motion-styles 拼进它自己那张，随 CARET_MOTION_CSS 一起进 styles.ts 的 ALL_CSS：
 * 入口只认那一处，这里不再单独注册
 */
export const QUILL_CSS = `
/* 装载羽毛的那根盒子：底色让掉，闪烁换成呼吸。
   呼吸而不是闪烁：笔尖压在插入点上，眼里那一点位置必须一直在，整支淡下去再回来比整根消失更像一支笔。
   周期与 Chromium 自己的插入符一样是 1s，暗下去的那一段只淡到七成，读者不会以为光标死了

   与 2px 条唯一不一致的地方是**移动时不重新起拍**：caret-motion 每次都把那条闪烁拉回起点，
   是因为赶上「灭」的那半周期读者会以为光标没跟上来。呼吸最暗也只到七成，羽毛一直在，
   再把它拉回起点只会让连续打字时它永远停在最亮那一帧，呼吸就没了 */
${LAYER} {
  background: none;
  /* 宽度仍是 2px，不改成 auto：纸感那一层是拿这一根的矩形去点灯、画脚下那圈光的，
     宽度一缩，它量到的位置就跟着漂。羽毛是绝对定位的子元素，本来就不靠父元素的宽度 */
  overflow: visible;
  animation: ${QUILL_BREATHE_NAME} 1s ease-in-out infinite;
  /* 颜色从纸上的墨与纸派生。这里是兜底的那一档：浏览器不认识 color-mix 时用纯墨色，仍是一支看得见的笔 */
  --dsh-chat-ux-paper-quill-edge: var(--dsh-chat-ux-paper-ink, currentColor);
  --dsh-chat-ux-paper-quill-body: var(--dsh-chat-ux-paper-ink, currentColor);
  --dsh-chat-ux-paper-quill-sheen: var(--dsh-chat-ux-paper-ink-muted, var(--dsh-chat-ux-paper-ink, currentColor));
  --dsh-chat-ux-paper-quill-barb: var(--dsh-chat-ux-paper-ink-muted, var(--dsh-chat-ux-paper-ink, currentColor));
  --dsh-chat-ux-paper-quill-rachis: var(--dsh-chat-ux-paper-paper, #f2e9d8);
  --dsh-chat-ux-paper-quill-down: var(--dsh-chat-ux-paper-ink-muted, var(--dsh-chat-ux-paper-ink, currentColor));
  /* 描金与角质笔杆：照搬 nocturne 的定值。金色在任何纸色上都成立，跟着纸走反而会糊成一块脏斑 */
  --dsh-chat-ux-paper-quill-metal-lo: #5e431c;
  --dsh-chat-ux-paper-quill-metal-hi: #f3dca4;
  --dsh-chat-ux-paper-quill-metal: #b8904c;
  --dsh-chat-ux-paper-quill-horn-lo: #8c7651;
  --dsh-chat-ux-paper-quill-horn-hi: #f3e6c6;
}

/* 羽片比墨浅一档、羽枝比羽片再亮一档、笔脊就是纸色——这三档由墨与纸两个变量现算，
   深浅两种纸各自成立，不必分主题写两套 */
@supports (color: color-mix(in srgb, red 50%, blue)) {
  ${LAYER} {
    --dsh-chat-ux-paper-quill-body: color-mix(
      in srgb,
      var(--dsh-chat-ux-paper-ink, currentColor) 74%,
      var(--dsh-chat-ux-paper-paper, #f2e9d8)
    );
    --dsh-chat-ux-paper-quill-sheen: color-mix(
      in srgb,
      var(--dsh-chat-ux-paper-ink, currentColor) 46%,
      var(--dsh-chat-ux-paper-paper, #f2e9d8)
    );
    --dsh-chat-ux-paper-quill-barb: color-mix(
      in srgb,
      var(--dsh-chat-ux-paper-paper, #f2e9d8) 58%,
      var(--dsh-chat-ux-paper-ink, currentColor)
    );
    --dsh-chat-ux-paper-quill-down: color-mix(in srgb, var(--dsh-chat-ux-paper-ink, currentColor) 55%, transparent);
  }
}

/* 羽毛自己。尺寸与偏移由 quill.ts 的 placeQuillCaret 每帧写在那根盒子里，
   这里只给材质：一支压在纸上的笔画，所以带一层很浅的落影 */
${ROOT} {
  position: absolute;
  left: 0;
  top: 0;
  display: block;
  pointer-events: none;
  filter: drop-shadow(0.8px 1.6px 1px rgba(0, 0, 0, 0.3));
}

/* 纸感标记不在时，装进去的那支笔整个收起来。
   这一条是给「纸先关、光标下一帧才重建」那种中间态兜底的：那一帧底色已经回到 2px 条，
   不藏的话会看到一根条和一支笔叠在一起 */
html:not([${PAPER_ROOT_ATTRIBUTE}]) ${ROOT} {
  display: none;
}

/* 羽毛不在怀里时，2px 的条自己回来——这是这套东西唯一真正会伤到读者的失效方式的兜底。
   能让它发生的只有一件事：React 把这根连同里面的笔一起摘掉、再挂回来，而中间没有一次同步。
   那期间标记还在（所以上面那条把底色让掉了）、笔没了，纯靠脚本等着下一帧才修的话，
   读者看到的是一根没有底色的空盒子。:has 不支持的浏览器上这条不成立，退化成上面那条的行为 */
${LAYER}:not(:has(> ${ROOT})) {
  background: var(${CARET_COLOR_PROPERTY}, var(--dsw-alias-state-business-primary, currentColor));
  animation: ${CARET_BLINK_NAME} 1s step-end infinite;
}

${ROOT} svg {
  display: block;
  width: 100%;
  height: 100%;
  /* 羽枝伸到字盒之外，viewBox 装不下整支笔：裁掉就只剩个笔尖 */
  overflow: visible;
}

${ROOT}-vane { fill: url(#${QUILL_ID}-vane); }
${ROOT}-barbs { fill: none; stroke: var(--dsh-chat-ux-paper-quill-barb); stroke-width: 0.28; stroke-linecap: round; }
${ROOT}-rachis { fill: var(--dsh-chat-ux-paper-quill-rachis); }
${ROOT}-rachis-light { fill: none; stroke: #fff; stroke-width: 0.22; opacity: 0.45; }
${ROOT}-down { fill: none; stroke: var(--dsh-chat-ux-paper-quill-down); stroke-width: 0.35; stroke-linecap: round; }
${ROOT}-engraving { fill: none; stroke: var(--dsh-chat-ux-paper-quill-metal-lo); stroke-width: 0.3; }
${ROOT}-hole { fill: var(--dsh-chat-ux-paper-quill-metal-lo); }

/* 笔尖那一点光：2.8s 亮一次，位置一动不动。它不是装饰，是「这一根还活着」的信号——
   羽毛的呼吸之外整支一直沉着，读者靠它确认输入框还有焦点
   羽片上那道上下扫过的光没有移植：羽片只有几十像素宽，扫光看不出来，却多一条一直在跑的动画 */
${ROOT}-glint {
  fill: #fff;
  opacity: 0;
  animation: ${QUILL_GLINT_NAME} 2.8s ease-in-out infinite;
}

@keyframes ${QUILL_BREATHE_NAME} {
  0%, 62% { opacity: 1; }
  62%, 100% { opacity: 0.72; }
}

@keyframes ${QUILL_GLINT_NAME} {
  0%, 72% { opacity: 0; }
  80% { opacity: 0.9; }
  88% { opacity: 0.15; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  /* 呼吸与那点光一起停。这一档要的是少动，恒亮的羽毛正好是 VS Code 那根 solid 光标的等价物 */
  ${LAYER},
  ${LAYER}:not(:has(> ${ROOT})) {
    animation: none;
  }

  ${ROOT}-glint {
    animation: none;
    /* 动画停了就永远到不了亮起来的那一帧，所以给它一个恒定的、看得见的值 */
    opacity: 0.55;
  }
}
`
