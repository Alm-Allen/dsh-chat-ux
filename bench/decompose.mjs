/**
 * 耗时与调用次数的对照分解。
 *
 * 只对照两个状态：原版（ab/A.js）与最终版（ab/FINAL.js）。
 * 两者都由 `setup-ab.mjs` 从 git 历史与当前构建重新生成，所以这个脚本可重复跑。
 */
import { run, selfCheck } from './bench.mjs'

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const pct = (a, b) => a === 0 ? (b === 0 ? '—' : '+∞') : ((b - a) / a * 100).toFixed(1) + '%'

const scenarios = [
  { label: '短消息',       turns: 40,  markdownNodes: 120, preGrowChars: 0 },
  { label: '长消息 20k',   turns: 40,  markdownNodes: 120, preGrowChars: 20000 },
  { label: '大会话 160轮', turns: 160, markdownNodes: 120, preGrowChars: 0 },
  { label: '文本节点 400', turns: 40,  markdownNodes: 400, preGrowChars: 0 },
  { label: '含容器增删',   turns: 40,  markdownNodes: 120, containerChurn: true },
]

const ROUNDS = 5

console.log('=== 自检 ===')
for (const [label, p] of [['原版', 'ab/A.js'], ['最终', 'ab/FINAL.js']]) {
  const sc = await selfCheck(p, { turns: 40, markdownNodes: 120, batches: 40 })
  console.log('  ' + label.padEnd(6) + (sc.ok ? 'PASS' : 'FAIL ' + JSON.stringify(sc.diffs)))
}
console.log('')

console.log('=== 原版 vs 最终（' + ROUNDS + ' 轮取中位）===')
console.log('')
for (const s of scenarios) {
  const bt = [], ot = []
  let b = null, o = null
  for (let i = 0; i < ROUNDS; i += 1) {
    b = await run('ab/A.js', { ...s, withPlugin: true }); bt.push(b.total)
    o = await run('ab/FINAL.js', { ...s, withPlugin: true }); ot.push(o.total)
  }
  console.log('  ' + s.label)
  console.log('    ' + '指标'.padEnd(22) + '原版'.padStart(10) + '最终'.padStart(10) + '变化'.padStart(10))
  const rows = [
    ['耗时 ms', Math.round(med(bt)), Math.round(med(ot))],
    ['querySelectorAll', b.querySelectorAll, o.querySelectorAll],
    ['getComputedStyle', b.getComputedStyle, o.getComputedStyle],
    ['createTreeWalker', b.createTreeWalker, o.createTreeWalker],
    ['createRange', b.createRange, o.createRange],
    ['node.data 读取', b.dataReads, o.dataReads],
    ['node.parentElement 读取', b.parentReads, o.parentReads],
  ]
  for (const [k, x, y] of rows) {
    console.log('    ' + k.padEnd(22) + String(x).padStart(10) + String(y).padStart(10) + pct(x, y).padStart(10))
  }
  console.log('')
}
