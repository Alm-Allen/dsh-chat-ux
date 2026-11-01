/**
 * 输入框的插入符动效：按掉浏览器画的那根，自己画一根，位移走过渡
 *
 * 浏览器不给插入符任何可动画的属性，接管只有 caret-color: transparent 加自绘这一条路
 * 接管两种面：contenteditable 的主输入框用折叠 Range 直接量，textarea 的选区不进 DOM，靠一层镜像量
 * 自绘的那根挂在可编辑面的父元素上，父元素不是定位上下文时补一个标记，由样式表补 position: relative
 * ⚠️ 原生被按下去、自绘没画出来就是读者看不见光标，所以量不出来一律退回原生，绝不维持现状
 */
import {COMPOSER_INPUT_SELECTOR, COMPOSER_TEXTAREA_SELECTOR} from "../../dom-contract"
import {QUILL_ATTRIBUTE, buildQuillCaret, placeQuillCaret} from "../paper/caret/quill"

// 闪烁动画的名字。caret-motion-styles.ts 用它拼 keyframes，两处必须一字不差
export const CARET_BLINK_NAME = "dsh-chat-ux-caret-blink"

// 挂在可编辑面上的标记：有它原生插入符才被按掉，规则在 caret-motion-styles.ts
export const CARET_ATTRIBUTE = "data-chat-ux-caret"

// 自绘插入符那根上的标记，样式表按它画
export const CARET_LAYER_ATTRIBUTE = "data-chat-ux-caret-layer"

// 只在真画出一根之后才写，样式表按它把 visibility 打开
export const CARET_VISIBLE_ATTRIBUTE = "data-chat-ux-caret-visible"

// 命令 chip 被选中的标记：dsh 这时把原生插入符按掉了，自绘的那根也要跟着藏
const CHIP_SELECTED_ATTRIBUTE = "data-composer-chip-selected"

// 挂在不是定位上下文的父元素上：样式表见到它就补一条 position: relative
export const CARET_HOST_ATTRIBUTE = "data-chat-ux-caret-host"

// 自绘那根的颜色，写在它自己身上：接管那一刻从可编辑面的原生插入符上读下来
export const CARET_COLOR_PROPERTY = "--dsh-chat-ux-caret-color"

// 聚焦之后隔多久补看一次。切会话时，聚焦与选区就绪之间隔着几帧
const FOCUS_SETTLE_MS = 120

// 镜像层要从 textarea 上抄的样式：影响字形宽度与折行位置的都在这里
// 少抄一条，镜像里的折行就和 textarea 里的对不上，插入符会落到别的行上
const MIRRORED_PROPERTY_LIST = [
	"direction", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style",
	"font-variant", "font-weight", "font-feature-settings", "font-variation-settings", "font-kerning",
	"letter-spacing", "word-spacing", "line-height", "text-align", "text-indent", "text-transform",
	"tab-size", "white-space", "word-break", "overflow-wrap", "hyphens",
	"padding-top", "padding-right", "padding-bottom", "padding-left",
] as const

// 这套动效的三档。host 侧的 schema 里有同一组字面量，改一处就要改另一处
// off 不动手，用浏览器自己的插入符；move 只在显式移动上放过渡，打字瞬时；typing 打字也放过渡（界面上叫「无论何时」）
export type CaretMotionMode = "off" | "move" | "typing"

// 安装结果：一个卸载入口，外加一个配置变了就重新同步一次的入口
export interface CaretMotionHandle {
	// 摘掉监听，并把所有自绘插入符和标记一起撤掉
	dispose: () => void
	// 按当前配置再同步一次，排在下一帧。配置一变就该调它
	resync: () => void
}

// 给整页装上插入符动效。档位在每次同步时现读，所以运行期改档不必重新安装
export function installCaretMotion(
	readMotionMode: () => CaretMotionMode,
	readQuillOn: () => boolean = () => false,
): CaretMotionHandle {
	// 每个可编辑面一份自绘状态。同屏只有一个面拿着焦点，所以这里通常只有一项
	const caretLayerMap = new Map<HTMLElement, CaretLayer>()
	// 一次同步已经排在下一帧
	let syncQueued = false
	// 已经排出去的那一帧；0 表示没有。卸载时要能把它连同回调一起取消
	let frameHandle = 0
	// 卸载之后一律不做
	// 帧回调与聚焦定时器都可能还在路上：让它们跑完会重建出那根、重新挂上观察者，
	// 而按掉原生插入符的标记已经在卸载时摘掉了，那一瞬读者没有光标
	let disposed = false
	// 这一帧里来过一次输入。move 档靠它把打字和显式移动分开
	let typedThisFrame = false
	// 上一次移动插入符的是 End 键
	// 软换行处的同一个偏移有两个位置：上一行行尾与下一行行首。textarea 不交出偏向哪一边，
	// 而 Chromium 在 End 之后画在行尾、其余时候画在行首，所以记住这一下
	let endKeyed = false

	// 排一帧同步。同一帧里来多少次触发都只跑一次
	const queueSync = (): void => {
		if (disposed || syncQueued) return
		syncQueued = true
		frameHandle = requestAnimationFrame(() => {
			frameHandle = 0
			syncQueued = false
			if (disposed) return
			const typing = typedThisFrame
			typedThisFrame = false
			sync(typing)
		})
	}

	const markTyped = (): void => {
		typedThisFrame = true
		endKeyed = false
	}

	// 记下这一次移动插入符的是不是 End（带 Shift 的是在选字，没有插入符可画）
	const noteKey = (event: KeyboardEvent): void => {
		if (event.key === "Shift" || event.key === "Control" || event.key === "Meta" || event.key === "Alt") return
		endKeyed = event.key === "End" && !event.shiftKey
	}

	// 指针按下去的位置由浏览器自己定，不再沿用上一次 End 的偏向
	const clearEndKey = (): void => {
		endKeyed = false
	}

	// 纯文本面自己滚了一下：自绘的那根不在它里面，不会跟着走，得重新量一次
	// scroll 不冒泡，所以这是捕获阶段的监听，页面上每一次滚动都会路过这里，只认已经接管的面
	const followPlainScroll = (event: Event): void => {
		const scrolledElement = event.target
		if (!(scrolledElement instanceof HTMLTextAreaElement) || !caretLayerMap.has(scrolledElement)) return
		queueSync()
	}

	// 可编辑面的内容、可编辑性或者身份变了
	// selectionchange 覆盖不了这些静默变化：清空草稿如果没顺带动选区，浏览器一个事件都不发；
	// 切会话时 Lexical 还在绑 editor，contenteditable 会短暂变成 false，浏览器随即把焦点收走，
	// 等它变回来又是一个事件都没有。纯文本面不走这条：它的内容不在 DOM 里
	const contentObserver = new MutationObserver(() => {
		if (readMotionMode() === "off") return
		queueSync()
	})

	// 盯住一个富文本面。同一个面盯多次是幂等的，选项以最后一次为准
	const observeComposer = (input: HTMLElement): void => {
		contentObserver.observe(input, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: ["contenteditable", "data-composer-input", CHIP_SELECTED_ATTRIBUTE],
		})
	}

	// 焦点在这个面上，却还没有自绘的那根——切会话留下的空窗就是它
	const needsTakeover = (): boolean => {
		const activeElement = document.activeElement
		if (!(activeElement instanceof HTMLElement) || surfaceOf(activeElement) === null) return false
		return !activeElement.hasAttribute(CARET_ATTRIBUTE)
	}

	// 焦点换了之后再补看一次
	// 切会话时焦点离开旧的与落到新的之间隔着几帧，中间不会有任何事件：浏览器迁移选区是静默的，
	// 有时连 focusin 都等不到（新元素刚建出来、editor 还没绑上）。两个方向都接，因为不知道哪一边才是最后一声
	// 只在还没接管时才补，已经画好的那根不去打扰，否则闪烁会从头开始
	const syncAfterFocusChange = (): void => {
		queueSync()
		window.setTimeout(() => {
			if (needsTakeover()) queueSync()
		}, FOCUS_SETTLE_MS)
	}

	// 一个节点在它父节点里的下标；不是亲生的给 -1
	const childIndex = (parent: Node, child: Node): number => {
		let index = 0
		for (let node = parent.firstChild; node !== null; node = node.nextSibling) {
			if (node === child) return index
			index += 1
		}
		return -1
	}

	// 光标贴着的那个换行符
	// 量的是 br 元素自己，不是它所在的段落：换行符的矩形永远只有一行，高度还正好是字高
	// 零矩形只发生在换行符旁边，所以这里找不到换行符就等于量不出来，调用方要把原生插入符还回去
	const nearestBreak = (range: Range): CaretAnchor | null => {
		const container = range.startContainer
		const offset = range.startOffset
		if (container instanceof HTMLBRElement) return {lineBreak: container, before: offset === 0}
		if (container instanceof Text) {
			const parent = container.parentNode
			if (parent === null) return null
			const index = childIndex(parent, container)
			if (index < 0) return null
			if (offset === container.data.length) {
				const next = parent.childNodes[index + 1]
				if (next instanceof HTMLBRElement) return {lineBreak: next, before: true}
			}
			if (offset === 0) {
				const previous = parent.childNodes[index - 1]
				if (previous instanceof HTMLBRElement) return {lineBreak: previous, before: false}
			}
			return null
		}
		const next = container.childNodes[offset]
		if (next instanceof HTMLBRElement) return {lineBreak: next, before: true}
		const previous = container.childNodes[offset - 1]
		if (previous instanceof HTMLBRElement) return {lineBreak: previous, before: false}
		return null
	}

	// 输入框被清到连段落都没有时（切会话之后就是这样，DOM 是个空壳），量一根藏在页面角落里的同款 br
	// 内容盒的第一行开头就是光标该在的地方，但那一行有多高、字盒在行里怎么摆，得从别处问
	// 临时建出来的那个 div 每帧现建现删，不碰 dsh 的任何容器：往 .grow 里塞节点会惊动 React
	// 量不出来给 null，调用方退回原生插入符
	const emptyLineBox = (input: HTMLElement): CaretBox | null => {
		const body = document.body
		if (body === null) return null
		const style = getComputedStyle(input)
		const measureBox = document.createElement("div")
		measureBox.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none"
		measureBox.style.padding = style.padding
		measureBox.style.whiteSpace = "pre-wrap"
		measureBox.style.fontFamily = style.fontFamily
		measureBox.style.fontSize = style.fontSize
		measureBox.style.fontWeight = style.fontWeight
		measureBox.style.fontStyle = style.fontStyle
		measureBox.style.lineHeight = style.lineHeight
		measureBox.appendChild(document.createElement("br"))
		body.appendChild(measureBox)
		const measureRect = measureBox.getBoundingClientRect()
		const breakElement = measureBox.firstElementChild
		const breakRect = breakElement === null ? null : breakElement.getBoundingClientRect()
		measureBox.remove()
		if (breakRect === null) return null
		// 临时那个 div 的 padding 与输入框一致，所以这两个差值就是内容盒起头到字盒起头的距离
		const inputRect = input.getBoundingClientRect()
		return {
			left: inputRect.left + (breakRect.left - measureRect.left),
			top: inputRect.top + (breakRect.top - measureRect.top),
			height: breakRect.height,
		}
	}

	// 富文本面上这一处折叠选区的视口矩形。量不出来给 null，调用方要把原生插入符还回去
	const measureRich = (input: HTMLElement, range: Range): CaretBox | null => {
		const rect = range.getBoundingClientRect()
		if (rect.height > 0) return {left: rect.left, top: rect.top, height: rect.height}
		// 零矩形：光标贴着换行符——空段落（<p><br></p>）与软换行都是这条路的常客
		const anchor = nearestBreak(range)
		if (anchor === null) {
			// 输入框里连一个换行符都没有：没有东西可量，但内容盒的第一行开头就是光标的位置
			// 里面有东西却找不到换行符，那是别的形状，不猜，把原生插入符还回去
			if (input.firstChild !== null) return null
			return emptyLineBox(input)
		}
		const breakRect = anchor.lineBreak.getBoundingClientRect()
		if (anchor.before) return {left: breakRect.left, top: breakRect.top, height: breakRect.height}
		// 换行符之后是下一行的行首：横向退到段落的内容左边界，纵向走一行
		const block = anchor.lineBreak.parentElement
		if (block === null) return null
		const lineHeight = Number.parseFloat(getComputedStyle(block).lineHeight)
		return {
			left: block.getBoundingClientRect().left,
			top: breakRect.top + (Number.isFinite(lineHeight) ? lineHeight : breakRect.height),
			height: breakRect.height,
		}
	}

	// 纯文本面上插入符的视口矩形，靠一层镜像量出来。镜像是个看不见的 div，挂在 body 上、量完就摘
	// 样式从 textarea 上抄，文本在插入符处断开，后半截整个包进一个 span，它的第一段行盒就是插入符
	// 后半截必须整段带上：软换行按整词走，只放前半截的话正在打的那个词会留在上一行
	// upstream 为真（上一下是 End）时改量前一个字符的右缘，与原生在 End 之后的位置一致
	// 量不出来给 null，调用方要把原生插入符还回去
	const measurePlain = (input: HTMLTextAreaElement, upstream: boolean): CaretBox | null => {
		const body = document.body
		if (body === null) return null
		const style = getComputedStyle(input)
		const mirror = document.createElement("div")
		mirror.style.cssText = "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;"
			+ "margin:0;border:0;box-sizing:content-box;height:auto;overflow:hidden"
		for (const name of MIRRORED_PROPERTY_LIST) mirror.style.setProperty(name, style.getPropertyValue(name))
		const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
		mirror.style.width = String(Math.max(0, input.clientWidth - (Number.isFinite(paddingX) ? paddingX : 0))) + "px"
		// 调用方只在选区折叠时才来，起点终点是同一处
		const caretAt = input.selectionEnd
		const marker = document.createElement("span")
		mirror.textContent = input.value.slice(0, caretAt)
		// 后半截为空（插入符在末尾）时补一个零宽空格：末尾换行符之后的空行才有行盒可量
		marker.textContent = input.value.slice(caretAt) || "\u200b"
		mirror.appendChild(marker)
		body.appendChild(mirror)
		const mirrorRect = mirror.getBoundingClientRect()
		let markerRect = marker.getClientRects()[0]
		let caretLeft = markerRect?.left
		const before = mirror.firstChild
		if (upstream && markerRect !== undefined && before instanceof Text && caretAt > 0 && input.value[caretAt - 1] !== "\n") {
			const previous = document.createRange()
			previous.setStart(before, caretAt - 1)
			previous.setEnd(before, caretAt)
			const rects = previous.getClientRects()
			const last = rects[rects.length - 1]
			// 前一个字符落在更上面的一行，才说明这里是软换行
			if (last !== undefined && last.top < markerRect.top - 1) {
				markerRect = last
				caretLeft = last.right
			}
		}
		mirror.remove()
		if (markerRect === undefined || caretLeft === undefined) return null
		// 镜像没有边框，padding 与 textarea 一致，所以这两个差值就是插入符在 textarea 内边距盒里的位置；
		// 再扣掉 textarea 自己滚走的那一段
		const inputRect = input.getBoundingClientRect()
		return {
			left: inputRect.left + input.clientLeft + (caretLeft - mirrorRect.left) - input.scrollLeft,
			top: inputRect.top + input.clientTop + (markerRect.top - mirrorRect.top) - input.scrollTop,
			height: markerRect.height,
		}
	}

	// 把一个视口矩形裁进 textarea 露出来的那一段
	// 自绘的那根不在 textarea 里面，它的裁剪管不到这根：内部滚动时插入符滚出可视区，
	// 原生那根跟着消失，这一根也得自己消失。整个被裁掉给 null
	const clipToField = (input: HTMLTextAreaElement, box: CaretBox): CaretBox | null => {
		const inputRect = input.getBoundingClientRect()
		const clipTop = inputRect.top + input.clientTop
		const clipBottom = clipTop + input.clientHeight
		const top = Math.max(box.top, clipTop)
		const bottom = Math.min(box.top + box.height, clipBottom)
		if (bottom - top < 1) return null
		return {left: box.left, top, height: bottom - top}
	}

	// 藏起来，那根留在原地：下次再出现不必重建
	const hide = (layer: CaretLayer): void => {
		layer.caret.removeAttribute(CARET_VISIBLE_ATTRIBUTE)
		layer.visible = false
	}

	// 把一个面的自绘状态整个撤掉：那一根、按掉标记、以及替它补过的定位上下文
	const release = (input: HTMLElement, layer: CaretLayer): void => {
		layer.caret.remove()
		// 那根连同它怀里的羽毛一起撤掉了；引用留着会让下一次重建接回旧节点
		layer.quill = null
		layer.quillHeight = 0
		input.removeAttribute(CARET_ATTRIBUTE)
		if (layer.markedHost) layer.host.removeAttribute(CARET_HOST_ATTRIBUTE)
	}

	// 这个可编辑面上的自绘插入符；没有就建一根
	const layerFor = (input: HTMLElement): CaretLayer | null => {
		const host = input.parentElement
		if (host === null) return null
		const existingLayer = caretLayerMap.get(input)
		if (existingLayer !== undefined && existingLayer.host === host) {
			// React 重渲染会把挂上去的那根一起摘掉，重新挂回去，并当作刚出现重新就位
			if (existingLayer.caret.isConnected) return existingLayer
			host.appendChild(existingLayer.caret)
			existingLayer.visible = false
			return existingLayer
		}
		// 父元素换了人：旧的那一份整个撤掉，按新的父元素重建
		if (existingLayer !== undefined) {
			release(input, existingLayer)
			caretLayerMap.delete(input)
		}
		// 自绘的那根按容器的内边距盒定位，容器必须是定位上下文。不是的话补一个标记，由样式表把它变成 relative
		// 作答框的 .field 与排队行都是这样。display: contents 的容器自己没有盒子，补了也没用：
		// 宁可不动手，让原生插入符留在原地
		const hostStyle = getComputedStyle(host)
		if (hostStyle.display === "contents") return null
		const markedHost = hostStyle.position === "static"
		if (markedHost) host.setAttribute(CARET_HOST_ATTRIBUTE, "")
		const caret = document.createElement("div")
		caret.setAttribute(CARET_LAYER_ATTRIBUTE, "")
		host.appendChild(caret)
		if (input.isContentEditable) observeComposer(input)
		const layer: CaretLayer = {caret, visible: false, host, markedHost, quill: null, quillHeight: 0}
		caretLayerMap.set(input, layer)
		return layer
	}

	// 接管那一刻读下原生插入符的颜色，自绘的那根照着画
	// 只在按掉标记还没写上时读得到：写上之后算出来的就是 transparent 了。auto 的意思是跟字色走
	const adoptCaretColor = (input: HTMLElement, layer: CaretLayer): void => {
		const style = getComputedStyle(input)
		const color = style.caretColor === "auto" ? style.color : style.caretColor
		layer.caret.style.setProperty(CARET_COLOR_PROPERTY, color)
	}

	// 给这一根装上一支羽毛，并按插入符高度摆好
	// 先挂笔、再打标记：标记一到，样式表就把 2px 的底色撤掉；反过来写的话，
	// 中间那一帧读者看到的是一根没有底色的条
	const markQuill = (layer: CaretLayer, caretHeight: number): void => {
		// React 重渲染会把那根连同里面那支笔一起摘掉再挂回来，所以每次按「笔还在不在」判一次。
		// 重复调用是幂等的，标记在不在都一样走
		if (layer.quill === null || layer.quill.parentElement !== layer.caret) {
			layer.quill = buildQuillCaret()
			layer.caret.appendChild(layer.quill)
			layer.quillHeight = 0
		}
		// 高度没变就不重写尺寸与偏移：这一帧 DOM 已经写够了
		if (Math.abs(layer.quillHeight - caretHeight) > 0.01) {
			placeQuillCaret(layer.quill, caretHeight)
			layer.quillHeight = caretHeight
		}
		layer.caret.setAttribute(QUILL_ATTRIBUTE, "")
	}

	// 撤掉怀里那支笔，把 2px 条要回来
	// 先摘标记、后撤笔：摘标记那一刻样式表已经把条画回来，笔留着一瞬也只是叠着；
	// 反过来先撤笔的话，中途只要有谁强制回流，那一瞬就是一根没有底色的空盒子
	const dropQuill = (layer: CaretLayer): void => {
		if (!layer.caret.hasAttribute(QUILL_ATTRIBUTE)) return
		layer.caret.removeAttribute(QUILL_ATTRIBUTE)
		layer.quill?.remove()
		layer.quill = null
		layer.quillHeight = 0
	}

	// 把自绘的光标放到这个视口矩形上
	// paused 为真时这一帧不播位移过渡：刚出现，或者 move 档下的一次打字
	const draw = (layer: CaretLayer, box: CaretBox, paused: boolean): void => {
		// 绝对定位按容器的内边距盒算，而且跟着容器自己的滚动走：矩形差值里扣掉边框、加回滚走的量
		const hostRect = layer.host.getBoundingClientRect()
		// 对齐到整像素。原生插入符就落在像素网格上，落在分数位置的矩形会被抗锯齿抹开一圈灰边，
		// 看起来和它不是一套。代价是位置最多偏半像素，看不出来
		const left = Math.round(box.left - hostRect.left - layer.host.clientLeft + layer.host.scrollLeft)
		const top = Math.round(box.top - hostRect.top - layer.host.clientTop + layer.host.scrollTop)

		// 不播过渡的那一帧必须瞬时就位，下一帧再把过渡接回来
		const fresh = !layer.visible
		const instant = fresh || paused
		if (instant) layer.caret.style.transitionProperty = "none"
		layer.caret.style.transform = "translate(" + left + "px, " + top + "px)"
		layer.caret.style.height = box.height + "px"
		if (instant) {
			requestAnimationFrame(() => {
				layer.caret.style.transitionProperty = ""
			})
		}
		if (fresh) {
			layer.visible = true
			layer.caret.setAttribute(CARET_VISIBLE_ATTRIBUTE, "")
		}
		// 纸感开着就把怀里那支笔摆到这一帧的高度上，关着就把它撤掉、把 2px 条要回来。
		// 两档都在这里落，是因为只有这里才拿到刚量出来的高度
		if (readQuillOn()) markQuill(layer, box.height)
		else dropQuill(layer)
		// 每移动一次都让闪烁从头开始：否则赶上灭的那半周期，读者会以为光标没跟上来
		// 只认闪烁那一条。getAnimations() 里也有正在跑的位移过渡，把那条也拉回起点的话，
		// 连续打字就变成一格一格地卡，光标永远落在上一格的插值位置上
		for (const animation of layer.caret.getAnimations()) {
			if (animation instanceof CSSAnimation && animation.animationName === CARET_BLINK_NAME) animation.currentTime = 0
		}
	}

	// 这一帧的光标归谁。typing 表示这一帧里来过一次输入
	const sync = (typing: boolean): void => {
		const mode = readMotionMode()
		// 关是彻底的：自绘的那根和按掉标记一起撤掉，原生插入符回来。留着它们只会让读者看不见光标
		if (mode === "off") {
			for (const [input, layer] of caretLayerMap) release(input, layer)
			caretLayerMap.clear()
			return
		}
		// 纸感关掉而光标还开着：把怀里的羽毛撤掉，让 2px 条回来。
		// 样式表也挡得住（它要求根上有纸感标记），但那认的是纸挂没挂上、不是配置；
		// 配置先落、纸下一帧才摘的那一段，两边都不动的话读者会看到一支笔和一根条叠着
		if (!readQuillOn()) {
			for (const layer of caretLayerMap.values()) dropQuill(layer)
		}
		const selection = document.getSelection()
		const activeElement = document.activeElement
		const focusedElement = activeElement instanceof HTMLElement ? activeElement : null
		const surfaceKind = focusedElement === null ? null : surfaceOf(focusedElement)
		// 焦点落在富文本面上就先盯住它，哪怕此刻还不可编辑：contenteditable 短暂变 false 时，
		// 只有盯着属性才等得到它变回来那一下
		if (surfaceKind === "rich" && focusedElement !== null) observeComposer(focusedElement)
		// 光标只出现在正拿着焦点的那个可编辑面上：hero 态的输入框没有可编辑面，多会话时也只有一个面拿着焦点
		// 选了字（合成中选中候选词也算）时不该有它
		let caretSurface: HTMLElement | null = null
		let caretRange: Range | null = null
		if (surfaceKind === "rich" && focusedElement !== null && focusedElement.isContentEditable
			&& selection !== null && selection.isCollapsed && selection.rangeCount > 0) {
			const candidateRange = selection.getRangeAt(0)
			if (focusedElement.contains(candidateRange.startContainer)) {
				caretSurface = focusedElement
				caretRange = candidateRange
			}
		}
		if (surfaceKind === "plain" && focusedElement instanceof HTMLTextAreaElement
			&& focusedElement.selectionStart === focusedElement.selectionEnd) caretSurface = focusedElement
		// 命令 chip 被选中时，dsh 把原生插入符按掉了：那一下不是光标，自绘的那根也藏起来
		if (caretSurface !== null && caretSurface.hasAttribute(CHIP_SELECTED_ATTRIBUTE)) {
			caretSurface = null
			caretRange = null
		}
		for (const [input, layer] of caretLayerMap) {
			// 切会话会把整个输入区换掉，提问卡片答完、排队行存完也会整块卸掉，跟着它走的那根一并撤掉
			if (!input.isConnected) {
				release(input, layer)
				caretLayerMap.delete(input)
				continue
			}
			if (input === caretSurface) continue
			// 光标不归它，或者干脆没有光标：自绘的那根藏起来，原生插入符还回去
			// 按掉标记只在真的有一根自绘的光标时才存在，其余任何时候撤掉它都是安全的
			hide(layer)
			input.removeAttribute(CARET_ATTRIBUTE)
		}
		if (caretSurface === null) return
		const layer = layerFor(caretSurface)
		if (layer === null) return
		let measured: CaretBox | null = null
		if (caretSurface instanceof HTMLTextAreaElement) measured = measurePlain(caretSurface, endKeyed)
		else if (caretRange !== null) measured = measureRich(caretSurface, caretRange)
		// 按掉标记只在真正画出一根之后才写。画不出来时把原生插入符还回去——
		// 原生已透明、自绘没画是这套动效唯一真正会伤到读者的失效方式，任何一次测量失败都必须退回原点
		if (measured === null) {
			caretSurface.removeAttribute(CARET_ATTRIBUTE)
			hide(layer)
			return
		}
		if (!caretSurface.hasAttribute(CARET_ATTRIBUTE)) adoptCaretColor(caretSurface, layer)
		// 纯文本面内部滚走的那一截不画。这不是测量失败——原生那根这时也看不见——所以标记照写
		let caretBox: CaretBox | null = measured
		if (caretSurface instanceof HTMLTextAreaElement) caretBox = clipToField(caretSurface, measured)
		if (caretBox === null) hide(layer)
		else draw(layer, caretBox, mode === "move" && typing)
		caretSurface.setAttribute(CARET_ATTRIBUTE, "")
	}

	document.addEventListener("selectionchange", queueSync)
	document.addEventListener("focusin", syncAfterFocusChange)
	document.addEventListener("focusout", syncAfterFocusChange)
	// move 档的判据。beforeinput 先于 selectionchange 到达，所以这一帧的移动算不算打字，读它比事后从位置上猜准
	// 输入法合成期间照样发 selectionchange、选区照样折叠（往真页面里注过合成，逐帧量过），所以这里不为合成单独分支
	document.addEventListener("beforeinput", markTyped)
	// 软换行处偏向哪一边的判据：上一下是不是 End。捕获阶段听，免得被谁拦在半路
	document.addEventListener("keydown", noteKey, true)
	document.addEventListener("pointerdown", clearEndKey, true)
	document.addEventListener("scroll", followPlainScroll, {capture: true, passive: true})
	window.addEventListener("resize", queueSync)
	// 自带的那两份字体是后到的，折行随之变化，光标要重新量一次
	document.fonts.addEventListener("loadingdone", queueSync)

	return {
		resync: queueSync,
		dispose: () => {
			disposed = true
			if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
			frameHandle = 0
			document.removeEventListener("selectionchange", queueSync)
			document.removeEventListener("focusin", syncAfterFocusChange)
			document.removeEventListener("focusout", syncAfterFocusChange)
			document.removeEventListener("beforeinput", markTyped)
			document.removeEventListener("keydown", noteKey, true)
			document.removeEventListener("pointerdown", clearEndKey, true)
			document.removeEventListener("scroll", followPlainScroll, true)
			window.removeEventListener("resize", queueSync)
			document.fonts.removeEventListener("loadingdone", queueSync)
			contentObserver.disconnect()
			for (const [input, layer] of caretLayerMap) release(input, layer)
			caretLayerMap.clear()
		},
	}
}

// 一个元素是不是本模块接管的可编辑面，是哪一种
// rich 是主输入框，plain 是输入区里可编辑的 textarea，都不是给 null
function surfaceOf(element: HTMLElement): SurfaceKind | null {
	if (element.matches(COMPOSER_INPUT_SELECTOR)) return "rich"
	if (!(element instanceof HTMLTextAreaElement) || !element.matches(COMPOSER_TEXTAREA_SELECTOR)) return null
	return element.disabled || element.readOnly ? null : "plain"
}

// 可编辑面的两种：contenteditable 的主输入框，与 textarea
type SurfaceKind = "rich" | "plain"

// 插入符在视口里的矩形：左、上、高。宽度由样式表定
interface CaretBox {
	left: number
	top: number
	height: number
}

// 一个可编辑面上的自绘插入符
interface CaretLayer {
	// 自绘的那根元素
	caret: HTMLElement
	// 此刻可见。用来认出刚出现那一帧，它不能走过渡
	visible: boolean
	// 那根挂在谁身上：可编辑面的父元素
	host: HTMLElement
	// 父元素原本不是定位上下文、由这里补过标记；撤掉那根时标记要一起还回去
	markedHost: boolean
	// 怀里那支羽毛；纸感关着、或者还用不上时为 null
	quill: HTMLElement | null
	// 羽毛上一次摆好的插入符高度：相同就不再写一次尺寸与偏移
	quillHeight: number
}

// 光标贴着的那个换行符，以及光标在它的哪一侧
interface CaretAnchor {
	// 换行符自己。它的矩形就是那一行的插入符位置：高度是字高，不是行高
	lineBreak: HTMLBRElement
	// 光标在它之前（行尾）还是之后（下一行行首）
	before: boolean
}
