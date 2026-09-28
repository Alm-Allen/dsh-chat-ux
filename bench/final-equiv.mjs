import { run } from './bench.mjs'

function cmp(a, b) {
  const d = []
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if (a[i] !== b[i]) d.push(i)
  return d
}

/**
 * 场景表。
 *
 * 后三个是**专门为颜色缓存的两条失效分支**加的：审查指出原先三个场景既没有主题翻转、
 * 也没有 class 变化，于是缓存新增的失效判据实际上没有被验证覆盖。这里补上，并且把
 * 「发布出去的颜色序列」也纳入比较——只看 highlight 覆盖集合是看不出颜色陈旧的。
 */
const cases = [
  ['纯追加',        { turns: 40, markdownNodes: 120, batches: 30 }],
  ['含容器增删',    { turns: 40, markdownNodes: 120, batches: 30, containerChurn: true }],
  ['文本节点 400',  { turns: 40, markdownNodes: 400, batches: 30 }],
  ['主题翻转',      { turns: 40, markdownNodes: 120, batches: 30, themeFlipAt: 15 }],
  ['元素 class 变化', { turns: 40, markdownNodes: 120, batches: 30, classChurnAt: 15 }],
  ['祖先属性变化',  { turns: 40, markdownNodes: 120, batches: 30, ancestorAt: 15 }],
]

console.log('=== 严格逐帧等价：原版 vs 最终版 ===')
console.log('  比较两项：highlight 覆盖集合（容器 key + 偏移，忽略档位号）、以及发布的颜色序列')
console.log('')
let allPass = true
for (const [label, opts] of cases) {
  const o = { ...opts, countRanges: true, countColors: true }
  // 自对照：确认基准本身确定
  const c1 = await run('ab/A.js', o)
  const c2 = await run('ab/A.js', o)
  const ctrlR = cmp(c1.rangeFrames, c2.rangeFrames)
  const ctrlC = cmp(c1.colourFrames, c2.colourFrames)

  const f1 = await run('ab/FINAL.js', o)
  const f2 = await run('ab/FINAL.js', o)
  const ctrlR2 = cmp(f1.rangeFrames, f2.rangeFrames)
  const ctrlC2 = cmp(f1.colourFrames, f2.colourFrames)

  const crossR = cmp(c1.rangeFrames, f1.rangeFrames)
  const crossC = cmp(c1.colourFrames, f1.colourFrames)
  const deterministic = ctrlR.length === 0 && ctrlC.length === 0 && ctrlR2.length === 0 && ctrlC2.length === 0
  const pass = deterministic && crossR.length === 0 && crossC.length === 0
  if (!pass) allPass = false

  console.log('  ' + label + '  (帧数 ' + c1.rangeFrames.length + ')')
  console.log('    自对照 原版 r=' + ctrlR.length + ' c=' + ctrlC.length +
    ' 最终 r=' + ctrlR2.length + ' c=' + ctrlC2.length +
    '  -> ' + (deterministic ? '基准确定' : '基准不确定'))
  console.log('    原版 vs 最终  差异帧 r=' + crossR.length + ' c=' + crossC.length +
    '  -> ' + (pass ? 'PASS 逐帧完全等价' : 'FAIL ' + JSON.stringify({ ranges: crossR.slice(0, 6), colours: crossC.slice(0, 6) })))
  console.log('')
}

// 额外断言：主题翻转后颜色确实变了（否则说明场景没生效，等价也是空的）
const t = await run('ab/FINAL.js', { turns: 40, markdownNodes: 120, batches: 30, themeFlipAt: 15, countColors: true })
const before = t.colourFrames[14]
const after = t.colourFrames[29]
console.log('=== 场景有效性自检（防止「等价」是空的）===')
console.log('  主题翻转场景：翻转前颜色=' + JSON.stringify(before) + '  翻转后=' + JSON.stringify(after))
console.log('  ' + (before !== after ? 'PASS 主题翻转确实改变了颜色' : '注意：颜色未变，该场景未真正生效'))

const a = await run('ab/FINAL.js', { turns: 40, markdownNodes: 120, batches: 30, ancestorAt: 15, countColors: true })
console.log('  祖先属性场景：变化前=' + JSON.stringify(a.colourFrames[14]) + '  变化后=' + JSON.stringify(a.colourFrames[29]))
console.log('')
console.log(allPass ? '全部 PASS' : '存在 FAIL')
process.exitCode = allPass ? 0 : 1
