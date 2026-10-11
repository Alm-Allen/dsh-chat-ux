/**
 * 从半截的 `run_code` 程序文本里，认出它将要执行的 `tools.write` / `tools.edit`。
 *
 * ## 为什么要在客户端自己扫
 *
 * dsh 的子调用行要等程序**真的跑起来**才出现：`tool/ptc-dispatch-start` 是执行到那一句时才 append 的
 * （`packages/core/tools/src/ptc.ts`），而参数是**运行时求值**的对象——dsh 自己也没有「代码文本 → 子调用
 * 列表」这种可复用的纯函数，它的语言判据在工具 schema 的 `code` 描述里（`ui-trajectory/code-program.ts`），
 * 而插件拿不到 schema。想在子调用行出现之前给读者一句「接下来要动哪些文件」，只能自己扫这段半成品的
 * 程序文本。
 *
 * ## 它天生是「尽力而为」
 *
 * 真实会话（887 份程序体、264 次 write/edit 调用）的分布：路径读得出约一半，文本读得出约四成，其余落在
 * 「先赋给变量」「拼接」「循环」上。所以这一段的**契约是「读不出就不说」**，绝不猜：宁可清单里少一行，也
 * 不能让读者以为要写某个文件而实际没有。
 *
 * ## 半截文本
 *
 * 参数是一批批流进来的，程序文本会停在任何位置——包括一个字符串字面量的中间。所以配对做不到「失败就
 * 放弃整处调用」：字符串还没闭合时要把它当成**已读到的前缀**收下（`readString` 的 `end` 落在文本末尾），
 * 否则最该显示内容的那一刻（正文正在流）恰好什么都看不到。
 *
 * 文本一律按 `charAt` 读：项目开了 `noUncheckedIndexedAccess`，下标访问都给 `string | undefined`，而
 * 「越界」在这一层的意思就是「这一段到头了」，空串正好是它要的兜底。
 *
 * @module dsh-chat-ux/chat/code-progress/preview-scan
 */

/** 从程序文本里认出的一处写入或编辑。 */
export interface PreviewTarget {
    /** 线上工具名：`write` 或 `edit`。 */
    name: string
    /** 锚点在程序文本里的位置。同一处的身份：文本只追加，这个位置不会变。 */
    at: number
    /** 目标路径；读不出为 null。 */
    path: string | null
    /** 会新增几行；文本读不出为 null。 */
    added: number | null
    /** 会删掉几行；`write` 没有这一面，读不出也是 null。 */
    removed: number | null
    /** 要写出去的正文：`write` 是 `content`、`edit` 是 `new_string`；读不出为 null。 */
    newText: string | null
    /** `edit` 被替换掉的原文；`write` 与读不出时为 null。 */
    oldText: string | null
    /**
     * 那两段原文都收尾了没有。
     *
     * 展开体里那次真 diff 要等它：半截的正文每 300 ms 换一次高度，会把这一块连同下面那份程序一直撑，
     * 而 dsh 的输入区座位是 `sticky` 贴底的，会跟着一起动——读者看到的就是输入框在乱蹦。
     */
    settled: boolean
}

/** 只认这两类调用：其余子调用（read / glob / bash…）不在这块预览的范围内。 */
const PREVIEW_TOOLS = new Set(['write', 'edit'])

/**
 * 一段**正在攒**的长内容——它多半就是要写出去的那一份，但还不能确定。
 *
 * 为什么要认它：`tools.write({file_path, content: text})` 里 `text` 必须先定义（否则运行时就是
 * ReferenceError），所以「内容」**必然**排在「调用」前面，写得越长锚点越靠后。867 份真实程序体里锚点的
 * 中位位置是 67%（读者那一次是 96%），而这段长内容的中位位置是 **3%**——想提前，只能从它下手。
 *
 * 代价说在明面上：看到长内容时**约七成**最后真的写了文件（176 个含 write/edit 的调用里长内容命中 55%，
 * 691 个不含的里命中 5%）。剩下三成是 prompt、是喂给别的工具的参数、是打印出来的东西——所以它在界面上
 * 只能是「可能」，等锚点到了才换成确凿的那一版。
 */
export interface DraftHint {
    /** 那段内容的第一行（去掉 markdown 标记与空白），给读者认出来在写什么；拿不到时是空串。 */
    heading: string
    /** 已收到的行数。 */
    lines: number
}

/** 调用锚点：`tools.write(` 与 `tools["write"](` 两种写法。 */
const CALL_PATTERN = /tools\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*(["'])([^"']+)\2\s*\])\s*\(/g

/** 路径字段，按先后顺序认。 */
const PATH_KEYS = ['file_path', 'path']

/** 认长内容至少要跨几行。定在 8：真实程序里「短模板」满地都是（日志、命令行），它们不是这一路要找的。 */
const DRAFT_MIN_LINES = 8

/** 每批最多看几段字符串就放弃。程序里短模板可能很多，没必要一路扫到底。 */
const DRAFT_SCAN_LIMIT = 8

/** 标题最多留几个字；折叠态行尾那点位置放不下更长的。 */
const DRAFT_HEADING_MAX = 18

/**
 * 追变量最多追几层。
 *
 * 真实程序里 `content → para1` 两层就到头；给 6 是留余量，同时也是防环的第二道闸（第一道是 `seen`）。
 */
const MAX_EXPAND_DEPTH = 6

/** 三种开括号各自的闭符号。 */
const CLOSERS: Record<string, string> = {')': '(', '}': '{', ']': '['}

/** 正则开头前面允许出现的字符：这些位置上的 `/` 不可能是除号。 */
const REGEX_LEADS = '=(,:[!&|?{};+-*%<>^~'

/**
 * 扫一遍程序文本，交出认得出的那几处写入或编辑。
 *
 * 读不出任何东西的那一处不列——路径与两个数字全空的行只会占地方。
 *
 * `previous` 是上一批的返回值：**读出过的东西不再撤回**。流式期会短暂看到一个完整的字面量（字符串刚
 * 闭合，后面那个 `+ something` 还没到），到下一批才知道它是拼接、按规矩该判成读不出——可那个数已经摆在
 * 读者眼前了，撤回就是一次回落。真实会话里这种情形占 149 份里 1 份，频率很低，但方向与数字轮那一套
 * 一致：宁可留一个稍后会被纠正的读数，也不让它往回跳。同一处按锚点位置相认，不按下标——读不出的那一处
 * 不列出来，下标会错位。
 * @param code - `run_code` 的 `code` 字段，可以只是已收到的那半截。
 * @param previous - 上一批的返回值；没有就传 undefined。
 * @returns 认出的一处一处，按在文本里出现的先后。
 */
export function scanPreviewTargets(code: string, previous?: readonly PreviewTarget[]): PreviewTarget[] {
    const bindings = readBindings(code)
    const carried = new Map<number, PreviewTarget>()
    for (const target of previous ?? []) carried.set(target.at, target)
    const targets: PreviewTarget[] = []
    CALL_PATTERN.lastIndex = 0
    for (let match = CALL_PATTERN.exec(code); match !== null; match = CALL_PATTERN.exec(code)) {
        const name = match[1] ?? match[3]
        if (name === undefined || !PREVIEW_TOOLS.has(name)) continue
        const at = match.index
        const fields = argumentFields(code, at + match[0].length - 1)
        const newRead = name === 'write'
            ? fieldValue(fields, ['content'], bindings, code)
            : fieldValue(fields, ['new_string'], bindings, code)
        const oldRead = name === 'edit' ? fieldValue(fields, ['old_string'], bindings, code) : null
        // 上一次读到过的那几个值兜在这里：这一批读不出的字段保留上一批的结果，不往回退。
        const seen = carried.get(at)
        const pathRead = fieldValue(fields, PATH_KEYS, bindings, code)
        const path = pathRead === null ? seen?.path ?? null : pathRead.text
        const added = newRead === null ? seen?.added ?? null : countLines(newRead.text)
        const removed = oldRead === null ? seen?.removed ?? null : countLines(oldRead.text)
        // 两段原文都收尾了才认「定稿」——展开体里那次 diff 要等它：半截的正文每 300 ms 变一次高度，
        // 会把这一块（连同下面那份程序）一直撑，而输入区是 `sticky` 贴底的，它跟着一起动。
        const settled = seen?.settled === true || (newRead?.closed === true && oldRead?.closed === true)
        if (path === null && added === null && removed === null) continue
        // 原文一并交出去：展开体里那时候要拿它画一次真正的 diff（`edit` 的两段都在才行）。
        targets.push({
            name,
            at,
            path,
            added,
            removed,
            newText: newRead?.text ?? null,
            oldText: oldRead?.text ?? null,
            settled,
        })
    }
    return targets
}

/**
 * 认一段正在攒的长内容。
 *
 * 从头往后看字符串字面量，交出**第一段**够长的：模型写长内容时总把它放在最前面（读者那次就在程序的
 * 第 0 个字符），所以不必扫到底。游标只往前走，所以一整趟的代价是 O(程序长度)，与找锚点同量级。
 * @param code - `run_code` 的 `code` 字段，可以只是已收到的那半截。
 * @returns 那一段的标题与已收到的行数，或 null（还没有够长的内容）。
 */
export function scanDraft(code: string): DraftHint | null {
    let cursor = 0
    while (cursor < code.length) {
        const at = nextQuoteAt(code, cursor)
        if (at < 0) return null
        const read = readString(code, at)
        const lines = countLines(read.value)
        if (lines >= DRAFT_MIN_LINES) return {heading: headingOf(read.value), lines}
        cursor = read.end
    }
    return null
}

/**
 * 下一个字符串字面量的起始位置。
 *
 * 三种引号都算：反引号与三引号是长文本的常见容器，而普通单双引号也可能是——认错了无非是白读一段。
 * @param code - 程序文本。
 * @param from - 从这里开始找。
 * @returns 位置，找不到为 -1。
 */
function nextQuoteAt(code: string, from: number): number {
    let best = -1
    for (const quote of ['`', "'", '"']) {
        const at = code.indexOf(quote, from)
        if (at >= 0 && (best < 0 || at < best)) best = at
    }
    return best
}

/**
 * 一段内容的第一行标题：去掉 markdown 的井号、引用号与项目符号，太长就截断。
 * @param text - 那段内容的正文。
 * @returns 标题，全是空白时是空串。
 */
function headingOf(text: string): string {
    let start = 0
    while (start < text.length) {
        const lineBreakAt = text.indexOf('\n', start)
        const line = text.slice(start, lineBreakAt < 0 ? text.length : lineBreakAt)
        const trimmed = line.replace(/^[#>\-*\s]+/, '').trim()
        if (trimmed !== '') {
            return trimmed.length > DRAFT_HEADING_MAX ? trimmed.slice(0, DRAFT_HEADING_MAX) + '…' : trimmed
        }
        if (lineBreakAt < 0) break
        start = lineBreakAt + 1
    }
    return ''
}

/**
 * 全文里的「变量名 = 值」。
 *
 * 只记**位置**，不在这里解析：解不解得开，等真要它的那一处再定（见 `resolveAt`）。这条规矩让别名
 * （`const content = story`）与插值（`` const content = `…${para1}…` ``）都能先收进来——它们占了真实
 * 程序里正文类字段的一大半，改造前是一见就丢的。
 *
 * 扫的时候要**跳过字符串与注释**：程序里写着「`const x = 1` 这种写法」的注释遍地都是，拿正则硬扫会
 * 把它们当成真绑定，而别名一追就是错的正文。
 *
 * 类型注解（`const x: string = …`）也认：冒号后面到赋值号之前那一段跳过。
 * @param code - 程序文本。
 * @returns 变量名到值的位置。
 */
function readBindings(code: string): Bindings {
    const bindings: Bindings = new Map()
    let cursor = 0
    while (cursor < code.length) {
        const char = code.charAt(cursor)
        if (char === '"' || char === "'" || char === '`') {
            cursor = readString(code, cursor).end
            continue
        }
        if (char === '/' && code.charAt(cursor + 1) === '/') {
            const lineBreakAt = code.indexOf('\n', cursor)
            cursor = lineBreakAt < 0 ? code.length : lineBreakAt
            continue
        }
        if (char === '/' && code.charAt(cursor + 1) === '*') {
            const close = code.indexOf('*/', cursor)
            cursor = close < 0 ? code.length : close + 2
            continue
        }
        if (!isNameChar(char)) {
            cursor += 1
            continue
        }
        const word = readIdentifier(code, cursor)
        cursor += word.length
        if (word !== 'const' && word !== 'let' && word !== 'var') continue
        const nameAt = skipSpaces(code, cursor)
        const name = readIdentifier(code, nameAt)
        if (name === '') continue
        let equalsAt = skipSpaces(code, nameAt + name.length)
        if (code.charAt(equalsAt) === ':') equalsAt = typeAnnotationEnd(code, equalsAt)
        if (equalsAt < 0 || code.charAt(equalsAt) !== '=') continue
        // `==` 与 `=>` 都不是赋值。
        if (code.charAt(equalsAt + 1) === '=' || code.charAt(equalsAt + 1) === '>') continue
        bindings.set(name, skipSpaces(code, equalsAt + 1))
        cursor = equalsAt + 1
    }
    return bindings
}

/**
 * 追一个变量名到它的正文。
 *
 * 三层闸：追过的名字不再追（环）、层数用完就停（深链）、位置没记过就放弃（参数、解构、循环变量）。
 * @param name - 变量名。
 * @param expand - 展开上下文。
 * @returns 那个变量读出来的正文，或 null。
 */
function resolveName(name: string, expand: ExpandContext): FieldText | null {
    if (expand.depth <= 0 || expand.seen.has(name)) return null
    const at = expand.bindings.get(name)
    if (at === undefined) return null
    const seen = new Set(expand.seen)
    seen.add(name)
    return resolveAt(expand.code, at, {
        code: expand.code,
        bindings: expand.bindings,
        depth: expand.depth - 1,
        seen,
    })
}

/**
 * 从 `at` 解析一个值。
 *
 * 收两种：字符串字面量，以及**别名**（值就是另一个变量名）。其余（拼接、调用、成员访问、三元、模板里
 * 解不开的插值）一律 null——那几种的真值要跑起来才知道，猜错比不说更糟。
 *
 * 两种都要看**后面**收没收住：`"a" + b` 与 `b + "\n"` 都不是「那一个值」，读出来会少一截。
 * @param code - 程序全文。
 * @param at - 值的起始位置。
 * @param expand - 展开上下文。
 * @returns 解析出来的正文，或 null。
 */
function resolveAt(code: string, at: number, expand: ExpandContext): FieldText | null {
    const start = skipSpaces(code, at)
    const char = code.charAt(start)
    if (char === '"' || char === "'" || char === '`') {
        const read = readString(code, start, expand)
        if (read.interpolated) return null
        if (!endsHere(code, read.end)) return null
        return {text: read.value, closed: read.closed}
    }
    if (!/[A-Za-z_$]/.test(char)) return null
    const name = readIdentifier(code, start)
    if (!endsHere(code, start + name.length)) return null
    return resolveName(name, expand)
}

/**
 * 类型注解的收尾：那个赋值号在哪儿。
 *
 * 从冒号往后找同一行里的 `=`；找不到、或者它已经翻到下一行去了，就当这处绑定不认识（保守，与改造前
 * 的覆盖面一致）。
 * @param code - 程序文本。
 * @param colonAt - 冒号的位置。
 * @returns 赋值号的位置，没找到为 -1。
 */
function typeAnnotationEnd(code: string, colonAt: number): number {
    const lineBreakAt = code.indexOf('\n', colonAt)
    const equalsAt = code.indexOf('=', colonAt)
    if (equalsAt < 0) return -1
    return lineBreakAt >= 0 && equalsAt > lineBreakAt ? -1 : equalsAt
}

/**
 * 这个位置上，「值」后面收住了没有。
 *
 * 跳空格与制表符，**不跳换行**。真实程序里不加分号的写法满地都是：
 *
 *     const scriptPath = 'C:\…\probe.ps1'
 *     const script = `…`
 *
 * 用「跳过所有空白」去找值后面是什么，就会越过行尾撞上下一行的 `const`，把一个本来读得出的绑定判成
 * 拼接——实测这一处会吃掉两成的读出率（77 份真实程序里 55 处写入因此从「有路径」掉成「什么都没有」）。
 * @param code - 程序全文。
 * @param at - 值的结束位置。
 * @returns 是不是收尾了。
 */
function endsHere(code: string, at: number): boolean {
    let cursor = at
    while (cursor < code.length) {
        const char = code.charAt(cursor)
        if (char !== ' ' && char !== '\t') break
        cursor += 1
    }
    return isValueEnd(code.charAt(cursor))
}

/**
 * 这里是不是一个值的结束。
 *
 * 别名与字面量后面再接着别的运算符，就不再是「那一个值」了。
 * @param char - 那个位置上的字符；越界是空串。
 * @returns 是不是收尾。
 */
function isValueEnd(char: string): boolean {
    return char === '' || char === ';' || char === ',' || char === ')' || char === '}'
        || char === ']' || char === '\n' || char === '\r'
}

/**
 * 标识符字符。
 * @param char - 一个字符。
 * @returns 是不是标识符的一部分。
 */
function isNameChar(char: string): boolean {
    return char !== '' && /[A-Za-z0-9_$]/.test(char)
}

/**
 * 从 `at` 读一个标识符。
 * @param text - 文本。
 * @param at - 起始位置。
 * @returns 标识符；那里不是标识符时是空串。
 */
function readIdentifier(text: string, at: number): string {
    let cursor = at
    while (cursor < text.length && isNameChar(text.charAt(cursor))) cursor += 1
    return text.slice(at, cursor)
}

/**
 * 跳过空白。
 * @param text - 文本。
 * @param at - 起始位置。
 * @returns 第一个非空白字符的位置。
 */
function skipSpaces(text: string, at: number): number {
    let cursor = at
    while (cursor < text.length && /\s/.test(text.charAt(cursor))) cursor += 1
    return cursor
}

/**
 * 是不是一个光溜溜的变量名。
 * @param text - 候选文本。
 * @returns 是则为 true。
 */
function isPlainName(text: string): boolean {
    if (!/^[A-Za-z_$]/.test(text)) return false
    return readIdentifier(text, 0).length === text.length
}

/**
 * 一个调用的实参键值对。
 *
 * `tools.write({file_path: '…', content})` 两种写法都收：带冒号的、以及把变量简写进对象的（简写那一份
 * 的值就是同名变量，交给值解析去查绑定表）。
 * @param code - 程序文本。
 * @param openAt - 实参那个 `(` 的位置。
 * @returns 键值对，按出现先后。
 */
function argumentFields(code: string, openAt: number): {key: string, value: string}[] {
    const closeAt = matchBracket(code, openAt)
    const body = argumentsBody(code, openAt, closeAt)
    const fields: {key: string, value: string}[] = []
    for (const part of splitTopLevel(body)) {
        const paired = /^\s*([A-Za-z_$][\w$]*)\s*[:=]\s*([\s\S]*)$/.exec(part)
        if (paired !== null) {
            const key = paired[1]
            if (key === undefined) continue
            fields.push({key, value: paired[2] ?? ''})
            continue
        }
        const shorthand = /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(part)
        const key = shorthand?.[1]
        if (key !== undefined) fields.push({key, value: key})
    }
    return fields
}

/**
 * 实参正文：对象写法取花括号里面，关键字写法（Python 那一套）就是实参本身。
 * @param code - 程序文本。
 * @param openAt - 实参那个 `(` 的位置。
 * @param closeAt - 它的配对位置，未闭合为 -1。
 * @returns 正文。
 */
function argumentsBody(code: string, openAt: number, closeAt: number): string {
    const body = code.slice(openAt + 1, closeAt < 0 ? code.length : closeAt)
    const braceAt = body.indexOf('{')
    if (braceAt < 0 || body.slice(0, braceAt).trim() !== '') return body
    const braceEnd = matchBracket(code, openAt + 1 + braceAt)
    return code.slice(openAt + 2 + braceAt, braceEnd < 0 ? code.length : braceEnd)
}

/**
 * 按顺序取第一个读得出的字段值。
 * @param fields - 实参键值对。
 * @param keys - 候选字段名。
 * @param bindings - 变量绑定表。
 * @param code - 程序全文（绑定的值按它里面的位置取）。
 * @returns 那一段文字与它收尾了没有，或 null（都没读出来）。
 */
function fieldValue(
    fields: {key: string, value: string}[],
    keys: readonly string[],
    bindings: Bindings,
    code: string,
): FieldText | null {
    for (const key of keys) {
        for (const field of fields) {
            if (field.key !== key) continue
            const text = valueText(field.value, bindings, code)
            if (text !== null) return text
        }
    }
    return null
}

/**
 * 一个字段值读出来的文本。
 *
 * 字面量收，变量收（**沿着别名一路追到字面量**，模板里的 `${…}` 只要是简单变量名也一并解开），其余
 * （拼接、调用、成员访问、三元）一律 null——那几种的真值要跑起来才知道。
 *
 * 这一处的覆盖面直接决定折叠态那一截有没有 `+n -m`：真实程序里正文类字段一半以上写成变量
 * （`{file_path, content}` 的简写），而它们多数只是**换个名字的同一段字面量**。改造前这些全判成读不出，
 * 现在能追进去。
 * @param value - 值的原文。
 * @param bindings - 变量绑定表。
 * @param code - 程序全文。
 * @returns 文本与收尾标记，或 null。
 */
function valueText(value: string, bindings: Bindings, code: string): FieldText | null {
    const text = value.trim()
    const expand: ExpandContext = {code, bindings, depth: MAX_EXPAND_DEPTH, seen: EMPTY_SEEN}
    const quote = text.charAt(0)
    if (quote === '"' || quote === "'" || quote === '`') {
        const read = readString(text, 0, expand)
        // 字面量后面还接着东西（`'a' + b`）就是拼接，不读。
        if (read.end !== text.length) return null
        return read.interpolated ? null : {text: read.value, closed: read.closed}
    }
    if (isPlainName(text)) return resolveName(text, expand)
    return null
}

/** 一条空的追链，给每次从字段出发的解析当起点。 */
const EMPTY_SEEN: ReadonlySet<string> = new Set()

/** 读出来的一段文字，以及它收尾了没有。 */
interface FieldText {
    /** 文字本身；没闭合时就是已收到的那一截。 */
    text: string
    /** 引号收尾了没有。 */
    closed: boolean
}

/**
 * 变量绑定表：名字 → 它那个值的**起始位置**（全程序坐标）。
 *
 * 存位置而不是文本，是为了「按需解析」：一个变量要经过别名、插值才落到正文上，而只有真用到它的那几处
 * 才值得追。也正因为存的是位置，`const content = \`…${para1}…\`` 这种含插值的绑定可以先收进来——
 * 解不解得开，等真要它的时候再定。
 */
type Bindings = Map<string, number>

/** 展开插值时的上下文：靠它递归查绑定表，并且有环、过深就停。 */
interface ExpandContext {
    /** 程序全文——绑定的值都按它里面的绝对位置取。 */
    code: string
    /** 变量名到值的位置。 */
    bindings: Bindings
    /** 还剩几层可追。 */
    depth: number
    /** 这条链上已经追过的名字，防 `const a = \`${a}\`` 这种自己咬自己。 */
    seen: ReadonlySet<string>
}

/** 读一段字符串字面量读出来的东西。 */
interface StringRead {
    /** 已解码的正文；未闭合时就是已收到的那一截。 */
    value: string
    /** 正文结束的位置（闭引号之后，或未闭合时的文本末尾）。 */
    end: number
    /** 里面有没有 `${…}`——有的话正文要跑起来才成立。 */
    interpolated: boolean
    /** 引号收尾了没有；流式期多半没收。 */
    closed: boolean
}

/**
 * 从 `at`（引号）读一段字符串字面量。
 *
 * 未闭合不是错误：流式期它就停在这里，正文按已收到的算。
 *
 * 反引号里那些 `${…}` 交给 `expand` 去解：解开就换成那个变量读出来的正文（读者要的是行数，而
 * `para1` 这种变量本身就写在上面几行）；任何一个解不开，整段就按「含插值」收场，与改造前一样
 * 什么都不报——**绝不拿半截正文去凑数**。
 * @param text - 含引号的文本。
 * @param at - 起始引号的位置。
 * @param expand - 展开插值要用的上下文；不传就只做标记，不展开。
 * @returns 读出来的正文、结束位置、插值标记与收尾标记。
 */
function readString(text: string, at: number, expand?: ExpandContext): StringRead {
    const quote = text.charAt(at)
    const triple = text.slice(at, at + 3) === quote.repeat(3)
    const closer = triple ? quote.repeat(3) : quote
    let value = ''
    let interpolated = false
    let cursor = at + closer.length
    while (cursor < text.length) {
        const char = text.charAt(cursor)
        if (char === '\\') {
            value += decodeEscape(text, cursor)
            cursor += escapeWidth(text, cursor)
            continue
        }
        if (text.slice(cursor, cursor + closer.length) === closer) {
            return {value, end: cursor + closer.length, interpolated, closed: true}
        }
        // JSON 那一层的转义（`\n`）到这里已经解开了，这一层只管程序文本自己的转义。
        if (closer === '`' && char === '$' && text.charAt(cursor + 1) === '{') {
            const closeAt = matchInterpolation(text, cursor + 1)
            if (closeAt >= 0) {
                const resolved = expandInterpolation(text.slice(cursor + 2, closeAt), expand)
                if (resolved !== null) {
                    value += resolved.text
                    cursor = closeAt + 1
                    continue
                }
            }
            interpolated = true
        }
        value += char
        cursor += 1
    }
    return {value, end: text.length, interpolated, closed: false}
}

/**
 * `${` 那个花括号的配对位置。
 *
 * 只在**这一段文本内部**配对：插值里再嵌对象、再嵌字符串都算得对，嵌不上的（流式半截）返回 -1，
 * 调用处就退回「含插值」的保守判断。
 * @param text - 含 `${` 的文本。
 * @param braceAt - `{` 的位置。
 * @returns 配对的 `}` 位置，找不到为 -1。
 */
function matchInterpolation(text: string, braceAt: number): number {
    let depth = 0
    let cursor = braceAt
    while (cursor < text.length) {
        const char = text.charAt(cursor)
        if (char === '"' || char === "'" || char === '`') {
            cursor = readString(text, cursor).end
            continue
        }
        if (char === '{') depth += 1
        else if (char === '}') {
            depth -= 1
            if (depth === 0) return cursor
        }
        cursor += 1
    }
    return -1
}

/**
 * 把一个插值表达式换成它代表的正文。
 *
 * 只认**一个光溜溜的变量名**：`${para1}` 收，`${JSON.stringify(config)}`、`${a.b}`、`${a + b}` 一律
 * 不收——那几种的真值要跑起来才知道，猜错比不说更糟。
 * @param expression - `${` 与 `}` 之间的原文。
 * @param expand - 展开上下文；缺席时不展开。
 * @returns 那个变量读出来的正文，或 null（不是简单变量名、或解不开）。
 */
function expandInterpolation(expression: string, expand?: ExpandContext): FieldText | null {
    if (expand === undefined) return null
    const name = expression.trim()
    if (!isPlainName(name)) return null
    return resolveName(name, expand)
}

/**
 * 转义序列的宽度。
 * @param text - 含转义的文本。
 * @param at - 反斜杠的位置。
 * @returns 占几个字符。
 */
function escapeWidth(text: string, at: number): number {
    const next = text.charAt(at + 1)
    if (next === 'u' && text.charAt(at + 2) === '{') {
        const close = text.indexOf('}', at + 3)
        return close < 0 ? text.length - at : close - at + 1
    }
    if (next === 'u') return 6
    if (next === 'x') return 4
    return 2
}

/**
 * 解一个转义序列。
 *
 * 解不开的（半截的 `\u`）就原样留着：这一处要的是「读者能认出这是哪份文件、有多少行」，不是逐字符还原，
 * 猜错比留着原文更糟。
 * @param text - 含转义的文本。
 * @param at - 反斜杠的位置。
 * @returns 解出来的字符。
 */
function decodeEscape(text: string, at: number): string {
    const width = escapeWidth(text, at)
    const body = text.slice(at + 1, at + width)
    if (width === 2) {
        const simple: Record<string, string> = {'n': '\n', 't': '\t', 'r': '\r', 'b': '\b', 'f': '\f', 'v': '\v', '0': '\0'}
        return simple[body] ?? body
    }
    const digits = body.charAt(0) === 'u' && body.charAt(1) === '{' ? body.slice(2, -1) : body.slice(1)
    const code = Number.parseInt(digits, 16)
    if (!Number.isFinite(code) || code <= 0 || code > 0x10FFFF) return '\\' + body
    return String.fromCodePoint(code)
}

/**
 * 从 `openAt`（`(`）找到配对位置。
 *
 * 字符串、注释与正则都要跳过去：真实程序里 `s.match(/[\u4e00-\u9fff]/g)` 这种一行就能把括号计数带偏
 * （`[` 进了栈却没有对应的 `]` 来平账）。
 * @param text - 程序文本。
 * @param openAt - 开括号的位置。
 * @returns 配对位置，未闭合为 -1。
 */
function matchBracket(text: string, openAt: number): number {
    const stack: string[] = []
    let cursor = openAt
    while (cursor < text.length) {
        const char = text.charAt(cursor)
        if (char === '"' || char === "'" || char === '`') {
            cursor = readString(text, cursor).end
            continue
        }
        if (char === '/' && text.charAt(cursor + 1) === '/') {
            const lineBreakAt = text.indexOf('\n', cursor)
            cursor = lineBreakAt < 0 ? text.length : lineBreakAt
            continue
        }
        if (char === '/' && text.charAt(cursor + 1) === '*') {
            const close = text.indexOf('*/', cursor)
            cursor = close < 0 ? text.length : close + 2
            continue
        }
        if (char === '/' && regexAllowed(text, cursor)) {
            cursor = skipRegex(text, cursor)
            continue
        }
        if (char === '(' || char === '{' || char === '[') {
            stack.push(char)
            cursor += 1
            continue
        }
        if (char === ')' || char === '}' || char === ']') {
            const opened = stack.pop()
            if (opened !== undefined && opened !== CLOSERS[char]) return -1
            if (stack.length === 0) return cursor
            cursor += 1
            continue
        }
        cursor += 1
    }
    return -1
}

/**
 * 这个 `/` 是正则的开头还是除号。
 *
 * 判据只看前一个有意义字符能不能收住一个表达式——够用了，真正要挡的是正则字符组里的 `(` 与 `)`。
 * @param text - 程序文本。
 * @param at - 斜杠的位置。
 * @returns 是不是正则的开头。
 */
function regexAllowed(text: string, at: number): boolean {
    let cursor = at - 1
    while (cursor >= 0 && /\s/.test(text.charAt(cursor))) cursor -= 1
    if (cursor < 0) return true
    return REGEX_LEADS.includes(text.charAt(cursor))
}

/**
 * 跳过一个正则字面量。
 * @param text - 程序文本。
 * @param at - 斜杠的位置。
 * @returns 结束位置。
 */
function skipRegex(text: string, at: number): number {
    let inClass = false
    let cursor = at + 1
    while (cursor < text.length) {
        const char = text.charAt(cursor)
        if (char === '\\') {
            cursor += 2
            continue
        }
        // 一行里没闭合就不是正则，退回保守位置，交给后面的字符逐个走。
        if (char === '\n') return at + 1
        if (char === '[') inClass = true
        else if (char === ']') inClass = false
        else if (char === '/' && !inClass) return cursor + 1
        cursor += 1
    }
    return text.length
}

/**
 * 按顶层逗号切一段文本。
 * @param text - 实参正文。
 * @returns 一段一段。
 */
function splitTopLevel(text: string): string[] {
    const parts: string[] = []
    let start = 0
    let cursor = 0
    while (cursor < text.length) {
        const char = text.charAt(cursor)
        if (char === '"' || char === "'" || char === '`') {
            cursor = readString(text, cursor).end
            continue
        }
        if (char === '(' || char === '{' || char === '[') {
            const close = matchBracket(text, cursor)
            cursor = close < 0 ? text.length : close + 1
            continue
        }
        if (char === ',') {
            parts.push(text.slice(start, cursor))
            start = cursor + 1
        }
        cursor += 1
    }
    parts.push(text.slice(start))
    return parts
}

/**
 * 一段文本的行数，按 dsh 自己的口径：末尾那个换行是行终止符、不算新的一行，正文为空是零行。
 * @param text - 文本。
 * @returns 行数。
 */
function countLines(text: string): number {
    const body = text.endsWith('\n') ? text.slice(0, -1) : text
    if (body === '') return 0
    let lines = 1
    for (let at = 0; at < body.length; at++) if (body.charAt(at) === '\n') lines += 1
    return lines
}
