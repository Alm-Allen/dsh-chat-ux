/**
 * 纸的覆盖范围。
 *
 * 纸是挂在 body 下的一片全屏 canvas，但它不一定覆盖整个视口：读者自建的桌面把左侧栏做成了
 * 透明的窗口材质（`data-window-material` 与 darwin 平台都会让 dsh 把 frame 的背景交出去），
 * 纸往那一块盖上去，透出来的就不是桌面而是纸纹，那块玻璃当场失效。
 *
 * 所以这一份回答两件事：这一帧纸该占视口的哪一块矩形，以及侧栏那条竖带由谁来铺。
 * 让开不等于没有纸感——侧栏自己那层半透明纸纹由 sidebarPaintsOwnTexture() 决定，
 * 它只叠纹理、不给底色，于是玻璃还透得出来。
 *
 * 判据全部来自 dsh 的语义属性——列宽在 grid 的 grid-template-columns 里，
 * 不认任何带构建期 hash 的 class
 */
import { PAPER_GLOW_ATTRIBUTE, PAPER_SHEET_ATTRIBUTE } from "./paper-styles"

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

// 纸自己那两片也满足「body 下、fixed、盖住视口」，量浮层时得先跳过，否则量到的是纸自己的左缘
const PAPER_LAYER_SELECTOR = `[${PAPER_SHEET_ATTRIBUTE}], [${PAPER_GLOW_ATTRIBUTE}]`

// 这一页见过窗口材质没有。见过一次就一直是 true，详见下面那份函数的注释
let windowMaterialSeen = false

/**
 * 左侧栏是不是「透出窗口材质」的那种。
 *
 * 两个标记任一在场就说明 dsh 已经把 frame 的底色交了出去（frame 变透明、侧栏只留一层 tint），
 * 侧栏的观感来自它背后的窗口，不是页面自己画的。这种时候纸不能盖上去
 *
 * **判据是「见过一次就永远算数」，不是「此刻标记在不在」。** 这一条是被一个真实故障逼出来的：
 * Windows 的 acrylic 只在窗口有焦点时存在，失焦那一刻 dsh 就把 data-window-material 摘掉
 * （apps/desktop 的 syncMaterial 在 blur 时发 none、focus 时发 translucent）。若照当下的标记判，
 * 最小化一下窗口就会让判据翻成「没有材质」，于是纸盖住侧栏、侧栏填充色被写成不透明的纸色；
 * 回到前台标记虽然恢复了，可那笔不透明色已经写下去，读者看到的就是「最小化一下，侧栏变成
 * 一张纸、再也不玻璃了」。
 *
 * 粘性的依据是「一个页面的窗口材质能力在它的生命周期里不会变」：有材质的平台不会中途变成没有，
 * 失焦只是系统临时撤下材质、换了不透明底，页面里那层纸不该跟着改成不透明的。
 * 反过来，没有材质的平台（普通浏览器、Linux）从一开始标记就不在，粘性也不会让它凭空变真
 */
export function sidebarRevealsWindowMaterial(): boolean {
    if (windowMaterialSeen) return true
    const root = document.documentElement
    if (root.getAttribute(PLATFORM_ATTRIBUTE) === "darwin") return rememberWindowMaterial()
    if (root.getAttribute(WINDOW_MATERIAL_ATTRIBUTE) === "translucent") return rememberWindowMaterial()
    // 两个标记也可能落在 body 上：一并认，认不到就当作没有材质
    if (document.body?.getAttribute(WINDOW_MATERIAL_ATTRIBUTE) === "translucent") return rememberWindowMaterial()
    return false
}

// 记下「这个页面确实有窗口材质」，之后即使标记被撤也照旧算数
function rememberWindowMaterial(): boolean {
    windowMaterialSeen = true
    return true
}

/**
 * 此刻窗口材质在不在。与上面那份**故意不粘**，两件事分开：
 *
 * 上面那份回答「这个页面有没有玻璃」（生命周期内不变，所以粘性）；
 * 这一份回答「这一秒底下还有东西可透吗」（会变，所以现读）。
 *
 * 为什么要分开：Windows 的 acrylic 在失焦时被系统撤下，dsh 把 data-window-material 摘掉。
 * 那一刻侧栏底下就没有材质了，宿主的回退路径（.sidebarCol::before 那层实底浮上来）才该生效。
 * 粘性判据把这条路挡住了，于是失焦期间侧栏只剩一层 85% 的 tint 浮在没底的窗口上——
 * 底下透出来的是窗口自己的背景色，与别处对不上，读者看到的是一条与周围不同的暗带。
 *
 * 所以「纸要不要盖侧栏」继续用粘性那份（不让整页纸压过来），而侧栏那层纸纹要按这一份来：
 * 材质不在时把纸纹收起来，把底让给宿主的回退填充
 */
export function windowMaterialPresent(): boolean {
    const root = document.documentElement
    if (root.getAttribute(PLATFORM_ATTRIBUTE) === "darwin") return true
    if (root.getAttribute(WINDOW_MATERIAL_ATTRIBUTE) === "translucent") return true
    // 两个标记也可能落在 body 上，与 sidebarRevealsWindowMaterial 认的是同一组
    return document.body?.getAttribute(WINDOW_MATERIAL_ATTRIBUTE) === "translucent"
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
 * 左侧栏那一列的元素。定位不到、或者认出来不是侧栏，都给 null。
 *
 * [data-shell-bottom] 是 AppFrame 那张 grid 的子元素，取它的父元素就是 grid；grid 的第一个
 * 元素子元素就是侧栏那一列（DocumentTitle 什么都不渲染，列次序由 dsh 定死）。这跟 sidebarWidth()
 * 是同一条前提——那一份读的也是「第一列」。
 *
 * 交出之前对一次几何：侧栏是 grid 第一列，它的宽度就该等于第一项列宽。这条校验是给 dsh 升级
 * 准备的——哪天第一列不再装侧栏，宁可这层纸纹不画，也不要把纹理贴到别的列上。取不到列宽
 * 或者对不上，一律当作没有侧栏
 */
export function sidebarElement(): HTMLElement | null {
    const shellBottom = document.querySelector(SHELL_BOTTOM_SELECTOR)
    const frame = shellBottom === null ? null : shellBottom.parentElement
    const first = frame === null ? null : frame.firstElementChild
    if (!(first instanceof HTMLElement)) return null
    // 容差 8px：列宽动画期间，列自身的矩形与 grid-template-columns 的插值会差一点。
    // 两边都是 0（侧栏折叠成零宽）同样算通过：标记留在那儿，展开时纹理立刻就在，
    // 不必等谁再来挂一次
    return Math.abs(first.getBoundingClientRect().width - sidebarWidth()) < 8 ? first : null
}

/**
 * 全屏那一层纸要不要盖住左侧栏：只看平台，没有读者开关。
 *
 * 自建桌面的左侧栏是仿 macOS 的透明窗口材质，观感来自它背后的窗口而不是页面自己画的，
 * 纸盖上去那块玻璃当场失效。所以这种平台上纸让开侧栏，其余平台一律盖满。
 * 判据本身在 sidebarRevealsWindowMaterial()，它认的是 dsh 的语义属性
 *
 * 让开之后侧栏并不是没有纸感：纸纹改为由侧栏自己那一层半透明纹理提供，见 sidebarPaintsOwnTexture()
 *
 * **这个返回值还是 `--dsw-specific-sidebar-fill` 那一笔的开关**（paper-tokens 的
 * applyPaperTokens 第三个参数）。它必须在材质平台上恒为假：那一笔写进去的是不透明的纸色，
 * 落在侧栏上会把 dsh 那层 85% 的 tint（只剩 15% 透光）整个盖死，窗口材质当场消失。
 * 现在走不到是因为这里的平台判据；哪天有人把判据放宽，侧栏的玻璃会跟着一起没 */
export function paperIncludesSidebar(): boolean {
    return !sidebarRevealsWindowMaterial()
}

/**
 * 侧栏要不要由插件自己叠一层纸纹。
 *
 * 只在「全屏那一层纸让开了侧栏」时画。让开的原因正是窗口材质，所以这一条读作
 * 「玻璃要透出来，纸纹改用一层不挡光的纹理补上」——纸感在这一列上仍然成立，只是换了个画法；
 * 纸感总开关关掉时它跟整块纸一起收。
 *
 * 全屏纸盖住侧栏时（没有窗口材质的平台）这一条为假——那边纸面 canvas 已经用 multiply 压过整列，
 * 再叠一层细纹只会把侧栏从它右边那半张纸里挑出来
 */
export function sidebarPaintsOwnTexture(): boolean {
    return !paperIncludesSidebar()
}

/**
 * 这一帧有没有盖住整个视口的浮层——设置面板这类 body-portal 的模态。
 *
 * 有它时纸铺满整窗。理由：这种浮层是「整屏遮罩加一块居中的面板」，窗口不够宽时面板左缘会
 * 伸进侧栏；纸平时让开侧栏，那一条上就露着面板自己的不透明底，与它右边被纸压过的那一截
 * 不是一个颜色。铺满之后整块面板都在纸下，侧栏的玻璃让位到浮层关闭为止。
 *
 * 怎么认：body 的直接子元素里，位置是 fixed、且盖住视口九成以上的；纸自己那三片也满足
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
 * coversSidebar 为 false 时把左栏那条竖带让出去，为 true 时铺满整个视口。
 * 这个函数只在尺寸真的变了的时候才算一次（见 paper-mount 的脏标记）
 */
export function measurePaperRect(coversSidebar: boolean): PaperRect {
    const viewportWidth = Math.max(1, Math.round(window.innerWidth))
    const viewportHeight = Math.max(1, Math.round(window.innerHeight))
    if (coversSidebar) return {left: 0, top: 0, width: viewportWidth, height: viewportHeight}
    const inset = Math.min(viewportWidth - 1, Math.max(0, Math.round(sidebarWidth())))
    return {left: inset, top: 0, width: Math.max(1, viewportWidth - inset), height: viewportHeight}
}
