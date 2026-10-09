/**
 * 输入框毛玻璃：只把**输入卡片那个矩形**变成一块半透明、背后模糊的玻璃。
 *
 * 范围就是卡片自己的边框盒——卡片下面那排统计与工具、上面那几张卡（待办、队列坞、目标条）都不在范围
 * 里，各自保持原样。这是读者看过第一版（整块座位磨砂）之后的要求。
 *
 * 麻烦在于铺底的那一层不是卡片自己。有会话内容时（active 相位）铺底的是**座位**
 * (`[data-composer-seat]`)——dsh 给它 `sticky; bottom: 0; z-index: 7` 与一块画布色实底
 * （`ConversationRoot.module.css`），dsh-claude-style 那类皮肤只是换了个画法。卡片的
 * `backdrop-filter` 采样的是它**背后**已经绘制的东西，座位那块不透明的底正好挡在中间，玻璃就什么
 * 也糊不到。所以座位必须在卡片这个矩形处**让出一块洞**。
 *
 * CSS 挖不出「位置由某个子元素决定」的洞，所以那两条边由 JS 量出来：`composer-glass.ts` 把卡片
 * 相对座位的上下边写进座位上的两个自定义属性，这里只负责画。
 *
 *   - 座位的底整块交给它的 `::after`，用 `clip-path` 沿那两个值挖开一条横贯的缺口；两个变量
 *     缺席时缺口是零高，也就是「整块都有底」——dsh 原来的样子，这是安全的一侧。
 *   - 卡片自己画底：一条**自带的蓝调渐变**（上亮下深：深色下从一档蓝灰到深蓝黑，浅色下从浅蓝白到浅蓝）
 *     再加一层轻模糊。读者的口径是「这个输入框应该有它自己的渐变色，其次才是毛玻璃，玻璃稍微透点色
 *     就行」——所以底为主、通透为辅，渐变的两端只让出一成不到。色值全部从主题令牌派生（带字面兜底），
 *     深浅色与第三方配色都自动跟随。圆角、发丝描边与阴影一律留着，那是「输入框」这几条边看得见的原因。
 *   第一次做的时候底是从画布色派生的，当场翻了车：画布色的 92% 叠在画布上就是画布本身，输入区整块
 *   融进背景，只剩一圈描边。底必须来自输入框自己那几档色，才与画布分得开。
 *   - 座位上方那条从画布淡出的带子照旧（座位的 `::before`），颜色跟着玻璃的底走。
 *
 * 新会话（hero）时铺底的是卡片自己、座位不画底，所以那一档不需要挖洞，卡片那几条规则一并管两档。
 *
 * **为什么要 `!important`。** 同页的 dsh-claude-style 也管输入区外观（它把卡片改成透明、改由座位
 * 铺 `bg-base` 实底），而且它那几条选择器的特异度高得多。本插件只认语义属性、不去认别的插件挂在
 * body 上的属性，所以压过它的手段只剩 `!important`：那几条声明都没有 `!important`，
 * `!important` 对非 `!important` 是绝对优先。它那条 `border: none !important` 不在这
 * 份表的目标里（卡片边框按原样）。
 *
 * **不支持就整块不生效。** 没有 `backdrop-filter`（或 `color-mix`）的浏览器上，只做半透明会
 * 变成「文字叠文字」——比不做更糟，所以整套规则收在 `@supports` 里，条件不成立时一条都不命中。
 *
 * @module dsh-chat-ux/client/chat/composer-glass/composer-glass-styles
 */

/**
 * 玻璃生效的属性。它由 `index.tsx` 按开关写上或摘掉，所以「用不用这块玻璃」不必重新生成样式表。
 */
export const GLASS_ATTRIBUTE = 'data-chat-ux-composer-glass'

/**
 * 缺口的上边（卡片顶相对座位顶），单位 px，由 `composer-glass.ts` 写在座位上。
 * 缺席时 `clip-path` 回退到零高的缺口，也就是整块底——回到 dsh 原来的样子。
 */
export const GLASS_TOP_VARIABLE = '--dsh-chat-ux-glass-top'

/** 缺口的下边（卡片底相对座位顶），单位 px，同样由 `composer-glass.ts` 写。 */
export const GLASS_BOTTOM_VARIABLE = '--dsh-chat-ux-glass-bottom'

/** 输入框毛玻璃的全部 CSS。 */
export const COMPOSER_GLASS_CSS = `/* dsh-chat-ux —— 输入框毛玻璃 */
body[${GLASS_ATTRIBUTE}] {
  /* 底让出多少。注意这是**叠在几层之上的那一层的**不透明度：卡片面上还有两片角光，合成之后的不透明度
     会更高（0.92 的底加一片 26% 的角光 ≈ 0.94，背后只剩 6%——读者当场报「好像是直接没有毛玻璃效果
     了」）。76% 配 blur(22px) 才是他说的「稍微再透一点」：看得到背后那片模糊，读不到内容。 */
  --dsh-chat-ux-glass-alpha: 70%;
}

@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) and (color: color-mix(in srgb, white 50%, transparent)) {
  /* ── 一、有会话内容时：座位照旧画底，但在卡片那一段让开 ── */
  /* 两层背景各铺一段：上段从座位顶到卡片顶，下段从卡片底到座位底，中间那段留白就是让给玻璃的缺口。
     两个变量缺席时上段铺满整块——也就是 dsh 原来的样子，这是安全的一侧。两条边由
     composer-glass.ts 量（见那个模块），这里只负责画。 */
  [data-phase='active'] [data-composer-seat],
  [data-content-phase='active'] [data-composer-seat] {
    background:
      linear-gradient(var(--dsw-alias-bg-base), var(--dsw-alias-bg-base)) 0 0 / 100% var(--dsh-chat-ux-glass-top, 100%) no-repeat,
      linear-gradient(var(--dsw-alias-bg-base), var(--dsw-alias-bg-base)) 0 var(--dsh-chat-ux-glass-bottom, 100%) / 100% calc(100% - var(--dsh-chat-ux-glass-bottom, 100%)) no-repeat !important;
  }

  /* 上方那条淡出带：座位之外，因此不被模糊。颜色刻意跟着**画布**走、不跟玻璃——它的本分是让内容淡出
     到画布，跟着玻璃的深蓝走会在消息区底边压出一条看得见的横带（读者报过一次「一层光晕」）。 */
  [data-phase='active'] [data-composer-seat]::before,
  [data-content-phase='active'] [data-composer-seat]::before {
    content: '' !important;
    position: absolute !important;
    top: auto !important;
    bottom: 100% !important;
    left: 0 !important;
    right: 0 !important;
    height: var(--dsh-composer-fade-h, 36px) !important;
    background: linear-gradient(
      to top,
      var(--dsw-alias-bg-base) 0%,
      color-mix(in srgb, var(--dsw-alias-bg-base) 72%, transparent) 32%,
      color-mix(in srgb, var(--dsw-alias-bg-base) 35%, transparent) 68%,
      transparent 100%
    ) !important;
    pointer-events: none !important;
  }

  /* ── 二、卡片自己画底：一条自带的蓝调渐变（上亮下深）加一层轻模糊，两档相位都这么办 ── */
  [data-phase='active'] [data-composer-card],
  [data-content-phase='active'] [data-composer-card],
  [data-phase='hero'] [data-composer-card],
  [data-content-phase='hero'] [data-composer-card] {
    /* 照 dsh 自己的做法（AppFrame.module.css 的 .sidebarCol）：一条两端带着淡淡颜色、中间**完全透明**的
       四停渐变，底下垫一层掺了一点蓝的底色。这里只把方向转成横向——卡片又宽又扁，左端就是「左上角」、
       右端就是「右下角」，横向的两端色读起来正是读者要的那对角。
       颜色与浓淡都用 dsh 自己那两个档：浅色 0.1 / 0.09（AppFrame 第 62-65 行），深色 0.08 / 0.07
       （第 164-167 行）。第一遍我按 0.14 / 0.12 写，比 dsh 浓了一倍——那也是「看着有点脏脏的」的一半。 */
    background-image:
      linear-gradient(
        to right,
        rgb(122 155 240 / 0.1) 0%,
        rgb(122 155 240 / 0) 38%,
        rgb(143 137 184 / 0) 64%,
        rgb(143 137 184 / 0.09) 100%
      ),
      linear-gradient(
        color-mix(in srgb, color-mix(in srgb, var(--dsw-specific-input-major, #ffffff) 97%, rgb(122 155 240)) var(--dsh-chat-ux-glass-alpha), transparent),
        color-mix(in srgb, color-mix(in srgb, var(--dsw-specific-input-major, #ffffff) 97%, rgb(122 155 240)) var(--dsh-chat-ux-glass-alpha), transparent)
      ) !important;
    /* 半径要跟底一起调：底一实，模糊再有也不会被看见。 */
    -webkit-backdrop-filter: blur(22px) saturate(130%);
    backdrop-filter: blur(22px) saturate(130%);
    /* 玻璃那三笔质感：顶边一道亮边、内侧一圈微光、底部一道内阴影。贴底时输入框背后本来就是空白
       （聊天内容的末尾停在输入框顶边，不会停在它后面），所以「背后透出来的模糊」这件事日常看不到；
       玻璃感就得由卡片自己交代。dsh 原来那层 --dsw-elevation-soft（发丝描边加两片柔光）接在后面
       留着，不能丢——那是「一个框」的边。 */
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.9),
      inset 0 0 0 1px rgb(255 255 255 / 0.5),
      inset 0 -16px 20px -18px rgb(15 17 21 / 0.07),
      var(--dsw-elevation-soft, none) !important;
  }

  /* 深色那一档：照 dsh 自己的做法（AppFrame.module.css 的 .sidebarCol），只是方向转成横向——
     那条配色 dsh 是用在侧栏上的（竖着：顶上一片蓝、底下一点紫），而卡片又宽又扁，横向的两端色读起来
     正是读者要的「左上角蓝、中间深、右下角又蓝」。
     这一版是第三稿：先试过 135deg 的斜线性渐变（扁卡片上投影几乎水平，读者一眼看出「像是从左边渐变
     到右边」），又试过两片聚在角上的径向光（他说「有点集中，看着有点脏脏的」）。dsh 这一条的好处正在
     于中间**完全透明**——两端各自一片极淡的色，中间交给底色，所以既不脏也不集中。 */
  body[data-ds-dark-theme] [data-phase='active'] [data-composer-card],
  body[data-ds-dark-theme] [data-content-phase='active'] [data-composer-card],
  body[data-ds-dark-theme] [data-phase='hero'] [data-composer-card],
  body[data-ds-dark-theme] [data-content-phase='hero'] [data-composer-card] {
    background-image:
      linear-gradient(
        to right,
        rgb(122 155 240 / 0.08) 0%,
        rgb(122 155 240 / 0) 38%,
        rgb(143 137 184 / 0) 64%,
        rgb(143 137 184 / 0.07) 100%
      ),
      linear-gradient(
        color-mix(in srgb, color-mix(in srgb, var(--dsw-specific-input-major, #0e1117) 97%, rgb(122 155 240)) var(--dsh-chat-ux-glass-alpha), transparent),
        color-mix(in srgb, color-mix(in srgb, var(--dsw-specific-input-major, #0e1117) 97%, rgb(122 155 240)) var(--dsh-chat-ux-glass-alpha), transparent)
      ) !important;
    /* 深色下的三笔：亮边与微光更弱、内阴影更重。 */
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.07),
      inset 0 0 0 1px rgb(255 255 255 / 0.04),
      inset 0 -16px 20px -18px rgb(0 0 0 / 0.55),
      var(--dsw-elevation-soft, none) !important;
  }
}
`
