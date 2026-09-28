import { run } from './bench.mjs'

function cmp(a, b) {
  const d = []
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) if (a[i] !== b[i]) d.push(i)
  return d
}

console.log('=== 负向对照：修复前的产物（只认主题失效）能否被本测试抓到 ===')
console.log('')
const cases = [
  ['主题翻转',      { themeFlipAt: 15 }],
  ['元素 class 变化', { classChurnAt: 15 }],
  ['祖先属性变化',  { ancestorAt: 15 }],
]
for (const [label, opts] of cases) {
  const o = { turns: 40, markdownNodes: 120, batches: 30, countColors: true, countRanges: true, ...opts }
  const orig = await run('ab/A.js', o)
  const old  = await run('ab/CURRENT.js', o)   // 修复前（只认主题）
  const fixed = await run('ab/FINAL.js', o)    // 修复后（任何属性变化）
  const dOld = cmp(orig.colourFrames, old.colourFrames)
  const dFix = cmp(orig.colourFrames, fixed.colourFrames)
  console.log('  ' + label)
  console.log('    原版 vs 修复前: ' + dOld.length + ' 帧颜色不同  -> ' + (dOld.length > 0 ? '抓到回归 ✓' : '未抓到'))
  console.log('    原版 vs 修复后: ' + dFix.length + ' 帧颜色不同  -> ' + (dFix.length === 0 ? '等价 ✓' : '仍有差异'))
}
