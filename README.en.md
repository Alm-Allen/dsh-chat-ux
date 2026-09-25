# dsh-chat-ux

English | [中文](./README.md)

A chat-area UX plugin for the [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) web GUI.

With it installed, model output fades in token by token instead of appearing in blocks, reasoning rows fold themselves away when thinking ends, process groups open and close on their own—and none of it ever yanks a reader who scrolled away.

## What it does

- **Token fade-in**: every token fades in, for both reasoning and answer text.
- **Self-folding reasoning rows**: a reasoning row expands while thinking and folds when it ends; once you touch it yourself, it stops moving.
- **Self-folding process groups**: a process group expands when a tool call starts and folds when that stretch ends, with a roller-blind transition in both directions.
- **Enhanced follow**: at the moments content jumps—thinking ends, a tool call appears—a reader parked at the bottom is handed back to dsh's own follow. If you scrolled away yourself, it stays out of your way.
- **Group follow**: inside height-capped process groups (standard / compact), reasoning and tool output keep up, scrolling vertically only.
- **File change rows**: write / edit calls inside `run_code` show their diff lines right in the chat area.
- **Bundled fonts**: HarmonyOS Sans SC for text and Maple Mono NF CN for code, shipped with the plugin—nothing to install, same type on both ends.
- **Caret motion**: the input caret slides, 80 ms, whether you type, arrow around, or click.
- **Send flight**: after you submit, the bubble rises from the composer into the transcript; 200 ms by default, adjustable on the plugins page.

## Install

In the dsh web GUI, open **Plugins** → **Add plugin** and enter the package name:

```
@alm-allen/dsh-chat-ux
```

Or from the command line (this forwards to pnpm inside the profile directory):

```sh
dsh plugin --profile web add @alm-allen/dsh-chat-ux
```

Restart dsh and reload the page. To remove it, use the plugin page or:

```sh
dsh plugin --profile web remove @alm-allen/dsh-chat-ux
```

### Install from the GitHub repository

You can also install straight from the repository — the build output is committed, so no build approval is required:

```sh
dsh plugin --profile web add github:Alm-Allen/dsh-chat-ux
```

Pin it to a commit so later pushes cannot change what you installed:

```sh
dsh plugin --profile web add github:Alm-Allen/dsh-chat-ux#<commit-sha>
```

## Configuration

Every switch lives on the plugin's own row on the **Plugins** page:

| Option | Default | Meaning |
| --- | --- | --- |
| Enhanced follow | on | When off, a bottom-parked reader is no longer handed back to dsh's follow at thinking-end / tool-call moments. |
| Group follow | follows "Enhanced follow" | Not a row of its own: the card has one "Enhanced follow" switch, which also governs whether reasoning and tool output keep up inside height-capped process groups. |
| Caret motion | always | Three steps: off / on move / always. |
| Send flight duration | 200 | How long the bubble's rise takes, a whole number of milliseconds from 80 to 1200. |
| Bundled fonts | on | When off, the system font stack is used. |
| Custom text font | empty | Your own font stack, overriding the bundled text font. |
| Custom mono font | empty | Same, for the bundled code font. |

## Compatibility

- Developed and verified on dsh 0.1.7-rc.2.
- Node `^22.19.0 || >=24.0.0`.

## About this repository

This repository carries the plugin's source and release notes. Build scripts and internal design docs are not part of it, so a fresh clone cannot run `npm run build`; install the package from npm instead.

## License

[MIT](./LICENSE)
