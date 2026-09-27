/**
 * 重新生成基准需要的两份产物。
 *
 * 为什么不把产物提交进仓库：`A.js`（原版）与 `FINAL.js`（当前版）各约 200 KB，而中间态还有
 * 七份、合计 1.7 MB。它们全都能从 git 历史与当前构建重新生成，没必要让仓库背这份体积。
 *
 * 用法（在 bench/ 下）：
 *
 *   node setup-ab.mjs
 *
 * 生成：
 *   ab/A.js       原版产物（从 BASE_COMMIT 的 dist/client.js 取出）
 *   ab/FINAL.js   当前产物（复制 ../dist/client.js）
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const abDir = join(here, 'ab')

/** 优化前的那个提交：本仓库最后一次「性能改动之前」的状态。 */
const BASE_COMMIT = '1a1ca65'

mkdirSync(abDir, { recursive: true })

/** 从某个提交取出 dist/client.js。 */
function extractFromHistory(commit, out) {
  const text = execFileSync('git', ['show', commit + ':dist/client.js'], {
    cwd: repo, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  })
  writeFileSync(out, text)
}

const aPath = join(abDir, 'A.js')
extractFromHistory(BASE_COMMIT, aPath)
console.log('已生成 ab/A.js        <- ' + BASE_COMMIT + ':dist/client.js')

const distPath = join(repo, 'dist', 'client.js')
if (!existsSync(distPath)) {
  console.error('缺少 ' + distPath + '，先在仓库根目录跑一次 npm run build')
  process.exit(1)
}
copyFileSync(distPath, join(abDir, 'FINAL.js'))
console.log('已生成 ab/FINAL.js    <- dist/client.js')
console.log('')
console.log('现在可以跑：node final-ab.mjs / node final-equiv.mjs / node decompose.mjs / node summary.mjs')
