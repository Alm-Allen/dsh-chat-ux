/**
 * 在 jsdom 里加载**真实构建产物** dist/client.js。
 *
 * 走的是 DSH 客户端模块加载器的同一条契约：window.__ModuleLoader__.load({ id, factory }) 注册
 * 工厂，再由我们调 factory(require) 物化。require 只认产物里出现的三个：react、react/jsx-runtime、
 * @deepseek-ai/dsh-client-ui-primitives。
 *
 * **全局绑定必须覆盖整个基准过程**，不能只包住加载：插件注册的 MutationObserver 回调是异步的，
 * 回调里照样把 Element / NodeFilter / document 当全局用。只在加载期暴露，回调一跑就是
 * ReferenceError——而且是被 jsdom 吞掉的，计数会静默失真。
 */
import { readFileSync } from 'node:fs'

/** 需要临时指向 jsdom 的全局名字。 */
const GLOBAL_NAMES = [
  'window', 'document', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
  'requestIdleCallback', 'cancelIdleCallback', 'matchMedia', 'Node', 'Element', 'HTMLElement',
  'CSS', 'Highlight', 'Range', 'NodeFilter', 'KeyboardEvent', 'Event', 'MouseEvent',
  'CSSStyleSheet', 'customElements', 'navigator', 'location', 'history', 'localStorage',
  'CSSStyleDeclaration', 'DOMRect', 'Text', 'DocumentFragment', 'HTMLInputElement', 'SVGElement',
]
// 注意：performance 刻意不在表里。jsdom 的 Performance 实现经由 globalThis 回查自己，
// 把它指到 win.performance 会造成无限递归（已实测）。

/**
 * 把 jsdom 的全局装上，返回恢复函数。整个基准过程都要包在它里面。
 * @param {object} win - jsdom window
 * @returns {() => void} 恢复函数
 */
export function bindWindowGlobals(win) {
  const saved = new Map()

  // performance 要单独处理。
  //
  // 不能直接把 jsdom 的 `win.performance` 挂到 globalThis 上：jsdom 的 Performance 实现会经由
  // globalThis 回查自己，指过去会造成无限递归（实测 RangeError）。
  //
  // 但**也不能不管**：插件的代码里是裸的 `performance.now()`，它解析到 globalThis.performance。
  // 若那是 Node 自己的 performance，插件读到的就是**真实时钟**，而 rAF 传入的是基准的假时钟——
  // 年龄计算于是混用两个时钟，同一份产物两次跑出不同结果。这正是基准长期不确定的真正根源
  // （表现为 createRange 4959 vs 5072、逐帧档位不同）。
  //
  // 折中：挂一个**普通对象**，它的 now 委托给 win.performance.now（基准的假时钟），而它自己不
  // 经过 jsdom 的实现，所以不会递归。
  saved.set('performance', Object.getOwnPropertyDescriptor(globalThis, 'performance'))
  try {
    Object.defineProperty(globalThis, 'performance', {
      value: {
        now: () => win.performance.now(),
        timeOrigin: 0,
        mark() {}, measure() {}, clearMarks() {}, clearMeasures() {},
        getEntries: () => [], getEntriesByName: () => [], getEntriesByType: () => [],
      },
      writable: true, configurable: true,
    })
  } catch {}

  for (const name of GLOBAL_NAMES) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    let value
    try { value = win[name] } catch { value = undefined }
    if (value !== undefined) {
      try { Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }) } catch {}
    }
  }
  return () => {
    for (const [name, desc] of saved) {
      if (desc === undefined) { try { delete globalThis[name] } catch {} }
      else { try { Object.defineProperty(globalThis, name, desc) } catch {} }
    }
  }
}

/**
 * 加载插件产物并把它的 apply 装到给定的 window 上。
 * 调用前必须已经用 {@link bindWindowGlobals} 绑好全局。
 * @param {object} win - jsdom window
 * @param {string} bundlePath - dist/client.js 路径
 * @param {object} options
 * @param {boolean} options.enableAll - 是否把所有开关打开（默认全开，测最重的路径）
 */
export function loadPlugin(win, bundlePath, { enableAll = true, settingsOverride = null } = {}) {
  const code = readFileSync(bundlePath, 'utf8')

  let registered = null
  win.__ModuleLoader__ = { load(entry) { registered = entry } }

  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useSyncExternalStore: (_sub, get) => get(),
    useId: () => 'id',
    Fragment: 'Fragment',
  }
  const jsxRuntime = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: 'Fragment',
  }
  const primitives = new Proxy({}, {
    get: (_t, name) => (name === 'diffTotals' ? () => ({ added: 0, removed: 0 }) : () => null),
  })
  const requireShim = (spec) => {
    if (spec === 'react') return React
    if (spec === 'react/jsx-runtime') return jsxRuntime
    if (spec === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error('bench: unexpected require ' + spec)
  }

  // eslint-disable-next-line no-new-func
  new Function('window', 'document', code)(win, win.document)
  if (registered === null) throw new Error('bench: bundle did not register via __ModuleLoader__.load')

  const exportsObj = registered.factory(requireShim)

  const disposers = []
  const settingsValue = enableAll ? {
    enhancedFollow: true, caretMotion: 'typing', fonts: true,
    fontSans: '', fontCode: '', sendFlight: true, tokenFade: true,
  } : {}

  const configForms = {
    get: () => ({
      getSnapshot: () => ({ status: 'ready', value: settingsValue, mode: 'host', writable: true }),
      subscribe: () => () => {},
      set: async () => true,
      unset: async () => true,
    }),
  }
  const slots = { inject: (_key, cb) => { cb(); return () => {} }, register: () => () => {} }
  const ctx = {
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
    inject: (_names, cb) => { cb({ get: () => ({ register: () => () => {} }) }) },
    reflect: { get: () => undefined },
    slots,
    configForms,
  }

  if (typeof exportsObj.apply === 'function') exportsObj.apply(ctx)

  return {
    exports: exportsObj,
    registeredId: registered.id,
    dispose: () => { for (const d of disposers) { try { d() } catch {} } },
  }
}