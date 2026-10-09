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
- **File change rows**: write / edit calls inside `run_code` show their diff lines right in the chat area For direct calls, the path, input size and `+n -m` appear while the arguments are still streaming, with `+n` growing as the content arrives (this stretch is marked beta and off by default; turn it on on the Plugins page).
- **Bundled fonts**: HarmonyOS Sans SC for text and Maple Mono NF CN for code, shipped with the plugin—nothing to install, same type on both ends.
- **Caret motion**: the input caret slides, 80 ms, whether you type, arrow around, or click. It covers the main composer, the answer box of a question card, and the inline editor for queued messages (the one you use for follow-ups to a running subagent).
- **Chat bubble motion** (on by default): the composer lifts off when you submit—its toolbar shrinks into the corners and fades, the card narrows into the bubble while the text re-wraps to fit—and lands in the transcript; the run is a fixed 300 ms. It runs entirely on the compositor, so it keeps its frame rate even while dsh's main thread is busy with the send.
- **Work details default to Standard**: on the web client, dsh's "Work details" setting is filled in as **Standard** (dsh's own web default is Detailed). Once you pick a mode yourself under Settings → **General**, your choice wins and the plugin leaves it alone.
- **Cache-hit rate**: the pill under the composer keeps one decimal, and its colour walks a six-stop ramp from 90% to 99% — red below 90, deep green at 99 and above. When the reading changes, the digits that changed roll to their new values (220 ms, lower digits starting later); a switch on the Plugins page turns it off.
- **Context occupancy as a pie**: the ring becomes a solid 20px pie on a 20%–40% ramp (green below 20, red at 40 and above), with the reading in the same colour. The occupied slice is cut along a fold line pivoted at the centre: by default the slice slides out along the bisector, and the gap between the two pieces is a constant 1.2px wide; switch it to "cut only" on the Plugins page and both pieces stay put — close the cut and you have the whole circle back. The percentage beside it rolls too.
- **Composer glass** (on by default): the input card keeps its own blue gradient — the same two-ends-tinted, middle-clear shape DSH uses on its sidebar — lets just under a tenth of it through, and adds a light blur plus a top highlight, an inner rim and a bottom inner shadow. The send button (stop while it runs) wears the same material. The stats row below and the cards above are untouched, and the fade band above it still fades to the canvas colour. A switch on the Plugins page turns it off.

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
| Automatic folding | on | When off, reasoning rows and process groups stop opening and closing on their own; clicking still works. |
| Token fade-in | on | When off, new text appears immediately. If the page stutters noticeably alongside other plugins, turn this off. |
| Caret motion | always | Three steps: off / on move / always. |
| Chat bubble motion | on | When off, the send has no flight and the message simply appears. |
| Cache-hit reels | on | When off, a changed rate swaps instantly. |
| Slice pulled out | on | When off, the slice stays in place and only the cut remains. |
| Composer glass | on | When off, the composer and the send button both go back to dsh's own look, and nothing behind it is blurred. |
| Bundled fonts | on | When off, the system font stack is used. |
| Text font | empty | Your own font stack, overriding the bundled text font. |
| Code font | empty | Same, for the bundled code font. |

"Work details" is not on the plugin card: it lives in dsh's own Settings → **General**, and the plugin only fills in Standard while you have not chosen a mode yourself.

## Compatibility

- Developed and verified on dsh 0.2.1-alpha.1.
- Node `^22.19.0 || >=24.0.0`.

## About this repository

This repository carries the plugin's source and release notes. Build scripts and internal design docs are not part of it, so a fresh clone cannot run `npm run build`; install the package from npm instead.

Every release is recorded in [CHANGELOG.md](./CHANGELOG.md) — the tag-triggered workflow takes the release notes out of it.

## License

[MIT](./LICENSE)
