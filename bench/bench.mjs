/**
 * dsh-chat-ux 性能基准（确定性版，基于 clock.mjs）。
 *
 * 两个层次：
 *
 *   计数层  与引擎无关的调用次数。完全确定，可跨引擎对照，是判断「优化是否真的消除了工作」的
 *           硬证据。
 *   计时层  JS 执行时间。**只在同机同场景下做相对对照**，绝对值不可跨环境比较。
 *
 * 每次运行都先跑一次自检（`selfCheck`）：同一份产物连续跑两次，计数必须逐位相同。自检不过就
 * 说明基准本身有问题，任何结论都不成立——这是上一轮踩过的坑。
 */
import { JSDOM } from 'jsdom'
import { makeCounter, instrument, buildChat, fillMarkdown, streamingTextNode } from './harness.mjs'
import { installBrowserShims } from './shims.mjs'
import { makeStepper } from './clock.mjs'
import { loadPlugin, bindWindowGlobals } from './loader.mjs'

/** 默认场景：40 轮历史 + 120 文本节点的正文。 */
export const DEFAULT_SCENARIO = { turns: 40, markdownNodes: 120, preGrowChars: 0, batches: 100, charsPerBatch: 8 }

/**
 * 跑一次流式场景，返回调用计数与耗时。
 *
 * @param {string} bundlePath - 产物路径
 * @param {object} options
 * @param {boolean} options.withPlugin - false 表示只跑基线（不装插件）
 * @param {boolean} options.countRanges - 是否逐帧记录 highlight 覆盖集合（用于等价性对照）
 * @returns {Promise<object>} 计数与耗时
 */
export async function run(bundlePath, {
  turns = 40, markdownNodes = 120, preGrowChars = 0, batches = 100, charsPerBatch = 8,
  withPlugin = true, countRanges = false, containerChurn = false,
  // 下面三个用来**真的走到颜色缓存的两条失效分支**（审查者指出原场景覆盖不到）：
  //   themeFlipAt     第几批翻转 body 的主题属性
  //   classChurnAt    第几批给正文所在元素换一个 class
  //   ancestorAt      第几批给一个**祖先**加属性（模拟继承色变化）
  themeFlipAt = -1, classChurnAt = -1, ancestorAt = -1, countColors = false,
} = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://127.0.0.1:3081/', pretendToBeVisual: true,
  })
  const win = dom.window
  installBrowserShims(win)
  const chat = buildChat(win, { turns })
  const stepper = makeStepper(win)

  const textNode = fillMarkdown(win, chat.streaming, markdownNodes)
  if (preGrowChars > 0) textNode.data += 'y'.repeat(preGrowChars)

  // 让「属性变化 → 计算色变化」这条链在 jsdom 里真的成立。
  //
  // jsdom 没有 CSS 层叠，所以给它加属性不会改变 getComputedStyle 的结果——那样上面那些
  // themeFlipAt / classChurnAt / ancestorAt 场景就是**空等价**（两边都没变色，比了个寂寞）。
  // 这里按属性模拟一个计算色：主题、元素自己的 class、祖先属性三者任一变化都会改变它。
  const colourSource = { theme: 'light', elClass: '', ancestorTone: 'a' }
  const realGCS = win.getComputedStyle.bind(win)
  win.getComputedStyle = function (el, ...rest) {
    const cs = realGCS(el, ...rest)
    if (el === textNode.parentElement) {
      const c = colourSource.theme === 'dark' ? '249, 250, 251'
        : colourSource.elClass !== '' ? '44, 55, 66'
        : colourSource.ancestorTone === 'b' ? '77, 88, 99'
        : '15, 17, 21'
      return { color: 'rgb(' + c + ')', getPropertyValue: (n) => cs.getPropertyValue(n) }
    }
    return cs
  }
  /** 把场景里的属性改动同步到 colourSource。 */
  const syncColourSource = () => {
    colourSource.theme = win.document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
    colourSource.elClass = textNode.parentElement?.getAttribute('class') ?? ''
    colourSource.ancestorTone = win.document.body.getAttribute('data-ancestor-tone') ?? 'a'
  }

  const counter = makeCounter()
  const restoreInstrument = instrument(win, counter)

  // DOM 属性读取计数：优化 1 针对 node.data，优化 3 针对 node.parentElement。
  // 这两项是**确定**的，比耗时更硬——它们直接证明访问被消除了，而不是碰巧跑得快。
  let dataReads = 0
  let parentReads = 0
  const cdProto = win.CharacterData.prototype
  const dataDesc = Object.getOwnPropertyDescriptor(cdProto, 'data')
  Object.defineProperty(cdProto, 'data', {
    get() { dataReads += 1; return dataDesc.get.call(this) },
    set(v) { return dataDesc.set.call(this, v) },
    configurable: true,
  })
  const nodeProto = win.Node.prototype
  const parentDesc = Object.getOwnPropertyDescriptor(nodeProto, 'parentElement')
  if (parentDesc !== undefined) {
    Object.defineProperty(nodeProto, 'parentElement', {
      get() { parentReads += 1; return parentDesc.get.call(this) },
      configurable: true,
    })
  }

  const restoreGlobals = bindWindowGlobals(win)

  const rangeFrames = []
  const snapRanges = () => {
    const covered = new Set()
    for (const [, hl] of win.CSS.highlights) {
      for (const r of (hl.ranges ?? [])) {
        const cont = r.startContainer.parentElement?.closest('[data-streaming]')
        covered.add((cont?.getAttribute('data-chat-flow-key') ?? '?') + '@' + r.startOffset + '-' + r.endOffset)
      }
    }
    rangeFrames.push([...covered].sort().join(','))
  }

  // 记录每批发布到正文元素上的颜色（用于验证缓存的失效分支）。
  const colourFrames = []
  const snapColour = () => {
    if (!countColors) return
    const el = textNode.parentElement
    colourFrames.push(el === null ? '' : el.style.getPropertyValue('--dsh-chat-ux-run-color'))
  }

  let plugin = null
  try {
    syncColourSource()
    if (withPlugin) plugin = loadPlugin(win, bundlePath)

    // 预热：让 JIT 与插件内部状态进入稳态，这一段不计入结果
    for (let b = 0; b < 20; b += 1) {
      textNode.data += 'x'.repeat(charsPerBatch)
      await stepper.frame()
    }
    for (const k of Object.keys(counter)) counter[k] = 0
    dataReads = 0
    parentReads = 0

    const t0 = Number(process.hrtime.bigint()) / 1e6
    let churn = null
    for (let b = 0; b < batches; b += 1) {
      textNode.data += 'x'.repeat(charsPerBatch)
      // 主题翻转：命中「任何属性变化」这条失效分支
      if (b === themeFlipAt) win.document.body.toggleAttribute('data-ds-dark-theme', true)
      // 元素自己的 class 变化：命中 class 比较这条分支
      if (b === classChurnAt) textNode.parentElement.setAttribute('class', 'token-string')
      // 祖先属性变化：只认主题的旧实现会在这里留下陈旧颜色
      if (b === ancestorAt) win.document.body.setAttribute('data-ancestor-tone', 'b')
      syncColourSource()
      if (containerChurn && b % 10 === 0) {
        const blk = win.document.createElement('div')
        blk.setAttribute('data-chat-flow-key', 'churn-' + b)
        const md = win.document.createElement('div')
        md.setAttribute('data-streaming', '')
        const p = win.document.createElement('p')
        const t = win.document.createTextNode('churn')
        p.appendChild(t); md.appendChild(p); blk.appendChild(md)
        chat.flow.appendChild(blk)
        churn = blk
      } else if (containerChurn && churn !== null && b % 10 === 5) {
        churn.remove()
        churn = null
      }
      await stepper.frame()
      if (countRanges) snapRanges()
      snapColour()
    }
    // 收尾：把剩下的存活区间跑完
    for (let f = 0; f < 12; f += 1) { await stepper.frame(); if (countRanges) snapRanges(); snapColour() }
    const total = Number(process.hrtime.bigint()) / 1e6 - t0

    const out = { ...counter, total, dataReads, parentReads, elements: win.document.querySelectorAll('*').length }
    if (countRanges) out.rangeFrames = rangeFrames
    if (countColors) out.colourFrames = colourFrames
    return out
  } finally {
    if (plugin) plugin.dispose()
    restoreGlobals()
    restoreInstrument()
  }
}

/**
 * 自检：同一份产物连跑两次，计数必须逐位相同。
 *
 * 计时允许有小幅波动，但**计数不允许**——计数里任何差异都意味着基准本身不确定，
 * 此时任何 A/B 结论都不成立。
 *
 * @param {string} bundlePath - 产物路径
 * @param {object} options - 传给 {@link run}
 * @returns {Promise<{ok: boolean, diffs: object}>}
 */
export async function selfCheck(bundlePath, options = {}) {
  const a = await run(bundlePath, options)
  const b = await run(bundlePath, options)
  const diffs = {}
  for (const k of Object.keys(a)) {
    // total 是耗时，允许波动；其余计数（含 dataReads / parentReads）必须逐位相同。
    if (k === 'total' || k === 'rangeFrames') continue
    if (a[k] !== b[k]) diffs[k] = [a[k], b[k]]
  }
  // 若要求记录区间，逐帧对比也要一致
  if (a.rangeFrames !== undefined) {
    const fa = a.rangeFrames, fb = b.rangeFrames
    const frameDiffs = []
    for (let i = 0; i < Math.max(fa.length, fb.length); i += 1) if (fa[i] !== fb[i]) frameDiffs.push(i)
    if (frameDiffs.length > 0) diffs.rangeFrames = frameDiffs
  }
  return { ok: Object.keys(diffs).length === 0, diffs, a, b }
}

/** 把结果打成表。 */
export function report(label, r) {
  const rows = [
    ['querySelectorAll', r.querySelectorAll],
    ['createTreeWalker', r.createTreeWalker],
    ['createRange', r.createRange],
    ['getComputedStyle', r.getComputedStyle],
    ['requestAnimationFrame', r.requestAnimationFrame],
  ]
  console.log('  ' + label)
  for (const [k, v] of rows) console.log('    ' + k.padEnd(22) + String(v).padStart(9))
  console.log('    ' + 'total ms'.padEnd(22) + r.total.toFixed(1).padStart(9))
  console.log('    ' + 'DOM elements'.padEnd(22) + String(r.elements).padStart(9))
}