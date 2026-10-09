/**
 * 输入框下方那个「上下文占用」的比例圆：从环改成实心饼，并按占用取五档色。
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
 * 颜色仍归样式表：这里只把计算值读出来涂进图里，档位与色值都写在 context-meter-styles。
 *
 * 判据失效时的表现是「什么都不变」：认不出就不动手，不会把别的元素改花。
 *
 * @module dsh-chat-ux/client/chat/context-meter/context-meter-pie
 */
import {
    CONTEXT_PIE_ATTRIBUTE, CONTEXT_REST_VAR, CONTEXT_TONE_ATTRIBUTE, CONTEXT_TONE_CALM, CONTEXT_TONE_FULL,
    CONTEXT_TONE_HOT, CONTEXT_TONE_STEADY, CONTEXT_TONE_VAR, CONTEXT_TONE_WARM,
} from './context-meter-styles'

/** 草稿坞：统计胶囊与这个比例圆都住在它里面。 */
const COMPOSER_DOCK_SELECTOR = '[data-composer-dock]'

/** 统计胶囊才带的座位 id 属性；带着它的子元素不归这一处管。 */
const STAT_ATTRIBUTE = 'data-composer-stat'

/** 比例圆那颗按钮：会开对话弹窗，并且画着一枚 svg。 */
const TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"]'

/** 读数文本的形状；dsh 写的就是「26%」。 */
const READING_PATTERN = /^(\d{1,3})%$/

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

/** 五档。取值由样式表那边持有，这里跟着它取窄。 */
type ContextTone =
    | typeof CONTEXT_TONE_CALM
    | typeof CONTEXT_TONE_STEADY
    | typeof CONTEXT_TONE_WARM
    | typeof CONTEXT_TONE_HOT
    | typeof CONTEXT_TONE_FULL

/** 上一次画进这颗按钮的那张图；读数与档位都没变就不再写一遍内联样式。 */
const paintedPies = new WeakMap<Element, string>()

/**
 * 装上这一处。
 * @returns 卸下这一处：断开观察，并把写过的标记、属性与内联样式撤干净。
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
 * 认一枚比例圆：读它的百分比，把档位写到按钮上，再把饼画成按钮的背景图。
 * @param root - 候选元素；认不出来就什么都不做。
 */
function paint(root: HTMLSpanElement): void {
    const trigger = root.querySelector(TRIGGER_SELECTOR)
    if (!(trigger instanceof HTMLElement) || trigger.querySelector('svg') === null) return
    const reading = READING_PATTERN.exec(trigger.textContent?.trim() ?? '')
    if (reading === null) return

    const captured = reading[1]
    if (captured === undefined) return
    const percent = Number(captured)
    const tone = contextTone(percent)
    if (trigger.getAttribute(CONTEXT_TONE_ATTRIBUTE) !== tone) {
        trigger.setAttribute(CONTEXT_TONE_ATTRIBUTE, tone)
    }
    // 画成功了才让原环让位：样式表那一半要是没上（比如选择器被写坏），这里该什么都不动，
    // 而不是留下一个「环被藏起来、饼又没有」的空格。
    if (!paintPie(trigger, percent)) return
    root.setAttribute(CONTEXT_PIE_ATTRIBUTE, '')
}

/**
 * 把饼画成按钮的背景图，落在原来那枚图标所占据的那一格上。
 *
 * 底色与档位色从计算样式里读：档位属性刚写上去，读到的就是这一档的颜色。读不到就什么都不画——
 * 那说明样式表没上（或者名字改了），此时代替原来的环会是一块空白，不如让原环留着。
 * @param trigger - 那颗按钮。
 * @param percent - 已占用的百分比。
 * @returns 这一帧画上了没有；没画上时调用方不该让原环让位。
 */
function paintPie(trigger: HTMLElement, percent: number): boolean {
    const computed = getComputedStyle(trigger)
    const tone = computed.getPropertyValue(CONTEXT_TONE_VAR).trim()
    const rest = computed.getPropertyValue(CONTEXT_REST_VAR).trim()
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

/**
 * 占用落在哪一档。
 *
 * 判据用的是 dsh 显示的那个整数（它自己就是四舍五入后的读数）：读者看到 30 就该是浅绿。端点按
 * 「超过」的口径算，所以 30 仍是浅绿、40 仍是黄、50 仍是橙黄。
 * @param percent - 显示用的占用百分比。
 * @returns 五档里的那一档。
 */
function contextTone(percent: number): ContextTone {
    if (percent > 50) return CONTEXT_TONE_FULL
    if (percent > 40) return CONTEXT_TONE_HOT
    if (percent > 30) return CONTEXT_TONE_WARM
    if (percent >= 20) return CONTEXT_TONE_STEADY
    return CONTEXT_TONE_CALM
}

/** 把写过的标记、档位与内联样式撤干净，让原环原样回来。 */
function release(): void {
    for (const root of document.querySelectorAll('[' + CONTEXT_PIE_ATTRIBUTE + ']')) {
        root.removeAttribute(CONTEXT_PIE_ATTRIBUTE)
        const trigger = root.querySelector(TRIGGER_SELECTOR)
        if (!(trigger instanceof HTMLElement)) continue
        trigger.removeAttribute(CONTEXT_TONE_ATTRIBUTE)
        trigger.style.removeProperty('background-image')
        trigger.style.removeProperty('background-repeat')
        trigger.style.removeProperty('background-size')
        trigger.style.removeProperty('background-origin')
        trigger.style.removeProperty('background-position')
    }
}
