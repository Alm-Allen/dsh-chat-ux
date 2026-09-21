# dsh-chat-ux

面向 DeepSeek Harness（dsh）Web GUI 聊天区的 UX 优化插件。

当前状态：已实现 **API 响应的 token 一次性渐变动效**（思考与正文都覆盖）。

## 工程结构

```
src/index.ts               host 半：Node 侧入口，由 bundle patch 挂载
src/client/index.tsx       client 半：浏览器入口，聊天区 UX 写在这里
src/client/token-motion.ts token 渐变动效：diff 新增文本并驱动高亮档位
src/client/styles.ts       聊天区样式表 + 渐变档位规则（纯文本，内联进 bundle）
scripts/wrap-client.cjs    把 tsc 的 CommonJS 产物包成 DSH 的 client bundle
cordis.patch.yml           组合包层：按包名 insert 一行（安装后走这个）
cordis.yml                 源码 overlay：按路径 insert 一行（本地 --patch 调试用）
tsconfig.json              host 半编译配置（NodeNext -> dist/）
tsconfig.client.json       client 半编译配置（CommonJS -> build/client/）
```

## 两条产物

dsh 的插件分两侧加载，本工程两侧都有：

- **host 半** — `exports["."]` -> `dist/index.js`。Node 侧，由 `cordis.patch.yml` 里的行按包名加载。
- **client 半** — `exports["./client"]` -> `dist/client.js`。因为 package.json 声明了 `dsh.client`，宿主会把这一项组合进浏览器启动图。

client 产物必须是**单个自包含文件**：浏览器模块加载器不给插件 client 提供相对 require，也没有资源 URL。它只认 `window.__ModuleLoader__.load({ id, factory })` 协议，factory 拿到一个绑定到加载器模块表的 `require`（react 与平台 client 包都在里面），并返回插件的 exports。

所以 `scripts/wrap-client.cjs` 做两件事：把 `src/client/` 内部所有相对 require 递归内联成一份模块表（源码可以正常拆多文件），非相对 require（react、`@deepseek-ai/*`）则原样留给加载器；最后包成协议要求的形状，并在写盘前做一次语法门禁。

## token 渐变动效

流式回复里**新出现的每个字符**亮一次，然后渐变回正文自身的颜色并保持静止。思考（reasoning）与正文都覆盖——两者渲染在同一个 Markdown 层里，也都落在该层流式期间标记的容器（`[data-streaming]`）内，所以一处安装即可。

实现走 **CSS Custom Highlight API**（`CSS.highlights` + `::highlight()`）：用 Range 标记字符区间，**不改动 DOM**。这一点是硬约束——聊天记录由 React 掌管，而官方 Markdown 层（`@deepseek-ai/dsh-client-ui-primitives`）不暴露任何节点渲染钩子（它的 `MarkdownDelegate` 只管链接导航），包裹 `<span>` 会和 reconciliation 打架。

每个字符**只管自己的渐变**：它到达时亮一次，然后按自己的到达时间淡回正文色，字符之间没有错峰、也不排队等待。同一批到达的字符一起亮、一起落；阅读顺序来自 API 的到达顺序，而不是插件发明的顺序。一个字符自始至终只有一种颜色，不做横扫。

因为 `::highlight()` 不接受 transition，渐变是**分档**的：`token-motion.ts` 按存活时长把区间分到 32 个档位，`styles.ts` 为每个档位生成一条 `color-mix()` 规则。渐变两端都是显式颜色变量，深浅色各一套：

```css
body {
  --dsh-chat-ux-token-highlight: var(--dsw-static-deepseek-500, #4d6bfe);
  --dsh-chat-ux-token-settle:    var(--dsw-alias-label-primary, #0f1115);
}

body[data-ds-dark-theme] {
  --dsh-chat-ux-token-highlight: var(--dsw-static-deepseek-200, #b9c6ff);
  --dsh-chat-ux-token-settle:    var(--dsw-alias-label-primary, #f9fafb);
}
```

**终点为什么不用 `currentColor`**：`::highlight()` 里的 `currentColor` 在 Chromium 中不解析为承载元素自己的颜色，而是塌缩成初始色。实测（`rgb(21, 21, 23)` 画布 + `color-scheme: dark`）只以 `currentColor` 为终点的规则落在 `rgb(0, 0, 0)`——在深色画布上不可见，表现为每个字符在 highlight 撤销前闪一下黑。浅色画布上看不出这个塌缩，因为那里的正文色（`rgb(15, 17, 21)`）本来就是黑。所以终点改用显式变量，并在两套主题下各校准一次。

可调参数都在 `token-motion.ts` 顶部：

| 参数 | 默认 | 作用 |
|---|---|---|
| `REVEAL_MS` | 150 | 一次渐变的总时长，越小越快 |
| `REVEAL_STEPS` | 32 | 颜色档位数，约等于帧数即可；越多越平滑 |

行为细节：

- 只处理**流式容器**内的变化，历史消息与已完成回复不会重播。
- 首次见到某容器只记录基线，不追溯已显示的内容。
- Markdown 重解析导致的大幅改写（超过 200 字符）视为重排而非新增，不产生动效。
- 尊重 `prefers-reduced-motion: reduce`；引擎不支持 Highlight API 时静默降级（返回空 disposer）。

## 命令

```sh
pnpm install        # 依赖（.npmrc 已指向 npmmirror）
npm run build       # clean + 两侧编译 + 包装 client bundle
npm run typecheck   # 只做类型检查
```

## 调参并生效

所有旋钮都在 `src/client/token-motion.ts` 顶部（见上表）。改完三步：

```sh
# 1. 按上表改参数，例如 REVEAL_MS = 120 让它更快
# 2. 在插件目录重建产物
cd C:/Study/typescript/deepseek-harness-chat-ux
npm run build
# 3. 在浏览器里硬刷新 dsh web 页面（Ctrl+F5）
```

只改 client 半（渐变时长、颜色、档位数）**不用重启** `dsh web`，刷新页面就够了；只有改到 host 半才需要重启。

顺带一提，`npm run typecheck` 能在不重建的情况下先查类型。

## 本地加载

**源码 overlay（改 host 半免构建）**

```sh
dsh web --patch ./cordis.yml
```

注意 patch 里的插件路径必须能解析到**包本身**（client 半要靠包 manifest 里的 `dsh.client` 声明才会被组合进启动图），所以 `cordis.yml` 里的相对路径要按你的 profile 目录调整，或改用包名。

**装进 profile（走组合包路径，推荐）**

```sh
dsh plugin --profile <name> add <本工程绝对路径>
dsh --profile <name> --dump-config      # 确认出现 "# == dsh-chat-ux" 层
dsh --profile <name> web                # 启动后刷新页面
```

## 下一步

聊天区 UX 继续在 `src/client/` 里做：

1. 非正文元素（行内 code、链接）目前同样淡回正文色，渐变结束时会跳回自己的颜色；要消除就得给它们各自的 settle 变量。
2. 若要覆盖官方渲染器管不到的位置（工具行、时间线等），再考虑 `conversation.chat.node` 槽位的 shadowing 替换（同 key、更低 priority 者渲染）。
3. 改完用 `npm run build` 重建，刷新页面验证。
