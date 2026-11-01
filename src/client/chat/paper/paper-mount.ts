/**
 * 纸的挂载与帧循环。
 *
 * 这一层只做三件事：把两片 canvas 与那层暗角挂上去、按脏标记决定这一帧要不要重算、以及在
 * 卸载时把挂过的全部撤干净。渲染本身在 paper-light 与 paper-glow，配色在 paper-tokens，
 * 覆盖范围在 paper-layout
 *
 * 节流的三条照搬 nocturne，它们是这个插件能和长会话共存的原因：
 *   一、纸纹（SURFACE）只在尺寸、纸样、纸纹强度变了时重算；
 *   二、光照（LIGHT）只在灯架变了时重算，不是每帧；
 *   三、辉光（screen 混合，最贵的那一层）只在灯重算过、光标动了、或者开着环境动效时重画
 * 空闲时整条循环压到 8 fps，有动效时才回到 30 fps；页面看不见时整条停掉
 */
import {GlowLayer, poolColor, poolStrength} from "./paper-glow"
import type {GlowFrame} from "./paper-glow"
import {measurePaperRect, paperIncludesSidebar} from "./paper-layout"
import type {PaperRect} from "./paper-layout"
import {PaperLight} from "./paper-light"
import {ambientLevel, buildRig} from "./paper-light-model"
import {
	PAPER_CSS, PAPER_GLOW_ATTRIBUTE, PAPER_HIDDEN_ATTRIBUTE, PAPER_SHEET_ATTRIBUTE, PAPER_VIGNETTE_ATTRIBUTE,
} from "./paper-styles"
import {applyPaperTokens, clearPaperTokens, paperTokenSet} from "./paper-tokens"
import {PAPER_DEFAULT_SETTINGS, paperOf, resolveProfile, roomOf} from "./paper-tables"
import type {PaperSettings} from "./paper-tables"
import {toUnit} from "./paper-math"

// 读者那边的三个开关，外加光标位置。每帧现读，所以运行期改配置不必重新安装
export interface PaperOptions {
	// 纸感总开关
	on: boolean
	// 纸与房间的组合 id，见 paper-tables 的 profileId
	style: string
	// 纸要不要盖住左侧栏。读者自建桌面把侧栏做成窗口材质时，这一项必须是 false
	includeSidebar: boolean
}

// 挂载结果
export interface PaperMountHandle {
	// 撤掉两片 canvas、暗角、令牌与全部监听
	dispose: () => void
	// 配置变了就调它：令牌与纸样都要重落，下一帧重算
	refresh: () => void
	// 只重落令牌，不动几何
	refreshTokens: () => void
}

// 安装层对外的把手：纸开着时它转调挂载层，关着时两个都是空操作
export interface PaperHandle {
	// 卸掉纸，令牌一并还原
	dispose: () => void
	// 纸样或覆盖范围变了：令牌与纸纹都重落，下一帧重算。没装的时候是空操作
	refresh: () => void
}

// 光标那一圈辉光与灯的横向偏移都读它；量不出来给 null
interface CaretPoint {
	x: number
	y: number
}

// 自绘插入符那一根上的标记，由 caret-motion 写。纸只读它，不参与插符的接管
const CARET_LAYER_ATTRIBUTE = "data-chat-ux-caret-layer"

// 样式表的 id。纸的规则整块在 paper-styles 里，这里只负责注入一次
const STYLE_ID = "dsh-chat-ux-paper-style"

/**
 * 注入纸的样式表。重复调用是幂等的；样式表本身以根元素上那个标记为前提，
 * 所以纸关着时它虽然躺在 head 里，却一条规则都不命中
 */
function ensurePaperStyle(): void {
	if (document.getElementById(STYLE_ID) !== null) return
	const style = document.createElement("style")
	style.id = STYLE_ID
	style.dataset.plugin = "dsh-chat-ux"
	style.textContent = PAPER_CSS
	document.head.appendChild(style)
}

// 一帧最多一次，这一层自己不改任何 DOM 的时机
const IDLE_INTERVAL_MS = 1000 / 8
const ACTIVE_INTERVAL_MS = 1000 / 30

// 一张全屏画布的像素预算。DOM 文字仍按系统 DPR 清晰渲染，这里只限制纸与光的采样率
const PIXEL_BUDGET = 1950000

/**
 * 挂上纸。
 *
 * options 是现读的函数而不是快照：配置改了不必重装，下一帧自然读到新值；
 * 只有纸样真的变了才需要 refresh()
 */
export function installPaper(readOptions: () => PaperOptions): PaperMountHandle {
	const sheetCanvas = document.createElement("canvas")
	const glowCanvas = document.createElement("canvas")
	const vignette = document.createElement("div")
	sheetCanvas.setAttribute(PAPER_SHEET_ATTRIBUTE, "")
	glowCanvas.setAttribute(PAPER_GLOW_ATTRIBUTE, "")
	vignette.setAttribute(PAPER_VIGNETTE_ATTRIBUTE, "")
	for (const node of [sheetCanvas, glowCanvas, vignette]) node.setAttribute("aria-hidden", "true")
	// 三件都直接挂 body 下：包一层带 z-index 的容器会给它们造一个隔离栈，
	// multiply 与页面断开之后就退化成直接覆盖（nocturne 实测过）
	document.body.append(sheetCanvas, glowCanvas, vignette)

	// 样式表跟着挂载走：纸关掉时它一条都不命中（根上没有那个标记），所以不需要按开关装卸
	ensurePaperStyle()

	const paperLight = new PaperLight(sheetCanvas)
	const glow = new GlowLayer(glowCanvas)
	const settings: PaperSettings = {...PAPER_DEFAULT_SETTINGS}
	const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
	let reduceMotion = reduceMotionQuery.matches

	let rect: PaperRect = {left: 0, top: 0, width: 1, height: 1}
	let pixelRatio = 1
	// 纸纹要重算。尺寸、纸样、纸纹强度任一变了就置起来
	let needsBuild = true
	// 光照要重算。灯架变了就置起来
	let needsLight = true
	let needsGlow = true
	let lastCaret: CaretPoint | null = null
	let lastLightAt = 0
	let lastPaintAt = 0
	let frameHandle = 0
	let disposed = false
	// 上一帧算出来「有没有在动」，它决定下一帧的间隔
	let active = false
	// 上一次落地的组合 id 与画布尺寸，用来判断这几样到底变了没有
	let lastStyle = ""
	let lastLayoutKey = ""

	// 页面上还在不在。整块纸关掉时把它撤了，省下一次全屏 multiply 的合成。
	//
	// 不用 hidden 属性：本插件的样式表给这三件写了 display: block，作者样式恒赢过 UA 的
	// [hidden]{display:none}，于是 hidden 一点作用都没有——实测加了它之后 computed display
	// 仍是 block，截图与纸开逐字节相同。所以这套用自己的一条规则（PAPER_HIDDEN_ATTRIBUTE）
	// 一并把 display 与定位都撤掉
	const setAttached = (attached: boolean): void => {
		for (const node of [sheetCanvas, glowCanvas, vignette]) {
			if (attached) node.removeAttribute(PAPER_HIDDEN_ATTRIBUTE)
			else node.setAttribute(PAPER_HIDDEN_ATTRIBUTE, "")
		}
	}

	// 自绘插入符此刻在哪。量不出来给 null，那一圈辉光就不画
	const readCaret = (): CaretPoint | null => {
		const layer = document.querySelector("[" + CARET_LAYER_ATTRIBUTE + "]")
		if (layer === null) return null
		const box = layer.getBoundingClientRect()
		if (box.width === 0 && box.height === 0) return null
		return {x: box.left, y: box.top + box.height / 2}
	}

	// 把三件的几何落到 DOM 上。纸不覆盖侧栏时那几项就是侧栏右边那一块，
	// canvas 的 CSS 尺寸与它在视口里的偏移一起改，着色器里的坐标系仍以 canvas 自己为准
	const applyRect = (): void => {
		for (const canvas of [sheetCanvas, glowCanvas]) {
			canvas.style.left = rect.left + "px"
			canvas.style.top = rect.top + "px"
			canvas.style.width = rect.width + "px"
			canvas.style.height = rect.height + "px"
		}
		vignette.style.left = rect.left + "px"
		vignette.style.top = rect.top + "px"
		vignette.style.width = rect.width + "px"
		vignette.style.height = rect.height + "px"
	}

	// 纸的像素尺寸按预算压一次：超过预算就按面积开方降 DPR，最低 0.5
	const computePixelRatio = (): number => {
		const budget = Math.sqrt(PIXEL_BUDGET / (rect.width * rect.height))
		return Math.max(0.5, Math.min(2, window.devicePixelRatio || 1, budget))
	}

	// 令牌跟着纸样落。纸样换了要重算纸纹，所以这里顺手把脏标记置上
	const refreshTokens = (): void => {
		const options = readOptions()
		if (!options.on) {
			clearPaperTokens()
			return
		}
		applyPaperTokens(paperTokenSet(options.style), paperIncludesSidebar(options.includeSidebar))
		if (options.style !== lastStyle) {
			lastStyle = options.style
			needsBuild = true
		}
	}

	// 切纸样时只有令牌与纸纹要重算，光与辉光跟着脏标记走
	const refresh = (): void => {
		if (disposed) return
		refreshTokens()
		const options = readOptions()
		rect = measurePaperRect(paperIncludesSidebar(options.includeSidebar))
		pixelRatio = computePixelRatio()
		applyRect()
		needsBuild = true
		needsLight = true
		needsGlow = true
		wake()
	}

	// 要不要再来一帧。纸面与辉光都是「算一次就静止」的，所以大多数时候这里返回 false，
	// 整条循环随之停下——不是降频，是不跑
	const paint = (now: number): boolean => {
		const options = readOptions()
		// 关掉、或者这台机器的 WebGL 起不来：两片 canvas 收起来，令牌也撤掉。
		// 令牌留着会让整页停在一张没有纹理的纸色上，那比不铺纸更难看
		if (!options.on || paperLight.state === "failed") {
			setAttached(false)
			clearPaperTokens()
			lastStyle = ""
			lastLayoutKey = ""
			return false
		}
		setAttached(true)
		const profile = resolveProfile(options.style)
		const paper = paperOf(profile)
		const room = roomOf(profile)

		// 换了纸样：令牌要重落，纸纹要重算。这两件都不必等调用方来 refresh
		if (options.style !== lastStyle) refreshTokens()

		// 布局变了才重新量。窗口尺寸、侧栏宽度、是否覆盖侧栏，三者合起来能唯一确定那块矩形
		// 平台判据也在这一句里落地：窗口材质的平台上 includeSidebar 恒为假，几何与令牌一起让开
		const includeSidebar = paperIncludesSidebar(options.includeSidebar)
		const desired = measurePaperRect(includeSidebar)
		const layoutKey = includeSidebar + ":" + desired.left + ":" + desired.width + "x" + desired.height
		if (layoutKey !== lastLayoutKey) {
			lastLayoutKey = layoutKey
			const changed =
				desired.left !== rect.left || desired.width !== rect.width || desired.height !== rect.height
			rect = desired
			pixelRatio = computePixelRatio()
			applyRect()
			// 覆盖范围变了，侧栏填充色要不要写也跟着变，令牌重落一次
			refreshTokens()
			if (changed) needsBuild = true
		}

		if (needsBuild) {
			paperLight.build({width: rect.width, height: rect.height, pixelRatio, paper, texture: settings.texture})
			glow.resize(rect.width, rect.height, pixelRatio)
			needsBuild = false
			needsLight = true
		}

		const caret = readCaret()
		// 灯的横向偏移要的是光标在纸上的坐标；纸不覆盖侧栏时那一段要扣掉
		const caretSheetX = caret === null ? rect.width / 2 : caret.x - rect.left
		const rig = buildRig({width: rect.width, height: rect.height}, caretSheetX, room, settings)
		const animateGrain = settings.grain > 0 && !reduceMotion
		const time = animateGrain ? now / 1000 : 0

		const caretMoved = caret === null
			? lastCaret !== null
			: lastCaret === null || Math.abs(caret.x - lastCaret.x) > 0.5 || Math.abs(caret.y - lastCaret.y) > 0.5
		const caretAppeared = (caret === null) !== (lastCaret === null)
		const dustDue = settings.particles > 0 && !reduceMotion && now - lastPaintAt > 60

		// 光照只要灯没动就不重算。颗粒要动的时候它得跟着走，否则噪点是死的
		let lightRan = false
		if (needsLight || (animateGrain && now - lastLightAt > 120)) {
			paperLight.render({
				rig,
				paper,
				room,
				settings: {...settings, lamp: settings.lamp},
				time,
				reduceMotion,
			})
			needsLight = false
			lastLightAt = now
			lightRan = true
		}

		// 辉光这一层只在「有光池、有尘埃、或者要跟光标那一圈余温」时才有内容可画。
		// 静止的台灯下这三样一件都不剩：颗粒与尘埃都关着、光池强度也降到了 0，整层是空的。
		// 空着还挂在页面上时，浏览器仍要为它付一次全屏 screen 合成——那是实测里帧间隔翻倍的主因
		// （纸开 p95 33.4ms、纸关 16.8ms，而两片 canvas 的 GL 绘制计数都是 0）。
		// 所以这一层按「有没有内容」显式收起来，而不是画一张全透明的图
		const glowMatters = settings.particles > 0 || settings.cursorGlow > 0 || poolStrength(rig, paper.appearance) > 0
		if (glowMatters && (lightRan || needsGlow || caretMoved || caretAppeared || dustDue)) {
			const lightChannels = toUnit(room.light.color).map((channel) => Math.round(channel * 255))
			const frame: GlowFrame = {
				rig,
				lamp: settings.lamp,
				rgb: lightChannels.join(", "),
				poolRgb: poolColor(room, paper.appearance),
				appearance: paper.appearance,
				intensity: settings.intensity,
				particles: settings.particles,
				cursorGlow: settings.cursorGlow,
				cursor: caret === null ? null : {x: caret.x - rect.left, y: caret.y - rect.top},
				time,
			}
			glow.render(frame)
			needsGlow = false
			glowCanvas.removeAttribute(PAPER_HIDDEN_ATTRIBUTE)
		} else if (!glowMatters) {
			glowCanvas.setAttribute(PAPER_HIDDEN_ATTRIBUTE, "")
		}

		lastCaret = caret
		// 只有「跟着光标走」的那一路光源需要持续跟帧：它每挪一次，整片纸的明暗都要重算。
		// 台灯与月光都只看纸的尺寸与房间预设，静止下来之后一个像素都不会再变，所以这里返回 false
		return rig.tracksCaret && !reduceMotion
	}

	/**
	 * 跑一帧。
	 *
	 * 与 nocturne 那版最大的差别在这里：它每帧都无条件排下一次 rAF，靠 8 fps / 30 fps 的间隔省电；
	 * 这里干脆不排——纸光与辉光都是算一次就静止的，只要没有东西再变，循环就停下，
	 * 于是静置时是 0 帧而不是 8 帧。有东西变了由 wake() 把它叫醒
	 *
	 * 里面出任何异常都不许把循环掐断，否则纸会停在最后一帧再也不动
	 */
	const tick = (now: number): void => {
		frameHandle = 0
		if (disposed) return
		const interval = active && !reduceMotion ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS
		if (now - lastPaintAt < interval) {
			frameHandle = requestAnimationFrame(tick)
			return
		}
		lastPaintAt = now
		let keepGoing = false
		try {
			keepGoing = paint(now)
		} catch (error) {
			console.warn("dsh-chat-ux: paper frame failed", error)
		}
		// 下一帧要不要按 30 fps 跑。只有「这一帧还想再来一遍」才算在动——台灯与月光永远返回 false，
		// 于是整条循环停下；跟着光标走的那一路才会把它置起来
		active = keepGoing
		if (keepGoing && !document.hidden) frameHandle = requestAnimationFrame(tick)
	}

	// 叫醒循环。已经醒着时是空操作
	const wake = (): void => {
		if (disposed || document.hidden || frameHandle !== 0) return
		// 叫醒之后先等一个空闲间隔再画：一批 resize 与配置变化会连着叫好几次，只该画一次
		lastPaintAt = 0
		frameHandle = requestAnimationFrame(tick)
	}

	// 窗口尺寸变了：矩形与像素比一起重算，纸纹要重建
	const onResize = (): void => {
		lastLayoutKey = ""
		needsBuild = true
		needsLight = true
		needsGlow = true
		wake()
	}

	// 页面看不见时停掉循环：一张一直在重算的纸，后台没人看，白烧电
	const onVisibility = (): void => {
		if (document.hidden) {
			if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
			frameHandle = 0
			return
		}
		needsLight = true
		needsGlow = true
		wake()
	}

	// 显卡被回收（切后台、驱动重置、显存吃紧）时不能白屏：让 context 自己回来，再整块重建纸纹
	const onContextLost = (event: Event): void => {
		event.preventDefault()
		paperLight.invalidate()
		// 光池也得丢：尺寸没变时 resize 会提前返回，那张小画布会一直贴着丢之前那套灯架
		glow.invalidate()
	}
	const onContextRestored = (): void => {
		paperLight.restore()
		lastLayoutKey = ""
		needsBuild = true
		needsLight = true
		needsGlow = true
		wake()
	}

	const onMotionChange = (event: MediaQueryListEvent): void => {
		reduceMotion = event.matches
		needsLight = true
		needsGlow = true
		wake()
	}

	window.addEventListener("resize", onResize)
	window.addEventListener("orientationchange", onResize)
	document.addEventListener("visibilitychange", onVisibility)
	sheetCanvas.addEventListener("webglcontextlost", onContextLost)
	sheetCanvas.addEventListener("webglcontextrestored", onContextRestored)
	if (typeof reduceMotionQuery.addEventListener === "function") reduceMotionQuery.addEventListener("change", onMotionChange)

	refreshTokens()
	rect = measurePaperRect(paperIncludesSidebar(readOptions().includeSidebar))
	pixelRatio = computePixelRatio()
	applyRect()
	frameHandle = requestAnimationFrame(tick)

	return {
		refresh,
		refreshTokens,
		dispose: () => {
			if (disposed) return
			disposed = true
			if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
			frameHandle = 0
			window.removeEventListener("resize", onResize)
			window.removeEventListener("orientationchange", onResize)
			document.removeEventListener("visibilitychange", onVisibility)
			sheetCanvas.removeEventListener("webglcontextlost", onContextLost)
			sheetCanvas.removeEventListener("webglcontextrestored", onContextRestored)
			if (typeof reduceMotionQuery.removeEventListener === "function") reduceMotionQuery.removeEventListener("change", onMotionChange)
			paperLight.destroy()
			sheetCanvas.remove()
			glowCanvas.remove()
			vignette.remove()
			clearPaperTokens()
		},
	}
}