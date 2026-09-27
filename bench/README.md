# bench —— dsh-chat-ux 性能基准

## 为什么存在

改性能之前先量，免得反向优化。这里的基准**自身必须先确定**：每次运行都会自检，同一份产物连跑
两次，计数与逐帧区间必须逐位相同；自检不过就说明基准有问题，任何 A/B 结论都不成立。

## 怎么跑

```sh
cd bench
npm install --no-save jsdom     # 基准唯一的依赖
node setup-ab.mjs               # 生成对照产物（从 git 历史取原版 + 当前 dist）
node final-ab.mjs               # 自检 + 原版 vs 最终版对照
node final-equiv.mjs            # 严格逐帧行为等价验证
node decompose.mjs              # 各维度分解
```

对照产物（`ab/A.js` 原版、`ab/FINAL.js` 当前版）**不进仓库**：各约 200 KB，都能由
`setup-ab.mjs` 重新生成（原版从 `1a1ca65:dist/client.js` 取出，当前版复制 `dist/client.js`）。

## 测什么

**与引擎无关的调用次数**，以及耗时（只做相对对照）：

| 指标 | 含义 | 确定性 |
| --- | --- | --- |
| `querySelectorAll` | 全文档查询次数 | 确定 |
| `createTreeWalker` | 文本节点遍历次数 | 确定 |
| `createRange` | Range 创建次数 | 确定 |
| `getComputedStyle` | 强制样式结算次数 | 确定 |
| `node.data` 读取 | 文本数据属性读取次数 | 确定 |
| `node.parentElement` 读取 | 父元素属性读取次数 | 确定 |
| `total` | JS 执行时间（ms） | **有波动，只做相对对照** |

## 确定性从哪来（这是本基准最重要的部分）

三个坑都踩过，全部修好后基准才确定：

### 1. 时钟必须在整个逻辑帧内恒定

插件每个逻辑帧读两次 `performance.now()`：一次在 MutationObserver 微任务里（`scan`），
一次在 rAF 回调里（`paint`）。若在两者之间推进时钟，同一帧里就会看到两个时刻，差多少取决于
微任务被抽干的深度——同一份产物两次跑出不同档位。

`clock.mjs` 固定了顺序：**时钟先前进 → 抽干微任务 → 跑 rAF 队列 → flush 空闲队列**，
全帧共用一个时刻。

### 2. 插件的裸 `performance.now()` 必须指向假时钟

插件的代码里是裸的 `performance.now()`，它解析到 `globalThis.performance`。原先
`bindWindowGlobals` **刻意排除了** `performance`（因为把 jsdom 的 Performance 挂上去会无限递归），
于是插件读到的是 **Node 的真实时钟**，而 rAF 传入的是假时钟——年龄计算混用两个时钟。

修法：挂一个**普通对象**，其 `now` 委托给 `win.performance.now()`，不经过 jsdom 的实现，
所以不递归。

### 3. `requestIdleCallback` 不能映射到 `setTimeout`

jsdom 的定时器走**真实时间**，而基准推进假时钟，于是「空闲回调何时跑」不确定（实测造成 10 帧
抖动）。改为一条自己的队列，由 `win.__flushIdle()` 显式 flush。

## 已知偏差

1. **绝对耗时不可信**。jsdom 没有布局与绘制，毫秒数只反映 JS 执行。
2. **原生选择器引擎的代价测不出**。jsdom 的 `querySelectorAll` 是 JS 实现
   （`@asamuzakjp/dom-selector`），内部用 TreeWalker 遍历文档。真实 Chromium 用原生引擎，
   所以「DOM 越大查询越贵」的趋势在基准里被放大。
3. **`createRange` 比真实浏览器廉价**。适合相对对照，不适合换算绝对开销。
4. **只覆盖流式路径**。折叠、气泡起飞、插入符动效需要真实事件与布局。

## 用法的边界

适合回答「改动前后同一指标是否变化」，不适合回答「真实浏览器里快了多少毫秒」。
后者需要 DevTools Performance 录制——那需要浏览器控制权，不在本环境内。

## 一条实测得来的教训

**读得少不等于跑得快。** 有一个优化把 `node.parentElement` 的读取次数降低了 64%~89%，
但耗时反而增加 1.1%~7.5%——因为那次读取在浏览器里只是一次属性访问，省它反而要多付一份快照
身份比较。**任何优化都必须同时看「调用次数」与「耗时」，只降计数可能是负优化。**

## 文件

| 文件 | 作用 |
| --- | --- |
| `clock.mjs` | 确定性时钟与帧驱动（所有基准的地基） |
| `harness.mjs` | 按 DSH 真实属性名构造聊天 DOM；昂贵操作计数器 |
| `shims.mjs` | 补 jsdom 缺失的浏览器 API |
| `loader.mjs` | 用 DSH 客户端模块加载器的契约加载 `dist/client.js`；统一时钟 |
| `bench.mjs` | 流式场景 + 自检 + 计数 |
| `setup-ab.mjs` | 生成对照产物（原版从 git 历史取，当前版复制 dist） |
| `final-ab.mjs` | 权威对照（原版 vs 最终版） |
| `final-equiv.mjs` | 严格逐帧行为等价验证 |
| `decompose.mjs` | 各维度分解（耗时 / 调用次数 / 属性读取） |
| `ab/` | 对照产物，**不进仓库**，由 `setup-ab.mjs` 生成 |

## 已评估并否决的候选（别重复探索）

三项都用本基准实测过，结论是**不做**。记在这里，免得后来者再花时间。

### 合并 5 个 MutationObserver —— 否决

原本以为「每批 5 次全文档回调」。实测（200 批，160 轮 DOM）只有 **2 个** observer 真正被回调：

| observer | 回调次数 | 耗时 | 原因 |
| --- | --- | --- | --- |
| token-motion | 200 | 64.6 ms | 声明了 `characterData: true` |
| process-fold | 200 | 6.9 ms | 声明了 `characterData: true` |
| reasoning-fold | **0** | 0 | 未声明 characterData |
| follow-guard | **0** | 0 | 未声明 characterData |
| fold-glide | **0** | 0 | 未声明 characterData |

`characterData` 变化只回调声明了它的 observer。合并省不到任何回调，只会让分发逻辑复杂化。

### 增量文本快照 —— 收益仅 4.5%，风险高

`scan()` 每次 mutation 都重建整段文本快照（走完所有文本节点 + 拼接）。实测重建本身
只占墙钟 **4.5%**（5.7ms / 127.4ms）。即使完全消除也只降 4.5%，而正确实现增量快照的
复杂度很高。

### 减少 publishRunColor 的读取 —— 已最优

含 Markdown 闭合的场景下，profile 曾显示 `publishRunColor` 占 44.7%（864.5ms），
看着像大机会。实测后是**归因假象**：

| 场景 | 调用次数 | 总耗时 | 每次 |
| --- | --- | --- | --- |
| 纯追加 | 1 | 37.9 ms | **37.86 ms**（首次初始化 jsdom 样式系统） |
| 每 2 批闭合 | 51 | 25.2 ms | 0.49 ms |

101 个元素 **100% 只读一次**，可省的重复读取是 **0 次**。闭合场景的绝对耗时增长来自
jsdom 的 DOM 重排与样式解析，不是插件的调用模式。

**教训**：profile 的 inclusive 时间会把被调用方的环境开销算进来。看到一个大数时，
先直接测「那个操作单次多少钱、调用多少次」，再决定是否值得优化。