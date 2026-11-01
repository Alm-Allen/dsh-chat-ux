/**
 * 辉光那一层：光池、灯焰、光标的那一圈余温，以及空气里的尘埃。它用 screen 混合压在纸上，
 * 所以只负责"多出来的光"，不负责颜色。
 *
 * 照 nocturne 的 core/glow-layer.js 搬。整层是 2D canvas：光池先在一张 192 列的小画布上按
 * lightAmount 逐像素算一遍，再放大贴回来——直接按屏幕像素算，每重画一次都是几十万次 toneMap
 *
 * 这一层很贵：screen 混合每重画一次，浏览器要把整块背景重新合成一遍，长会话里 DOM 上万节点时
 * 是秒级代价。所以调用方只在真会变的时候画（见 paper-mount 的脏标记），这里不做节流
 */
import {lightAmount} from "./paper-light-model"
import type {LightRig} from "./paper-light-model"
import {toUnit} from "./paper-math"
import type {RoomDefinition} from "./paper-tables"

// 一次绘制的输入
export interface GlowFrame {
	// 这一帧的灯架。光池与尘埃的明暗都按它算
	rig: LightRig
	// 灯开着没有。关掉时整层清空——没有灯就没有光池
	lamp: boolean
	// 灯色的 "r, g, b"，直接拼进 canvas 的 rgba()
	rgb: string
	// 光池的颜色。暗纸上它与 rgb 不是同一个值，理由见 poolColor
	poolRgb: string
	// 亮纸还是暗纸。它决定光池的强度与尘埃的浓淡
	appearance: "light" | "dark"
	// 灯的强度，只用在灯焰的半径上
	intensity: number
	// 尘埃的浓度，0 到 1。0 时一颗都不画
	particles: number
	// 光标那一圈辉光的强度，0 时这一项不画
	cursorGlow: number
	// 光标位置，相对纸的左上角。量不出来给 null，那一圈就不画
	cursor: {x: number; y: number} | null
	// 秒。尘埃的漂移与闪烁都读它；不开环境动效时调用方传 0，于是尘埃是静态的
	time: number
}

// 一颗尘埃。位置与相位都是 0 到 1 的伪随机数，由下标算出来，不需要保存任何状态
interface Mote {
	x: number
	y: number
	z: number
	phase: number
	size: number
}

// 一颗尘埃的伪随机分量
function moteHash(seed: number): number {
	const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
	return value - Math.floor(value)
}

// 尘埃的位置表。固定 110 颗，浓度只决定画前多少颗，所以同样的浓度每次画出来的分布都一样
const MOTES: readonly Mote[] = Array.from({length: 110}, (_unused, index) => ({
	x: moteHash(index * 3.1),
	y: moteHash(index * 7.7),
	z: moteHash(index * 1.9),
	phase: moteHash(index * 5.3) * 100,
	size: .5 + moteHash(index * 9.1) * 1.6,
}))

// 把漂移量折回 0 到 1，尘埃走出纸面就从另一边回来
function wrap01(value: number): number {
	return ((value % 1) + 1) % 1
}

// 光池小画布的列数。行数按纸的长宽比推，所以光池的像素永远是这个量级
const POOL_COLUMNS = 192

/**
 * 光池画多实。
 *
 * 纸光那一层已经把灯画出来了，光池再叠一次就是双重打光。所以只有「纸光画不出灯」的那两路才给它：
 * 暗纸（纸光在深色底上几乎看不出方向）与穿窗月光（它要的是窗棂投影，不是一团亮）。
 *
 * 台灯与静止光都返回 0：台灯那圈圆形光斑已经在 LIGHT 那次 pass 里算进来了，
 * 再补一层 screen 只会让光斑边缘发白。这一项一旦是 0、尘埃与光标余温又都关着，
 * 挂载层就会把整整一层全屏 screen 合成收起来——那是实测里帧间隔翻倍的主因
 */
export function poolStrength(rig: LightRig, appearance: "light" | "dark"): number {
	if (rig.source === "still" || rig.source === "desk-lamp") return 0
	if (appearance === "dark") return 1
	if (rig.source === "moonlight") return .2
	return 0
}

/**
 * screen 那一层的池色。
 *
 * 亮纸上用灯色即可。暗纸上若照搬"灯色 × 纸色"，screen 会直接烧成一片白（nocturne 实测过），
 * 所以取灯色的 34%——暖，但不刺眼
 */
export function poolColor(room: RoomDefinition, appearance: "light" | "dark"): string {
	const light = toUnit(room.light.color).map((channel) => Math.round(channel * 255))
	const scaled = appearance === "dark" ? light.map((channel) => Math.round(channel * 0.34)) : light
	return scaled.join(", ")
}

/**
 * 辉光那一层。一个实例对一片 canvas。
 *
 * 三张离屏画布（光池、柔边、辉光）与那张尘埃的贴图都是自己建的，不进 DOM
 */
export class GlowLayer {
	readonly canvas: HTMLCanvasElement
	// 2D 上下文拿不到时整层不画：纸还在，只是没有光池与尘埃
	readonly context: CanvasRenderingContext2D | null

	// 最近一次 resize 的量，render 用它把画布坐标换回 CSS 像素
	private width = 0
	private height = 0
	private pixelRatio = 1
	// 逐像素算出来的光池，以及它的两份模糊
	private readonly pool: HTMLCanvasElement
	private readonly soft: HTMLCanvasElement
	private readonly bloom: HTMLCanvasElement
	// 光池的输入指纹。灯没动、纸没换，就不重算那 192 × N 次 toneMap
	private poolKey = ""
	// 尘埃的那张圆形贴图：一张 32px 的径向渐变，画的时候按尺寸拉伸
	private readonly sprite: HTMLCanvasElement

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas
		this.context = canvas.getContext("2d")
		this.pool = document.createElement("canvas")
		this.soft = document.createElement("canvas")
		this.bloom = document.createElement("canvas")
		this.sprite = document.createElement("canvas")
		this.sprite.width = 32
		this.sprite.height = 32
		const spriteContext = this.sprite.getContext("2d")
		if (spriteContext === null) return
		const gradient = spriteContext.createRadialGradient(16, 16, 0, 16, 16, 16)
		gradient.addColorStop(0, "rgba(255,255,255,1)")
		gradient.addColorStop(.22, "rgba(255,255,255,.6)")
		gradient.addColorStop(1, "rgba(255,255,255,0)")
		spriteContext.fillStyle = gradient
		spriteContext.fillRect(0, 0, 32, 32)
	}

	/**
	 * 换尺寸。尺寸没变时直接返回——同尺寸重设 canvas.width 会清空画布，
	 * 而流式期间每帧都有一批 dirty 标记走到这里
	 */
	resize(width: number, height: number, pixelRatio: number): void {
		if (this.width === width && this.height === height && this.pixelRatio === pixelRatio) return
		this.width = width
		this.height = height
		this.pixelRatio = pixelRatio
		this.canvas.width = Math.max(1, Math.round(width * pixelRatio))
		this.canvas.height = Math.max(1, Math.round(height * pixelRatio))
		// 光池按旧的尺寸算的，作废
		this.poolKey = ""
	}

	/**
	 * 让光池作废：尺寸可能要换、或者上一张纸的光池不该再贴回来。
	 *
	 * 只扔指纹不扔三张离屏画布——它们下次 ensurePool 时会按新尺寸重设，
	 * 提前置成 0 反而会多一次分配
	 */
	invalidate(): void {
		this.poolKey = ""
		this.clear()
	}

	// 清空整层。灯关掉、纸要重画之前都得先来这一下，否则上一帧的光池还留着
	clear(): void {
		const context = this.context
		if (context === null) return
		context.setTransform(1, 0, 0, 1, 0, 0)
		context.clearRect(0, 0, this.canvas.width, this.canvas.height)
	}

	// 画一帧。lamp 关着时画布被清空，之后什么都不画
	render(frame: GlowFrame): void {
		const context = this.context
		if (context === null) return
		context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0)
		context.clearRect(0, 0, this.width, this.height)
		if (!frame.lamp) return
		const rig = frame.rig
		this.paintPool(context, frame, rig)
		this.paintLampSpill(context, frame, rig)
		this.paintMotes(context, frame, rig)
		this.paintLampGlare(context, frame, rig)
		this.paintCursorGlow(context, frame)
	}

	// 光池：把那张 192 列的贴图按纸的大小铺开，两份模糊叠出层次
	private paintPool(context: CanvasRenderingContext2D, frame: GlowFrame, rig: LightRig): void {
		const strength = poolStrength(rig, frame.appearance)
		if (strength <= 0) return
		this.ensurePool(rig, frame.poolRgb)
		context.imageSmoothingEnabled = true
		context.imageSmoothingQuality = "high"
		context.globalAlpha = strength
		context.drawImage(this.soft, 0, 0, this.width, this.height)
		context.globalAlpha = strength * (frame.appearance === "dark" ? .4 : .8)
		context.drawImage(this.bloom, 0, 0, this.width, this.height)
		context.globalAlpha = 1
	}

	// 台灯自己那一圈外溢：落在灯座上，所以只有台灯这一路有
	private paintLampSpill(context: CanvasRenderingContext2D, frame: GlowFrame, rig: LightRig): void {
		if (rig.source !== "desk-lamp") return
		const x = rig.position[0]
		const y = rig.position[1]
		const radius = Math.max(1, this.height * .55)
		const spill = context.createRadialGradient(x, y, 0, x, y, radius)
		spill.addColorStop(0, "rgba(" + frame.rgb + ", " + (frame.appearance === "light" ? .1 : .16) + ")")
		spill.addColorStop(1, "rgba(" + frame.rgb + ", 0)")
		context.fillStyle = spill
		context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
	}

	/**
	 * 尘埃。每一颗自己漂、自己闪，只有被灯照到的那一片才画——
	 * 暗处的尘埃本来就不该看见，这一条省掉的正是最多的工作量
	 */
	private paintMotes(context: CanvasRenderingContext2D, frame: GlowFrame, rig: LightRig): void {
		if (frame.particles <= 0) return
		const count = Math.round(MOTES.length * frame.particles)
		const strength = frame.appearance === "light" ? .5 : .9
		for (let index = 0; index < count; index += 1) {
			const mote = MOTES[index]
			if (mote === undefined) continue
			const speed = .4 + mote.z
			const drift = Math.sin(frame.time * .05 * speed + mote.phase) * .04 + frame.time * .004 * (mote.z - .5)
			const fall = -frame.time * .006 * speed + Math.cos(frame.time * .07 + mote.phase) * .03
			const x = wrap01(mote.x + drift) * this.width
			const y = wrap01(mote.y + fall) * this.height
			const lit = lightAmount(rig, x, y)
			if (lit < .05) continue
			const twinkle = .5 + .5 * Math.sin(frame.time * (.8 + mote.z * 2.2) + mote.phase)
			const size = mote.size * (1 + mote.z * 1.6)
			context.globalAlpha = Math.min(1, lit * twinkle * strength)
			context.drawImage(this.sprite, x - size * 2, y - size * 2, size * 4, size * 4)
		}
		context.globalAlpha = 1
	}

	// 字锤小灯自己那一圈灯焰：它是这一路光源的署名，半径跟着强度走
	private paintLampGlare(context: CanvasRenderingContext2D, frame: GlowFrame, rig: LightRig): void {
		if (rig.source !== "carriage") return
		const x = rig.position[0]
		const y = rig.position[1]
		const radius = Math.max(1, 110 * frame.intensity)
		const glare = context.createRadialGradient(x, y, 0, x, y, radius)
		glare.addColorStop(0, "rgba(" + frame.rgb + ", " + (frame.appearance === "light" ? .26 : .45) + ")")
		glare.addColorStop(1, "rgba(" + frame.rgb + ", 0)")
		context.fillStyle = glare
		context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
	}

	// 光标那一圈余温。只在光标真的在的时候画
	private paintCursorGlow(context: CanvasRenderingContext2D, frame: GlowFrame): void {
		const cursor = frame.cursor
		if (cursor === null || frame.cursorGlow <= 0) return
		const glow = context.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, 34)
		glow.addColorStop(0, "rgba(" + frame.rgb + ", " + (.4 * frame.cursorGlow).toFixed(3) + ")")
		glow.addColorStop(1, "rgba(" + frame.rgb + ", 0)")
		context.fillStyle = glow
		context.fillRect(cursor.x - 34, cursor.y - 34, 68, 68)
	}

	/**
	 * 重算光池。
	 *
	 * 指纹把灯架的每一个数、池色与尺寸一起带上：任意一项变了就重算。这比每次渲染都算省得多，
	 * 而它仍然只在灯真的动过之后才算——光池是这一层最贵的那一步
	 */
	private ensurePool(rig: LightRig, poolRgb: string): void {
		const key = JSON.stringify([
			rig.position, rig.direction, rig.cosOuter, rig.cosInner, rig.exposure, rig.window, poolRgb, this.width, this.height,
		])
		if (key === this.poolKey) return
		this.poolKey = key
		const columns = POOL_COLUMNS
		const rows = Math.max(8, Math.round((columns * this.height) / Math.max(1, this.width)))
		const channels = poolRgb.split(",").map((part) => Number(part))
		const red = channels[0] ?? 0
		const green = channels[1] ?? 0
		const blue = channels[2] ?? 0
		for (const target of [this.pool, this.soft, this.bloom]) {
			target.width = columns
			target.height = rows
		}
		const poolContext = this.pool.getContext("2d")
		const softContext = this.soft.getContext("2d")
		const bloomContext = this.bloom.getContext("2d")
		if (poolContext === null || softContext === null || bloomContext === null) return
		const image = poolContext.createImageData(columns, rows)
		for (let row = 0; row < rows; row += 1) {
			for (let column = 0; column < columns; column += 1) {
				const lit = lightAmount(rig, ((column + .5) / columns) * this.width, ((row + .5) / rows) * this.height)
				const offset = (row * columns + column) * 4
				image.data[offset] = red
				image.data[offset + 1] = green
				image.data[offset + 2] = blue
				image.data[offset + 3] = Math.round(Math.min(1, lit) * 255)
			}
		}
		poolContext.putImageData(image, 0, 0)
		// 两份模糊：柔边让光池没有格子感，辉光那一份把亮处往外散
		softContext.filter = "blur(1px)"
		softContext.drawImage(this.pool, 0, 0)
		softContext.filter = "none"
		bloomContext.filter = "blur(6px)"
		bloomContext.drawImage(this.pool, 0, 0)
		bloomContext.filter = "none"
	}
}
