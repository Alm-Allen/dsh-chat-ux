/**
 * 输入框下方那个「上下文占用」的比例圆：从环改成实心饼，按占用取色阶，并沿一条折点在圆心的折线切一刀，
 * 已占用那一块沿角平分线推开一段，缺口就是它原来的位置
 *
 * dsh 没给这个圆任何语义属性，也没把它做成座位，只能从结构上认；认不出就什么都不做，不会把别的元素改花
 *
 * 颜色仍归样式表：这里只把求值后的颜色读出来涂进图里，色标与插值在 context-meter-styles
 */
import {COMPOSER_DOCK_SELECTOR} from "../../dom-contract"
import {rampPosition, RAMP_POSITION_VAR, RAMP_SPAN_ATTRIBUTE} from "../ramp"
import {paintReel, releaseReel} from "../reel/reel-host"
import {REEL_TAKEOVER_ATTRIBUTE} from "../reel/reel-styles"
import {CONTEXT_PIE_ATTRIBUTE, CONTEXT_REST_VAR} from "./context-meter-styles"

// 统计胶囊才带的座位 id 属性；带着它的子元素不归这一处管
const STAT_ATTRIBUTE = "data-composer-stat"

// 比例圆那颗按钮：会开对话弹窗，并且画着一枚 svg
const TRIGGER_SELECTOR = `button[aria-haspopup="dialog"]`

// 读数文本的形状；dsh 写的就是「26%」
const READING_PATTERN = /^(\d{1,3})%$/

// 六个色标在占用上的位置：20 绿、24 浅绿、28 黄、32 橙黄、36 橙红、40 红
// 低于 20 一律绿、40 及以后一律红，与样式表里那几段一一对应
const CONTEXT_STOPS = [20, 24, 28, 32, 36, 40]

/**
 * 饼的边长：16px
 *
 * 比原图标那一格（14px）大一圈就够，再大盘着这一行；上下都还在行高以内，左右各借 1px
 * （左面是按钮的内边距，右面是图标与读数之间那 6px 的间隔），离读数还剩 5px
 */
export const PIE_SIZE = 16

// 原图标那一格：dsh 那枚 svg 写的就是 14×14。饼比它大，靠这个数摆正
const ICON_SIZE = 14

/**
 * 那道缝的宽度，像素，也是这一处唯一的可调量
 *
 * 缝由「洞口比那一块大一圈」给出（见 pushImage），宽恒为这个值，与推开多远无关；图标这个尺寸上
 * 1px 出头已经看得很清楚，再宽那一块就要与盘面散开
 */
const SLICE_GAP = 1.2

/**
 * 那一块沿角平分线推开多远，像素
 *
 * 缝不靠它挣（见 pushImage），它只影响两件事：那一块离开原位多远，以及盘面还剩多少直径
 * （PIE_SIZE 减位移，位移越大盘面越小）。2.6px 是权衡后的取值：推开的观感明显，盘面还剩 13.4px，
 * 与原来那圈环的外轮廓同量级；实心饼比同直径的环看得清，所以还立得住
 */
const SLICE_LIFT = 2.6

// 那一圈缝的遮罩 id：只在推出去那一套里用
const SLICE_MASK_ID = "dsh-chat-ux-slice"

// 盘面的半径：占满这一格，切口开在圆里，圆外不必留白
const RADIUS = PIE_SIZE / 2

// 推出去那一套的半径：得让出推开那一段，否则那一块的外缘会被这一格（PIE_SIZE）裁掉
const PUSH_RADIUS = (PIE_SIZE - SLICE_LIFT) / 2

// 圆心：这一格的正中
const CENTER = PIE_SIZE / 2

// 一整圈，弧度
const FULL_TURN = Math.PI * 2

// path 坐标的小数位取两位：再多的位数只是噪声
const PATH_PRECISION = 100

// 画法参数：生产调用一律用默认值，检测脚本会试别的缝宽与位移
export interface PieShape {
    // 环绕那一块的那道缝，像素
    gap?: number
    // 那一块沿角平分线推开多远，像素
    lift?: number
}

// 扩张那一下用多久。与数字滚动同一个时长：两件事通常同时发生，一起收才像一件事
const GROW_MS = 220

// 一枚饼当前的状态
interface PaintedPie {
    // 上一次画出来的读数；有一帧在跑时，这是那一帧的中间值
    percent: number
    // 正在跑的帧把手；0 表示没有在跑
    handle: number
    // 这一档的扇形色与未占用底色，每帧都要拼进图里
    tone: string
    rest: string
    // 这一次扩张的起止读数与起手时刻
    from: number
    to: number
    startedAt: number
}

// 每一枚饼当前的状态；键是那颗按钮
const paintedPies = new WeakMap<Element, PaintedPie>()

/**
 * 装上这一处
 * 返回的卸载函数断开观察，并把写过的标记、属性、数字滚动与内联样式撤干净
 */
export function installContextMeterPie(): () => void {
    let dock: Element | null = null
    let frameHandle = 0

    // 坞那一层带 data-composer-dock，比例圆与统计胶囊都是它的直接子元素；认过就记住，换会话换掉它时重认
    const readDockChildren = (): readonly Element[] => {
        if (dock !== null && dock.isConnected) return Array.from(dock.children)
        dock = document.querySelector(COMPOSER_DOCK_SELECTOR)
        return dock === null ? [] : Array.from(dock.children)
    }

    // 真正的形状判据在 paintContextMeter 里，认不出就什么都不做
    const paintDockChildren = (): void => {
        // 坞里除比例圆以外的孩子都是 conversation.composer.dock 的座位，各自带着自己的座位 id；
        // 比例圆是 InputBar 直接渲染的，没有座位、不带这个属性。所以先按属性把它排掉，形状判据只当兜底
        const candidates: HTMLSpanElement[] = []
        for (const candidate of readDockChildren()) {
            if (!(candidate instanceof HTMLSpanElement)) continue
            if (candidate.hasAttribute(STAT_ATTRIBUTE)) continue
            candidates.push(candidate)
        }
        if (candidates.length !== 1) return
        const only = candidates[0]
        if (only === undefined) return
        paintContextMeter(only)
    }

    paintDockChildren()
    // 流式期间每一次字符变化都会叫到这里，所以只登记一帧：一帧最多认一次
    const observer = new MutationObserver(() => {
        if (frameHandle !== 0) return
        frameHandle = requestAnimationFrame(() => {
            frameHandle = 0
            paintDockChildren()
        })
    })
    // 不盯 characterData：流式输出每一批都会往思考行里加字，那是这条链路里最密的一路，而读数只在
    // 百分比真的翻一格时才变，那时 dsh 会重设读数那一截的 textContent，也就是一次 childList
    observer.observe(document.body, {subtree: true, childList: true})

    return () => {
        observer.disconnect()
        if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
        releasePieTakeover()
    }
}

/**
 * 一枚饼的样子：一整枚圆被一条折点在圆心的折线切开，已占用那一块沿角平分线推出去一段，
 * 缺口就是那一块原来的位置
 *
 * 两块之间的缝宽恒定，由「洞口比那一块大一圈」给出，见 pushImage。这条路径也是检测脚本的采样依据，
 * 所以它连参数一起是公开的
 */
export function pieImage(percent: number, tone: string, rest: string, shape?: PieShape): string {
    // 两头都单独走：满值时那道缝会与盘面的边界重合，而且「切了一刀还占满」本就说不通；空值时该画的是一枚
    // 完整的灰盘（什么都没有，也不该有缝）。两档都画整圆，不切
    if (percent >= 100) return inlineSvg(`<path d="${discPath(CENTER, CENTER, RADIUS)}" fill="${tone}"/>`)
    if (percent <= 0) return inlineSvg(`<path d="${discPath(CENTER, CENTER, RADIUS)}" fill="${rest}"/>`)

    const occupied = percent / 100 * 360
    return pushImage(occupied, tone, rest, shape?.gap ?? SLICE_GAP, shape?.lift ?? SLICE_LIFT)
}

/**
 * 推出去：两块是全等的扇形，一块留在原位（那就是盘上的缺口），另一块沿角平分线挪开 lift
 *
 * 缝宽不靠位移挣：盘上挖掉的是那一条扇形再向外一圈 seam，所以缝环绕那一块的整条边界处处一样宽，
 * 与推开多远无关。盘面半径随位移收（(PIE_SIZE - lift) / 2），整幅图的外接尺寸恒为 PIE_SIZE，
 * 圆心沿角平分线的反面退半个 lift，图这才落在容器正中
 */
function pushImage(occupied: number, tone: string, rest: string, seam: number, lift: number): string {
    const direction = occupied / 2
    const halfAngleSin = Math.sin(rad(direction))
    const halfAngleCos = Math.cos(rad(direction))
    const half = lift / 2
    const centerX = round2(CENTER - half * halfAngleSin)
    const centerY = round2(CENTER + half * halfAngleCos)
    const apexX = round2(centerX + lift * halfAngleSin)
    const apexY = round2(centerY - lift * halfAngleCos)
    const slice = sectorPath(apexX, apexY, PUSH_RADIUS, 0, occupied)
    const plate = `<path d="${discPath(centerX, centerY, PUSH_RADIUS)} ${slice}" fill="${rest}" fill-rule="evenodd" mask="url(#${SLICE_MASK_ID})"/>`
    return inlineSvg(sliceGapMask(slice, seam) + plate
        + `<path d="${slice}" fill="${tone}"/>`)
}

/**
 * 那一圈缝的遮罩：整幅图铺白，再把那一条扇形的 path 描一道宽边涂黑，涂黑处透明
 *
 * 描边以 path 为中心向两侧各扩半个缝宽（stroke-width 是 2 × seam），外侧那一半是缝，内侧那一半落在
 * 那一块自己的地界里，挖掉也不影响；拐角用 round，顶点那一头因此是一段圆角的缝，与两条直边同宽
 */
function sliceGapMask(slice: string, seam: number): string {
    return `<mask id="${SLICE_MASK_ID}" maskUnits="userSpaceOnUse" x="0" y="0" width="${PIE_SIZE}" height="${PIE_SIZE}">`
        + `<rect x="0" y="0" width="${PIE_SIZE}" height="${PIE_SIZE}" fill="#ffffff"/>`
        + `<path d="${slice}" fill="none" stroke="#000000" stroke-width="${seam * 2}" stroke-linejoin="round"/>`
        + "</mask>"
}

// 一整圈：两段半圆拼起来。起点与终点重合的那段弧按 SVG 的规矩会被整段忽略，画出来什么都没有
function discPath(cx: number, cy: number, radius: number): string {
    const x = round2(cx)
    const top = round2(cy - radius)
    const bottom = round2(cy + radius)
    return "M " + x + " " + top
        + " A " + radius + " " + radius + " 0 1 1 " + x + " " + bottom
        + " A " + radius + " " + radius + " 0 1 1 " + x + " " + top + " Z"
}

/**
 * 一角扇形：从顶点出发，走到 from 度那一点，再沿弧顺时针走到 to 度
 * 盘面与那一块都用它、用同一组角度与半径，差别只有顶点落在哪
 */
function sectorPath(cx: number, cy: number, radius: number, from: number, to: number): string {
    const x = round2(cx)
    const y = round2(cy)
    const x0 = round2(cx + radius * Math.sin(rad(from)))
    const y0 = round2(cy - radius * Math.cos(rad(from)))
    const x1 = round2(cx + radius * Math.sin(rad(to)))
    const y1 = round2(cy - radius * Math.cos(rad(to)))
    // 过了半个圈要走大弧，否则圆弧会挑另一侧那条近路
    const largeArc = to - from > 180 ? 1 : 0
    return "M " + x + " " + y + " L " + x0 + " " + y0
        + " A " + radius + " " + radius + " 0 " + largeArc + " 1 " + x1 + " " + y1 + " Z"
}

// 度换弧度。0 度是 12 点，顺时针为正
function rad(degrees: number): number {
    return degrees / 360 * FULL_TURN
}

// 把一段图元包成一张可以直接当背景图的 SVG
function inlineSvg(body: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PIE_SIZE} ${PIE_SIZE}">${body}</svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// 两位小数，给 path 坐标用
function round2(value: number): number {
    return Math.round(value * PATH_PRECISION) / PATH_PRECISION
}

/**
 * 认一枚比例圆：读它的百分比，把色阶的段与位置写到按钮上，再给读数挂上数字滚动、把饼画成按钮的背景图
 * 认不出来的候选什么都不做
 */
function paintContextMeter(root: HTMLSpanElement): void {
    const trigger = root.querySelector(TRIGGER_SELECTOR)
    if (!(trigger instanceof HTMLElement) || trigger.querySelector("svg") === null) return
    const reading = trigger.querySelector("span")
    if (!(reading instanceof HTMLElement)) return
    const text = reading.textContent?.trim() ?? ""
    const matched = READING_PATTERN.exec(text)
    if (matched === null) return
    const captured = matched[1]
    if (captured === undefined) return

    const percent = Number(captured)
    const toneRamp = rampPosition(percent, CONTEXT_STOPS)
    // 值没变就不写：属性与内联样式喂不到观察者（那只盯 childList 与 characterData），但每次同步都重写一遍
    // 会让样式失效白白重算
    if (trigger.getAttribute(RAMP_SPAN_ATTRIBUTE) !== toneRamp.span) trigger.setAttribute(RAMP_SPAN_ATTRIBUTE, toneRamp.span)
    if (trigger.style.getPropertyValue(RAMP_POSITION_VAR) !== toneRamp.mix) trigger.style.setProperty(RAMP_POSITION_VAR, toneRamp.mix)
    // 数字滚动挂在那串读数的旁边（按钮上），不是它里面：那一截归 dsh 的 React 管，读数一变它会重设
    // textContent，塞在里面的节点会被一起清掉（见 reel-host）
    paintReel(trigger, reading, text)
    // 先让开、再读色：让开与色阶都由这条属性开门，属性晚一步的话 getComputedStyle 读到的还是 dsh 给那颗
    // 按钮的默认文字色，饼会画成灰的，而且要等到下一次 DOM 变化才会重画
    root.setAttribute(CONTEXT_PIE_ATTRIBUTE, "")
    // 画不出来就把属性撤回去：原环还在，读者看到的是一个环，而不是环被藏起来、饼又没有的空格
    if (!startPieGrow(trigger, percent, reading)) root.removeAttribute(CONTEXT_PIE_ATTRIBUTE)
}

/**
 * 把读数对应的那张图画进那颗按钮，落在原来那枚图标所占据的那一格上
 *
 * 底色与扇形色都从计算样式里读：段标记刚写上去，读数那一截的 color 就是这一档的颜色。读不到底色就什么都
 * 不画——那说明样式表没上（或者名字改了），此时把原环藏起来只会留下一块空白
 */
function startPieGrow(trigger: HTMLElement, target: number, reading: HTMLElement): boolean {
    // 扇形色就是 color-mix 算出来的那一份（常常是 oklch(...) 写法），直接拼进图片文档即可：图片文档认它，
    // 与 rgb 字面值画出同一个像素
    const readingStyle = getComputedStyle(reading)
    const tone = readingStyle.color
    // 底色与扇形色都从读数那一截取，两个数一次样式结算拿到
    const rest = readingStyle.getPropertyValue(CONTEXT_REST_VAR).trim()
    if (tone === "" || rest === "") return false

    const previous = paintedPies.get(trigger)
    // 读数与色都没变、也没有一帧在跑：不写第二遍
    if (previous !== undefined && previous.handle === 0 && previous.percent === target
        && previous.tone === tone && previous.rest === rest) return true
    // 上一次还在跑就被新读数打断了：从它当前显示的那一格接着往新目标走，不从起点重来
    if (previous !== undefined && previous.handle !== 0) cancelAnimationFrame(previous.handle)
    const from = previous === undefined ? 0 : previous.percent

    // 背景图那四个属性只在接管时写一次，之后的每一帧只换图
    if (previous === undefined) {
        trigger.style.backgroundRepeat = "no-repeat"
        trigger.style.backgroundSize = PIE_SIZE + "px " + PIE_SIZE + "px"
        // 内容框的原点就是图标那一格的左边缘；饼比那一格宽 2px，起点往左借一半才与图标同心
        trigger.style.backgroundOrigin = "content-box"
        trigger.style.backgroundPosition = -(PIE_SIZE - ICON_SIZE) / 2 + "px center"
    }

    const piePaint: PaintedPie = {
        percent: from,
        handle: 0,
        tone,
        rest,
        from,
        to: target,
        startedAt: performance.now(),
    }
    paintedPies.set(trigger, piePaint)
    writePieImage(trigger, from, tone, rest)
    // 刚挂上就从 0 长出来（与数字滚动那个先例一致），以及读数没变、系统要求减少动态效果：都不跑帧
    if (from === target || reduceMotion()) {
        piePaint.percent = target
        writePieImage(trigger, target, tone, rest)
        return true
    }
    // 背景图是一整张 data URL 的 SVG，换图插不了值；CSS 过渡只能落在 conic-gradient 上，而它在 16px 这个
    // 尺寸上的硬边有锯齿。所以留着背景图，一次变化十二帧上下，由 rAF 推读数、每帧重画一张
    piePaint.handle = requestAnimationFrame((now) => advancePieGrow(trigger, now))
    return true
}

// 把读数对应的那张图写进那颗按钮
function writePieImage(trigger: HTMLElement, percent: number, tone: string, rest: string): void {
    trigger.style.backgroundImage = pieImage(percent, tone, rest)
}

/**
 * 推一帧：把这一枚饼从起点的读数推到终点的读数
 * 缓动是收尾那一种，与数字滚动那条 CSS 曲线同一档；JS 里没有现成的三次贝塞尔求值，为一条曲线搬进来一个
 * 求解器不值，220ms 上两者的差别看不出来
 */
function advancePieGrow(trigger: HTMLElement, now: number): void {
    const piePaint = paintedPies.get(trigger)
    if (piePaint === undefined) return
    const progress = Math.min(1, (now - piePaint.startedAt) / GROW_MS)
    if (progress >= 1) {
        piePaint.percent = piePaint.to
        piePaint.handle = 0
        writePieImage(trigger, piePaint.to, piePaint.tone, piePaint.rest)
        return
    }
    const eased = 1 - (1 - progress) ** 3
    piePaint.percent = piePaint.from + (piePaint.to - piePaint.from) * eased
    writePieImage(trigger, piePaint.percent, piePaint.tone, piePaint.rest)
    piePaint.handle = requestAnimationFrame((next) => advancePieGrow(trigger, next))
}

// 系统说「减少动态效果」：扩张那一下不跑，直接落定
function reduceMotion(): boolean {
    return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
}

// 把写过的标记、色阶、数字滚动与内联样式撤干净，让原环原样回来
function releasePieTakeover(): void {
    for (const reading of document.querySelectorAll("[" + REEL_TAKEOVER_ATTRIBUTE + "]")) {
        if (reading instanceof HTMLElement) releaseReel(reading)
    }
    for (const root of document.querySelectorAll("[" + CONTEXT_PIE_ATTRIBUTE + "]")) {
        root.removeAttribute(CONTEXT_PIE_ATTRIBUTE)
    }
    for (const trigger of document.querySelectorAll("[" + RAMP_SPAN_ATTRIBUTE + "]")) {
        if (!(trigger instanceof HTMLElement)) continue
        const piePaint = paintedPies.get(trigger)
        if (piePaint !== undefined && piePaint.handle !== 0) cancelAnimationFrame(piePaint.handle)
        trigger.removeAttribute(RAMP_SPAN_ATTRIBUTE)
        trigger.style.removeProperty(RAMP_POSITION_VAR)
        trigger.style.removeProperty("background-image")
        trigger.style.removeProperty("background-repeat")
        trigger.style.removeProperty("background-size")
        trigger.style.removeProperty("background-origin")
        trigger.style.removeProperty("background-position")
    }
}
