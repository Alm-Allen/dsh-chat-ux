import { run, selfCheck } from './bench.mjs'

const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const pct = (a, b) => a === 0 ? (b === 0 ? '0%' : '新增') : ((b - a) / a * 100).toFixed(1) + '%'

const scenarios = [
  { label: '短消息',       turns: 40,  markdownNodes: 120, preGrowChars: 0 },
  { label: '长消息 20k',   turns: 40,  markdownNodes: 120, preGrowChars: 20000 },
  { label: '大会话 160轮', turns: 160, markdownNodes: 120, preGrowChars: 0 },
  { label: '文本节点 400', turns: 40,  markdownNodes: 400, preGrowChars: 0 },
  { label: '含容器增删',   turns: 40,  markdownNodes: 120, containerChurn: true },
]

const ROUNDS = 9

console.log('=== 三个状态：不装插件 / 原版 / 最终版 ===')
console.log('')
console.log('  ' + '场景'.padEnd(14) + '不装'.padStart(8) + '原版'.padStart(9) + '最终'.padStart(9) + '   插件净开销(原)'.padStart(16) + '   插件净开销(终)'.padStart(16) + '   插件自身降幅'.padStart(14))
for (const s of scenarios) {
  const t = {}
  for (const [label, p, withPlugin] of [['none', 'ab/A.js', false], ['orig', 'ab/A.js', true], ['final', 'ab/FINAL.js', true]]) {
    const arr = []
    for (let i = 0; i < ROUNDS; i += 1) arr.push((await run(p, { ...s, withPlugin })).total)
    t[label] = med(arr)
  }
  const netOrig = t.orig - t.none
  const netFinal = t.final - t.none
  const drop = netOrig === 0 ? '—' : ((netFinal - netOrig) / netOrig * 100).toFixed(1) + '%'
  console.log('  ' + s.label.padEnd(14) +
    (t.none.toFixed(0) + 'ms').padStart(8) +
    (t.orig.toFixed(0) + 'ms').padStart(9) +
    (t.final.toFixed(0) + 'ms').padStart(9) +
    (netOrig.toFixed(0) + 'ms').padStart(16) +
    (netFinal.toFixed(0) + 'ms').padStart(16) +
    drop.padStart(14))
}
console.log('')

console.log('=== 各维度降幅（原版 -> 最终版）===')
console.log('')
const keys = [
  ['耗时 total', 'total', 'ms'],
  ['querySelectorAll', 'querySelectorAll', '次'],
  ['getComputedStyle', 'getComputedStyle', '次'],
  ['createTreeWalker', 'createTreeWalker', '次'],
  ['node.data 读取', 'dataReads', '次'],
  ['node.parentElement 读取', 'parentReads', '次'],
  ['createRange', 'createRange', '次'],
]
console.log('  ' + '指标'.padEnd(26) + scenarios.map(s => s.label.padStart(12)).join(''))
for (const [label, key, unit] of keys) {
  const cells = []
  for (const s of scenarios) {
    const a = await run('ab/A.js', { ...s, withPlugin: true })
    const b = await run('ab/FINAL.js', { ...s, withPlugin: true })
    const av = key === 'total' ? a.total : a[key]
    const bv = key === 'total' ? b.total : b[key]
    cells.push(pct(av, bv).padStart(12))
  }
  console.log('  ' + label.padEnd(26) + cells.join(''))
}
