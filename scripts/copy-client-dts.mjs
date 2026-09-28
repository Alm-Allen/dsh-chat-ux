/**
 * 把客户端半区的入口声明放到 `dist/client.d.ts`。
 *
 * 为什么需要这一步：客户端产物必须包成加载器要求的 factory 形式，而 tsdown 的 banner/footer 会
 * 一起裹住声明产物，于是 `dist/client.d.ts` 开头变成加载器外壳、不再是合法模块（`tsc` 报
 * TS2306）。所以客户端那一半的声明改由裸 tsc 出（`tsconfig.client.json` 的 `outDir` 是
 * `build/client`），再由这里把入口那一份复制过去。
 *
 * `build/client/index.d.ts` 是自包含的（只 import 类型，没有相对引用），所以复制一份就够，
 * 不必连带整个目录——这与改动前 `dist/client.d.ts` 的形状一致。
 *
 * 用法：`npm run build:types`（已串在 `npm run build` 里）。
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'build', 'client', 'index.d.ts')
const to = join(root, 'dist', 'client.d.ts')

if (!existsSync(from)) {
  console.error('缺少 ' + from + '，先跑 tsc -p tsconfig.client.json --emitDeclarationOnly')
  process.exit(1)
}
mkdirSync(dirname(to), { recursive: true })
copyFileSync(from, to)
console.log('dist/client.d.ts <- build/client/index.d.ts')
