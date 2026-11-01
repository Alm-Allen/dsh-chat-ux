/**
 * 纸感的配色令牌。
 *
 * 本插件从不写 --dsw-alias-* 里的品牌色：那是宿主的语义别名，也是别的皮肤（dsh-claude-style 之类）
 * 在改的同一条通道。但纸盖上去之后，正文与底色的令牌必须跟着纸走，否则深色模式配亮纸会把正文
 * 压成一片看不见的白（正文那一条在暗纸上是 12.8，在亮纸上是 1.08）。所以这里分两步：
 *   1. 我们自己的一整套 `--dsh-chat-ux-paper-*`，写在根元素上，样式表、光标、辉光都读它；
 *   2. 宿主的几条令牌（整页底色、侧栏填充色、文字、代码底色、几条照着宿主底色挑的灰底与淡字、
 *      正文与代码字族），只写纸算出来的那一项值。
 * 第二条是「纸盖上去之后读得出来」这件事无法绕开的最小代价；每一笔都记着原值与优先级，
 * 卸载与关掉时逐项还原，别人后写过的就不抢回来
 *
 * 写在哪个元素上是有讲究的，这不是风格问题而是层级问题：dsh 的 ui-theme 把 `--dsw-alias-bg-base`
 * 定义在 `body` 上（design-platform.css 的 `body { … }`），主题包又把 `--dsh-font-family-text`
 * 写在 body 上。内联写在 `html` 上只是「根元素的声明」，body 自己的声明是本地声明、赢过继承——
 * 实测就是这么翻的车：html 上是 #efdfbd，body 上算出来仍是 #fff。所以宿主那几条一律写到 body 上
 */

import {toUnit} from "./paper-math"
import {paperOf, ROOM} from "./paper-tables"
import type {PaperDefinition, PaperMode} from "./paper-tables"

// 本插件自己的变量前缀
export const PAPER_PREFIX = "--dsh-chat-ux-paper-"

// 挂在根元素上的范围标记：纸开着且有值时才在
export const PAPER_ROOT_ATTRIBUTE = "data-dsh-chat-ux-paper"

// 暗档的标记。与上面那条同时在场时才表示「此刻用的是暗版葱皮」
export const PAPER_DARK_ATTRIBUTE = "data-dsh-chat-ux-paper-dark"

// 会被改写的宿主令牌：整页底色、侧栏填充色、三档文字、代码块与内联代码的底、几条在纸上一压就
// 只剩一两个 L* 的灰底与淡字，以及两条字族（字族可以单独关掉，见 applyPaperTokens 的 includeFont）
const HOST_BASE_PROPERTY = "--dsw-alias-bg-base"
const HOST_SIDEBAR_PROPERTY = "--dsw-specific-sidebar-fill"
const HOST_LABEL_PRIMARY_PROPERTY = "--dsw-alias-label-primary"
const HOST_LABEL_SECONDARY_PROPERTY = "--dsw-alias-label-secondary"
const HOST_LABEL_TERTIARY_PROPERTY = "--dsw-alias-label-tertiary"
const HOST_LABEL_CAPTION_PROPERTY = "--dsw-alias-label-caption"
const HOST_CODE_BLOCK_PROPERTY = "--dsw-alias-markdown-code-block"
const HOST_INLINE_CODE_PROPERTY = "--dsw-alias-markdown-inline-code"
// 宿主的「淡」「空闲」「悬停」「层」「浮层」「文档预览」这几档都是照着它自己的底色挑的。
// 纸把底色换掉之后，它们与纸的亮度差只剩一两个 L*：不复用，读者要么读不出字，要么看见纸上的斑块
const HOST_LABEL_DIMMED_PROPERTY = "--dsw-alias-label-dimmed"
const HOST_STATE_IDLE_PRIMARY_PROPERTY = "--dsw-alias-state-idle-primary"
const HOST_INTERACTIVE_BG_HOVER_SOLID_PROPERTY = "--dsw-alias-interactive-bg-hover-solid"
const HOST_BG_OVERLAY_PROPERTY = "--dsw-alias-bg-overlay"
const HOST_BG_LAYER_1_PROPERTY = "--dsw-alias-bg-layer-1"
const HOST_BG_DOCUMENT_PREVIEW_PROPERTY = "--dsw-alias-bg-document-preview"
const HOST_TEXT_FONT_PROPERTY = "--dsh-font-family-text"
const HOST_CODE_FONT_PROPERTY = "--dsh-font-family-code"

/**
 * 墨色按比例压进纸色里的一档。
 *
 * 上面那几条要的是「比纸深一点点」的那种底与「比正文淡一点」的那种字，两者的明暗差必须跟着纸走。
 * 所以值是一条 CSS 表达式而不是算好的 rgb：引用的是我们自己落在根元素上的墨色与纸色两个变量，
 * 亮纸暗纸两档就自动成立，换纸时也不用在 TS 里按档算两套颜色。参数量是墨色占的比例（百分数）
 */
function paperInkMix(inkPercent: number): string {
    return `color-mix(in srgb, var(${PAPER_PREFIX}ink) ${inkPercent}%, var(${PAPER_PREFIX}paper))`
}

/**
 * 纸感的正文与代码字族。
 *
 * 纸面上的字是衬线，这是纸感的一半——老式数字配衬线字身是 ebook 的读法，配无衬线就只是一块米色。
 * 栈的写法与 nocturne 逐字一致：自起的名字没有，用字体的本名，后面一路退到各平台的衬线系统字。
 * dsh 自己的 base.css 把 --dsw-font-family 定义成 var(--dsh-font-family-text, 默认值)，所以写这一条就够
 */
const PAPER_TEXT_FONT_STACK = '"EB Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, '
    + '"Source Han Serif SC", "Songti SC", "Noto Serif CJK SC", serif'

// 代码字族：打字机体的那一支，退到 Courier 与 Consolas
const PAPER_CODE_FONT_STACK = '"Courier Prime", "IBM Plex Mono", "Courier New", "DejaVu Sans Mono", ui-monospace, monospace'

// 一套纸色
export interface PaperTokenSet {
    // 纸的本色，整页底色
    paper: string
    // 正文墨色
    ink: string
    // 次要文字
    inkMuted: string
    // 房间的地面色
    room: string
    // 房间边缘（最深那一档）
    roomEdge: string
    // 光色，形如 "255 210 154"，给 rgb() / 变量使用
    lightRgb: string
    // 选区底色
    selection: string
    // 代码块的底：比纸深一档，但不到 dsh 深色代码块那一档，否则暗纸上会变成一块黑斑
    codeBlock: string
    // 内联代码的底：与代码块同一条规则，浅一档
    inlineCode: string
}

// 写过原值的那一条令牌，还原时逐项回到原样
interface OwnedProperty {
    element: HTMLElement
    name: string
    valueBefore: string
    priorityBefore: string
    valueWritten: string
    priorityWritten: string
}

// 写过的那几笔。同一个名字在根元素与 body 上是两条，所以认的是「元素 + 名字」
const ownedList: OwnedProperty[] = []

/**
 * 记下原值并写入。同一个元素上的同一名字只记第一次的原值。
 *
 * 导出是因为「写在宿主身上、又能逐项还原」这件事不止纸色一处要：用户气泡的底色
 * （paper-bubble.ts）走的是同一条机制。两边共用同一本账，于是 clearPaperTokens() 一次就把
 * 它们全还回去，不必记得谁先谁后
 */
export function setOwned(element: HTMLElement, name: string, value: string, priority = ""): void {
    const existing = ownedList.find((owned) => owned.element === element && owned.name === name)
    if (existing === undefined) {
        ownedList.push({
            element,
            name,
            valueBefore: element.style.getPropertyValue(name),
            priorityBefore: element.style.getPropertyPriority(name),
            valueWritten: value,
            priorityWritten: priority,
        })
    } else {
        existing.valueWritten = value
        existing.priorityWritten = priority
    }
    element.style.setProperty(name, value, priority)
}

// 还回一元素上的一笔。当下值已经不等于我们写的那一个时不动手——那说明别家后写过，抢回去会抹掉它。
// 与 setOwned 一并导出，理由同上
export function releaseOwned(element: HTMLElement, name: string): void {
    const index = ownedList.findIndex((owned) => owned.element === element && owned.name === name)
    if (index < 0) return
    const owned = ownedList[index]
    if (owned === undefined) return
    if (element.style.getPropertyValue(name) === owned.valueWritten
        && element.style.getPropertyPriority(name) === owned.priorityWritten) {
        if (owned.valueBefore === "") element.style.removeProperty(name)
        else element.style.setProperty(name, owned.valueBefore, owned.priorityBefore)
    }
    ownedList.splice(index, 1)
}

// 把写过的全部还回去：当下值仍是我们的写入值才动手
export function restorePaperTokens(): void {
    for (const owned of ownedList) {
        if (owned.element.style.getPropertyValue(owned.name) !== owned.valueWritten
            || owned.element.style.getPropertyPriority(owned.name) !== owned.priorityWritten) continue
        if (owned.valueBefore === "") owned.element.style.removeProperty(owned.name)
        else owned.element.style.setProperty(owned.name, owned.valueBefore, owned.priorityBefore)
    }
    ownedList.length = 0
}

/**
 * 把一套纸色写进页面。重复调用是幂等的，只有值变了的属性才会真的落到 DOM 上——
 * 改一条 custom property 会让整篇文档的样式失效，那是这个插件最贵的一次操作
 */
export function applyPaperTokens(
    set: PaperTokenSet,
    mode: PaperMode,
    includeSidebar: boolean,
    includeFont: boolean,
): void {
    const root = document.documentElement
    const body = document.body
    // 先在 root 上挂一条范围标记，样式表靠它决定纸层与光标那几张表要不要生效
    root.setAttribute(PAPER_ROOT_ATTRIBUTE, "")
    // 暗档单独一条标记。它原来的唯一读者是暗角那两条按档分叉的规则；暗角下线之后暂时没人读它，
    // 留着是给以后按档写的样式
    if (mode === "dark") root.setAttribute(PAPER_DARK_ATTRIBUTE, "")
    else root.removeAttribute(PAPER_DARK_ATTRIBUTE)
    // 自己那一套写在根元素上：没有别人定义过它们，继承就能一路到每个元素
    const ownPairs: Array<[string, string]> = [
        [PAPER_PREFIX + "paper", set.paper],
        [PAPER_PREFIX + "ink", set.ink],
        [PAPER_PREFIX + "ink-muted", set.inkMuted],
        [PAPER_PREFIX + "room", set.room],
        [PAPER_PREFIX + "room-edge", set.roomEdge],
        [PAPER_PREFIX + "light-rgb", set.lightRgb],
        [PAPER_PREFIX + "selection", set.selection],
    ]
    for (const [name, value] of ownPairs) setOwned(root, name, value)
    // 宿主那几条得写在 body 上：ui-theme 在 body 的规则里定义它们，内联写在根元素上只算「根元素的声明」，
    // 输给 body 自己的本地声明。body 还没建出来（脚本跑得比文档早）时这一帧先跳过，下一帧会再来
    if (body === null) return
    setOwned(body, HOST_BASE_PROPERTY, set.paper)
    // 文字跟着纸走：纸只有两档，而宿主那三档文字是按它自己的底色挑的。不接这一笔，
    // 深色模式配亮纸时正文是近白压米白，读不出来
    setOwned(body, HOST_LABEL_PRIMARY_PROPERTY, set.ink)
    setOwned(body, HOST_LABEL_SECONDARY_PROPERTY, set.inkMuted)
    setOwned(body, HOST_LABEL_TERTIARY_PROPERTY, set.inkMuted)
    setOwned(body, HOST_LABEL_CAPTION_PROPERTY, set.inkMuted)
    // 代码那两块底同理：dsh 深色给的是近黑的块，压在暗纸上会变成纸上的一块斑
    setOwned(body, HOST_CODE_BLOCK_PROPERTY, set.codeBlock)
    setOwned(body, HOST_INLINE_CODE_PROPERTY, set.inlineCode)
    // 宿主拿这一条当「淡」用（HeroShell、Input、ModelSelect 等处都读它），亮档现值对纸只有 1.11，
    // 落在纸上等于消失。与次墨同一支混法，两档都还留在 3 线以上
    setOwned(body, HOST_LABEL_DIMMED_PROPERTY, paperInkMix(52))
    // 状态点为空闲时的那一档：亮档现值对纸 1.31，那个点会读成纸上抠出来的一个洞
    setOwned(body, HOST_STATE_IDLE_PRIMARY_PROPERTY, paperInkMix(52))
    // 输入条加号按钮的悬停底。亮档对纸 1.02，悬停等于没有反馈；深色档它又浅得离谱，压在暗纸上是一块灰
    setOwned(body, HOST_INTERACTIVE_BG_HOVER_SOLID_PROPERTY, paperInkMix(6))
    // 浮层与卡片的底。深色现值是 #61666b，压在暗纸上就是一块明显发亮的灰斑
    setOwned(body, HOST_BG_OVERLAY_PROPERTY, paperInkMix(22))
    // 往上抬一层的底。深色现值与暗纸只差 0.7 个 L*，层差消失，卡片和纸糊成一片
    setOwned(body, HOST_BG_LAYER_1_PROPERTY, paperInkMix(8))
    // 文档预览的底。深色现值比暗纸还深，读成纸上挖下去的一个洞
    setOwned(body, HOST_BG_DOCUMENT_PREVIEW_PROPERTY, paperInkMix(3))
    // 字族跟着纸感走，但在卡片上是一个可以单独关掉的子开关：读者自己配过字体时，
    // 纸只换底与墨，字留给他自己那套。关掉时把写过的还回去，与侧栏填充色同一套还法
    if (includeFont) {
        setOwned(body, HOST_TEXT_FONT_PROPERTY, PAPER_TEXT_FONT_STACK)
        setOwned(body, HOST_CODE_FONT_PROPERTY, PAPER_CODE_FONT_STACK)
    } else {
        releaseOwned(body, HOST_TEXT_FONT_PROPERTY)
        releaseOwned(body, HOST_CODE_FONT_PROPERTY)
    }
    // 侧栏填充色只在纸真的盖住侧栏时才改。纸让开侧栏时，那一列还归宿主自己画——
    // 改了这一条，没有窗口材质的平台上侧栏会变成一片没有纹理的纸色，与它右边那块接不上。
    // 从「盖」切到「让开」时要把写过的还回去，否则上次那一笔会一直留着
    if (includeSidebar) setOwned(body, HOST_SIDEBAR_PROPERTY, set.paper)
    else releaseOwned(body, HOST_SIDEBAR_PROPERTY)
}

/**
 * 撤掉纸：把我们写过的全部还原，并摘掉范围标记。
 *
 * 标记摘得晚一步也行——样式表里所有纸规则都以它为前提，摘掉之后一条都不命中，
 * 于是即使某条属性没还原成功，页面也只是回到宿主自己的样子
 */
export function clearPaperTokens(): void {
    restorePaperTokens()
    document.documentElement.removeAttribute(PAPER_ROOT_ATTRIBUTE)
    document.documentElement.removeAttribute(PAPER_DARK_ATTRIBUTE)
}

/** 某一档纸在纸面上压出来的两层底：代码块与内联代码。纸色与墨色之间取一截。

 * 深浅两档各算一次，规则只有这一条：代码底要比纸深一档、又不能深到读成一块斑。
 * 亮档落在 #e4dccd 左右，暗档落在 #292923 左右
 */
function codeSurfaces(paper: PaperDefinition): { codeBlock: string, inlineCode: string } {
    const base = toUnit(paper.paper)
    const ink = toUnit(paper.ink)
    const mix = (amount: number): string => {
        const mixed = [0, 1, 2].map((index) => Math.round(((base[index] ?? 0) * (1 - amount) + (ink[index] ?? 0) * amount) * 255))
        return "#" + mixed.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")
    }
    return {codeBlock: mix(.1), inlineCode: mix(.06)}
}

/**
 * 从明暗那一档算出这一套颜色。
 *
 * 挂载层与安装层都要它：前者在帧里按脏标记重落，后者在装上的那一刻落一次（首帧之前页面就该是纸的调子）。
 * 两处算出来的必须是同一套，所以只写这一处
 */
export function paperTokenSet(mode: PaperMode): PaperTokenSet {
    const paper = paperOf(mode)
    const surfaces = codeSurfaces(paper)
    return {
        paper: paper.paper,
        ink: paper.ink,
        inkMuted: paper.inkMuted,
        room: ROOM.palette.room,
        roomEdge: ROOM.palette.roomEdge,
        lightRgb: toUnit(ROOM.light.color).map((channel) => Math.round(channel * 255)).join(" "),
        selection: paper.selection,
        codeBlock: surfaces.codeBlock,
        inlineCode: surfaces.inlineCode,
    }
}
