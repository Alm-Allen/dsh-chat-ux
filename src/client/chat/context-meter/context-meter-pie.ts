/**
 * 输入框下方那个「上下文占用」的比例圆：从环改成实心饼，按占用取无极色阶，并沿一条**折点在圆心**的
 * 折线切一刀——两段各是一条半径，沿线开出等宽的一道切口，把圆分成两块。两块都留在原位，所以把切口
 * 补上还是一整个圆；已占用的那一块多大随占用长大，变化那一下由这里逐帧推过去。
 *
 * dsh 没给这个圆任何语义属性，也没把它做成座位——它是 InputBar 里直接渲染的一个 span（那一行
 * 是 activity 为空时的 ContextMeter），插件接不过来，所以只能从结构上认它：草稿坞的直接子元素
 * 里，那个既不带 data-composer-stat（统计胶囊才带）、又装着一枚 aria-haspopup="dialog" 按钮与
 * 一个 svg 的 span。
 *
 * 画法与直觉那条路不同：饼是内联 SVG 作为按钮的背景图，不是伪元素加 conic-gradient。两个原因都
 * 在 dsh 这一侧——它的主题把 corner-shape 全局设成 superellipse(1.5)（选择器里连 :before/:after
 * 一起），于是 border-radius: 50% 画出来是圆角方块而不是圆；伪元素又只能从自定义属性里取值，
 * 几何算不出来。自己画一张图两处一起绕开：SVG 里的圆永远是圆，扇形角度与切口都由这里算。
 *
 * 扩张那一下为什么是逐帧重画、不是 CSS 过渡：背景图是一整张 data URL 的 SVG，换图插不了值；SVG
 * 的 d 能插值，但这一条 path 的大弧标记在 50% 处会从 0 跳到 1，插到一半会翻面；conic-gradient 能靠
 * CSS 过渡，可它在 20px 这个尺寸上的硬边有锯齿，而且换掉它就要把「读数同色」与「先让位再读色」这两
 * 处已经踩平的坑重做一遍。所以留着背景图，动画由 rAF 推读数、每帧重画一张图——一次变化十二帧上下，
 * 每帧只是拼一个字符串加一次样式写入。
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
 * 六个色标在占用上的位置：20 绿、24 浅绿、28 黄、32 橙黄、36 橙红、40 红。低于 20 一律绿、40 及
 * 以后一律红，与样式表里那几段一一对应。
 */
const CONTEXT_STOPS = [20, 24, 28, 32, 36, 40]

/**
 * 饼的边长：20px。
 *
 * 原来那圈环的外轮廓只有 13px（半径 6.5），那个尺寸上圆弧与那道切口都认不出来，所以把它做大。20px
 * 正好是这颗按钮那一行的行高，上下一点不外溢；左右各借 3px（左面是按钮的内边距，右面是图标与读数
 * 之间那 6px 的间隔），离读数还剩 3px。
 */
export const PIE_SIZE = 20

/** 原图标那一格：dsh 那枚 svg 写的就是 14×14。饼比它大，靠这个数摆正。 */
const ICON_SIZE = 14

/**
 * 那道切口的宽度，像素——**唯一的旋钮**。
 *
 * 切口就是那条折线本身：折点在圆心，两段各是一条半径，沿线开出等宽的一道缝（缝宽不随半径变），把
 * 圆分成两块。两块**都不动位置**，所以把缝补上还是一整个圆——读者看到的是「这个圆被切了一刀」，
 * 而不是「一块被端了出去」。
 *
 * 这一格图标上 1px 出头已经看得很清楚；再宽，两块就要散开了。
 */
const CUT_GAP = 1.2

/**
 * 推出去那一套沿角平分线推开多远，像素——**只在开关打开时用**。
 *
 * 1px 出头已经看得出「那一块被端了出去」；再大，扇形顶点离圆心太远，形状就不像同一枚饼了。
 */
const SLICE_LIFT = 2.6

/**
 * 圆心那个小孔的半径，像素。
 *
 * 两条缝各自只让到自己那一侧的半径线为止，圆心恰好落在四条半缝的交点上——谁也挖不到它，会留下一
 * 点扇形色的残渣（读者看到的是「这一刀没切透」）。所以另给一个以圆心为心的小圆，两块都把它挖掉。
 */
const PIVOT_HOLE = 0.7

/** 遮罩的 id：每次画的都是一份独立的图片文档，同一个 id 不会跟别处撞。 */
const PIVOT_MASK_ID = 'dsh-chat-ux-pivot'

/** 盘面的半径：占满这一格。切口开在圆里，圆外不必留白。 */
const RADIUS = PIE_SIZE / 2

/** 推出去那一套的半径：得让出推开那一段，否则那一块的外缘会被 20px 的容器裁掉。 */
const PUSH_RADIUS = (PIE_SIZE - SLICE_LIFT) / 2

/** 圆心：这一格的正中。 */
const CENTER = PIE_SIZE / 2

/** 一整圈，弧度。 */
const FULL_TURN = Math.PI * 2

/** path 坐标的小数位取两位：再多的位数只是噪声。 */
const PATH_PRECISION = 100

/** 折线切开之后，那一块的两种去处。 */
export type PieStyle = 'push' | 'cut'

/** 画法参数：生产调用只给 style，探针与预览还会试 gap / lift。 */
export interface PieShape {
    /** 折线切开之后，那一块推不推出去。 */
    style: PieStyle
    /** 切口宽度（「只切一刀」那一套用），像素。 */
    gap?: number
    /** 推开多远（「推出去」那一套用），像素。 */
    lift?: number
}

/** 扩张那一下用多久。与数字轮同一个时长：两件事通常同时发生，一起收才像一件事。 */
const GROW_MS = 220

/** 一枚饼当前的状态。 */
interface PaintedPie {
    /** 上一次画出来的读数；有一帧在跑时，这是那一帧的中间值。 */
    percent: number
    /** 正在跑的帧把手；0 表示没有在跑。 */
    handle: number
    /** 这一档的扇形色。 */
    tone: string
    /** 这一档的未占用底色。 */
    rest: string
    /** 上一次画出来用的是哪一套画法；开关翻了要按它判断该不该重画。 */
    style: PieStyle
    /** 这一次扩张的起点读数。 */
    from: number
    /** 这一次扩张的终点读数。 */
    to: number
    /** 这一次扩张的起手时刻。 */
    startedAt: number
}

/** 每一枚饼当前的状态；键是那颗按钮。 */
const paintedPies = new WeakMap<Element, PaintedPie>()

/** 装上这一处之后的把手。 */
export interface ContextMeterPieHandle {
    /** 卸下这一处：断开观察，并把写过的标记、属性、数字轮与内联样式撤干净。 */
    dispose: () => void
    /** 开关变了就再落一次：每一枚饼按新画法立刻重画，不必等读数下一次变化。 */
    resync: () => void
}


/**
 * 装上这一处。
 * @param shouldPush - 折线切开之后那一块推不推出去（插件管理页上那个开关）。
 * @returns 卸下这一处，以及开关变化后重新落一次。
 */
export function installContextMeterPie(shouldPush: () => boolean): ContextMeterPieHandle {
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
            paint(child, shouldPush() ? 'push' : 'cut')
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

    return {
        dispose: () => {
            observer.disconnect()
            if (frame !== 0) cancelAnimationFrame(frame)
            release()
        },
        resync: sync,
    }
}

/**
 * 一枚饼的样子：一整枚圆，被一条折点在圆心的折线切开。
 *
 * 切开之后那一块有两种去处，由 `style` 决定：`cut` 只切一刀——两块都留在原位，中间一道等宽的切口，
 * 把切口补上还是一整个圆；`push` 是那一块沿角平分线推开一段——缺口就是它原来的位置，盘上因此留下
 * 同形状的一块空位。两套的折线是同一条，差别只在推不推。
 *
 * 这条路径也是探针的采样依据，所以它连参数一起是公开的。
 * @param percent - 已占用的百分比。
 * @param tone - 已占用那一块的颜色。
 * @param rest - 剩下那一块的颜色。
 * @param shape - 画法；不带时按「只切一刀」画。
 * @returns 可以直接当 background-image 用的 url()。
 */
export function pieImage(percent: number, tone: string, rest: string, shape?: PieShape): string {
    const style = shape?.style ?? 'cut'
    // 两头都单独走：满值时两条切口会重合成一条、而且「切了一刀还占满」本就说不通；空值时该画的就是
    // 一枚完整的灰盘（什么都没有，也不该有切口）。两档都画整圆，不切。
    if (percent >= 100) return inlineSvg('<path d="' + discPath(CENTER, CENTER, RADIUS) + '" fill="' + tone + '"/>')
    if (percent <= 0) return inlineSvg('<path d="' + discPath(CENTER, CENTER, RADIUS) + '" fill="' + rest + '"/>')

    const occupied = percent / 100 * 360
    if (style === 'push') return pushImage(occupied, tone, rest, shape?.lift ?? SLICE_LIFT)
    return cutImage(occupied, tone, rest, shape?.gap ?? CUT_GAP)
}

/**
 * 只切一刀：两块都在原位，各自把同一道切口挖掉一半，所以缝的两侧都干净。
 * @param occupied - 已占用的角度，度。
 * @param tone - 已占用那一块的颜色。
 * @param rest - 剩下那一块的颜色。
 * @param gap - 切口宽度，像素。
 * @returns url()。
 */
function cutImage(occupied: number, tone: string, rest: string, gap: number): string {
    // 折线：0 度那一段与 occupied 那一段，各是一条半径。**两块各让出自己那一侧的半个缝宽**——缝因此
    // 完全落在各块自己的地界里，evenodd 挖得干净（跨在两块边界上的话，缝的外半条会在对方那一侧被当成
    // 「多出来的一块」而填上色）。缝是**透明**的，露出的是按钮底下的页面底色，深浅两套主题都自动对得上。
    const half = gap / 2
    const mask = ' mask="url(#' + PIVOT_MASK_ID + ')"'
    const plate = '<path d="' + discPath(CENTER, CENTER, RADIUS)
        + ' ' + slotPath(CENTER, CENTER, RADIUS, 0, half, -1)
        + ' ' + slotPath(CENTER, CENTER, RADIUS, occupied, half, 1)
        + '" fill="' + rest + '" fill-rule="evenodd"' + mask + '/>'
    const slice = '<path d="' + sectorPath(CENTER, CENTER, RADIUS, 0, occupied)
        + ' ' + slotPath(CENTER, CENTER, RADIUS, 0, half, 1)
        + ' ' + slotPath(CENTER, CENTER, RADIUS, occupied, half, -1)
        + '" fill="' + tone + '" fill-rule="evenodd"' + mask + '/>'
    return inlineSvg(pivotMask(CENTER, CENTER) + plate + slice)
}

/**
 * 推出去：两块是**全等**的扇形，一块留在原位（那就是盘上的缺口），另一块沿角平分线挪开 lift。
 *
 * 整幅图（盘加上推出去那一块）要落在容器正中，所以圆心先沿角平分线的反面退半个 lift——不退的话，
 * 推开的那一侧会被 20px 的容器裁掉一角。
 * @param occupied - 已占用的角度，度。
 * @param tone - 已占用那一块的颜色。
 * @param rest - 剩下那一块的颜色。
 * @param lift - 推开多远，像素。
 * @returns url()。
 */
function pushImage(occupied: number, tone: string, rest: string, lift: number): string {
    const direction = occupied / 2
    const half = lift / 2
    const centerX = round2(CENTER - half * Math.sin(rad(direction)))
    const centerY = round2(CENTER + half * Math.cos(rad(direction)))
    // 缺口的顶点正落在圆心上，那一点的填充也只是「一半」——同样套上遮罩，缺口那一头才干净。
    const plate = '<path d="' + discPath(centerX, centerY, PUSH_RADIUS)
        + ' ' + sectorPath(centerX, centerY, PUSH_RADIUS, 0, occupied)
        + '" fill="' + rest + '" fill-rule="evenodd" mask="url(#' + PIVOT_MASK_ID + ')"/>'
    const apexX = round2(centerX + lift * Math.sin(rad(direction)))
    const apexY = round2(centerY - lift * Math.cos(rad(direction)))
    const slice = '<path d="' + sectorPath(apexX, apexY, PUSH_RADIUS, 0, occupied) + '" fill="' + tone + '"/>'
    return inlineSvg(pivotMask(centerX, centerY) + plate + slice)
}


/**
 * 一整圈：两段半圆拼起来。
 *
 * 不能只用一段弧——起点与终点重合时，那段弧按 SVG 的规矩会被整段忽略，画出来什么都没有。
 * @param cx - 圆心横坐标。
 * @param cy - 圆心纵坐标。
 * @param radius - 半径。
 * @returns SVG path 的 d。
 */
function discPath(cx: number, cy: number, radius: number): string {
    const x = round2(cx)
    const top = round2(cy - radius)
    const bottom = round2(cy + radius)
    return 'M ' + x + ' ' + top
        + ' A ' + radius + ' ' + radius + ' 0 1 1 ' + x + ' ' + bottom
        + ' A ' + radius + ' ' + radius + ' 0 1 1 ' + x + ' ' + top + ' Z'
}

/**
 * 圆心那一小圈的遮罩：整幅图铺白，再把圆心那一圈涂黑——涂黑的地方就是透明的。
 *
 * 为什么用遮罩，而不是在 path 的 d 里塞一个小圆（那条路试过，两种弧的写法都试过）：那个小圆的半径
 * 不到 1px，即使 d 算得完全正确（dump 出来那个圆明明在），Chromium 也会当成「小到不必画」而放过，圆心
 * 那一点照样留着扇形色。遮罩是一次涂黑，跟路径的尺寸无关。
 * @param cx - 圆心的横坐标。
 * @param cy - 圆心的纵坐标。
 * @returns mask 元素的文本。
 */
function pivotMask(cx: number, cy: number): string {
    return '<mask id="' + PIVOT_MASK_ID + '" maskUnits="userSpaceOnUse" x="0" y="0"'
        + ' width="' + PIE_SIZE + '" height="' + PIE_SIZE + '">'
        + '<rect x="0" y="0" width="' + PIE_SIZE + '" height="' + PIE_SIZE + '" fill="#ffffff"/>'
        + '<circle cx="' + round2(cx) + '" cy="' + round2(cy) + '" r="' + PIVOT_HOLE + '" fill="#000000"/>'
        + '</mask>'
}

/**
 * 一角扇形：从顶点出发，走到 from 度那一点，再沿弧顺时针走到 to 度。
 *
 * 两套画法都用它、都用同一组角度与半径，差别只有顶点落在哪：只切一刀时两块都从容器正中那颗圆心起，
 * 推出去时拿一块从那颗圆心起、另一块从挪开 lift 的那一点起。
 * @param cx - 顶点的横坐标。
 * @param cy - 顶点的纵坐标。
 * @param radius - 半径。
 * @param from - 起始角度，度；0 是 12 点。
 * @param to - 结束角度，度，顺时针。
 * @returns SVG path 的 d。
 */
function sectorPath(cx: number, cy: number, radius: number, from: number, to: number): string {
    const x = round2(cx)
    const y = round2(cy)
    const x0 = round2(cx + radius * Math.sin(rad(from)))
    const y0 = round2(cy - radius * Math.cos(rad(from)))
    const x1 = round2(cx + radius * Math.sin(rad(to)))
    const y1 = round2(cy - radius * Math.cos(rad(to)))
    // 过了半个圈要走大弧，否则圆弧会挑另一侧那条近路。
    const largeArc = to - from > 180 ? 1 : 0
    return 'M ' + x + ' ' + y + ' L ' + x0 + ' ' + y0
        + ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + x1 + ' ' + y1 + ' Z'
}

/**
 * 一段切口：从圆心沿 direction 那条半径走出去的一个窄长条，一条边就压在半径线上。
 *
 * 它只往**一侧**让出 half 宽——盘让盘那一侧、那一块让扇形那一侧，两边一起才是等宽的一道缝。缝的末端
 * 停在圆边上，所以整块都落在各自的地界里，evenodd 挖出来是干净的。
 * @param cx - 圆心横坐标。
 * @param cy - 圆心纵坐标。
 * @param radius - 半径；缝到圆边为止。
 * @param direction - 这一段开在哪条半径上，度；0 是 12 点。
 * @param half - 让出的宽度（也就是缝宽的一半），像素。
 * @param side - 往哪一侧让：`1` 是角度增大（顺时针）那一侧，`-1` 是另一侧。
 * @returns SVG path 的 d。
 */
function slotPath(
    cx: number, cy: number, radius: number, direction: number, half: number, side: number,
): string {
    const sin = Math.sin(rad(direction))
    const cos = Math.cos(rad(direction))
    // 沿半径走出去的那个长度，以及法线方向上让出的那一点宽度。
    const outX = sin * radius
    const outY = -cos * radius
    const nx = cos * half * side
    const ny = sin * half * side
    return 'M ' + round2(cx) + ' ' + round2(cy)
        + ' L ' + round2(cx + outX) + ' ' + round2(cy + outY)
        + ' L ' + round2(cx + outX + nx) + ' ' + round2(cy + outY + ny)
        + ' L ' + round2(cx + nx) + ' ' + round2(cy + ny) + ' Z'
}

/** 度换弧度。0 度是 12 点，顺时针为正。 */
function rad(degrees: number): number {
    return degrees / 360 * FULL_TURN
}


/**
 * 把一段图元包成一张可以直接当背景图的 SVG。
 * @param body - 图元。
 * @returns url()。
 */
function inlineSvg(body: string): string {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PIE_SIZE + ' ' + PIE_SIZE + '">'
        + body + '</svg>'
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'
}

/** 两位小数，给 path 坐标用。 */
function round2(value: number): number {
    return Math.round(value * PATH_PRECISION) / PATH_PRECISION
}

/**
 * 认一枚比例圆：读它的百分比，把色阶的段与位置写到按钮上，再给读数挂上数字轮、把饼画成按钮的背景图。
 * @param root - 候选元素；认不出来就什么都不做。
 */
function paint(root: HTMLSpanElement, style: PieStyle): void {
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
    if (!paintPie(trigger, percent, reading, style)) root.removeAttribute(CONTEXT_PIE_ATTRIBUTE)
}

/**
 * 把读数对应的那张图画进那颗按钮，落在原来那枚图标所占据的那一格上。
 *
 * 底色与扇形色都从计算样式里读：段标记刚写上去，读数那一截的 `color` 就是这一档的颜色。读不到底色就
 * 什么都不画——那说明样式表没上（或者名字改了），此时代替原来的环会是一块空白，不如让原环留着。
 * @param trigger - 那颗按钮。
 * @param target - 这一档已占用的百分比。
 * @param reading - 读数那一截；它的 `color` 就是扇形色。
 * @returns 这一帧接上了没有；没接上时调用方不该让原环让位。
 */
function paintPie(trigger: HTMLElement, target: number, reading: HTMLElement, style: PieStyle): boolean {
    // 扇形色就是 `color-mix` 算出来的那一份（常常是 `oklch(...)` 写法），直接拼进图片文档即可：
    // 探针里那组 fill 写法对照（.probe/ramp.mjs）量过，图片文档认它，与 rgb 字面值画出同一个像素。
    const tone = getComputedStyle(reading).color
    const rest = getComputedStyle(trigger).getPropertyValue(CONTEXT_REST_VAR).trim()
    if (tone === '' || rest === '') return false

    const existing = paintedPies.get(trigger)
    // 读数与色都没变、也没有一帧在跑：不写第二遍。
    if (existing !== undefined && existing.handle === 0 && existing.percent === target
        && existing.tone === tone && existing.rest === rest && existing.style === style) return true
    // 上一次还在跑就被新读数打断了：从它当前显示的那一格接着往新目标走，不从起点重来。
    if (existing !== undefined && existing.handle !== 0) cancelAnimationFrame(existing.handle)
    const from = existing === undefined ? 0 : existing.percent

    // 背景图那四个属性只在接管时写一次，之后的每一帧只换图。
    if (existing === undefined) {
        trigger.style.backgroundRepeat = 'no-repeat'
        trigger.style.backgroundSize = PIE_SIZE + 'px ' + PIE_SIZE + 'px'
        // 内容框的原点就是图标那一格的左边缘；饼比那一格宽 6px，起点往左借一半才与图标同心。
        trigger.style.backgroundOrigin = 'content-box'
        trigger.style.backgroundPosition = -(PIE_SIZE - ICON_SIZE) / 2 + 'px center'
    }

    const record: PaintedPie = {
        percent: from,
        handle: 0,
        tone,
        rest,
        style,
        from,
        to: target,
        startedAt: performance.now(),
    }
    paintedPies.set(trigger, record)
    paintImage(trigger, from, tone, rest, style)
    // 刚挂上就从 0 长出来（与数字轮那个先例一致），以及读数没变、系统要求减少动态效果：都不跑帧。
    if (from === target || reduceMotion()) {
        record.percent = target
        paintImage(trigger, target, tone, rest, style)
        return true
    }
    record.handle = requestAnimationFrame((now) => { advance(trigger, now) })
    return true
}

/** 把读数对应的那张图写进那颗按钮。 */
function paintImage(trigger: HTMLElement, percent: number, tone: string, rest: string, style: PieStyle): void {
    trigger.style.backgroundImage = pieImage(percent, tone, rest, {style})
}

/**
 * 推一帧：把这一枚饼从起点的读数推到终点的读数。
 *
 * 缓动是收尾那一种（与数字轮那条 CSS 曲线同一档）。JS 里没有现成的三次贝塞尔求值，为一条曲线搬进来
 * 一个求解器不值——220ms 上两者的差别看不出来。
 * @param trigger - 那颗按钮。
 * @param now - 这一帧的时刻。
 */
function advance(trigger: HTMLElement, now: number): void {
    const record = paintedPies.get(trigger)
    if (record === undefined) return
    const progress = Math.min(1, (now - record.startedAt) / GROW_MS)
    if (progress >= 1) {
        record.percent = record.to
        record.handle = 0
        paintImage(trigger, record.to, record.tone, record.rest, record.style)
        return
    }
    const eased = 1 - (1 - progress) ** 3
    record.percent = record.from + (record.to - record.from) * eased
    paintImage(trigger, record.percent, record.tone, record.rest, record.style)
    record.handle = requestAnimationFrame((next) => { advance(trigger, next) })
}

/** 系统说「减少动态效果」：扩张那一下不跑，直接落定。 */
function reduceMotion(): boolean {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
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
        const record = paintedPies.get(trigger)
        if (record !== undefined && record.handle !== 0) cancelAnimationFrame(record.handle)
        trigger.removeAttribute(RAMP_SPAN_ATTRIBUTE)
        trigger.style.removeProperty(RAMP_POSITION_VAR)
        trigger.style.removeProperty('background-image')
        trigger.style.removeProperty('background-repeat')
        trigger.style.removeProperty('background-size')
        trigger.style.removeProperty('background-origin')
        trigger.style.removeProperty('background-position')
    }
}