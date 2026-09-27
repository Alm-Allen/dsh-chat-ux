/**
 * 基准测试夹具：忠实地构造 DSH 聊天区的 DOM。
 *
 * 结构与属性名都取自本机安装的 DSH（0.1.7-rc.2）源码，不是猜的：
 *
 *   [data-chat-flow]                    聊天列
 *   [data-conversation-scroll]          滚动容器
 *   [data-chat-flow-key]                每个流块
 *   [data-variant="think"][data-state]  思考行（running / ok）
 *   [data-streaming]                    Markdown 层在流式期间标记的容器
 *   [data-step-process]                 过程组
 *   [data-step-process-body][hidden]    过程组体（收起时 hidden="until-found"）
 *   [data-chat-call-id]                 工具调用行
 *
 * 同时给全局装一个"昂贵操作计数器"：本基准只测这些与引擎无关的**调用次数**——
 * jsdom 里量布局与样式重算没有意义（它没有布局引擎），而真实浏览器里决定成本
 * 的正是这些调用各发生多少次。
 */

export function makeCounter() {
  return {
    querySelectorAll: 0,
    querySelector: 0,
    getComputedStyle: 0,
    createTreeWalker: 0,
    createRange: 0,
    requestAnimationFrame: 0,
    setInterval: 0,
    setTimeout: 0,
    mutationCallbacks: 0,
    mutationRecords: 0,
  }
}

/**
 * 把计数器装到 window 上，返回一个恢复函数。
 * @param {object} win - jsdom 的 window
 * @param {object} counter - 计数器
 */
export function instrument(win, counter) {
  const doc = win.document
  const proto = win.Document.prototype
  const elProto = win.Element.prototype

  const wrap = (obj, name, key) => {
    const original = obj[name]
    obj[name] = function (...args) {
      counter[key] += 1
      return original.apply(this, args)
    }
    return () => { obj[name] = original }
  }

  const restores = [
    wrap(proto, 'querySelectorAll', 'querySelectorAll'),
    wrap(proto, 'querySelector', 'querySelector'),
    wrap(proto, 'createTreeWalker', 'createTreeWalker'),
    wrap(doc, 'createRange', 'createRange'),
  ]

  const originalGCS = win.getComputedStyle
  win.getComputedStyle = function (...args) {
    counter.getComputedStyle += 1
    return originalGCS.apply(this, args)
  }
  restores.push(() => { win.getComputedStyle = originalGCS })

  const originalRAF = win.requestAnimationFrame
  win.requestAnimationFrame = function (cb) {
    counter.requestAnimationFrame += 1
    return originalRAF.call(this, cb)
  }
  restores.push(() => { win.requestAnimationFrame = originalRAF })

  return () => { for (const r of restores) r() }
}

/**
 * 构造一个长会话：若干已完成的轮次，加一个正在流式输出的轮次。
 * @param {object} win - jsdom 的 window
 * @param {object} options
 * @param {number} options.turns - 已完成的轮次数量
 * @param {number} options.charsPerTurn - 每轮正文长度
 * @returns {{ scroll: Element, flow: Element, streaming: Element, think: Element }}
 */
export function buildChat(win, { turns = 40, charsPerTurn = 200 } = {}) {
  const doc = win.document
  doc.body.innerHTML = ''

  const frame = doc.createElement('div')
  const scroll = doc.createElement('div')
  scroll.setAttribute('data-conversation-scroll', '')
  const flow = doc.createElement('div')
  flow.setAttribute('data-chat-flow', '')
  scroll.appendChild(flow)
  frame.appendChild(scroll)
  doc.body.appendChild(frame)

  const addTurn = (index, { streaming = false } = {}) => {
    const block = doc.createElement('div')
    block.setAttribute('data-chat-flow-key', 'k' + index)

    // 思考行
    const think = doc.createElement('div')
    think.setAttribute('data-variant', 'think')
    think.setAttribute('data-state', streaming ? 'running' : 'ok')
    const thinkBody = doc.createElement('div')
    thinkBody.textContent = 'thinking about step ' + index + ' '.repeat(40)
    think.appendChild(thinkBody)
    block.appendChild(think)

    // 过程组 + 组体
    const group = doc.createElement('div')
    group.setAttribute('data-step-process', '')
    const header = doc.createElement('button')
    header.setAttribute('data-process-activity', '')
    const shimmer = doc.createElement('span')
    shimmer.setAttribute('data-text-shimmer', '')
    shimmer.textContent = 'working'
    header.appendChild(shimmer)
    group.appendChild(header)
    const body = doc.createElement('div')
    body.setAttribute('data-step-process-body', '')
    if (!streaming) body.setAttribute('hidden', 'until-found')
    const content = doc.createElement('div')
    content.setAttribute('data-step-process-content', '')
    body.appendChild(content)
    group.appendChild(body)
    block.appendChild(group)

    // 工具调用行
    const call = doc.createElement('div')
    call.setAttribute('data-chat-call-id', 'call-' + index)
    call.textContent = 'tool call ' + index
    block.appendChild(call)

    // 正文（Markdown 层）
    const md = doc.createElement('div')
    if (streaming) md.setAttribute('data-streaming', '')
    const p = doc.createElement('p')
    p.textContent = 'answer '.repeat(Math.max(1, Math.round(charsPerTurn / 7))) + index
    md.appendChild(p)
    block.appendChild(md)

    flow.appendChild(block)
    return { block, think, group, body, content, md, p }
  }

  for (let i = 0; i < turns; i += 1) addTurn(i)
  const live = addTurn(turns, { streaming: true })

  return { frame, scroll, flow, streaming: live.md, live, addTurn }
}

/** 让 jsdom 的 rAF 与 rIC 可用（jsdom 默认没有 rIC）。 */
export function installSchedulers(win) {
  if (typeof win.requestIdleCallback !== 'function') {
    win.requestIdleCallback = (cb) => win.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1)
    win.cancelIdleCallback = (id) => win.clearTimeout(id)
  }
}
/**
 * 取到流式容器里那个正文文本节点。
 *
 * 基准用它来**原地**追加字符（`node.data += ...`），而不是 `textContent = ...`：后者会替换整个
 * 文本节点、产生 childList mutation，而真实 DSH 里 React 更新文本子节点用的是 characterData。
 * 两者的 observer 触发面不同，会直接影响测出来的回调次数。
 * @param {object} chat - buildChat 的返回值
 * @returns {Text} 正文文本节点
 */
export function streamingTextNode(chat) {
  const p = chat.streaming.querySelector('p')
  let node = p.firstChild
  if (node === null || node.nodeType !== 3) {
    node = chat.streaming.ownerDocument.createTextNode('')
    p.appendChild(node)
  }
  return node
}
/**
 * 把一个流式容器填成**真实的 Markdown 形状**。
 *
 * 为什么需要它：默认夹具的正文只有一个 <p>（一个文本节点），于是 token-motion 的 TreeWalker
 * 只走 1 个节点、只拼 200 字符——把「每次 mutation 重建整段快照」的成本压到了几乎为零。
 * 真实回答里有段落、行内代码、链接、列表、代码块（带语法 token 的 span），文本节点几十上百个，
 * 快照拼接是 O(整条消息)。不还原这一点，就会把 TreeWalker/拼接当成免费。
 *
 * @param {object} win - jsdom window
 * @param {Element} container - 流式容器（带 data-streaming）
 * @param {number} nodes - 目标文本节点数
 * @returns {Text} 末尾那个可继续追加的文本节点
 */
export function fillMarkdown(win, container, nodes = 120) {
  const doc = win.document
  container.innerHTML = ''
  const makeParagraph = () => {
    const p = doc.createElement('p')
    return p
  }
  let created = 0
  const tail = { node: null }
  while (created < nodes) {
    const p = makeParagraph()
    // 每个段落里放几个不同形状的行内元素，模拟链接/代码/强调
    for (let k = 0; k < 6 && created < nodes; k += 1) {
      const kind = k % 3
      if (kind === 0) {
        p.appendChild(doc.createTextNode('普通文字片段 ' + created + ' '))
        created += 1
      } else if (kind === 1) {
        const a = doc.createElement('a')
        a.href = '#'
        a.appendChild(doc.createTextNode('链接文字 ' + created + ' '))
        p.appendChild(a)
        created += 1
      } else {
        const code = doc.createElement('code')
        code.appendChild(doc.createTextNode('code_token_' + created + ' '))
        p.appendChild(code)
        created += 1
      }
    }
    container.appendChild(p)
  }
  // 末尾留一个可继续追加的文本节点（模拟正在流出的最后一段正文）
  const lastP = container.lastElementChild ?? container
  const t = doc.createTextNode('')
  lastP.appendChild(t)
  tail.node = t
  return t
}
/**
 * 模拟真实的 Markdown 流式闭合：把行内标记逐步「闭合」。
 *
 * 真实 DSH 的流式正文不是纯追加——micromark 每收到几个字符就重解析一次，`**bold` 会变成
 * `<strong>bold</strong>`、`\`code` 会变成 `<code>code</code>`。这会**替换节点**，
 * 于是插件走 LCS 差分那一路，并且要重新反查元素。
 *
 * 只测纯追加会把这条路径的代价全部漏掉。
 *
 * @param {object} win - jsdom window
 * @param {Element} container - 流式容器
 * @param {Text} tailNode - 当前正在追加的文本节点
 * @param {number} round - 第几轮（决定闭合哪种标记）
 * @returns {Text} 追加用的新文本节点（闭合会替换掉旧的）
 */
export function closeMarkdownToken(win, container, tailNode, round) {
  const doc = win.document
  const kind = round % 3
  const parent = tailNode.parentElement ?? container
  // 取出尾部文本，把最后一段包进一个行内元素（模拟 token 闭合）
  const text = tailNode.data
  if (text.length < 8) return tailNode
  const cut = text.length - 4
  tailNode.data = text.slice(0, cut)
  const inline = doc.createElement(kind === 0 ? 'strong' : kind === 1 ? 'code' : 'em')
  inline.appendChild(doc.createTextNode(text.slice(cut)))
  parent.appendChild(inline)
  // 后面继续追加落在一个新文本节点上（与真实层一致：闭合后新内容在兄弟节点里）
  const next = doc.createTextNode('')
  parent.appendChild(next)
  return next
}
