# dsh-chat-ux

English | [中文](./README.md)

A chat-area UX plugin for the [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) web GUI.

With it installed, model output fades in token by token instead of appearing in blocks, reasoning rows fold themselves away when thinking ends, process groups open and close on their own—and none of it ever yanks a reader who scrolled away.

## What it does

- **Token fade-in**: every token fades in, for both reasoning and answer text. Its cost stays inside the streaming message, so it doesn't add to other plugins' style or DOM work, and it steps aside while the main thread is already overloaded.
- **Self-folding reasoning rows**: a reasoning row expands while thinking and folds when it ends; once you touch it yourself, it stops moving.
- **Self-folding process groups**: a process group expands when a tool call starts and folds when that stretch ends, with a roller-blind transition in both directions. A row whose body holds several cards (`run_code`'s program plus its output) rolls as one blind, not card by card. Both share one "Automatic folding" switch on the Plugins page.
- **Enhanced follow**: at the moments content jumps—thinking ends, a tool call appears—a reader parked at the bottom is handed back to dsh's own follow. If you scrolled away yourself, it stays out of your way.
- **Group follow**: inside height-capped process groups (standard / compact), reasoning and tool output keep up, scrolling vertically only.
- **File change rows**: write / edit calls inside `run_code` show their diff lines right in the chat area.
- **Bundled fonts**: HarmonyOS Sans SC for text and Maple Mono NF CN for code, shipped with the plugin—nothing to install, same type on both ends.
- **Caret motion**: the input caret slides, 80 ms, whether you type, arrow around, or click. It covers the main composer, the answer box of a question card, and the inline editor for queued messages (the one you use for follow-ups to a running subagent).
- **Chat bubble motion** (on by default): the composer lifts off when you submit—its toolbar shrinks into the corners and fades, the card narrows into the bubble while the text re-wraps to fit—and lands in the transcript; the run is a fixed 300 ms. It runs entirely on the compositor, so it keeps its frame rate even while dsh's main thread is busy with the send.
- **Work details default to Standard**: on the web client, dsh's "Work details" setting is filled in as **Standard** (dsh's own web default is Detailed). Once you pick a mode yourself under Settings → **General**, your choice wins and the plugin leaves it alone.

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
| Automatic folding | on | When off, reasoning rows and process groups stop opening and closing on their own; clicking still works. |
| Group follow | follows "Enhanced follow" | Not a row of its own: the card has one "Enhanced follow" switch, which also governs whether reasoning and tool output keep up inside height-capped process groups. |
| Caret motion | always | Three steps: off / on move / always. |
| Chat bubble motion | on | When off, the send has no flight and the message simply appears. |
| Bundled fonts | on | When off, the system font stack is used. |
| Custom text font | empty | Your own font stack, overriding the bundled text font. |
| Custom mono font | empty | Same, for the bundled code font. |

"Work details" is not on the plugin card: it lives in dsh's own Settings → **General**, and the plugin only fills in Standard while you have not chosen a mode yourself.

## Compatibility

- Developed and verified on dsh 0.1.7-rc.2.
- Node `^22.19.0 || >=24.0.0`.

## About this repository

This repository carries the plugin's source and release notes. Build scripts and internal design docs are not part of it, so a fresh clone cannot run `npm run build`; install the package from npm instead.

## License

[MIT](./LICENSE)
