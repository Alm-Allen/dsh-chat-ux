/**
 * 输入框下方那个「上下文占用」的比例圆：从环改成实心饼，并按占用取无极色阶。
 *
 * dsh 没给这个圆任何语义属性，也没把它做成座位——它是 InputBar 里直接渲染的一个 span（那一行
 * 是 activity 为空时的 ContextMeter），插件接不过来，所以只能从结构上认它：草稿坞的直接子元素
 * 里，那个既不带 data-composer-stat（统计胶囊才带）、又装着一枚 aria-haspopup="dialog" 按钮与
 * 一个 svg 的 span。
 *
 * 画法与直觉那条路不同：饼是内联 SVG 作为按钮的背景图，不是伪元素加 conic-gradient。两个原因都
 * 在 dsh 这一侧——它的主题把 corner-shape 全局设成 superellipse(1.5)（选择器里连 :before/:after
 * 一起），于是 border-radius: 50% 画出来是圆角方块而不是圆；伪元素又只能从自定义属性里取值，
 * 几何算不出来。自己画一张图两处一起绕开：SVG 里的圆永远是圆，扇形角度由这里算。
 *
 * 颜色仍归样式表：这里只把**求值后的颜色**读出来涂进图里（`color-mix` 的结果），色标与插值都写在
 * context-meter-styles。读数那一串百分比由 reel-host 挂上同一枚数字轮——它同样不是座位，所以那一侧
 * 挂的是一棵自己的 React 树。段标记与段内位置走 `../ramp`，与命中率共用同一套机制。
 *
 * 判据失效时的表现是「什么都不变」：认不出就不动手，不会把别的元素改花。
 *
 * @module dsh-chat-ux/client/chat/context-meter/context-meter-pie
 */
import {rampPosition, RAMP_POSITION_VAR, RAMP_SPAN_ATTRIBUTE} from '../ramp'
import {paintReel, releaseReel} from '../reel/reel-host'
import {REEL_TAKEOVER_ATTRIBUTE} from '../reel/reel-styles'
import {CONTEXT_PIE_ATTRIBUTE, CONTEXT_REST_VAR} from './context-meter-styles'

/** 草稿坞：统计胶囊与这个比例圆都住在它里面。 */
const COMPOSER_DOCK_SELECTOR = '[data-composer-dock]'

/** 统计胶囊才带的座位 id 属性；带着它的子元素不归这一处管。 */
const STAT_ATTRIBUTE = 'data-composer-stat'

/** 比例圆那颗按钮：会开对话弹窗，并且画着一枚 svg。 */
const TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"]'

/** 读数文本的形状；dsh 写的就是「26%」。 */
const READING_PATTERN = /^(\d{1,3})%$/

/**
 * 六个色标在占用上的位置：15 绿、20 浅绿、25 黄、30 橙黄、35 橙红、40 红。低于 15 一律绿、40 及
 * 以后一律红，与样式表里那几段一一对应。
 */
const CONTEXT_STOPS = [15, 20, 25, 30, 35, 40]

/** 饼的边长，取原环 svg 的 14px；两者占的是同一格，所以不必再量。 */
const PIE_SIZE = 14

/** 原环的几何（`ContextMeter.tsx` 的 RADIUS 与 `.module.css` 的 stroke-width）。 */
const RING_RADIUS = 5.5
const RING_STROKE = 2

/**
 * 饼的半径取原环的**外轮廓**：环带从 5.5 往两边各铺 1，最外圈就是 6.5。
 *
 * 这一格是 14px，但原环画不满它——四周各留 0.5px。照 14px 画满会一眼看出比原来大一圈，所以
 * 实心饼也停在 6.5。
 */
const RADIUS = RING_RADIUS + RING_STROKE / 2

/** 圆心：那一格的正中，与原环的 cx/cy 同值。 */
const CENTER = PIE_SIZE / 2

/** 一整圈，弧度。 */
const FULL_TURN = Math.PI * 2

/** path 坐标的小数位取两位：再多的位数只是噪声。 */
const PATH_PRECISION = 100

/** 上一次画进这颗按钮的那张图；读数与色阶位置都没变就不再写一遍内联样式。 */
const paintedPies = new WeakMap<Element, string>()


/**
 * 装上这一处。
 * @returns 卸下这一处：断开观察，并把写过的标记、属性、数字轮与内联样式撤干净。
 */
export function installContextMeterPie(): () => void {
    let dock: Element | null = null
    let frame = 0

    /** 草稿坞：认过之后就记住它，换会话把它换掉时重认。 */
    const composerDock = (): Element | null => {
        if (dock !== null && dock.isConnected) return dock
        dock = document.querySelector(COMPOSER_DOCK_SELECTOR)
        return dock
    }

    const sync = (): void => {
        const seat = composerDock()
        if (seat === null) return
        for (const child of seat.children) {
            if (!(child instanceof HTMLSpanElement)) continue
            if (child.hasAttribute(STAT_ATTRIBUTE)) continue
            paint(child)
        }
    }

    sync()
    const observer = new MutationObserver(() => {
        // 流式期间每一次字符变化都会叫到这里，所以只登记一帧：一帧最多认一次。
        if (frame !== 0) return
        frame = requestAnimationFrame(() => {
            frame = 0
            sync()
        })
    })
    observer.observe(document.body, {subtree: true, childList: true, characterData: true})

    return () => {
        observer.disconnect()
        if (frame !== 0) cancelAnimationFrame(frame)
        release()
    }
}

/**
 * 认一枚比例圆：读它的百分比，把色阶的段与位置写到按钮上，再给读数挂上数字轮、把饼画成按钮的背景图。
 * @param root - 候选元素；认不出来就什么都不做。
 */
function paint(root: HTMLSpanElement): void {
    const trigger = root.querySelector(TRIGGER_SELECTOR)
    if (!(trigger instanceof HTMLElement) || trigger.querySelector('svg') === null) return
    const reading = trigger.querySelector('span')
    if (!(reading instanceof HTMLElement)) return
    const text = reading.textContent?.trim() ?? ''
    const matched = READING_PATTERN.exec(text)
    if (matched === null) return
    const captured = matched[1]
    if (captured === undefined) return

    const percent = Number(captured)
    const ramp = rampPosition(percent, CONTEXT_STOPS)
    // 值没变就不写：属性与内联样式虽然不喂观察者（那只盯 childList 与 characterData），但每次同步都
    // 重写一遍会让样式失效白白重算。
    if (trigger.getAttribute(RAMP_SPAN_ATTRIBUTE) !== ramp.span) {
        trigger.setAttribute(RAMP_SPAN_ATTRIBUTE, ramp.span)
    }
    if (trigger.style.getPropertyValue(RAMP_POSITION_VAR) !== ramp.mix) {
        trigger.style.setProperty(RAMP_POSITION_VAR, ramp.mix)
    }
    // 数字轮挂在那串读数的**旁边**（按钮上），不是它里面：那一截归 dsh 的 React 管，读数一变它会重设
    // 那一截的 textContent，塞在里面的节点会被一起清掉（见 reel-host 的说明）。读数形状对不上时
    // 它自己什么都不挂，原文本照旧。
    paintReel(trigger, reading, text)
    // 先让位、再读色：让位与色阶都由这条属性开门，属性晚一步的话 `getComputedStyle` 读到的还是 dsh
    // 给那颗按钮的默认文字色——饼会画成灰的，而且要等到下一次 DOM 变化才会重画（读者的观感是
    // 「刚打开是灰的，聊一句才变色」）。
    root.setAttribute(CONTEXT_PIE_ATTRIBUTE, '')
    // 画不出来就把属性撤回去：原环还在，读者看到的是一个环，而不是「环被藏起来、饼又没有」的空格。
    if (!paintPie(trigger, percent, reading)) root.removeAttribute(CONTEXT_PIE_ATTRIBUTE)
}

/**
 * 把饼画成按钮的背景图，落在原来那枚图标所占据的那一格上。
 *
 * 底色与扇形色都从计算样式里读：段标记刚写上去，读数那一截的 `color` 就是这一档的颜色。读不到底色就
 * 什么都不画——那说明样式表没上（或者名字改了），此时代替原来的环会是一块空白，不如让原环留着。
 * @param trigger - 那颗按钮。
 * @param percent - 已占用的百分比。
 * @param reading - 读数那一截；它的 `color` 就是扇形色。
 * @returns 这一帧画上了没有；没画上时调用方不该让原环让位。
 */
function paintPie(trigger: HTMLElement, percent: number, reading: HTMLElement): boolean {
    // 扇形色就是 `color-mix` 算出来的那一份（常常是 `oklch(...)` 写法），直接拼进图片文档即可：
    // 探针里那组 fill 写法对照（.probe/ramp.mjs）量过，图片文档认它，与 rgb 字面值画出同一个像素。
    const tone = getComputedStyle(reading).color
    const rest = getComputedStyle(trigger).getPropertyValue(CONTEXT_REST_VAR).trim()
    if (tone === '' || rest === '') return false

    const image = pieImage(percent, tone, rest)
    if (paintedPies.get(trigger) === image) return true
    paintedPies.set(trigger, image)
    trigger.style.backgroundImage = image
    trigger.style.backgroundRepeat = 'no-repeat'
    trigger.style.backgroundSize = PIE_SIZE + 'px ' + PIE_SIZE + 'px'
    // 内容框的原点就是图标那一格的左边缘，不必再去量按钮的内边距。
    trigger.style.backgroundOrigin = 'content-box'
    trigger.style.backgroundPosition = '0 center'
    return true
}

/**
 * 一张内联 SVG：一个底色圆，叠一块从 12 点顺时针切到读数的扇形。
 * @param percent - 已占用的百分比。
 * @param tone - 扇形颜色。
 * @param rest - 未占用那一角的颜色。
 * @returns 可以直接当 background-image 用的 url()。
 */
function pieImage(percent: number, tone: string, rest: string): string {
    const disc = '<circle cx="' + CENTER + '" cy="' + CENTER + '" r="' + RADIUS + '"'
    const filled = disc + ' fill="' + tone + '"/>'
    const empty = disc + ' fill="' + rest + '"/>'
    const sector = percent <= 0 ? '' : '<path d="' + sectorPath(percent) + '" fill="' + tone + '"/>'
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PIE_SIZE + ' ' + PIE_SIZE + '">'
        + (percent >= 100 ? filled : empty + sector) + '</svg>'
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
}

/**
 * 扇形那一段路径：从圆心出发，到 12 点，再沿弧顺时针切到读数所在的角度。
 * @param percent - 已占用的百分比。
 * @returns SVG path 的 d。
 */
function sectorPath(percent: number): string {
    const angle = percent / 100 * FULL_TURN
    const x = round2(CENTER + RADIUS * Math.sin(angle))
    const y = round2(CENTER - RADIUS * Math.cos(angle))
    // 过了半个圈要走大弧，否则圆弧会挑另一侧那条近路。
    const largeArc = percent > 50 ? 1 : 0
    return 'M ' + CENTER + ' ' + CENTER + ' L ' + CENTER + ' ' + (CENTER - RADIUS)
        + ' A ' + RADIUS + ' ' + RADIUS + ' 0 ' + largeArc + ' 1 ' + x + ' ' + y + ' Z'
}

/** 两位小数，给 path 坐标用。 */
function round2(value: number): number {
    return Math.round(value * PATH_PRECISION) / PATH_PRECISION
}

/** 把写过的标记、色阶、数字轮与内联样式撤干净，让原环原样回来。 */
function release(): void {
    for (const reading of document.querySelectorAll('[' + REEL_TAKEOVER_ATTRIBUTE + ']')) {
        if (reading instanceof HTMLElement) releaseReel(reading)
    }
    for (const root of document.querySelectorAll('[' + CONTEXT_PIE_ATTRIBUTE + ']')) {
        root.removeAttribute(CONTEXT_PIE_ATTRIBUTE)
    }
    for (const trigger of document.querySelectorAll('[' + RAMP_SPAN_ATTRIBUTE + ']')) {
        if (!(trigger instanceof HTMLElement)) continue
        trigger.removeAttribute(RAMP_SPAN_ATTRIBUTE)
        trigger.style.removeProperty(RAMP_POSITION_VAR)
        trigger.style.removeProperty('background-image')
        trigger.style.removeProperty('background-repeat')
        trigger.style.removeProperty('background-size')
        trigger.style.removeProperty('background-origin')
        trigger.style.removeProperty('background-position')
    }
}
