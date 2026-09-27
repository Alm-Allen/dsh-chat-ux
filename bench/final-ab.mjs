import { run, selfCheck, DEFAULT_SCENARIO } from './bench.mjs'

const scenarios = [
  { label: '短消息(120节点)',     turns: 40,  markdownNodes: 120, preGrowChars: 0 },
  { label: '长消息(120节点,20k)', turns: 40,  markdownNodes: 120, preGrowChars: 20000 },
  { label: '大会话(160轮)',       turns: 160, markdownNodes: 120, preGrowChars: 0 },
  { label: '文本节点 400',        turns: 40,  markdownNodes: 400, preGrowChars: 0 },
  { label: '含容器增删',          turns: 40,  markdownNodes: 120, containerChurn: true },
]

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const pct = (a, b) => a === 0 ? (b === 0 ? '—' : '+∞') : ((b - a) / a * 100).toFixed(1) + '%'

console.log('=== 自检（基准必须确定）===')
const sc = await selfCheck('ab/FINAL.js', { ...DEFAULT_SCENARIO, countRanges: true })
console.log('  ' + (sc.ok ? 'PASS 计数与逐帧区间完全确定' : 'FAIL ' + JSON.stringify(sc.diffs)))
console.log('')

console.log('=== 原版 vs 最终版（5 轮取中位）===')
console.log('')
for (const s of scenarios) {
  const bt = [], ot = []
  let b = null, o = null
  for (let i = 0; i < 5; i += 1) {
    b = await run('ab/A.js', { ...s, withPlugin: true }); bt.push(b.total)
    o = await run('ab/FINAL.js', { ...s, withPlugin: true }); ot.push(o.total)
  }
  console.log('  ' + s.label)
  console.log('    ' + '指标'.padEnd(20) + '原版'.padStart(10) + '最终'.padStart(10) + '变化'.padStart(10))
  const rows = [
    ['耗时 ms', Math.round(med(bt)), Math.round(med(ot))],
    ['querySelectorAll', b.querySelectorAll, o.querySelectorAll],
    ['getComputedStyle', b.getComputedStyle, o.getComputedStyle],
    ['createRange', b.createRange, o.createRange],
    ['node.data 读取', b.dataReads, o.dataReads],
    ['parentElement 读取', b.parentReads, o.parentReads],
  ]
  for (const [k, x, y] of rows) {
    console.log('    ' + k.padEnd(20) + String(x).padStart(10) + String(y).padStart(10) + pct(x, y).padStart(10))
  }
  console.log('')
}
