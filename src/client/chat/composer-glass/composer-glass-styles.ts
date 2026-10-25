/**
 * 输入框毛玻璃样式。
 *
 * 只覆盖卡片的边框盒，座位上的缺口由 JS 写入的上下边变量决定。玻璃必须画在卡片的 ::before 上：
 * 卡片自身若成为 backdrop root，会截断菜单的模糊并改变固定定位后代的包含块；也不能给卡片加
 * isolation 或 z-index，否则菜单会被封进卡片的层叠上下文。
 *
 * 所有规则都以 body 门控属性为前缀；不支持 backdrop-filter 或 color-mix 时整块不生效。
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

/** 左下角那枚加号（添加文件 / 调指令）身上的属性，同样由 `composer-glass.ts` 打。 */
export const GLASS_ADD_ATTRIBUTE = 'data-chat-ux-glass-add'

/**
 * 挂在主按钮旁边那枚**独立停止圆**上：可继续的子智能体在跑时 dsh 会另给一枚（那时主按钮仍是发送 /
 * 排队），它与主按钮同一个 class、紧排在它前面。两枚共用同一套材质，所以它也吃下面那份样式。
 */
export const GLASS_STOP_ATTRIBUTE = 'data-chat-ux-glass-stop'

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
     出边界。要调浓淡就改最后那个百分比与那枚灰——读者第二轮说浅色下整块「有一点点脏脏的」，灰从
     15% 收到 10%、灰本身也提亮一档（从 rgb(150 158 176) 到 rgb(172 178 192)），合成之后仍比画布
     暗七八级，中间那段照旧交代得出边界。 */
  --dsh-chat-ux-glass-base: color-mix(
    in srgb,
    color-mix(in srgb, var(--dsw-specific-input-major, #ffffff) 97%, rgb(122 155 240)) 90%,
    rgb(172 178 192)
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
      inset 0 -16px 20px -18px rgb(15 17 21 / 0.045),
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
     第四轮他说浅色下整块「有一点点脏脏的、整体再调得浅一点」，浅色那两片再收四分之一（0.022 / 0.018），
     深色那两片不动。
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
        rgb(122 155 240 / 0.022) 0%,
        rgb(122 155 240 / 0) 38%,
        rgb(143 137 184 / 0) 64%,
        rgb(143 137 184 / 0.018) 100%
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
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]) {
    background: color-mix(in srgb, var(--dsw-alias-button-info-fill, #4176e6) 84%, transparent) !important;
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.55),
      inset 0 0 0 1px rgb(255 255 255 / 0.35),
      inset 0 -10px 14px -12px rgb(15 17 21 / 0.16) !important;
  }

  /* dsh 那条 hover 规则（.primary:hover:not(:disabled)）没有 !important，会被上面基础规则里的
     !important 一起压掉，所以 hover 得自己写一条。浓淡照 dsh 的 hover 令牌，也让出一成多——比静止
     那档更实一点，指上去才看得出是「亮了一点」而不是「换了个色」。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled) {
    background: color-mix(in srgb, var(--dsw-alias-button-info-hover, #7aaaff) 92%, transparent) !important;
  }

  /* 深色下那三笔：亮边与微光收得更紧（深色里一点点白就很跳），底部内阴影加重。 */
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]) {
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.28),
      inset 0 0 0 1px rgb(255 255 255 / 0.1),
      inset 0 -10px 14px -12px rgb(0 0 0 / 0.5) !important;
  }

  /* ── 四之三、把 rc.2 那条「不可用就整枚淡到四成」收回来 ── */
  /* dsh 0.2.0-rc.2 给这枚按钮的 :disabled 样式是 opacity: .4（0.2.1-alpha.2 已经不用这条，
     那台上空输入框时它照旧实心），于是同一块玻璃在「输入框为空」时会整枚淡掉——两版的观感就
     此分叉（实测：rc.2 空输入时按钮面 #b8cbf2，打了字之后 #5d89e5；alpha.2 一直是 #5e8ae7）。
     材质本来是同一条规则画的，所以这里只把那层淡化收回来，两版与两种状态都是同一块玻璃。
     代价照实说：收回来之后「还不能发送」这件事就没有视觉提示了（按钮由 dsh 端拒收，点不动），
     这与 alpha.2 的行为一致——那一版本来就不靠淡化交代。深色档一样收，理由同一条。 */
  body[${GLASS_ATTRIBUTE}] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):disabled {
    opacity: 1 !important;
  }

  /* ── 五、左下角那枚加号（添加文件 / 调指令）：同一块玻璃上的一片灰 ── */
  /* 与主按钮同一套做法、同一个理由：底是 dsh 那个令牌（--dsw-specific-selector，比卡片底深一档），
     让出两成之后卡片那条横向渐变从小圆底下透上来，两处就接上了。三笔质感按 28px 的小圆收一遍——
     主按钮那三笔是给 34px 写的。过渡与主按钮同值，指上去是「亮了一点」而不是「换了个色」。
     兜底色的作用与主按钮那边一样：令牌改名时不至于整条声明作废，圆片还在、只是回到中性灰。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}] {
    background: color-mix(in srgb, var(--dsw-specific-selector, rgb(127 132 142)) 80%, transparent) !important;
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.45),
      inset 0 0 0 1px rgb(255 255 255 / 0.3),
      inset 0 -10px 14px -12px rgb(15 17 21 / 0.12) !important;
    transition: background-color 100ms ease !important;
  }

  /* dsh 那条 hover 规则（.add:hover:not(:disabled)）没有 !important，会被上面基础规则里的
     !important 压掉，所以 hover 得自己写一条——浓淡与主按钮同一档：比静止更实一点。 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover-solid, rgb(147 152 162)) 90%, transparent) !important;
  }

  /* 深色下那三笔：与主按钮同一档收法（深色里一点点白就很跳），底部内阴影同样加重。 */
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}],
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}] {
    box-shadow:
      inset 0 1px 0 0 rgb(255 255 255 / 0.22),
      inset 0 0 0 1px rgb(255 255 255 / 0.08),
      inset 0 -10px 14px -12px rgb(0 0 0 / 0.4) !important;
  }
}
`
