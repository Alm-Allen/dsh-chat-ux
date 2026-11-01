/**
 * 纸的覆盖范围。
 *
 * 纸是挂在 body 下的一片全屏 canvas，但它不一定覆盖整个视口：读者自建的桌面把左侧栏做成了
 * 透明的窗口材质（`data-window-material` 与 darwin 平台都会让 dsh 把 frame 的背景交出去），
 * 纸往那一块盖上去，透出来的就不是桌面而是纸纹，那块玻璃当场失效。
 *
 * 所以这里只回答一件事：这一帧纸该占视口的哪一块矩形。判据全部来自 dsh 的语义属性——
 * 列宽在 grid 的 grid-template-columns 里，不认任何带构建期 hash 的 class
 */

// 纸占的那块矩形，单位是 CSS 像素、相对视口左上角
export interface PaperRect {
	left: number
	top: number
	width: number
	height: number
}

// 桌面版把窗口材质交出去的那两个标记：darwin 平台与 Windows 11 的 acrylic
const WINDOW_MATERIAL_ATTRIBUTE = "data-window-material"
const PLATFORM_ATTRIBUTE = "data-platform"

// AppFrame 给底部那一行放的标记；它的父元素就是那张 grid
const SHELL_BOTTOM_SELECTOR = "[data-shell-bottom]"

/**
 * 左侧栏此刻是不是「透出窗口材质」的状态。
 *
 * 两个标记任一在场就说明 dsh 已经把 frame 的底色交了出去（frame 变透明、侧栏只留一层 tint），
 * 侧栏的观感来自它背后的窗口，不是页面自己画的。这种时候纸不能盖上去
 */
export function sidebarRevealsWindowMaterial(): boolean {
	const root = document.documentElement
	const platform = root.getAttribute(PLATFORM_ATTRIBUTE)
	if (platform === "darwin") return true
	const material = root.getAttribute(WINDOW_MATERIAL_ATTRIBUTE)
	if (material === "translucent") return true
	// 两个标记也可能落在 body 上：一并认，认不到就当作没有材质
	return document.body !== null && document.body.getAttribute(WINDOW_MATERIAL_ATTRIBUTE) === "translucent"
}

/**
 * 左侧栏的宽度。取不到给 0，调用方据此退回「整块视口」。
 *
 * 列宽写在 AppFrame 那层 grid 的 grid-template-columns 上，形如 `280px minmax(...) minmax(...)`。
 * 只读第一项：sidebar | center | rightbar 的三列顺序由 dsh 定死，第一个数字就是左栏
 */
export function sidebarWidth(): number {
	const shellBottom = document.querySelector(SHELL_BOTTOM_SELECTOR)
	const frame = shellBottom === null ? null : shellBottom.parentElement
	if (frame === null) return 0
	const columns = getComputedStyle(frame).gridTemplateColumns
	const first = columns.trim().split(/\s+/)[0]
	if (first === undefined) return 0
	const width = Number.parseFloat(first)
	return Number.isFinite(width) && width > 0 ? width : 0
}

/**
 * 纸到底要不要盖住左侧栏：读者的选择，再让一层平台判据。
 *
 * 两项都为真才盖。第二项是给自建桌面准备的——那边的左侧栏是仿 macOS 的透明窗口材质，
 * 观感来自它背后的窗口而不是页面自己画的，纸盖上去那块玻璃当场失效。这种平台上无论开关怎么选
 * 都不盖：留一块不铺纸的侧栏，比铺上去把读者的桌面材质弄没要好。判据本身在
 * sidebarRevealsWindowMaterial()，它认的是 dsh 的语义属性
 */
export function paperIncludesSidebar(requested: boolean): boolean {
	return requested && !sidebarRevealsWindowMaterial()
}

/**
 * 这一帧纸该占的矩形。
 *
 * includeSidebar 为 false 时把左栏那条竖带让出去；让出去之后纸的尺寸会变，所以这个函数
 * 只在尺寸真的变了的时候才算一次（见 paper-mount 的脏标记）
 */
export function measurePaperRect(includeSidebar: boolean): PaperRect {
	const viewportWidth = Math.max(1, Math.round(window.innerWidth))
	const viewportHeight = Math.max(1, Math.round(window.innerHeight))
	if (includeSidebar) return {left: 0, top: 0, width: viewportWidth, height: viewportHeight}
	const inset = Math.min(viewportWidth - 1, Math.max(0, Math.round(sidebarWidth())))
	return {left: inset, top: 0, width: Math.max(1, viewportWidth - inset), height: viewportHeight}
}
