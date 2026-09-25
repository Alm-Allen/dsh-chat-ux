# dsh-chat-ux

[English](./README.en.md) | 中文

面向 [DeepSeek Harness（dsh）](https://github.com/deepseek-ai/deepseek-harness) Web GUI 聊天区的 UX 优化插件。

装好之后，聊天区里模型吐字不再是整段闪现、思考行不会一直杵在那儿、过程组该开的时候开该收的时候收——而读者自己滚到哪里，都不会被动画抢回去。

## 它做了什么

- **token 淡入**：模型的输出按 token 淡入，思考与正文都覆盖。
- **思考行自动开合**：思考时自动展开，这段思考结束就收起；读者自己动过手，就不再打扰。
- **过程组自动开合**：工具调用开始自动展开，这一段跑完再收起，展开收起都走一道卷帘门过渡。
- **增强跟随**：思考结束、工具调用出现这些"内容要跳"的时刻，把贴底的读者交还给 dsh 的跟随；读者自己滚动离开底部时一概不插手。
- **组体跟随**：标准／简洁档里被限高的过程组，思考与工具输出照样不掉队，组体只滚纵向。
- **文件变更行**：`run_code` 里 write / edit 的改动，diff 行直接显示在聊天区。
- **自带字体**：正文 HarmonyOS Sans SC、等宽 Maple Mono NF CN，随插件一起发出，装插件的人不必自己装字体，两端看到的也是同一套字。
- **插入符动效**：输入框的光标会滑过去，打字、方向键、点击都算，80 ms。

## 安装

在 dsh Web GUI 里打开**插件**页 →**添加插件**→ 输入包名：

```
@alm-allen/dsh-chat-ux
```

或者直接走命令行（等价于在 profile 目录里执行 pnpm）：

```sh
dsh plugin --profile web add @alm-allen/dsh-chat-ux
```

装完重启 dsh、刷新页面即可。卸载用插件页的开关，或：

```sh
dsh plugin --profile web remove @alm-allen/dsh-chat-ux
```

### 从 GitHub 仓库安装

也可以直接从仓库装 —— 仓库里带了构建产物，所以不需要任何构建授权：

```sh
dsh plugin --profile web add github:Alm-Allen/dsh-chat-ux
```

想锁死到某个 commit（后续推送就改不了你装到的东西）：

```sh
dsh plugin --profile web add github:Alm-Allen/dsh-chat-ux#<commit-sha>
```

## 配置

插件装好后，在**插件**页的这一行上可以直接改：

| 项 | 默认 | 说明 |
| --- | --- | --- |
| 增强跟随 | 开 | 关掉后，思考结束与工具调用出现时不再把读者交还给 dsh 的跟随。 |
| 组体跟随 | 随上一项 | 同一开关，控制限高过程组里思考与工具输出是否掉队。 |
| 插入符动效 | 无论何时 | 三档：关／移动时／无论何时。 |
| 自带字体 | 开 | 关掉后走系统字体栈。 |
| 自定义正文字体 | 空 | 填自己的字体栈，覆盖自带的正文字体。 |
| 自定义等宽字体 | 空 | 同上，覆盖等宽的编码字体。 |

## 兼容性

- 在 dsh 0.1.7-rc.2 上开发与验证。
- Node `^22.19.0 || >=24.0.0`。

## 关于本仓库

这里是插件的源码与发行说明。构建脚本、内部设计文档不在本仓库内，因此 clone 之后不能直接 `npm run build`；需要用插件请直接安装 npm 上的包。

## 许可

[MIT](./LICENSE)
