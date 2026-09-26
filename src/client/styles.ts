/**
 * 聊天区样式，写成纯文本是为了让 client bundle 保持单文件自包含
 * （DSH 的 client 模块加载器不提供任何资源 URL）。
 *
 * `ALL_CSS` 是注入的那一张表：下面这份聊天区规则，再加上卡片、插入符、文件变更行、折叠体入场
 * 与字体那几份各自的 `*-styles.ts`。
 *
 * token 淡入的档位规则**不在这里**：那批规则跟着 `token-motion.ts` 走一张单独的样式表（见它里面的
 * `revealCss`），因为它们的条数是拿得出来单独看的一份代价。这里只留淡入用色在页面级的那份兜底。
 */
import { CARET_MOTION_CSS } from './caret-motion-styles'
import { CARD_CSS } from './config-card-styles'
import { FILE_MUTATION_CSS } from './file-mutation-styles'
import { FOLD_MOTION_CSS } from './fold-motion-styles'
import { FONT_CSS } from './font-styles'
import { SEND_FLIGHT_CSS } from './send-flight-styles'
import { RUN_COLOR_VAR } from './token-motion'

/** 注入样式表的固定 id，用于卸载和排查。 */
export const STYLE_ID = 'dsh-chat-ux-style'

/** 聊天区样式表。 */
export const CHAT_AREA_CSS = `/* dsh-chat-ux —— 聊天区 */
body {
  /* 页面级兜底：正文自己的令牌，跟着主题走。区间真正渲染所在的元素会用自己算出来的
     颜色覆盖它。 */
  ${RUN_COLOR_VAR}: var(--dsw-alias-label-primary, #0f1115);
}

body[data-ds-dark-theme] {
  /* 深色画布：同一个令牌解析出来是亮色，默认值的读法一致。 */
  ${RUN_COLOR_VAR}: var(--dsw-alias-label-primary, #f9fafb);
}

/* 过程组的组体只该在纵向滚。dsh 的 .body 只声明了 overflow-y: auto，而按 CSS Overflow 规范，
   一个轴是 visible、另一个不是时，visible 会计算成 auto——于是它同时成了横向滚动容器，内容只要
   横向多出一两个像素就长出横向滚动条（宽表格的 100cqw 突破、行内代码的 inline-flex 原子，或者
   scrollbar-gutter 削窄之后剩下的一点舍入，都算）。「详细」与「完全展开」两档走的是简写
   overflow: visible，两轴一起放开，本来就没有这个问题，所以这一条只认收纳档。

   横向超出只裁剪、不给滚：组体里能横向滚的东西（代码块、表格）各自带着自己的 overflow-x，不该由
   组体这一层再兜一次。裁剪掉的那一条同时也不再占掉组体底部——process-follow 量的是 scrollHeight
   减 clientHeight，少一条滚动条就少一份偏差。 */
[data-step-process]:not([data-group-expanded-mode]) [data-step-process-body] {
  overflow-x: hidden;
}

/* 带实时细节的档位（标准与详细）把这一段的细节接在组头标签后面（"正在分析请求 · …"），而那一段正是组内思考行正在出的字——
   组体开着的时候两处一起出字。detail 与标签在同一个文本节点里，CSS 切不开，所以让原文本整块让位，
   改显示 process-fold 写在属性上的那半截标签：组头、图标和开合控件都还在原处，只是不再跟着出字。
   组体一收起，原文本立刻回来；没有实时细节的档位标记不成立，什么都不变。

   替上来的那半截还要自己带流光：动画原本挂在被隐藏的那个元素上，跟着它一起没了。下面这道渐变、
   它的半宽和周期都对着 ui-primitives 的 TextShimmer 抄，只有 keyframes 的名字是自己的——那份样式
   走的是 CSS Modules，宿主自己的动画名随时会被改名，不能当接口用。 */

[data-step-process][data-chat-ux-live-detail][data-chat-ux-open] button[data-process-activity] > [data-text-shimmer] {
  display: none;
}

[data-step-process][data-chat-ux-live-detail][data-chat-ux-open] button[data-process-activity]::after {
  content: attr(data-chat-ux-label);
  /* 组头是 flex 容器，原文本作为 flex 项带着这三个约束，替上来的文本要占同一格。 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes dsh-chat-ux-label-shimmer {
  66.6667%, 100% { background-position: 0% center; }
}

/* 撑得起这道渐变的浏览器，才把文字交给背景去画；撑不起就让它老实当一段静态标签，
   而不是配上一个画不出来的背景、把字也一起搭进去。

   括号里必须是一个「属性: 值」声明。写成裸的函数调用（color-mix(...)）会被规范归入
   「未知的函数形式」而恒为假，整块规则静默跳过——文字还在，流光没了，且不留任何痕迹。 */
@supports (color: color-mix(in oklab, currentColor 50%, transparent)) and ((-webkit-background-clip: text) or (background-clip: text)) {
  [data-step-process][data-chat-ux-live-detail][data-chat-ux-open] button[data-process-activity]::after {
    background-image: linear-gradient(
      90deg,
      currentColor calc(50% - var(--dsh-chat-ux-label-spread, 0px)),
      color-mix(in oklab, currentColor 50%, transparent),
      currentColor calc(50% + var(--dsh-chat-ux-label-spread, 0px))
    );
    background-position: 100% center;
    background-repeat: no-repeat;
    background-size: 250% 100%;
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: dsh-chat-ux-label-shimmer 1.5s cubic-bezier(0.33, 0, 0.67, 1) infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    [data-step-process][data-chat-ux-live-detail][data-chat-ux-open] button[data-process-activity]::after {
      background-image: none;
      -webkit-text-fill-color: currentColor;
      animation: none;
    }
  }
}
`

/**
 * 注入的那一张样式表：本插件拥有的常驻规则，按下面的顺序拼起来。
 *
 * 加了带 CSS 的特性，把它的 CSS 加进这张清单——入口只认这一处，不再自己拼。token 淡入的档位规则
 * 不进这里，它由 `token-motion.ts` 自己带着一张独立的表（见那个模块里的 `REVEAL_STYLE_ID`）。
 */
export const ALL_CSS = [CHAT_AREA_CSS, CARD_CSS, CARET_MOTION_CSS, FILE_MUTATION_CSS, FOLD_MOTION_CSS, FONT_CSS, SEND_FLIGHT_CSS].join('\n')
