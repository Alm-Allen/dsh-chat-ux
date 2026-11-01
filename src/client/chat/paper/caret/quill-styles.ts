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
 *
 * **整张表里没有一条会自己跑的动画。** 这支笔在屏幕上完全静止：不闪烁、不呼吸、笔尖那点光也不来回亮。
 * 会动的只剩两条，都不属于「闪」：读者挪光标时那一趟 80 ms 位移过渡（geometry 那一侧的事），
 * 以及哪一帧该出现、哪一帧该藏起来（caret-motion 的事）
 */
import {COMPOSER_PLACEHOLDER_SELECTOR} from "../../../dom-contract"
import {CARET_COLOR_PROPERTY, CARET_LAYER_ATTRIBUTE, CARET_VISIBLE_ATTRIBUTE} from "../../caret/caret-motion"
import {PAPER_ROOT_ATTRIBUTE} from "../paper-tokens"
import {QUILL_ATTRIBUTE, QUILL_ID, QUILL_ROOT_CLASS} from "./quill"

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
 * 空输入框里那行提示要给羽毛让开多宽。
 *
 * 一支笔从笔尖朝右上伸出去 60 个本地单位，整支高 78 单位、按插入符的高度画：
 * 默认档 16px 字、字盒约 22px 时横向占到 60 / 78 × 22 ≈ 17px，约合 1.06em。
 * 这里取 1.25em——中文界面下五个半角空格差不多就这么宽——比笔宽多出来的那一点是缝。
 *
 * 写 em 不写 px：字号一变，笔与提示按同一个比例放大，这道缝不会在大字号上消失
 */
const PLACEHOLDER_INDENT_EM = 1.25

/**
 * 羽毛光标那一整张表。
 *
 * 由 caret-motion-styles 拼进它自己那张，随 CARET_MOTION_CSS 一起进 styles.ts 的 ALL_CSS：
 * 入口只认那一处，这里不再单独注册
 */
export const QUILL_CSS = `
/* 装载羽毛的那根盒子：底色让掉，闪烁也停掉。
   caret-motion-styles 给这一根写了闪烁（1s step-end，一半时间 opacity 0），那根条必须闪，
   因为浏览器自己画的插入符就在闪。羽毛不该闪：读者要的是一支摆在那里的笔。
   animation: none 就是这一条唯一的职责；恒定在这里，不在 keyframes 里 */
${LAYER} {
  background: none;
  /* 宽度仍是 2px，不改成 auto：纸感那一层是拿这一根的矩形去点灯、画脚下那圈光的，
     宽度一缩，它量到的位置就跟着漂。羽毛是绝对定位的子元素，本来就不靠父元素的宽度 */
  overflow: visible;
  /* 不闪。caret-motion 的 draw() 每次移动都会把那条闪烁动画拉回起点，这一根身上没有那条动画，
     那段循环对它就是空转——它只认动画名，认不到就什么都不做

     caret-motion-styles 的 prefers-reduced-motion 那一段对这里没有额外的事可做：
     整支本来就是静止的。那一档要停的位移过渡（80 ms）仍然由 caret-motion-styles 那一份关掉，
     这里不重复写 */
  animation: none;
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
   读者看到的是一根没有底色的空盒子。:has 不支持的浏览器上这条不成立，退化成上面那条的行为

   **这条兜底不闪**：它是一根等下一次同步来把羽毛挂回去的临时条，通常只存在一两帧，
   给它挂上闪烁只会让这期间的光标看起来在闪——正是这一轮要去掉的东西。
   恒定底色就够了：读者的要求是看得见光标，不是看得见它闪 */
${LAYER}:not(:has(> ${ROOT})) {
  background: var(${CARET_COLOR_PROPERTY}, var(--dsw-alias-state-business-primary, currentColor));
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

/* 笔尖那一点光：一个恒定的小亮点，不闪。
   它原来是 2.8s 亮一次的循环，那是「这根还活着」的信号；静态之后这个信号没有地方安放，
   就留成一点固定的高光——笔尖上有一点反光本来就成立，它只是不再随时间变
   羽片上那道上下扫过的光从移植起就没带过来：羽片只有几十像素宽，扫光看不出来，却多一条常驻动画 */
${ROOT}-glint {
  fill: #fff;
  opacity: 0.55;
}

/* 空着的时候，那行提示要给这支笔让开。
   笔尖钉在插入点上，整支朝右上伸出去，正好横过提示最前面几个字；提示整行向右让出一段，字就不被压住。

   只有笔真画在那里才让：插入符层上带着羽毛标记、并且这一帧是可见的。
   没聚焦、插入符动效关着、纸感关着——这些时候提示都留在原处，不会平白无故挪一下。

   :has 从提示的父元素往下找那根笔：插入符层与提示同级，都挂在可编辑面的父元素下面
   （caret-motion 的 layerFor 把那一根 append 到 input.parentElement 上） */
${ROOT_SCOPE} *:has(> [${CARET_LAYER_ATTRIBUTE}][${QUILL_ATTRIBUTE}][${CARET_VISIBLE_ATTRIBUTE}]) > ${COMPOSER_PLACEHOLDER_SELECTOR} {
  padding-left: ${PLACEHOLDER_INDENT_EM}em;
}
`
