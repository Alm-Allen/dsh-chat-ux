/**
 * jsdom 缺失的浏览器 API 补丁。
 *
 * 只补插件真正会碰到、而 jsdom 没实现的那些。补丁尽量给"能跑但什么都不做"的实现：
 * 基准要量的是插件自己发出的 DOM 操作次数，不是这些 API 的行为。
 */
export function installBrowserShims(win) {
  const doc = win.document

  // document.fonts —— jsdom 未实现 FontFaceSet。caret-motion 监听 loadingdone 重排插入符。
  if (!doc.fonts) {
    const listeners = new Map()
    doc.fonts = {
      ready: Promise.resolve(),
      status: 'loaded',
      addEventListener(type, cb) {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type).add(cb)
      },
      removeEventListener(type, cb) { listeners.get(type)?.delete(cb) },
      dispatch(type) { for (const cb of listeners.get(type) ?? []) cb({ type }) },
    }
  }

  // CSS.highlights —— token-motion 的区间注册表。jsdom 的 CSS 对象没有它。
  // 真实接口是 HighlightRegistry（一个 maplike）：除了 set/get/delete/has/size，还要可迭代。
  // 基准靠迭代来逐帧对比注册表内容，所以 keys/values/entries/[Symbol.iterator] 都得给。
  if (win.CSS && !win.CSS.highlights) {
    const map = new Map()
    const registry = {
      set(k, v) { map.set(k, v); return this },
      get(k) { return map.get(k) },
      delete(k) { return map.delete(k) },
      has(k) { return map.has(k) },
      clear() { map.clear() },
      get size() { return map.size },
      keys() { return map.keys() },
      values() { return map.values() },
      entries() { return map.entries() },
      forEach(cb, thisArg) { map.forEach((v, k) => cb.call(thisArg, v, k, this)) },
      [Symbol.iterator]() { return map[Symbol.iterator]() },
    }
    Object.defineProperty(win.CSS, 'highlights', { value: registry, writable: true, configurable: true })
  }

  // Highlight —— 构造器，记录它拿到的 Range 数量（token-motion 每帧建它）。
  if (typeof win.Highlight !== 'function') {
    win.Highlight = class Highlight {
      constructor(...ranges) { this.ranges = ranges; this.size = ranges.length }
      get type() { return 'highlight' }
    }
    if (win.CSS) { try { win.CSS.Highlight = win.Highlight } catch {} }
  }

  // ResizeObserver —— jsdom 未实现。process-follow 用它。
  if (typeof win.ResizeObserver !== 'function') {
    const instances = []
    win.ResizeObserver = class ResizeObserver {
      constructor(cb) { this.cb = cb; this.targets = new Set(); instances.push(this) }
      observe(t) { this.targets.add(t) }
      unobserve(t) { this.targets.delete(t) }
      disconnect() { this.targets.clear() }
      /** 基准可以手动触发一次回调。 */
      trigger() { this.cb([...this.targets].map((target) => ({ target, contentRect: target.getBoundingClientRect?.() ?? {} })), this) }
    }
    win.__resizeObservers = instances
  }

  // matchMedia —— jsdom 未实现。token-motion / caret-motion / fold-glide 查 reduced-motion。
  if (typeof win.matchMedia !== 'function') {
    win.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {}, removeEventListener() {},
      addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })
  }

  // requestIdleCallback —— jsdom 未实现。token-motion 用它收起档位规则。
  //
  // **不要映射到 setTimeout**：jsdom 的定时器走真实时间，而基准推进的是假时钟，于是
  // 「空闲回调何时跑」在两次运行之间不确定——实测它会让逐帧对比产生 10 帧抖动，
  // 把确定性基准变成噪声源（这曾让我把一个不存在的 bug 当成真问题追了一轮）。
  // 这里改成一条自己的队列，由基准显式 flush。
  const idleQueue = []
  let idleSeq = 0
  win.requestIdleCallback = (cb) => {
    const id = ++idleSeq
    idleQueue.push({ id, cb })
    return id
  }
  win.cancelIdleCallback = (id) => {
    const i = idleQueue.findIndex((e) => e.id === id)
    if (i >= 0) idleQueue.splice(i, 1)
  }
  /** 把排队的空闲回调全部跑掉。基准在推进帧之后调它，让「收起档位规则」也可确定。 */
  win.__flushIdle = () => {
    const due = idleQueue.splice(0, idleQueue.length)
    for (const { cb } of due) cb({ didTimeout: false, timeRemaining: () => 50 })
  }

  // Element.prototype.animate —— jsdom 未实现 Web Animations。fold-glide / send-flight 用它。
  if (typeof win.Element.prototype.animate !== 'function') {
    win.Element.prototype.animate = function () {
      const anim = {
        onfinish: null, oncancel: null,
        cancel() {}, finish() { this.onfinish?.() }, play() {}, pause() {},
        finished: Promise.resolve(),
      }
      return anim
    }
  }

  // Element.prototype.scrollTo / scrollTop 可写（jsdom 里 scrollTop 是只读 0）。
  // 插件大量读写 scrollTop / scrollHeight / clientHeight，这里给可写且可配的几何。
  const defineGeometry = (proto) => {
    for (const prop of ['scrollTop', 'scrollHeight', 'clientHeight', 'offsetHeight', 'offsetTop']) {
      const desc = Object.getOwnPropertyDescriptor(proto, prop)
      if (desc && desc.set) continue
      let store = 0
      try {
        Object.defineProperty(proto, prop, {
          get() { return this.__geom?.[prop] ?? store },
          set(v) { if (!this.__geom) this.__geom = {}; this.__geom[prop] = v },
          configurable: true,
        })
      } catch {}
    }
  }
  defineGeometry(win.Element.prototype)

  // getBoundingClientRect —— jsdom 全给 0，插件用它量起点/终点。给一个可配的矩形。
  const originalRect = win.Element.prototype.getBoundingClientRect
  win.Element.prototype.getBoundingClientRect = function () {
    const r = this.__rect
    if (r) return r
    return originalRect.call(this)
  }

  return win
}
