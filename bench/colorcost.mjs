import { run, selfCheck } from './bench.mjs'

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const pct = (a, b) => a === 0 ? (b === 0 ? '—' : '+∞') : ((b - a) / a * 100).toFixed(1) + '%'

const scenarios = [
  { label: '短消息',       turns: 40,  markdownNodes: 120, preGrowChars: 0 },
  { label: '大会话 160轮', turns: 160, markdownNodes: 120, preGrowChars: 0 },
  { label: '文本节点 400', turns: 40,  markdownNodes: 400, preGrowChars: 0 },
  { label: '含容器增删',   turns: 40,  markdownNodes: 120, containerChurn: true },
]

const ROUNDS = 7

console.log('=== 自检 ===')
for (const [label, p] of [['NOCACHE', 'ab/NOCACHE.js'], ['CURRENT(带缓存)', 'ab/CURRENT.js']]) {
  const sc = await selfCheck(p, { turns: 40, markdownNodes: 120, batches: 40 })
  console.log('  ' + label.padEnd(18) + (sc.ok ? 'PASS' : 'FAIL'))
}
console.log('')

console.log('=== 颜色缓存的真实贡献（' + ROUNDS + ' 轮取中位）===')
console.log('  A = NOCACHE（每次读，原版语义）   B = CURRENT（带缓存）')
console.log('')
console.log('  ' + '场景'.padEnd(14) + 'A 每次读'.padStart(11) + 'B 带缓存'.padStart(11) + '  缓存贡献'.padStart(11) + '  A的gcs'.padStart(9) + '  B的gcs'.padStart(8))
for (const s of scenarios) {
  const A = [], B = []
  let a = null, b = null
  for (let i = 0; i < ROUNDS; i += 1) {
    a = await run('ab/NOCACHE.js', { ...s, withPlugin: true }); A.push(a.total)
    b = await run('ab/CURRENT.js', { ...s, withPlugin: true }); B.push(b.total)
  }
  const am = med(A), bm = med(B)
  console.log('  ' + s.label.padEnd(14) +
    (am.toFixed(0) + 'ms').padStart(11) +
    (bm.toFixed(0) + 'ms').padStart(11) +
    pct(am, bm).padStart(11) +
    String(a.getComputedStyle).padStart(9) +
    String(b.getComputedStyle).padStart(8))
}
