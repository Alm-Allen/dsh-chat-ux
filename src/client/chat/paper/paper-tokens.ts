/**
 * 纸感的配色令牌。
 *
 * 本插件从不写 --dsw-alias-*：那是宿主的语义别名，也是别的皮肤（dsh-claude-style 之类）在改的同一条通道。
 * 纸只需要把底色、墨色、房间色这几样交给自己的一套变量，样式表再从这些变量派生。
 *
 * 但纸色必须先落到宿主真正画底的那条令牌上，否则 canvas 的 multiply 只能压出光照，纸会透成
 * 宿主原来的米白（shader 里的 albedo 是接近白的）。所以这里分两步：
 *   1. 我们自己的一整套 `--dsh-chat-ux-paper-*`，写在根元素上，样式表、光标、辉光都读它；
 *   2. 宿主的几条令牌（整页底色、侧栏填充色、正文与代码字族），只写纸自己那一项值。
 * 第二条是「纸盖上去之后底色得是纸色」这件事无法绕开的最小代价；每一笔都记着原值与优先级，
 * 卸载与关掉时逐项还原，别人后写过的就不抢回来
 *
 * 写在哪个元素上是有讲究的，这不是风格问题而是层级问题：dsh 的 ui-theme 把 `--dsw-alias-bg-base`
 * 定义在 `body` 上（design-platform.css 的 `body { … }`），主题包又把 `--dsh-font-family-text`
 * 写在 body 上。内联写在 `html` 上只是「根元素的声明」，body 自己的声明是本地声明、赢过继承——
 * 实测就是这么翻的车：html 上是 #efdfbd，body 上算出来仍是 #fff。所以宿主那几条一律写到 body 上
 */

import {toUnit} from "./paper-math"
import {paperOf, resolveProfile, roomOf} from "./paper-tables"

// 本插件自己的变量前缀
export const PAPER_PREFIX = "--dsh-chat-ux-paper-"

// 会被改写的宿主令牌。三条：整页底色、侧栏填充色、正文与代码的字族
const HOST_BASE_PROPERTY = "--dsw-alias-bg-base"
const HOST_SIDEBAR_PROPERTY = "--dsw-specific-sidebar-fill"
const HOST_TEXT_FONT_PROPERTY = "--dsh-font-family-text"
const HOST_CODE_FONT_PROPERTY = "--dsh-font-family-code"

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
	// 灯照不到的暗角强度，0 到 1
	vignette: number
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

// 记下原值并写入。同一个元素上的同一名字只记第一次的原值
function setOwned(element: HTMLElement, name: string, value: string, priority = ""): void {
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

// 还回一元素上的一笔。当下值已经不等于我们写的那一个时不动手——那说明别家后写过，抢回去会抹掉它
function releaseOwned(element: HTMLElement, name: string): void {
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
export function applyPaperTokens(set: PaperTokenSet, includeSidebar: boolean): void {
	const root = document.documentElement
	const body = document.body
	// 先在 root 上挂一条范围标记，样式表靠它决定纸层与光标那几张表要不要生效
	root.setAttribute(PAPER_ROOT_ATTRIBUTE, "")
	// 自己那一套写在根元素上：没有别人定义过它们，继承就能一路到每个元素
	const ownPairs: Array<[string, string]> = [
		[PAPER_PREFIX + "paper", set.paper],
		[PAPER_PREFIX + "ink", set.ink],
		[PAPER_PREFIX + "ink-muted", set.inkMuted],
		[PAPER_PREFIX + "room", set.room],
		[PAPER_PREFIX + "room-edge", set.roomEdge],
		[PAPER_PREFIX + "light-rgb", set.lightRgb],
		[PAPER_PREFIX + "selection", set.selection],
		[PAPER_PREFIX + "vignette", String(set.vignette)],
	]
	for (const [name, value] of ownPairs) setOwned(root, name, value)
	// 宿主那几条得写在 body 上：ui-theme 在 body 的规则里定义它们，内联写在根元素上只算「根元素的声明」，
	// 输给 body 自己的本地声明。body 还没建出来（脚本跑得比文档早）时这一帧先跳过，下一帧会再来
	if (body === null) return
	setOwned(body, HOST_BASE_PROPERTY, set.paper)
	// 字族跟着纸感走：关掉时这两条会被还原，页面回到 dsh 自己那套或读者在设置里填的那套
	setOwned(body, HOST_TEXT_FONT_PROPERTY, PAPER_TEXT_FONT_STACK)
	setOwned(body, HOST_CODE_FONT_PROPERTY, PAPER_CODE_FONT_STACK)
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
}

// 挂在根元素上的范围标记：纸开着且有值时才在
export const PAPER_ROOT_ATTRIBUTE = "data-dsh-chat-ux-paper"

/**
 * 从纸样那一串算出这一套颜色。
 *
 * 挂载层与安装层都要它：前者在帧里按脏标记重落，后者在装上的那一刻落一次（首帧之前页面就该是纸的调子）。
 * 两处算出来的必须是同一套，所以只写这一处
 */
export function paperTokenSet(style: string): PaperTokenSet {
	const profile = resolveProfile(style)
	const paper = paperOf(profile)
	const room = roomOf(profile)
	return {
		paper: paper.paper,
		ink: paper.ink,
		inkMuted: paper.inkMuted,
		room: room.palette.room,
		roomEdge: room.palette.roomEdge,
		lightRgb: toUnit(room.light.color).map((channel) => Math.round(channel * 255)).join(" "),
		// 选区色：暗纸用纸自带的那一支，亮纸用房间的描金。与 nocturne 的 washColor 同一条规则
		selection: paper.appearance === "dark" ? paper.selection : (room.selection === "" ? paper.selection : room.selection),
		vignette: room.atmosphere.vignette,
	}
}
