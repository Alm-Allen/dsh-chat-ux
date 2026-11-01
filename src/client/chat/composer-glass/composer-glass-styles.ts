/**
 * 输入框毛玻璃：只把输入卡片那个矩形变成一块半透明、背后模糊的玻璃，卡片下面那排统计、上面那几张卡都不动。
 *
 * 玻璃长在卡片的 ::before 上，不长在卡片自己身上：卡片是斜杠命令、@ 提及的候选菜单与模型选择这些浮层的
 * 祖先，卡片自己一带 backdrop-filter 就成了它们的祖先 backdrop root，菜单的模糊采样被掐断、整块透掉。
 * 每一组规则都拿 body 上的开关属性当前缀，关掉时整块表一条都不命中，真的回到 dsh 原来的输入框
 */
import {PAPER_DARK_ATTRIBUTE, PAPER_PREFIX, PAPER_ROOT_ATTRIBUTE} from "../paper/paper-tokens"

// 玻璃生效的开关属性，由 index.tsx 按设置写上或摘掉；表里每一组规则都拿它当前缀，开关不必重新生成样式表
export const GLASS_ATTRIBUTE = "data-chat-ux-composer-glass"

// 缺口的上边（卡片顶相对座位顶，单位 px），由 composer-glass.ts 写在座位上；缺席时座位那两层背景回退成整块底
export const GLASS_TOP_VARIABLE = "--dsh-chat-ux-glass-top"

// 缺口的下边（卡片底相对座位顶，单位 px），同样由 composer-glass.ts 写
export const GLASS_BOTTOM_VARIABLE = "--dsh-chat-ux-glass-bottom"

// 右下角那枚主操作按钮（发送或停止）身上的属性，由 composer-glass.ts 打
export const GLASS_PRIMARY_ATTRIBUTE = "data-chat-ux-glass-primary"

// 左下角那枚加号（添加文件或调指令）身上的属性，同样由 composer-glass.ts 打
export const GLASS_ADD_ATTRIBUTE = "data-chat-ux-glass-add"

// 独立停止圆：可继续的子智能体在跑时 dsh 另摆一枚（那时主按钮仍是发送或排队），它与主按钮同一个 class、
// 紧排在它前面，所以两枚共用下面同一套材质
export const GLASS_STOP_ATTRIBUTE = "data-chat-ux-glass-stop"

// 输入框毛玻璃的全部 CSS
export const COMPOSER_GLASS_CSS = `/* dsh-chat-ux —— 输入框毛玻璃 */
/* 整块表处处 !important：同页的 dsh-claude-style 皮肤也管输入区外观（它把卡片改成透明、改由座位铺
   bg-base 实底），那几条选择器的特异度高得多；本插件只认语义属性、不认别的插件挂在 body 上的属性，
   压过它的手段只剩 !important。它那条 border: none !important 不在这份表的目标里 */
body[${GLASS_ATTRIBUTE}] {
  /* 底让出多少。这是叠在几层之上的那一层的不透明度：伪元素面上还有两片角光，合成之后更高，
     0.92 的底加一片 26% 的角光约 0.94，背后只剩 6%，读者当场报「好像直接没有毛玻璃效果」；
     70% 配 blur(22px) 才是既看得到背后那片模糊、又读不到内容 */
  --dsh-chat-ux-glass-alpha: 70%;
  /* 浅色下卡片那块底。这里必须主动压一点灰：浅色里 --dsw-specific-input-major 与画布 --dsw-alias-bg-base
   是同一个令牌（都是 neutral-bluish-00），dsh 原本靠发丝描边加柔光分界，玻璃把底让到七成之后，中间那段
   （四停渐变里完全透明的那截）只剩画布色叠画布色，读者报「中间太白、和背景融进去了」。压的是一层中性冷灰，
   合成之后仍比画布暗七八级；要调浓淡就改最后那个百分比与那枚灰 */
  --dsh-chat-ux-glass-base: color-mix(
	in srgb,
	color-mix(in srgb, var(--dsw-specific-input-major, #ffffff) 97%, rgb(122 155 240)) 90%,
	rgb(172 178 192)
  );
}

/* 深色那一档不压灰：那里的输入面色（neutral-bluish-850）本来就比画布（950）亮一档，天然分得开 */
body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] {
  --dsh-chat-ux-glass-base: color-mix(in srgb, var(--dsw-specific-input-major, #0e1117) 97%, rgb(122 155 240));
}

/* 纸感开着时的深色玻璃：底的色相跟着纸走，不再掺冷蓝。
   上面那一条的底是「输入面色 neutral-bluish-850 掺 3% 冷蓝」，合成出来是一块冷近黑（#2d2e2f）；纸感开着时
   卡片底下压的是暗档葱皮 #3a3a32（暖灰），两者色相差出 160 度，同屏就是读者说的「太冷、太科技感」。
   所以纸开着时改从纸色与墨色派生：纸色朝墨色混 6%。
   明度那头：6% 在 srgb 里逐通道 +10 阶，把 #3a3a32 抬到 #44443c；乘 70% 的 alpha 压在纸上之后是 #414139，
   对纸 1.1——仍比纸深一点，读起来是压在纸上的一层玻璃，没有变成浮起的一块。
   色相那头：纸与墨在暗档都是暖黄绿家族（R-B 分别 6 与 11），掺出来自然同族；纸色以后改了它自动跟。
   不掺 --dsw-specific-input-major 了：那是宿主的中性偏冷的近黑，正是另一半「冷」的来源。
   两条变量名由 paper-tokens 的 PAPER_PREFIX 拼出来，不在这里重抄一遍字面量：两处写法一旦分叉，
   color-mix 就整条作废、玻璃静默退回 dsh 自己那一档，页面不报错。
   兜底值取当下这两个字面值，缺席时算出来与现在一致 */
:root[${PAPER_ROOT_ATTRIBUTE}][${PAPER_DARK_ATTRIBUTE}] body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] {
  --dsh-chat-ux-glass-base: color-mix(
	in srgb,
	var(${PAPER_PREFIX}ink, #e8e6dd) 6%,
	var(${PAPER_PREFIX}paper, #3a3a32)
  );
}

/* 没有 backdrop-filter 或 color-mix 的浏览器上，只做半透明会变成文字叠文字，比不做更糟，所以整块收在这里 */
@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) and (color: color-mix(in srgb, white 50%, transparent)) {
  /* 有会话内容时：座位照旧画底，在卡片那一段让开 */
  /* 两层背景各铺一段：上段从座位顶到卡片顶，下段从卡片底到座位底，中间那段留白就是让给玻璃的缺口。
     两个变量缺席时上段铺满整块——也就是 dsh 原来的样子，这是安全的一侧；两条边由 composer-glass.ts 量 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-seat],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-seat] {
	background:
	  linear-gradient(var(--dsw-alias-bg-base), var(--dsw-alias-bg-base)) 0 0 / 100% var(--dsh-chat-ux-glass-top, 100%) no-repeat,
	  linear-gradient(var(--dsw-alias-bg-base), var(--dsw-alias-bg-base)) 0 var(--dsh-chat-ux-glass-bottom, 100%) / 100% calc(100% - var(--dsh-chat-ux-glass-bottom, 100%)) no-repeat !important;
  }

  /* 座位上方那条淡出带在座位之外，因此不被模糊。颜色刻意跟着画布走、不跟玻璃：跟玻璃的深蓝走会在
     消息区底边压出一条看得见的横带，读者报过一次「一层光晕」 */
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

  /* 卡片自己：交出底色，只留那三笔质感（底与模糊都在下面那个 ::before 上） */
  /* 底色留在卡片自己身上的话，伪元素那层模糊就得先糊过它自己，等于没糊 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card],
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] {
	background: transparent !important;
	/* 那三笔质感：顶边一道亮边、内侧一圈微光、底部一道内阴影。贴底时输入框背后本来就是空白（聊天内
	   容的末尾停在输入框顶边，不会停在它后面），所以「背后透出来的模糊」这件事日常看不到，玻璃感得由
	   卡片自己交代；dsh 原来那层 --dsw-elevation-soft（发丝描边加两片柔光）接在后面不能丢，那是
	   「一个框」的边。inset 阴影画在透明底之上、内容之下，底交出去之后照样看得见 */
	box-shadow:
	  inset 0 1px 0 0 rgb(255 255 255 / 0.9),
	  inset 0 0 0 1px rgb(255 255 255 / 0.5),
	  inset 0 -16px 20px -18px rgb(15 17 21 / 0.045),
	  var(--dsw-elevation-soft, none) !important;
  }

  /* 玻璃本体：卡片自己的 ::before，铺满卡片那个矩形 */
  /* 底是两层：一条照 dsh 自己在 AppFrame.module.css 的 .sidebarCol 上的四停渐变——两端各一片极淡的色、
   中间完全透明，再垫一层掺了一点蓝的底色。方向转成横向：卡片又宽又扁，左端就是「左上角」、右端就是
   「右下角」，横向的两端色正是读者要的那对角。
   伪元素没有后代，它的 backdrop-filter 只糊自己那层，造不出祖先 backdrop root（玻璃不能长在卡片本体上的
   原因，见模块头） */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card]::before,
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card]::before {
	content: '' !important;
	position: absolute !important;
	inset: 0 !important;
	/* 落到卡片内容之下。卡片自己不建立层叠上下文（见模块头），所以这一层落进座位那一层，绘制在座位
	   底色之上、卡片内容之下——正是输入框的底该在的位置 */
	z-index: -1 !important;
	/* 卡片可能被别的插件改过圆角，跟着它走 */
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
	/* 模糊半径与底的不透明度是一对：底一实，模糊再大也看不出来 */
	-webkit-backdrop-filter: blur(22px) saturate(130%);
	backdrop-filter: blur(22px) saturate(130%);
  }

  /* 深色档同一套做法，只是两端那两片更淡（0.035 与 0.03）。dsh 那条配色本来用在竖着的侧栏上，
     而卡片又宽又扁，横向的两端色读起来正是「左端蓝、中间深、右端又偏蓝」；关键在于中间完全透明——
     两端各自一片极淡的色、中间交给底色，既不脏也不集中 */
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

  /* 深色下那三笔：亮边与微光更弱、底部内阴影更重 */
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

  /* 右下角那枚主操作按钮（发送，跑起来时是停止）：同一块玻璃上的一片蓝 */
  /* 底还是 dsh 那个令牌（--dsw-alias-button-info-fill，浅色 500、深色 400，白图标），只让出一成多：
     卡片那条横向渐变从小圆底下透上来，两处就接上了。三笔质感按 34px 的小圆重调，照搬卡片那三笔
     （给 700×80 的大面写的）会糊成一团。这里不加 backdrop-filter：按钮背后就是卡片那块已经糊过的
     玻璃，再糊一次看不出来，白多一层重采样；按钮本身也没有任何后代，加不加都不牵连别人 */
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

  /* dsh 自己那条 hover 规则（.primary:hover:not(:disabled)）没有 !important，会被上面基础规则压掉，
     所以 hover 得自己写一条；浓淡照 dsh 的 hover 令牌，也让出一成多——比静止那档更实一点，指上去才看
     得出是「亮了一点」而不是「换了个色」 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):hover:not(:disabled) {
	background: color-mix(in srgb, var(--dsw-alias-button-info-hover, #7aaaff) 92%, transparent) !important;
  }

  /* 深色下那三笔：亮边与微光收得更紧（深色里一点点白就很跳），底部内阴影加重 */
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='active'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]),
  body[${GLASS_ATTRIBUTE}][data-ds-dark-theme] [data-content-phase='hero'] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]) {
	box-shadow:
	  inset 0 1px 0 0 rgb(255 255 255 / 0.28),
	  inset 0 0 0 1px rgb(255 255 255 / 0.1),
	  inset 0 -10px 14px -12px rgb(0 0 0 / 0.5) !important;
  }

  /* rc.2 那条「不可用就整枚淡到四成」在这里收回来 */
  /* dsh 0.2.0-rc.2 给这枚按钮的 :disabled 是 opacity: .4（0.2.1-alpha.2 已经不用这条，空输入框时
     照旧实心），不收回来的话同一块玻璃在「输入框为空」时会整枚淡掉，两版观感就此分叉（实测 rc.2 空输
     入时按钮面 #b8cbf2、打字之后 #5d89e5，alpha.2 一直是 #5e8ae7）。代价照实说：收回来之后「还不能发
     送」没有视觉提示了，按钮仍由 dsh 端拒收、点不动，这与 alpha.2 一致；深色档一样收 */
  body[${GLASS_ATTRIBUTE}] [data-composer-card] :is([${GLASS_PRIMARY_ATTRIBUTE}], [${GLASS_STOP_ATTRIBUTE}]):disabled {
	opacity: 1 !important;
  }

  /* 左下角那枚加号（添加文件或调指令）：同一块玻璃上的一片灰 */
  /* 与主按钮同一套做法：底是 dsh 那个令牌（--dsw-specific-selector，比卡片底深一档），让出两成之后
     卡片那条横向渐变从小圆底下透上来。三笔质感按 28px 的小圆收一遍（主按钮那三笔是给 34px 写的），
     过渡与主按钮同值。不借主按钮那支蓝——它是次要操作，整枚染蓝会把「哪一枚是发送」弄糊。兜底色的
     作用同主按钮：令牌改名时不至于整条声明作废，圆片还在、只是回到中性灰 */
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

  /* dsh 那条 hover 规则（.add:hover:not(:disabled)）没有 !important，会被上面基础规则压掉，所以自
     己写一条，浓淡与主按钮同一档：比静止更实一点 */
  body[${GLASS_ATTRIBUTE}] [data-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='active'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled),
  body[${GLASS_ATTRIBUTE}] [data-content-phase='hero'] [data-composer-card] [${GLASS_ADD_ATTRIBUTE}]:hover:not(:disabled) {
	background: color-mix(in srgb, var(--dsw-alias-interactive-bg-hover-solid, rgb(147 152 162)) 90%, transparent) !important;
  }

  /* 深色下那三笔与主按钮同一档收法，底部内阴影同样加重 */
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
