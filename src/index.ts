/**
 * dsh-chat-ux —— 后端。
 *
 * 聊天区本身由前端渲染（见 `src/client/`），DSH 之所以从 `exports["./client"]` 加载它，
 * 是因为这个包声明了 `dsh.client`。这一半做两件事：
 *
 * 1. 让这一行存在。设置服务把 `Config` 里标了 `.volatile()` 的字段投影成表单，值由前端通过
 *    自己的 config form 读写，host 侧不看这些值——它们的消费者全在浏览器里。
 * 2. 把包内 `assets/fonts/` 的字体子集挂到 dsh 的 web 服务器上。前端那几条 `@font-face` 从
 *    `/dsh-chat-ux/fonts/<file>` 取字，所以装插件的人不必自己装字体。Web 与桌面 App 是同一个
 *    页面：桌面 App 把 `dsh-app://app/` 下不属于 shell 的路径原样转发给 Host，两边同一条路径。
 *
 * 没有 web 服务器（例如 headless）时这里什么都不注册，前端会落到字体栈里的系统字体。
 *
 * @module dsh-chat-ux
 */
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

// 报给加载器的插件名；同时也是这一行在 profile 里的条目 id。
export const name = 'dsh-chat-ux'

/**
 * 前端绑定 config form 用的那个字符串。设置服务按 **profile 条目 id** 标识一份表单，而这个 id 就是
 * 上面那个插件名，所以前后端必须一字不差地拼出它。
 */
export const SETTINGS_NAMESPACE = 'dsh-chat-ux'

// 一个被揭开的字符回到文字本色所用的默认时长。
export const DEFAULT_REVEAL_MS = 120

/**
 * 渐变时长的边界。前端会 clamp 到同一个范围，所以直接写进 profile patch 的值也没法
 * 要求一个分档的 highlight 规则采样不出来的渐变：在 `MAX_REVEAL_MS` 上，一档仍然能撑约一显示帧。
 */
export const MIN_REVEAL_MS = 30
export const MAX_REVEAL_MS = 600

/**
 * 内嵌字体对外的路径前缀。前端 `client/font-styles.ts` 里有同一个字符串，改一处就要改另一处。
 */
export const FONT_ROUTE_PATH = '/dsh-chat-ux/fonts'

// 这个插件拥有的配置字段。
export interface Config {
  // 一个刚揭开的字符从高亮色淡回文字本色所用的时长。越小越快。
  revealMs: Volatile<number>
}

/**
 * 这一行的配置 schema。`.volatile()` 是设置表单的前提：设置服务只投影标了它的字段，也只会为带
 * volatile 字段的条目暴露一份表单，插件管理页正是靠这一点才认得这个条目。
 */
export const Config = Schema.object({
  revealMs: Schema.number().min(MIN_REVEAL_MS).max(MAX_REVEAL_MS).default(DEFAULT_REVEAL_MS).volatile(),
})

/**
 * host 侧入口。
 * @param ctx - host 根 context。
 */
export function apply(ctx: Context): void {
  console.log('[dsh-chat-ux] host half loaded')
  // 等 web 服务器出现再挂字体：它在 profile 里是另一行，不一定比这一行先激活。没有它的组合
  // （例如 headless）里这段回调不会跑，字体取不到，插件其余部分照常工作。
  ctx.inject(['webServer'], (scope) => {
    const webServer = scope.get('webServer') as WebServerLike
    scope.effect(() => webServer.register({ kind: 'prefix', path: FONT_ROUTE_PATH, handler: serveFont }),
      'dsh-chat-ux: embedded fonts')
  })
}

/** 包内字体目录。host 产物在 `dist/`，所以从这里回到包根。 */
const FONT_DIRECTORY = fileURLToPath(new URL('../assets/fonts/', import.meta.url))

/**
 * 能被请求到的字体文件。用白名单而不是拼路径：请求里的任何一段都不该进文件系统。
 * 文件名与 `scripts/subset-fonts.py` 的产物、前端 `font-styles.ts` 的 URL 三者一致。
 */
const FONT_FILES = new Set([
  'harmonyos-sans-sc-regular.woff2',
  'harmonyos-sans-sc-medium.woff2',
  'harmonyos-sans-sc-bold.woff2',
  'maple-mono-nf-cn-regular.woff2',
  'maple-mono-nf-cn-bold.woff2',
])

/**
 * dsh 的 webServer 服务（`@deepseek-ai/dsh-host-webserver`）在本文件用到的那一部分。
 * 这个包不依赖 dsh 的任何包，所以只按形状取它。
 */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

/** 把一份字体子集写进响应。 */
const serveFont = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  const fileName = pathname.slice(FONT_ROUTE_PATH.length + 1)
  if (!FONT_FILES.has(fileName)) {
    response.writeHead(404).end()
    return
  }
  const file = join(FONT_DIRECTORY, fileName)
  // 文件读不到就当 404：这条路由只服务包内固定的几份字，缺了就是没生成或没随包发出。
  const info = await stat(file).catch(() => null)
  if (info === null) {
    response.writeHead(404).end()
    return
  }
  const etag = '"' + String(info.size) + '-' + String(Math.round(info.mtimeMs)) + '"'
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304).end()
    return
  }
  response.writeHead(200, {
    'content-type': 'font/woff2',
    'content-length': String(info.size),
    // 重新生成子集时文件名不变，所以留一天而不是 immutable。
    'cache-control': 'public, max-age=86400',
    etag,
  })
  createReadStream(file).pipe(response)
}
