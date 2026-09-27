import { run } from './bench.mjs'

function cmp(a, b) {
  const d = []
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if (a[i] !== b[i]) d.push(i)
  return d
}

const cases = [
  ['纯追加',     { turns: 40,  markdownNodes: 120, batches: 30 }],
  ['含容器增删', { turns: 40,  markdownNodes: 120, batches: 30, containerChurn: true }],
  ['文本节点 400', { turns: 40, markdownNodes: 400, batches: 30 }],
]

console.log('=== 严格逐帧等价：原版 vs 最终版 ===')
console.log('  比较对象是 highlight 覆盖集合（容器 key + 偏移），忽略档位号')
console.log('')
for (const [label, opts] of cases) {
  // 自对照：确认基准本身确定
  const c1 = await run('ab/A.js', { ...opts, countRanges: true })
  const c2 = await run('ab/A.js', { ...opts, countRanges: true })
  const ctrl = cmp(c1.rangeFrames, c2.rangeFrames)

  const f1 = await run('ab/FINAL.js', { ...opts, countRanges: true })
  const f2 = await run('ab/FINAL.js', { ...opts, countRanges: true })
  const ctrl2 = cmp(f1.rangeFrames, f2.rangeFrames)

  const cross = cmp(c1.rangeFrames, f1.rangeFrames)
  console.log('  ' + label + '  (帧数 ' + c1.rangeFrames.length + ')')
  console.log('    自对照 原版=' + ctrl.length + ' 最终=' + ctrl2.length + '  -> ' + (ctrl.length === 0 && ctrl2.length === 0 ? '基准确定' : '基准不确定'))
  console.log('    原版 vs 最终 差异帧: ' + cross.length + '  -> ' + (cross.length === 0 ? 'PASS 逐帧完全等价' : 'FAIL ' + JSON.stringify(cross.slice(0, 8))))
  console.log('')
}
