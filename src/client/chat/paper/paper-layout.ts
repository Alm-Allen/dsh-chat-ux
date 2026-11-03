/**
 * 纸的覆盖范围。
 *
 * 纸是挂在 body 下的一片全屏 canvas，但它只铺聊天那一列：左侧栏与右侧栏保持 dsh 自己的样子，
 * 底色、纹理、字体、文字色一件都不经纸感的手。所以这一份回答两件事：这一帧纸该占视口哪一块矩形，
 * 以及主列之外那几列是哪几个元素（插件要在它们身上写回宿主原值，见 paper-tokens）。
 *
 * 盖住整个视口的浮层是唯一的例外：设置面板这类 body-portal 的模态横跨三列，纸那时铺满整窗，
 * 否则面板左缘那一截露在纸外、与右边被纸压过的那一截不是一个颜色。
 *
 * 判据全部来自 dsh 的语义属性——列宽在 grid 的 grid-template-columns 里，不认任何带构建期 hash 的 class
 */
import { PAPER_GLOW_ATTRIBUTE, PAPER_SHEET_ATTRIBUTE } from "./paper-styles"

// 纸占的那块矩形，单位是 CSS 像素、相对视口左上角
export interface PaperRect {
    left: number
    top: number
    width: number
    height: number
}

// AppFrame 给底部那一行放的标记；它的父元素就是那张 grid
const SHELL_BOTTOM_SELECTOR = "[data-shell-bottom]"

// dsh 在 AppFrame 那张 grid 上标的侧栏折叠态。它比列宽可靠：折叠后的列宽按平台是 0 或 56，
// 而纸要铺过那条图标轨道（读者收起的正是侧栏，那一条已经不是侧栏的内容区了）
export const SIDEBAR_COLLAPSED_ATTRIBUTE = "data-sidebar-collapsed"

// 纸自己那两片也满足「body 下、fixed、盖住视口」，量浮层时得先跳过，否则量到的是纸自己的左缘
const PAPER_LAYER_SELECTOR = `[${PAPER_SHEET_ATTRIBUTE}], [${PAPER_GLOW_ATTRIBUTE}]`

/**
 * AppFrame 那张 grid 元素。
 *
 * 三列的宽度写在它的 grid-template-columns 上：侧栏折叠、展开、拖宽都只改这一条。
 * 纸的左右缘都从那里量，所以它是纸的几何唯一的输入。[data-shell-bottom] 是它的子元素，
 * 取父元素就是它
 */
export function frameElement(): HTMLElement | null {
    const shellBottom = document.querySelector(SHELL_BOTTOM_SELECTOR)
    const frame = shellBottom === null ? null : shellBottom.parentElement
    return frame instanceof HTMLElement ? frame : null
}

// frame 的子元素里不占列的那几个：底部那一行横跨三列，浮层容器盖住整块，桌面窗口的座位只贴一角。
// 它们不是列，不该被当成侧栏去还原令牌
const NON_COLUMN_SELECTOR = "[data-shell-bottom], [data-shell-overlay], [data-shell-leading]"

/**
 * 每一列的宽度，按次序。
 *
 * grid-template-columns 的计算值就是这一串像素，形如 `280px 976px 280px`。读不到给空表，
 * 调用方据此让纸从视口最左边铺起
 */
function columnWidths(): number[] {
    const frame = frameElement()
    if (frame === null) return []
    return getComputedStyle(frame).gridTemplateColumns.trim().split(/\s+/)
        .map((track) => Number.parseFloat(track))
        .filter((width) => Number.isFinite(width))
}

/**
 * 左侧栏此刻是不是收起的。
 *
 * 收起之后 dsh 在 Windows 这类平台上留一条 56px 的图标轨道（darwin 与带 caption titlebar 的
 * 桌面是 0）。纸要一直铺到视口最左边：读者收起的正是那一列，留着一条没有纸的竖带比铺上去更显眼。
 * 判据用的是 dsh 自己那条属性，不按平台推——推出来的结果在两种收起宽度上会分叉
 */
export function sidebarCollapsed(): boolean {
    const frame = frameElement()
    if (frame === null) return false
    // closest 连自己一起认：dsh 把这条属性写在 frame 那一层 div 上
    return frame.closest(`[${SIDEBAR_COLLAPSED_ATTRIBUTE}]`) !== null
}

/**
 * 主列之外那几列：左侧栏与右侧栏。
 *
 * 主列是第二列（左 | 主 | 右 的次序由 dsh 定死）。插件在这几列身上写回宿主自己的令牌，
 * 于是它们内部读到的就是「没有这个插件时」的那一套。
 *
 * **判据是几何，不是子元素次序。** frame 的子元素不止三列：底部那一行、浮层容器、拖拽把手都在里面，
 * 按序号取会认错——认错的方向有两个，都很糟：主列被当成侧栏（聊天区丢掉纸的字与墨），
 * 或者底部行被当成侧栏（输入框那些纸感的底回到宿主）。所以只认「左缘落在某一列的起点上、
 * 宽度也等于那一列」的元素，主列那一项跳过。列宽正在过渡时会对不上，那时交空表就行——
 * 已经写下去的还原值留在元素上，不会因为一次没认到就被抹掉
 */
export function sideColumns(): HTMLElement[] {
    const frame = frameElement()
    if (frame === null) return []
    const widths = columnWidths()
    if (widths.length < 2) return []
    // 每一列的起点，相对 frame 的左缘。grid 的列从内容盒排起，frame 自己不带内边距，8px 容差兜住边框
    const starts: number[] = []
    let offset = 0
    for (const width of widths) {
        starts.push(offset)
        offset += width
    }
    const frameLeft = frame.getBoundingClientRect().left
    const columns: HTMLElement[] = []
    for (const child of frame.children) {
        if (!(child instanceof HTMLElement)) continue
        if (child.matches(NON_COLUMN_SELECTOR)) continue
        const box = child.getBoundingClientRect()
        const slot = starts.findIndex((start, index) => index !== 1
            && Math.abs(box.left - (frameLeft + start)) < 8
            && Math.abs(box.width - (widths[index] ?? 0)) < 8)
        if (slot >= 0) columns.push(child)
    }
    return columns
}

/**
 * 这一帧有没有盖住整个视口的浮层——设置面板这类 body-portal 的模态。
 *
 * 有它时纸铺满整窗。理由：这种浮层是「整屏遮罩加一块居中的面板」，窗口不够宽时面板左缘会
 * 伸进侧栏；纸平时让开左右两栏，那一条上就露着面板自己的不透明底，与它右边被纸压过的那一截
 * 不是一个颜色。铺满之后整块面板都在纸下，两栏让位到浮层关闭为止。
 *
 * 怎么认：body 的直接子元素里，位置是 fixed、且盖住视口九成以上的；纸自己那两片也满足
 * 这几条，先跳过；#root 是页面本身，不算浮层
 */
export function overlayCoversViewport(): boolean {
    const body = document.body
    if (body === null) return false
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    for (const element of body.children) {
        if (element.matches(PAPER_LAYER_SELECTOR)) continue
        if (element.id === "root") continue
        if (getComputedStyle(element).position !== "fixed") continue
        const box = element.getBoundingClientRect()
        if (box.width >= viewportWidth * 0.9 && box.height >= viewportHeight * 0.9) return true
    }
    return false
}

/**
 * 这一帧纸该占的矩形。
 *
 * overlayCovers 为假时把左栏与右栏那两条竖带让出去，为真时铺满整个视口。
 * 这个函数只在尺寸真的变了的时候才算一次（见 paper-mount 的脏标记）
 */
export function measurePaperRect(overlayCovers: boolean): PaperRect {
    const viewportWidth = Math.max(1, Math.round(window.innerWidth))
    const viewportHeight = Math.max(1, Math.round(window.innerHeight))
    if (overlayCovers) return {left: 0, top: 0, width: viewportWidth, height: viewportHeight}
    const widths = columnWidths()
    // 侧栏收起时那条轨道归纸：纸一下铺到最左边，侧栏在它底下收回（展开时反过来，纸跟着列宽滑开）
    const left = sidebarCollapsed()
        ? 0
        : Math.min(viewportWidth - 1, Math.max(0, Math.round(widths[0] ?? 0)))
    // 右侧栏只在三列时存在。两列时最后那一项就是主列，不能扣
    const right = widths.length >= 3 ? Math.max(0, Math.round(widths[widths.length - 1] ?? 0)) : 0
    const width = Math.max(1, viewportWidth - left - Math.min(right, viewportWidth - left - 1))
    return {left, top: 0, width, height: viewportHeight}
}
