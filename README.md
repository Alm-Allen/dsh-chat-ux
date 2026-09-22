# dsh-chat-ux

面向 DeepSeek Harness（dsh）Web GUI 聊天区的 UX 优化插件。

当前状态：已实现 **API 响应的 token 淡入**（思考与正文都覆盖）、**思考行随思考自动展开与收起**、**用户消息气泡的 Markdown 渲染**；渐变时长可以在 dsh 的**插件管理页**上调整。

## 工程结构

```
src/index.ts               host 半：Node 侧入口，注册设置命名空间
src/client/index.tsx       client 半：浏览器入口，聊天区 UX 写在这里
src/client/token-motion.ts token 淡入：diff 新增文本并驱动透明度档位
src/client/reasoning-fold.ts 思考行：思考中展开、思考结束收起
src/client/styles.ts       聊天区样式表 + 透明度档位规则（纯文本，内联进 bundle）
src/client/user-bubble.tsx 用户气泡：接管 conversation.chat.node 的 user / steering 座位
src/client/user-bubble-styles.ts 气泡样式表（复刻官方度量，dsh-chat-ux-ub- 前缀）
src/client/settings-card.tsx 插件管理页上的配置卡片（渐变时长表单）
src/client/config-card-styles.ts 卡片的样式表与类名（跟随 dsh 设计令牌）
src/client/settings-scope.ts 客户端 settings scope 的最小类型契约
src/client/platform-modules.d.ts 平台基座模块的环境声明（运行时由加载器提供）
scripts/wrap-client.cjs    把 tsc 的 CommonJS 产物包成 DSH 的 client bundle
cordis.patch.yml           组合包层：按包名 insert 一行（安装后走这个）
cordis.yml                 源码 overlay：按路径 insert 一行（本地 --patch 调试用）
tsconfig.json              host 半编译配置（NodeNext -> dist/）
tsconfig.client.json       client 半编译配置（CommonJS -> build/client/）
```

## 两条产物

dsh 的插件分两侧加载，本工程两侧都有：

- **host 半** — `exports["."]` -> `dist/index.js`。Node 侧，由 `cordis.patch.yml` 里的行按包名加载。它只做一件事：把设置命名空间 `dsh-chat-ux` 注册给设置服务。
- **client 半** — `exports["./client"]` -> `dist/client.js`。因为 package.json 声明了 `dsh.client`，宿主会把这一项组合进浏览器启动图。聊天区动效与配置卡片都在这一侧。

client 产物必须是**单个自包含文件**：浏览器模块加载器不给插件 client 提供相对 require，也没有资源 URL。它只认 `window.__ModuleLoader__.load({ id, factory })` 协议，factory 拿到一个绑定到加载器模块表的 `require`（react 与平台 client 包都在里面），并返回插件的 exports。

所以 `scripts/wrap-client.cjs` 做两件事：把 `src/client/` 内部所有相对 require 递归内联成一份模块表（源码可以正常拆多文件），非相对 require（react、`@deepseek-ai/*`）则原样留给加载器；最后包成协议要求的形状，并在写盘前做一次语法门禁。

两侧通过两个字符串对齐：设置命名空间 `dsh-chat-ux` 与字段名 `revealMs`。它们各自写在自己那侧，改一处就要改另一处。

## token 淡入

流式回复里**新出现的每个字符**先淡后实：到达时只有自己颜色的 20% 不透明度，然后逐渐变成完全不透明并保持静止。思考（reasoning）与正文都覆盖——两者渲染在同一个 Markdown 层里，也都落在该层流式期间标记的容器（`[data-streaming]`）内，所以一处安装即可。

实现走 **CSS Custom Highlight API**（`CSS.highlights` + `::highlight()`）：用 Range 标记字符区间，**不改动 DOM**。这一点是硬约束——聊天记录由 React 掌管，而官方 Markdown 层不暴露任何节点渲染钩子（它的 `MarkdownDelegate` 只管链接导航），包裹 `<span>` 会和 reconciliation 打架。

每个字符**只管自己的淡入**：它到达时最淡，然后按自己的到达时间变实，字符之间没有错峰、也不排队等待。同一批到达的字符一起淡、一起实；阅读顺序来自 API 的到达顺序，而不是插件发明的顺序。

`::highlight()` 接受不了 `opacity`——它的属性集很小（color、background-color、各种 text-decoration、text-shadow），所以透明度只能挂在 `color` 的 alpha 通道上。这正是 `color-mix(in srgb, C p%, transparent)` 的语义：与 `transparent` 混合会把结果的 alpha 按 `p` 加权，色相不变。

`::highlight()` 同样不接受 transition，所以渐变是**分档**的：`token-motion.ts` 按存活时长把区间分到 96 个档位，`styles.ts` 为每个档位生成一条规则，从 20% 一路走到 100%。

档位数的用处取决于 alpha 的精度：整数百分比在 20%–100% 之间只有 81 个取值，96 档里仍会有 15 档撞成同一个颜色，看着仍是一段台阶。所以规则里写的是两位小数（`20.32%`），96 档才真是 96 个不同的颜色。96 是对着最慢档定的：600 ms 在 144 Hz 上是 86 帧，每帧至少还能分到一档。

淡入用的颜色是**每个字符自己的颜色**：`token-motion.ts` 扫描到新字符时读它所在元素的 `getComputedStyle(el).color`，写回该元素的 `--dsh-chat-ux-run-color`；`styles.ts` 的 96 条规则统一读这个变量。

```css
/* 页面级兜底：只有从没写入过自己颜色的元素才用得上 */
body {
  --dsh-chat-ux-run-color: var(--dsw-alias-label-primary, #0f1115);
}

body[data-ds-dark-theme] {
  --dsh-chat-ux-run-color: var(--dsw-alias-label-primary, #f9fafb);
}
```

`::highlight()` 会把自定义属性解析到**承载元素**上，所以同一档位、不同元素读到的颜色各不相同。实测：元素上写 `rgb(77, 155, 255)`，第 0 档读出 `color(srgb 0.301961 0.607843 1 / 0.7)`。

颜色是**每一帧按 Range 的实际元素校正**的，不是扫描时写一次就完事。Markdown 层在流式期间会重建节点（把 `**bold` 重新解析、折叠某一行），被换掉的那个元素上留着的颜色再也没人渲染，而真正在渲染的新元素会回退到页面默认值——那是正文色，于是闪过一下白。所以 `paint()` 从 Range 的 `startContainer` 反查元素并补写变量；元素上已经带着记录过的颜色时跳过样式读取，每帧每个区间只多一次 WeakMap 查找。

**为什么不能只用一个颜色**：答案里不只有正文。链接走 `--dsw-alias-link`，代码块的 token 颜色由 shiki 内联写死，列表标记是 `--dsw-alias-label-secondary`——把它们在淡入期间一律涂成正文色，每个字符就会**比它最终的颜色更亮**，然后再掉回去。深色主题下最刺眼：正文色是 `rgb(249, 250, 251)` 的近白，本该是蓝、紫、绿的那些字符会先闪一下白。那不是淡入，是高亮。

**为什么不用 `currentColor`**：`::highlight()` 里的 `currentColor` 在 Chromium 中不解析为承载元素自己的颜色，而是塌缩成初始色。实测（`rgb(21, 21, 23)` 画布 + `color-scheme: dark`）只以 `currentColor` 为色的规则画在 `rgb(0, 0, 0)`——在深色画布上不可见，表现为每个字符在 highlight 撤销前闪一下黑。浅色画布上看不出这个塌缩，因为那里的正文色（`rgb(15, 17, 21)`）本来就是黑。所以透明度只能挂在显式颜色上——而且必须是每个元素自己的那一个。

想换起始透明度就改 `token-motion.ts` 顶部的 `TOKEN_MIN_OPACITY`（默认 0.2）。20% 在深色画布上约合 `rgb(67, 68, 70)`——暗到读不出字，又不至于像什么都没渲染出来。

行为细节：

- 只处理**流式容器**内的变化，历史消息与已完成回复不会重播。
- 首次见到某容器只记录基线，不追溯已显示的内容。
- 只有**纯粹的末尾追加**才算新字符：旧文本必须是新文本的前缀。别的形状——变短、在中间岔开——都是对已经读过的文字做重排，不产生动效。
- **折叠/展开思考行或工具行不会重放渐变**。这些行所在的容器在整轮 `running` 期间都带着 `data-streaming`（思考停下之后才到的正文也在里面），而收起的思考行显示的正是展开后内容的第一行——所以展开它看起来和"追加了一段文字"一模一样。区分二者只能靠点击：`click`/`keydown` 在捕获阶段先记下受影响的容器，400 ms 内不把它们的变化当成新输出。**只有读者自己那一下才算**——插件自动收起思考行派的也是同一条捕获路径，那份声明（`beginProgrammaticToggle`）会让守卫放过它，否则「思考刚停、正文刚开头」那一段正好被静默掉；`keydown` 也只认目标自己落在容器里的情况，不再因为一次 PageUp 就把页面上所有流式容器一起静默。
- 重排发生时，落在**公共前缀与公共后缀**里的区间继续自己的淡入，而不是被整片撤销——后缀里的那批整体平移，跟着自己的字符走。否则正读到一半的正文会因为读者点了一下折叠控件就整片定格。
- 尊重 `prefers-reduced-motion: reduce`；引擎不支持 Highlight API 时静默降级（返回空 disposer）。

## 思考行自动展开

dsh 的思考行**默认是收起的**，也没有对应的设置项（它自己的 README 写着 "Each reasoning row starts collapsed"），所以插件只能去按行自己的展开控件：思考中（`data-state="running"`）还没展开就点开，`data-state` 转 `ok` 就点回去。

认行用的是语义属性，不是 class 名——dsh 的 class 名带构建期 hash，每次发版都会变：

| 属性 | 含义 |
|---|---|
| `data-variant="think"` | 这一行是思考行 |
| `data-state="running" \| "ok"` | 模型还在思考 / 思考已结束 |
| `data-expanded` | 存在即展开 |

**读者仍然拥有这一行。** 在行内点一下或按一下键，会记下当时所处的阶段，本阶段内插件不再动它：思考中折叠了就保持折叠，已结束的行展开了就保持展开。**这个让位是按阶段算的，不是按行算的**——思考中折叠又展开的行，等思考结束仍然会被收起，因为读者并没有表示「思考完了也要一直开着」。阶段一变，自动规则重新接管。

控件按「行内第一个 `[role="button"]` 或 `button`」来找：dsh 的 `DisclosureRow` 在 `expandOnRowClick` 为真时整行就是按钮，否则是左侧的 chevron 按钮，这样找两种配置都覆盖。

两个已知边界：

- 如果整段过程（turn process）本身是收起的，思考行根本不在 DOM 里，插件够不着它。
- 展开是模拟点击（`click()`）实现的，dsh 若改掉 `DisclosureRow` 的交互，这里会静默失效——不报错，只是不再自动展开。

## 用户气泡的 Markdown

dsh 对两种消息用两套文本处理：助手消息走 `MarkdownText`（GFM + KaTeX），读者自己的消息走 `projectUserText`——那是个**引用装饰器**，不是解析器。它把 `@label`、`/name`、`@[label](dsh-session:...)` 三类 token 换成 chip，其余文本原样返回。所以读者在自己气泡里打的 `` `path` `` 是字面量，同样的文字出现在回答里却是代码。

插件接管 `conversation.chat.node` 槽位的 `user` 与 `steering` 两个 key，把这一侧也换成 Markdown。

**为什么是 `priority: -1`**：这个槽位是 keyed 的，契约写着「复用同一个 key 会替换该渲染器」，而遮蔽规则是**升序排列、最低者渲染**（同 key 同 priority 会抛错）。官方注册没传 priority，即默认 0，所以负值才是替换而不是竞争。

**引用与 Markdown 二选一。** 这是这个功能的核心取舍：`projectUserText` 和 `MarkdownText` 都是「整串文本 → React 节点」的投影，而 Markdown 渲染器的输出是任意嵌套的元素树，中间没有能让 chip 穿过去的缝。所以分流按 **host 真正解析出来的 label** 判断：

- 有 `referenceLabels` / `skillNames` → 保持引用投影，chip 与「点击打开文件」不变，不渲染 Markdown；
- 其余 → 走 Markdown。

判断依据是已解析的 label，而不是文本里有没有 `@`——后者会把邮箱地址也当成引用。

**代价**（模块头注释里也写着）：

- `UserStyleBubble` 与 `MessageIconActions` 是 ui-chat 的内部实现、没有包导出，所以气泡外壳、附件行、复制按钮与时钟都按同样的设计令牌重写了一份；
- 时钟的日期模板在官方那里来自 `chat` 命名空间（插件够不到），这里用同样的分档逻辑自己拼；
- **发送瞬间会有一次跳变**：本地回显气泡（`PendingSubmissionBubble`）由 `ChatView` 直接渲染、不走槽位，所以回显是纯文本，落地后才变成 Markdown。


## 配置卡片

插件管理页（侧栏 **插件** → 「已安装」→ **dsh-chat-ux**）上的表单不是自己发明的样式，用的是 dsh 自己的设计语言：

- 颜色全部来自 `--dsw-*` 主题令牌，深浅色主题自动跟随，没有第二套规则；
- 字段节奏（label 13px/500、提示 12px 三级色、输入框 34px 高 / 8px 圆角 / 0.5px 边框 / `bg-layer-3`）与表单底部的保存按钮，都与 dsh 随附的插件配置页一致；
- 「已覆盖」徽标复用 `@deepseek-ai/dsh-client-ui-primitives` 的 `Tag`（`tone="neutral"`）——按 dsh 的约定，插件之间不能互相导入组件，可共享的控件只住在这个包里。

这些平台包由浏览器模块加载器从它冻结的基座模块表提供，所以 `platform-modules.d.ts` 只是给编译器看的窄声明，不需要安装它们。

## 渐变速度

速度由设置命名空间 `dsh-chat-ux` 的 `revealMs` 决定，默认 120 ms，允许 30–600 ms。

上限不是随便定的：`styles.ts` 编译期就生成了 96 条档位规则，时长越长每档跨度越大；600 ms 摊到 96 档是 6.25 ms 一档，仍在 144 Hz 的一帧之内，再长就会看出台阶。

在 dsh 里改：

1. 侧栏 **插件** → 「已安装」里的 **dsh-chat-ux**；
2. 包说明下方的**渐变时长**输入框里改数字；
3. 点**保存**。值写进 `$DSH_HOME/settings.yaml` 的 `dsh-chat-ux:` 分节，下一次出字立即生效——不需要重启、也不需要刷新页面。

「已覆盖」徽标表示用户层里有这个字段；旁边的**重置**会清掉它，让取值退回默认层。

不经过界面也可以，直接写 profile 的 `cordis.patch.yml`（这是按 id 覆盖组合配置，不要再写一遍 `insert`）：

```yaml
- id: dsh-chat-ux
  config:
    revealMs: 240
```

改完重启 dsh 生效。界面里保存的值属于用户层，会盖过这里的 base 值。

## 命令

```sh
pnpm install        # 依赖（.npmrc 已指向 npmmirror）
npm run build       # clean + 两侧编译 + 包装 client bundle
npm run typecheck   # 只做类型检查
```

## 改完怎么生效

| 改了哪一侧 | 生效方式 |
|---|---|
| client 半（`src/client/`） | `npm run build`，然后刷新页面（Ctrl+F5） |
| host 半（`src/index.ts`） | `npm run build`，然后**重启 dsh** |
| 只改设置里的值 | 不用构建，保存即生效 |

装成本地链接（`link:`）的 profile 会直接拿到新产物，不用重装。

## 本地加载

**源码 overlay（改 host 半免构建）**

```sh
dsh web --patch ./cordis.yml
```

注意 patch 里的插件路径必须能解析到**包本身**（client 半要靠包 manifest 里的 `dsh.client` 声明才会被组合进启动图），所以 `cordis.yml` 里的相对路径要按你的 profile 目录调整，或改用包名。

**装进 profile（走组合包路径，推荐）**

```sh
dsh plugin --profile web add <本工程绝对路径>
dsh --profile web --dump-config      # 确认出现 "# == dsh-chat-ux" 层
dsh web                              # 启动后刷新页面
```

装进桌面 App 的 `desktop` profile 时 `dsh plugin` 会被拒绝（那个 profile 由 Electron 应用独占管理），改在应用里的**插件 → 添加插件**填同一个绝对路径即可；它同样会把包加进依赖并自动对账 `dsh.profile.bundles`。

## 下一步

聊天区 UX 继续在 `src/client/` 里做：

1. 工具行、时间线等位置也可以用同一套 `conversation.chat.node` shadowing 替换（同 key、更低 priority 者渲染），气泡就是这么接管的。
2. 改完用 `npm run build` 重建。web profile 刷新页面即可；desktop profile 必须**重启 App**——Windows 下应用菜单被置空（`apps/desktop/src/main.ts`），Ctrl+F5 与 F5 都不生效。
