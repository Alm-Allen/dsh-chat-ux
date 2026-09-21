# dsh-chat-ux

面向 DeepSeek Harness（dsh）Web GUI 聊天区的 UX 优化插件。

当前状态：已实现 **API 响应的 token 淡入**（思考与正文都覆盖），渐变时长可以在 dsh 的**插件管理页**上调整。

## 工程结构

```
src/index.ts               host 半：Node 侧入口，注册设置命名空间
src/client/index.tsx       client 半：浏览器入口，聊天区 UX 写在这里
src/client/token-motion.ts token 淡入：diff 新增文本并驱动透明度档位
src/client/styles.ts       聊天区样式表 + 透明度档位规则（纯文本，内联进 bundle）
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

流式回复里**新出现的每个字符**先淡后实：到达时是 70% 不透明的正文色，然后逐渐变成完全不透明并保持静止。思考（reasoning）与正文都覆盖——两者渲染在同一个 Markdown 层里，也都落在该层流式期间标记的容器（`[data-streaming]`）内，所以一处安装即可。

实现走 **CSS Custom Highlight API**（`CSS.highlights` + `::highlight()`）：用 Range 标记字符区间，**不改动 DOM**。这一点是硬约束——聊天记录由 React 掌管，而官方 Markdown 层不暴露任何节点渲染钩子（它的 `MarkdownDelegate` 只管链接导航），包裹 `<span>` 会和 reconciliation 打架。

每个字符**只管自己的淡入**：它到达时最淡，然后按自己的到达时间变实，字符之间没有错峰、也不排队等待。同一批到达的字符一起淡、一起实；阅读顺序来自 API 的到达顺序，而不是插件发明的顺序。

`::highlight()` 接受不了 `opacity`——它的属性集很小（color、background-color、各种 text-decoration、text-shadow），所以透明度只能挂在 `color` 的 alpha 通道上。这正是 `color-mix(in srgb, C p%, transparent)` 的语义：与 `transparent` 混合会把结果的 alpha 按 `p` 加权，色相不变。

`::highlight()` 同样不接受 transition，所以渐变是**分档**的：`token-motion.ts` 按存活时长把区间分到 32 个档位，`styles.ts` 为每个档位生成一条规则，从 70% 一路走到 100%，每档 1%。

颜色端点仍是显式变量，不用 `currentColor`：

```css
body {
  --dsh-chat-ux-token-settle: var(--dsw-alias-label-primary, #0f1115);
}

body[data-ds-dark-theme] {
  --dsh-chat-ux-token-settle: var(--dsw-alias-label-primary, #f9fafb);
}
```

**为什么不用 `currentColor`**：`::highlight()` 里的 `currentColor` 在 Chromium 中不解析为承载元素自己的颜色，而是塌缩成初始色。实测（`rgb(21, 21, 23)` 画布 + `color-scheme: dark`）只以 `currentColor` 为色的规则画在 `rgb(0, 0, 0)`——在深色画布上不可见，表现为每个字符在 highlight 撤销前闪一下黑。浅色画布上看不出这个塌缩，因为那里的正文色（`rgb(15, 17, 21)`）本来就是黑。所以改用显式变量，并在两套主题下各校准一次。

想换起始透明度就改 `token-motion.ts` 顶部的 `TOKEN_MIN_OPACITY`（默认 0.7）。

行为细节：

- 只处理**流式容器**内的变化，历史消息与已完成回复不会重播。
- 首次见到某容器只记录基线，不追溯已显示的内容。
- Markdown 重解析导致的大幅改写（超过 200 字符）视为重排而非新增，不产生动效。
- 尊重 `prefers-reduced-motion: reduce`；引擎不支持 Highlight API 时静默降级（返回空 disposer）。

## 配置卡片

插件管理页（侧栏 **插件** → 「已安装」→ **dsh-chat-ux**）上的表单不是自己发明的样式，用的是 dsh 自己的设计语言：

- 颜色全部来自 `--dsw-*` 主题令牌，深浅色主题自动跟随，没有第二套规则；
- 字段节奏（label 13px/500、提示 12px 三级色、输入框 34px 高 / 8px 圆角 / 0.5px 边框 / `bg-layer-3`）与表单底部的保存按钮，都与 dsh 随附的插件配置页一致；
- 「已覆盖」徽标复用 `@deepseek-ai/dsh-client-ui-primitives` 的 `Tag`（`tone="neutral"`）——按 dsh 的约定，插件之间不能互相导入组件，可共享的控件只住在这个包里。

这些平台包由浏览器模块加载器从它冻结的基座模块表提供，所以 `platform-modules.d.ts` 只是给编译器看的窄声明，不需要安装它们。

## 渐变速度

速度由设置命名空间 `dsh-chat-ux` 的 `revealMs` 决定，默认 150 ms，允许 30–600 ms。

上限不是随便定的：`styles.ts` 编译期就生成了 32 条档位规则，时长越长每档跨度越大；600 ms 时一档约等于一个显示帧，再长就会看出台阶。

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

1. 行内 code、链接在淡入期间也会被涂成正文色（highlight 的 `color` 会替换元素自己的颜色），淡入结束时会跳回它们本来的颜色；要消除就得给它们各自的 settle 变量。
2. 若要覆盖官方渲染器管不到的位置（工具行、时间线等），再考虑 `conversation.chat.node` 槽位的 shadowing 替换（同 key、更低 priority 者渲染）。
3. 改完用 `npm run build` 重建，刷新页面验证。
