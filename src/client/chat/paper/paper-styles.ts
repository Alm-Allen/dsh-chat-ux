/**
 * 纸感的样式。
 *
 * 四件事：给两片全屏 canvas 与那层暗角找位置、把纸色铺到宿主真正画底的几处、让侧栏在需要时
 * 躲开全屏那一层纸，以及给躲开之后的侧栏补一层只有纹理、没有底色的纸纹。
 * 整张表都以根元素上的 `data-dsh-chat-ux-paper` 为前提——那个标记不在时一条都不命中，
 * 于是关掉纸感是彻底的，不必逐条撤销
 */
import {PAPER_DARK_ATTRIBUTE, PAPER_ROOT_ATTRIBUTE, PAPER_PREFIX} from "./paper-tokens"

// 两片 canvas 与暗角上的标记，值就是它们的角色
export const PAPER_SHEET_ATTRIBUTE = "data-dsh-chat-ux-paper-sheet"
export const PAPER_GLOW_ATTRIBUTE = "data-dsh-chat-ux-paper-glow"
export const PAPER_VIGNETTE_ATTRIBUTE = "data-dsh-chat-ux-paper-vignette"

/**
 * 侧栏那层纸纹的标记，挂在侧栏那一列自己身上（paper-mount 负责增删）。
 *
 * 为什么不写在根元素上、让 CSS 自己去认那一列：那要写成 :has(> [data-shell-bottom]) 再取
 * 第一个子元素，而 :has 的失效检查会跟着每一次 DOM 变更走——聊天流每吐一个字都要重算一遍。
 * 反过来由 JS 定位一次、挂一条属性，样式表里就只剩一个属性选择器。
 *
 * 为什么这个开关不在 CSS 里再判一次平台：窗口材质那套判据已经有了一份（paper-layout 的
 * sidebarRevealsWindowMaterial），CSS 里照抄一遍就是两份会分叉的真相
 */
export const PAPER_SIDEBAR_ATTRIBUTE = "data-dsh-chat-ux-paper-sidebar-texture"

/**
 * 收起标记。写在三件身上就是「这一层此刻不参与绘制」。
 *
 * 用它而不是 hidden 属性：UA 样式表里 [hidden] 只有 display:none 这一条，而本表给三件写的是
 * display:block，作者样式恒赢，于是 hidden 一点作用都没有（实测：加了 hidden 之后
 * computed display 仍是 block，截图与纸开逐字节相同）
 */
export const PAPER_HIDDEN_ATTRIBUTE = "data-dsh-chat-ux-paper-hidden"

// 纸层的层级。必须高过页面里所有正常内容，才压得住字。
// 发送气泡的替身是 2147481999，**压在纸下**（send-morph.ts 的 GHOST_Z 与这里是一对，改一处就要改两处）：
// 替身若浮在纸上，飞行中不受 multiply 压暗、落定后受，同一个色值在两帧里差出一档，读者看到的就是落地跳色
const SHEET_Z = "2147482000"
const GLOW_Z = "2147482001"
const VIGNETTE_Z = "2147482002"

// 侧栏纸纹那张噪声块的边长，也是 mask-size 的重复周期。180 是读者看着真机一轮轮调出来的：
// 更小时平铺痕迹要靠放大镜才看得见，更大则白占内存、看不出差别
const SIDEBAR_NOISE_TILE = 180

/**
 * 侧栏那层纸纹的形状：一张纯噪声的 SVG，只出 alpha、RGB 全黑（颜色归 CSS 给）。
 *
 * 为什么不是 CSS 渐变。第一版用的是三条 repeating-linear-gradient，读者看了真机截图说
 * 「读起来是网格，不是纸纹」。渐变的每个梯度都是周期函数，铺满 280 宽的侧栏就是一张格纸；
 * 而且三条直线里两条只差 90 度，人眼对「两个正交方向的等间距直线」最敏感，那正是网格的定义。
 * 纸纹的本质是没有周期，所以换成 feTurbulence 的噪声。
 *
 * **两层噪声叠起来，不是一层。**
 *   低频（baseFrequency 0.50、4 个八度）出纸的不匀，负责「这张纸不是一块平色」；
 *   高频（1.70、2 个八度、alpha 乘 0.5）出纸齿，负责凑近看时的颗粒。
 * 两层用 screen 合成：alpha 互相补足，低频淡的地方由高频兜住，不会出现大片空白。
 *
 * **频率调过一轮，这两个数是读者看了真机之后定的。** 第一版是 0.12 / 0.70，读者的原话是
 * 「看着有点像是一张很糊的图片放大后的某一个局部视图」——0.12 那层出的是跨几十像素的大块
 * 云斑，铺在 280 宽的侧栏上正是「低分辨率图被放大」的样子。改成 0.32 之后斑块缩到十几像素，
 * 不再是糊图；高频从 0.70 提到 1.50，纸齿更细。这一步渲染成图对比过（0.25 / 0.32 / 0.40 配
 * 1.20 / 1.50），0.32 / 1.50 那一组既没有大团块、也没有砂纸感。**读者之后又手动细了一档到
 * 0.50 / 1.70，并把画布从 220 收到 180**，现值以字面量为准。
 *
 * 屏幕上的颗粒尺寸由两处相乘决定：baseFrequency 相对 SVG 自己那张 220 画布，而 mask-size 是
 * 180px，整块被缩到 0.818 再平铺。想整体缩一圈颗粒就改 SIDEBAR_NOISE_TILE，但那会让接缝变密，
 * 所以先调频率这一档。
 *
 * 单层 0.65（最初按建议写的那个数）在 20% 浓度下渲染出来像砂纸，不像纸。单层噪声只有一种
 * 颗粒大小，纸上没有那种东西。也**没有**写各向异性的 baseFrequency（比如 0.9 0.12 拉出横向
 * 纤维）：单方向会回到「有方向感」的老问题，与网格是同一类错。
 *
 * **stitchTiles 必须留。** 不加它，220px 那块噪声的四条边对不上，平铺出来是一张可见的网格，
 * 比渐变那版还糟。频率改过之后这一条重新验了一遍（不同频率的平铺边界行为会变，不能沿用旧结论）：
 * 接缝处相邻像素的平均差是 0.054 / 0.055，同一张图内部相邻像素的差是 0.065 / 0.058——
 * 接缝仍比内部平，2x2 平铺放大 8 倍目检也看不出那条缝。
 *
 * 编码只把 # 换成 %23，属性一律用单引号包。于是这个字符串里没有双引号、没有反引号、
 * 也没有美元加大括号，直接塞进 CSS 的 url("...") 是安全的（这张样式表本身是模板字符串）
 */
const SIDEBAR_NOISE_DATA_URI = "data:image/svg+xml,"
    + "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>"
    + "<filter id='n' x='0' y='0' width='100%' height='100%'>"
    + "<feTurbulence type='fractalNoise' baseFrequency='0.50' numOctaves='4' result='low' stitchTiles='stitch'/>"
    + "<feColorMatrix in='low' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0' result='lowA'/>"
    + "<feTurbulence type='fractalNoise' baseFrequency='1.70' numOctaves='2' result='high' stitchTiles='stitch'/>"
    + "<feColorMatrix in='high' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0' result='highA'/>"
    + "<feBlend in='lowA' in2='highA' mode='screen'/>"
    + "</filter>"
    + "<rect width='100%' height='100%' filter='url(%23n)'/>"
    + "</svg>"

// 根元素上的选择器前缀，整张表的共同前提
const ROOT = "html[" + PAPER_ROOT_ATTRIBUTE + "]"

/**
 * 纸感那一整张表。
 *
 * 两片 canvas 直接挂在 body 下、不带任何包裹容器：mix-blend-mode 的元素一旦被包进带 z-index 的容器，
 * 就会连同那个容器的隔离栈一起与页面断开，multiply 退化成直接覆盖。这条是 nocturne 实测出来的，
 * 这里照搬同样的挂法
 */
export const PAPER_CSS = `
/* 纸与光：两片 fixed 全屏 canvas。left / top / width / height 由 paper-mount 逐帧写，
   纸不铺侧栏时那几项就是左侧栏右边那一块 */
${ROOT} [${PAPER_SHEET_ATTRIBUTE}],
${ROOT} [${PAPER_GLOW_ATTRIBUTE}],
${ROOT} [${PAPER_VIGNETTE_ATTRIBUTE}] {
  position: fixed;
  left: 0;
  top: 0;
  display: block;
  pointer-events: none;
  user-select: none;
}

${ROOT} [${PAPER_SHEET_ATTRIBUTE}] {
  mix-blend-mode: multiply;
  z-index: ${SHEET_Z};
}

${ROOT} [${PAPER_GLOW_ATTRIBUTE}] {
  mix-blend-mode: screen;
  z-index: ${GLOW_Z};
}

/* 暗角挂在单独一层上，位置跟着纸走：纸不覆盖左侧栏时，那块的窗口材质不该被压暗 */
${ROOT} [${PAPER_VIGNETTE_ATTRIBUTE}] {
  z-index: ${VIGNETTE_Z};
  background: radial-gradient(
    ellipse 92% 88% at 50% 46%,
    transparent 52%,
    rgba(0, 0, 0, calc(var(${PAPER_PREFIX}vignette, 0.35) * 0.30)) 100%
  );
}

/* 收起来的三件。这里必须自己写一条，而不是靠 UA 的 [hidden]{display:none}：
   上面那条把 display 写成了 block，作者样式压过 UA 样式表，于是加了 hidden 也照样是 block、
   照样参与合成（实测截图与纸开逐字节相同）。
   连定位一起撤掉也是必须的：只藏不撤的话，三块 1440x900 的元素仍然撑在文档流里，
   body.scrollHeight 会从 900 涨到 3610 */
${ROOT} [${PAPER_HIDDEN_ATTRIBUTE}] {
  display: none;
  /* 定位一起撤：只藏不撤的话，三块 1440x900 的元素仍会撑在文档流里 */
  position: static;
  left: auto;
  top: auto;
  width: 0;
  height: 0;
}

/* 暗档的暗角比亮档重，但不能重到四角比画布还黑。亮档那个 0.30 的乘子是给米白纸调的，
   压到暗纸上几乎看不出来；这一路是 0.85 → 0.70 → 0.45 → 0.25 收下来的：0.70 那一档算出来
   四角是 19，比 dsh 的深色画布（21）还黑，整张纸的四边像被啃掉一圈；0.45 之后四角 24，纸
   从画布上浮起来；最后读者又收到 0.25，四角更亮一档 */
${ROOT}[${PAPER_DARK_ATTRIBUTE}] [${PAPER_VIGNETTE_ATTRIBUTE}] {
  background: radial-gradient(
    ellipse 92% 88% at 50% 46%,
    transparent 46%,
    rgba(0, 0, 0, calc(var(${PAPER_PREFIX}vignette, 0.25) * 0.25)) 100%
  );
}

/* 侧栏自己那层纸纹。
   位置：paper-mount 找到侧栏那一列（AppFrame grid 的第一个元素子元素）并在它身上挂
   PAPER_SIDEBAR_ATTRIBUTE，样式表只认那条属性。为什么不用 :has 去找那一列，见 paper-styles
   顶部那条常量的注释。

   **这一层只给纹理，不给底色，也不加灯光。** 侧栏的观感在材质平台上由三层叠出来：
   窗口材质（页面之下）、::before 那层实底（材质平台上 opacity: 0）、以及侧栏自己的 tint
   （color-mix 85% 叠 transparent，只剩 15% 透光）。往上再加任何不透明的底，都是乘在那 15% 上：
   一层 85% 的纸色会把透光打到 2.25%，玻璃当场失效。

   **纹理用一张噪声图当 mask，不用渐变。** 这里换过一次：先做的是三条 repeating-linear-gradient
   （帘纹加两道斜纤维），读者看了真机截图说「读起来是网格，不是纸纹」。原因不在浓淡在规整——
   渐变的每一个梯度都是周期函数，4.2 / 9 / 13px 精确重复铺满 280 宽的侧栏就是一张格纸；
   而且三条直线里两条只差 90 度，人眼对「两个正交方向的等间距直线」最敏感，那正是网格的定义。
   纸纹的本质是没有周期：纤维走向随机、长度不一、疏密不均。CSS 渐变做不出这个，
   所以换成 feTurbulence 的噪声，用 mask 套色。

   为什么是 mask 而不是把噪声上成颜色：mask 只读 alpha，颜色仍归 CSS 给。于是「哪里的纹理密」
   与「纹理是什么色」分成两件事：明暗两档只换颜色（ink 跟着纸走），噪声图一个字都不用改。
   换成把噪声直接当图片上色的话，两档就得两张图。

   **稠密程度由两处决定**：background-color 那个百分比（当前 10%）与噪声自己的 alpha 分布。
   这张噪声在 Chromium 里量出来的 alpha 分布是：均值 0.625、p50 0.627、p90 0.745、最浓 0.945，
   最小值 0.251（没有全透明像素，因为两层 screen 合成把低谷兜住了）。于是：

     整层平均不透明度      10% × 0.625 = 6.25%
     最浓的像素            10% × 0.945 = 9.45%

   折算到透光（起点是 dsh 那层 tint 留下的 15%）：

     整层平均   15% × (1 - 0.0625) = 14.06%
     最浓的像素 15% × (1 - 0.0945) = 13.58%

   也就是这层把玻璃平均压掉 0.94 个百分点、最浓处压掉 1.42 个——纹路在，玻璃照样透。

   调浓淡有两个旋钮：抬 background-color 那个百分比（线性、直观，先动这个），
   或者抬 feFuncA 的 amplitude（改分布形状，颗粒对比更跳）。**整层 opacity 别动**——
   它会把「没有噪声的地方」一起乘进去，那是这条设计里唯一不能碰的东西。

   10% 这个数是三档（8 / 10 / 12）在亮暗两档上叠着真实合成链看过的：8% 在暗档上几乎看不出，
   12% 在亮档上开始抢字。10% 两档都刚好。

   为什么不用 backdrop-filter：侧栏底下已经是系统 vibrancy，页面里再叠一层 backdrop-filter 会
   造一个新的 backdrop root，把 vibrancy 的透出路径切断——比不透明更隐蔽的失效方式。

   颜色从 --dsh-chat-ux-paper-ink 派生，不写死色值，两档因此自动成立：亮档的墨是深棕，
   压在浅玻璃上是深色细纹；暗档的墨是暖白 #e8e6dd，压在深玻璃上是浅色细纹。
   **混的是 ink 不是 paper**：paper 是纸的本色，混进来等于给侧栏铺一层纸色底，正是上面要避开的。

   噪声那块图见文件顶部的 SIDEBAR_NOISE_DATA_URI，那边写了每个参数在管什么。 */
${ROOT} [${PAPER_SIDEBAR_ATTRIBUTE}]::after {
  position: absolute;
  inset: 0;
  /* 负一层：压在这一列的 tint 之上、侧栏内容之下。.sidebarCol 带 isolation: isolate，
     它形成自己的层叠上下文，于是负 z-index 的伪元素画在那条 background 之后、内容之前——
     纹理是纸面的痕，字与控件印在它上面；反过来盖在字上就成了在文字上蒙一层纱 */
  z-index: -1;
  pointer-events: none;
  content: "";
  /* 只给颜色，不给形状：整块铺满，露多少由 mask 决定。混 transparent 而不是配 rgba()，
     是为了让颜色跟着 ink 走、不写死色号 */
  background-color: color-mix(in srgb, var(${PAPER_PREFIX}ink) 10%, transparent);
  /* 噪声只决定「哪里显示」。四个属性各写两遍：不带前缀的那一组是新语法，
     -webkit- 那一组给旧版 Chromium 兜底（Electron 的版本跟着 dsh 走，不能假定够新） */
  mask-image: url("${SIDEBAR_NOISE_DATA_URI}");
  mask-size: ${SIDEBAR_NOISE_TILE}px ${SIDEBAR_NOISE_TILE}px;
  mask-repeat: repeat;
  -webkit-mask-image: url("${SIDEBAR_NOISE_DATA_URI}");
  -webkit-mask-size: ${SIDEBAR_NOISE_TILE}px ${SIDEBAR_NOISE_TILE}px;
  -webkit-mask-repeat: repeat;
}

/* 纸面下的字与背景：宿主的底色与侧栏填充色由 paper-tokens 内联写，这里只管那些靠自己的色值画底、
   不认令牌的地方 */
${ROOT} ::selection {
  background: var(${PAPER_PREFIX}selection, rgba(176, 138, 74, 0.28));
  color: inherit;
}

`
