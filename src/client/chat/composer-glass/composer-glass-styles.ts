/**
 * 输入框毛玻璃：只把**输入卡片那个矩形**变成一块半透明、背后模糊的玻璃。
 *
 * 范围就是卡片自己的边框盒——卡片下面那排统计与工具、上面那几张卡（待办、队列坞、目标条）都不在范围
 * 里，各自保持原样。这是读者看过第一版（整块座位磨砂）之后的要求。
 *
 * 麻烦在于铺底的那一层不是卡片自己。有会话内容时（active 相位）铺底的是**座位**
 * (`[data-composer-seat]`)——dsh 给它 `sticky; bottom: 0; z-index: 7` 与一块画布色实底
 * （`ConversationRoot.module.css`），dsh-claude-style 那类皮肤只是换了个画法。玻璃的
 * `backdrop-filter` 采样的是它**背后**已经绘制的东西，座位那块不透明的底正好挡在中间，玻璃就什么
 * 也糊不到。所以座位必须在卡片这个矩形处**让出一块洞**。
 *
 * CSS 挖不出「位置由某个子元素决定」的洞，所以那两条边由 JS 量出来：`composer-glass.ts` 把卡片
 * 相对座位的上下边写进座位上的两个自定义属性，这里只负责画。
 *
 *   - 座位的底整块交给它的两层背景：上段从座位顶到卡片顶、下段从卡片底到座位底，中间那段留白就是
 *     让给玻璃的缺口；两个变量缺席时上段铺满整块，也就是 dsh 原来的样子（安全的一侧）。
 *   - 卡片那块玻璃画在卡片的 `::before` 上（为什么要这样，见下一节）：一条**自带的蓝调渐变**，
 *     照 dsh 自己在 `AppFrame.module.css` 的 `.sidebarCol` 上那条「两端带着淡淡颜色、中间
 *     **完全透明**」的四停渐变来写（浅色 0.1/0.09、深色 0.08/0.07），底下垫一层掺了一点蓝的底色，
 *     只让出一成不到（70%），再叠一层 `blur(22px)`；顶边亮边、内侧微光、底部内阴影那三笔质感
 *     留在卡片自己身上。
 *     第一次做的时候底是从画布色派生的，当场翻了车：画布色的 92% 叠在画布上就是画布本身，输入区整块
 *     融进背景，只剩一圈描边。底必须来自输入框自己那几档色，才与画布分得开。
 *   - 座位上方那条从画布淡出的带子照旧（座位的 `::before`），颜色刻意跟着**画布**走、不跟玻璃：
 *     跟着玻璃的深蓝走会在消息区底边压出一条看得见的横带（读者报过一次「一层光晕」）。
 *
 * 新会话（hero）时铺底的是卡片自己、座位不画底，所以那一档不需要挖洞，卡片那几条规则一并管两档。
 *
 * **为什么玻璃长在 `::before` 上，不长在卡片自己身上。** 卡片是输入区那一票浮层的**祖先**：
 * `/` 与 `@` 的候选菜单（`ui-input-trigger` 的 `MenuView`）就挂在卡片里的
 * `.overlayAnchor` 上（`MenuView.tsx` 用 `closest('[data-composer-card]')` 判「点在输入区
 * 里就不关」），模型选择、目录选择、反馈弹窗也都认 `[data-composer-card]` 当锚点。而 dsh 的菜单
 * 材质（`ui-primitives/MenuSurface.module.css`）特意把 `backdrop-filter` 放在菜单**自己的子层**
 * （`.material`）上，注释写明这是为了让「嵌套菜单与固定浮层免于祖先的 backdrop root」。给卡片加上
 * `backdrop-filter` 正好造出那个祖先 backdrop root：菜单那一层的模糊采样被掐断（菜单落在卡片边框盒
 * 之外，采样域里什么也没有），只剩 `--dsw-menu-surface-fill` 那点 58% / 45% 的底色，于是菜单整块
 * 透掉、底下的字透上来——读者报回来的就是这件事（「`/` 的指令弹窗有点透明，可读性非常差」）。
 * 挪到伪元素上就都好了：卡片自己不再是 backdrop root（伪元素没有后代，不会把这个问题转嫁给谁），
 * 模糊与底色和原来一模一样。顺带解掉另一半：卡片的 `backdrop-filter` 还会把 `position: fixed`
 * 的后代（`MenuSurface` 那个 portal 到 `body` 的 `.backing`，以及各家 picker 与 modal）
 * 的包含块改成卡片自己。
 *
 * 伪元素用 `z-index: -1` 落到卡片内容之下，这要它所在的层叠上下文兜住。**不能给卡片自己加
 * `isolation` 或 `z-index`**：那会把卡片变成一个层叠容器，菜单的 `z-index` 被封在卡片里，
 * 座位里排在卡片之上的那几张卡（dock 里的队列坞、待办）就会压住菜单——dsh 自己那条
 * `.composerSeat:has([data-trigger-menu]) { z-index: 9 }` 正是为了让菜单的层级由**座位**去挣。
 * 所以这里一个层叠属性都不加：座位（`sticky` + `z-index: 7`）本来就是层叠上下文，伪元素落到
 * 那里，绘制在座位底色之上、卡片内容之下，正合适；hero 相位那一层是 `.composerHero`
 * （`z-index: 1` 的 flex item），同理。
 *
 * **每一组规则都带 `body[data-chat-ux-composer-glass]` 这个前缀。** 开关关掉时属性被摘掉，
 * 整块表一条都不命中，于是真的回到 dsh 原来的输入框。只靠变量缺席是不够的：座位那两条边由 JS 写在
 * 座位元素上（卸载时会清），但卡片那几条是 `!important` 的静态声明，一旦表还在，卡片就会一直
 * 停在「底交出去了」的状态上，看起来像少了半层。
 *
 * **右下角那枚主操作按钮也归这里管。** dsh 给它的是一枚饱和的实心蓝圆
 * （`--dsw-alias-button-info-fill`，浅色 500、深色 400，白图标），摆在这块玻璃卡片上就是另一套
 * 材质：纯色、平、比卡片亮一档。这里把它改画成同一块玻璃上的一片蓝——底还是那个令牌，但让出一成多
 * （卡片那条渐变透上来）、按小圆调一遍那三笔质感、hover 跟着 dsh 的 hover 令牌。属性由 JS 打
 * （见 `composer-glass.ts` 的 `markPrimary`），因为 dsh 那枚按钮既不带语义属性、class 名又
 * 带构建期 hash。
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
 * 玻璃生效的属性。它由 `index.tsx` 按开关写上或摘掉；表里每一组规则都拿它当前缀，所以
 * 「用不用这块玻璃」不必重新生成样式表。
 */
export const GLASS_ATTRIBUTE = 'data-chat-ux-composer-glass'

/**
 * 缺口的上边（卡片顶相对座位顶），单位 px，由 `composer-glass.ts` 写在座位上。
 * 缺席时座位那两层背景回退到「上段铺满整块」，也就是整块底——回到 dsh 原来的样子。
 */
export const GLASS_TOP_VARIABLE = '--dsh-chat-ux-glass-top'

/** 缺口的下边（卡片底相对座位顶），单位 px，同样由 `composer-glass.ts` 写。 */
export const GLASS_BOTTOM_VARIABLE = '--dsh-chat-ux-glass-bottom'

/** 右下角那枚主操作按钮（发送 / 停止）身上的属性，由 `composer-glass.ts` 打。 */
export const GLASS_PRIMARY_ATTRIBUTE = 'data-chat-ux-glass-primary'

/** 输入框毛玻璃的全部 CSS。 */
export const COMPOSER_GLASS_CSS = `/* dsh-chat-ux —— 输入框毛玻璃 */
body[${GLASS_ATTRIBUTE}] {
  /* 底让出多少。注意这是**叠在几层之上的那一层的**不透明度：伪元素面上还有两片角光，合成之后的不
     透明度会更高（0.92 的底加一片 26% 的角光 ≈ 0.94，背后只剩 6%——读者当场报「好像是直接没有毛
     玻璃效果了」）。70% 配 blur(22px) 才是他说的「稍微再透一点」：看得到背后那片模糊，读不到内容。 */
  --dsh-chat-ux-glass-alpha: 70%;
  /* 浅色下卡片那块底。这里必须主动压一点灰——浅色里 --dsw-specific-input-major 与画布
     --dsw-alias-bg-base 是**同一个令牌**（都是 neutral-bluish-00），dsh 原本靠发丝描边加柔光分界，
     玻璃把底让到七成之后，中间那一段（四停渐变里完全透明的那截）就只剩「画布色叠画布色」，
     读者报「中间太白、和背景融进去了」。压的是一层中性冷灰：既降亮度也降饱和，中间那段才交代得
     出边界。要调浓淡就改最后那个百分比（现在是 15%）。 */
  --dsh-chat-ux-glass-base: color-mix(
    in srgb,
    color-mix(in srgb, var(--dsw-specific-input-major, #ffffff) 97%, rgb(122 155 240)) 85%,
    rgb(150 158 176)
  );
}

/* 深色那一档不压灰：那里的输入面色（neutral-bluish-850）本来就比画布（950）亮一档，天然分得开。 */
body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] {
  --dsh-chat-ux-glass-base: color-mix(in srgb, var(--dsw-specific-input-major, #0e1117) 97%, rgb(122 155 240));
}

@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) and (color: color-mix(in srgb, white 50%, transparent)) {
  /* ── 一、有会话内容时：座位照旧画底，但在卡片那一段让开 ── */
  /* 两层背景各铺一段：上段从座位顶到卡片顶，下段从卡片底到座位底，中间那段留白就是让给玻璃的缺口。
     两个变量缺席时上段铺满整块——也就是 dsh 原来的样子，这是安全的一侧。两条边由
     composer-glass.ts 量（见那个模块），这里只负责画。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-seat],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-seat] {
    background:
      linear-gradient(var(--dsw-alias-bg-base), var(--dsw-alias-bg-base)) 0 0 / 100% var(--dsh-chat-ux-glass-top, 100%) no-repeat,
      linear-gradient(var(--dsw-alias-bg-base), var(--dsw-alias-bg-base)) 0 var(--dsh-chat-ux-glass-bottom, 100%) / 100% calc(100% - var(--dsh-chat-ux-glass-bottom, 100%)) no-repeat !important;
  }

  /* 上方那条淡出带：座位之外，因此不被模糊。颜色刻意跟着**画布**走、不跟玻璃——它的本分是让内容淡出
     到画布，跟着玻璃的深蓝走会在消息区底边压出一条看得见的横带（读者报过一次「一层光晕」）。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-seat]::before,
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-seat]::before {
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

  /* ── 二、卡片自己：交出底色，只留那三笔质感（底与模糊都在下面那个 ::before 上） ── */
  /* 底色整个交出去。留在卡片自己身上的话，伪元素那层模糊就得先糊过它自己，等于没糊。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] {
    background: transparent !important;
    /* 玻璃那三笔质感：顶边一道亮边、内侧一圈微光、底部一道内阴影。贴底时输入框背后本来就是空白
       （聊天内容的末尾停在输入框顶边，不会停在它后面），所以「背后透出来的模糊」这件事日常看不到；
       玻璃感就得由卡片自己交代。dsh 原来那层 --dsw-elevation-soft（发丝描边加两片柔光）接在后面
       留着，不能丢——那是「一个框」的边。inset 阴影画在卡片透明底的上面、内容的下面，所以底交出去
       之后它照样看得见。 */
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.9),
      inset 0 0 0 1px rgb(255 255 255 / 0.5),
      inset 0 -16px 20px -18px rgb(15 17 21 / 0.07),
      var(--dsw-elevation-soft, none) !important;
  }

  /* ── 三、玻璃本体：卡片自己的 ::before，铺满卡片那个矩形 ── */
  /* 底是两层：先一条照 dsh 自己做法（AppFrame.module.css 的 .sidebarCol）的四停渐变——两端各自一片
     极淡的色、中间**完全透明**，再垫一层掺了一点蓝的底色。方向转成横向：卡片又宽又扁，左端就是
     「左上角」、右端就是「右下角」，横向的两端色读起来正是读者要的那对角。深色起初沿用 dsh 那两个档
     （0.08 / 0.07，AppFrame 第 164-167 行）；浅色起初也是 dsh 那两档（0.1 / 0.09），读者在浅色下又看
     过一轮，说两端也要「再浅一点」，先是 0.07 / 0.06。第三轮他说整条
     渐变「再低调点、隐约能看出有渐变色就行」，两档一起再砍一半多——深色 0.035 / 0.03、浅色
     0.03 / 0.025（深色下实测两端只比中间亮两三个灰阶、蓝通道最多六阶）。底压过灰之后，两端本来就不必出那么多力。
     第一遍按 0.14 / 0.12 写，比 dsh 浓了一倍，那也是「看着有点脏脏的」的一半。
     伪元素没有后代，所以它的 backdrop-filter 只会给自己那层模糊，不会再给谁造出祖先 backdrop root
     （这正是卡片本体做不了这件事的原因，见模块头）。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card]::before {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    /* 落到卡片内容之下。卡片自己不建立层叠上下文（见模块头），所以这一层会落到座位那一层里，
       绘制在座位底色之上、卡片内容之下——正是「输入框的底」该在的位置。 */
    z-index: -1 !important;
    /* 卡片可能被别的插件改过圆角，跟着它走。 */
    border-radius: inherit !important;
    pointer-events: none !important;
    background-image:
      linear-gradient(
        to right,
        rgb(122 155 240 / 0.03) 0%,
        rgb(122 155 240 / 0) 38%,
        rgb(143 137 184 / 0) 64%,
        rgb(143 137 184 / 0.025) 100%
      ),
      linear-gradient(
        color-mix(in srgb, var(--dsh-chat-ux-glass-base) var(--dsh-chat-ux-glass-alpha), transparent),
        color-mix(in srgb, var(--dsh-chat-ux-glass-base) var(--dsh-chat-ux-glass-alpha), transparent)
      ) !important;
    /* 半径要跟底一起调：底一实，模糊再有也不会被看见。 */
    -webkit-backdrop-filter: blur(22px) saturate(130%);
    backdrop-filter: blur(22px) saturate(130%);
  }

  /* 深色那一档：照 dsh 自己的做法（AppFrame.module.css 的 .sidebarCol），只是方向转成横向——
     那条配色 dsh 是用在侧栏上的（竖着：顶上一片蓝、底下一点紫），而卡片又宽又扁，横向的两端色读起来
     正是读者要的「左上角蓝、中间深、右下角又蓝」。
     这一版是第三稿：先试过 135deg 的斜线性渐变（扁卡片上投影几乎水平，读者一眼看出「像是从左边渐变
     到右边」），又试过两片聚在角上的径向光（他说「有点集中，看着有点脏脏的」）。dsh 这一条的好处正在
     于中间**完全透明**——两端各自一片极淡的色，中间交给底色，所以既不脏也不集中。 */
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='active'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='active'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='hero'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='hero'] [data-composer-card]::before {
    background-image:
      linear-gradient(
        to right,
        rgb(122 155 240 / 0.035) 0%,
        rgb(122 155 240 / 0) 38%,
        rgb(143 137 184 / 0) 64%,
        rgb(143 137 184 / 0.03) 100%
      ),
      linear-gradient(
        color-mix(in srgb, var(--dsh-chat-ux-glass-base) var(--dsh-chat-ux-glass-alpha), transparent),
        color-mix(in srgb, var(--dsh-chat-ux-glass-base) var(--dsh-chat-ux-glass-alpha), transparent)
      ) !important;
  }

  /* 深色下那三笔：亮边与微光更弱、内阴影更重。 */
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='active'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='active'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='hero'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='hero'] [data-composer-card] {
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.07),
      inset 0 0 0 1px rgb(255 255 255 / 0.04),
      inset 0 -16px 20px -18px rgb(0 0 0 / 0.55),
      var(--dsw-elevation-soft, none) !important;
  }

  /* ── 四、右下角那枚主操作按钮（发送，跑起来时是停止）：同一块玻璃上的一片蓝 ── */
  /* 底还是 dsh 那个令牌，只让出一成多：卡片那条横向渐变从小圆底下透上来，两处就接上了。三笔质感按
     34px 的小圆重调一遍——卡片那三笔是给 700×80 的大面写的，照搬上去会糊成一团。
     这里**不加 backdrop-filter**：按钮背后就是卡片那块已经模糊过的玻璃，再糊一次看不出来，白多一层
     重采样；按钮本身也没有任何后代，加不加都不牵连别人。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}] {
    background: color-mix(in srgb, var(--dsw-alias-button-info-fill, #4176e6) 84%, transparent) !important;
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.55),
      inset 0 0 0 1px rgb(255 255 255 / 0.35),
      inset 0 -10px 14px -12px rgb(15 17 21 / 0.16) !important;
  }

  /* dsh 那条 hover 规则（.primary:hover:not(:disabled)）没有 !important，会被上面基础规则里的
     !important 一起压掉，所以 hover 得自己写一条。浓淡照 dsh 的 hover 令牌，也让出一成多——比静止
     那档更实一点，指上去才看得出是「亮了一点」而不是「换了个色」。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}]:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dsw-alias-button-info-hover, #7aaaff) 92%, transparent) !important;
  }

  /* 深色下那三笔：亮边与微光收得更紧（深色里一点点白就很跳），底部内阴影加重。 */
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='active'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='active'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='hero'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='hero'] [data-composer-card] [${GLASS_PRIMARY_ATTRIBUTE}] {
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.28),
      inset 0 0 0 1px rgb(255 255 255 / 0.1),
      inset 0 -10px 14px -12px rgb(0 0 0 / 0.5) !important;
  }
}
`
