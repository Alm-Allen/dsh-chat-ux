/**
 * 灯：从纸的尺寸与光标位置算出这一帧的灯架，以及在某个点上收多少光。
 *
 * 与 nocturne 的 core/light-model.js 逐行对应，只多了一件事：那边读全局 SETTINGS 与 theme()，
 * 这里把 settings 与房间当参数传进来。函数切分保持不变，数值一个没改
 *
 * 三路光源共用一套几何，分叉只在这三处：灯座怎么钉、光是怎么走的、曝光按哪个参考点标定
 * （nocturne 文档 3.2 记了灯座那一处改动：上游挂在小车上，这里钉在纸心，只随光标偏移 ±30%）
 */
import {clamp, dot3, norm, smoothstep, spreadToCosine} from "./paper-math"
import {PAPER_DARK_RENDER} from "./paper-tables"
import type {PaperMode, PaperSettings, RoomDefinition} from "./paper-tables"

// 纸在视口里的尺寸，单位是 CSS 像素
export interface SheetSize {
    width: number
    height: number
}

// 窗光那块窗框。只有 moonlight 用得到
export interface WindowFrame {
    x: number
    y: number
    width: number
    height: number
    columns: number
    rows: number
    softness: number
    skew: number
}

// 这一帧的灯架。渲染核只经手它，不看配置
export interface LightRig {
    source: "carriage" | "desk-lamp" | "moonlight" | "still"
    // 灯的位置，三维，z 是离纸的高度
    position: [number, number, number]
    // 光锥的轴，已单位化
    direction: [number, number, number]
    // 光锥的内外两圈余弦：内圈以里是满亮，外圈以外为零
    cosOuter: number
    cosInner: number
    // 曝光。它让"参考点上的辐照度 × 曝光"恰好等于 intensity，三路光源才可比
    exposure: number
    window: WindowFrame
    // 这一路光会不会随光标走。静止漫射光不会，所以挂载层可以在它身上省掉整条帧循环
    tracksCaret: boolean
}

// 窗格的边宽：夹在 4 到 16 像素之间，取短边的 4%
export function barHalfWidth(width: number, height: number): number {
    return Math.min(16, Math.max(4, .04 * Math.min(width, height)))
}

// 一条格线上的窗棂：offset 落在 cell 的整数倍附近时为 0，落在两格之间时为 1
export function between(offset: number, cell: number, bar: number, soft: number): number {
    const t = offset / cell
    return smoothstep(bar - soft, bar + soft, Math.abs(t - Math.round(t)) * cell)
}

/**
 * 月光穿过的窗：一块矩形窗框，里面按格数分格，窗棂挡掉中间那一部分。
 *
 * 返回 0 到 1 的透过率。窗框的柔边用 softness 撑开，斜度把整块窗框剪成平行四边形
 */
export function windowGobo(rig: LightRig, x: number, y: number): number {
    const frame = rig.window
    const soft = Math.max(.5, frame.softness)
    const shearedX = x - (y - frame.y) * frame.skew
    const dx = shearedX - frame.x
    const dy = y - frame.y
    const across = smoothstep(-soft, soft, frame.width / 2 - Math.abs(dx))
    const down = smoothstep(-soft, soft, frame.height / 2 - Math.abs(dy))
    const paneWidth = frame.width / frame.columns
    const paneHeight = frame.height / frame.rows
    const bar = barHalfWidth(paneWidth, paneHeight)
    const open = between(dx + frame.width / 2, paneWidth, bar, soft) * between(dy + frame.height / 2, paneHeight, bar, soft)
    return across * down * (.3 + .7 * open)
}

/**
 * 纸面上某一点收到的辐照度。
 *
 * 月光是一路平行光乘窗棂；另外两路是点光源：平方反比、Lambert、再乘光锥的浓淡。
 * normal 缺省是正对读者（0, 0, 1），辉光那一层要的正是这个方向
 */
export function irradiance(rig: LightRig, x: number, y: number, normal?: readonly [number, number, number] | null): number {
    const facing = normal ?? [0, 0, 1]
    if (rig.source === "moonlight") {
        return Math.max(0, dot3(facing, [-rig.direction[0], -rig.direction[1], -rig.direction[2]])) * windowGobo(rig, x, y)
    }
    const toLight: [number, number, number] = [x - rig.position[0], y - rig.position[1], -rig.position[2]]
    const distanceSquared = Math.max(1, dot3(toLight, toLight))
    const ray = norm(toLight)
    const cone = smoothstep(rig.cosOuter, rig.cosInner, dot3(ray, rig.direction))
    const lambert = Math.max(0, -dot3(facing, ray))
    return (cone * lambert) / distanceSquared
}

// 曝光曲线：1 减 e 的负值。这条把无界的辐照度压进 0 到 1，是"像灯"而不是"像贴图"的一半
export function toneMap(value: number): number {
    return 1 - Math.exp(-Math.max(0, value))
}

// 某一点最终收多少光，0 到 1
export function lightAmount(rig: LightRig, x: number, y: number, normal?: readonly [number, number, number] | null): number {
    return toneMap(irradiance(rig, x, y, normal) * rig.exposure)
}

/**
 * 把曝光标定到参考点上。
 *
 * 参考点是"光锥应该最亮的那一处"：灯从那里量出来多少辐照度，曝光就按它反算，
 * 于是换光源、换纸的大小，最亮处一样亮，差别只在光怎么散开
 */
export function referenceExposure(rig: LightRig, intensity: number, x: number, y: number): number {
    const energy = irradiance(rig, x, y)
    return energy > 0 ? intensity / energy : 0
}

/**
 * 这一帧的灯架。
 *
 * caretSheetX 是光标在纸上的横坐标；量不出来时传纸心，光锥就停在中间。
 * 三种光源的几何各自照搬：carriage 钉在纸心只随光标偏移 ±30%，desk-lamp 从房间给的角上打过来，
 * moonlight 是一束平行光加一扇窗
 */
export function buildRig(sheet: SheetSize, caretSheetX: number, room: RoomDefinition, settings: PaperSettings): LightRig {
    const width = sheet.width
    const height = sheet.height
    const halfAngle = Math.acos(spreadToCosine(settings.spread))
    const cosOuter = Math.cos(halfAngle)
    const cosInner = Math.cos(halfAngle * (1 - .85 * settings.softness))
    const swivel = (clamp(settings.aim, -45, 45) * Math.PI) / 180

    const base: LightRig = {
        source: room.light.source,
        position: [0, 0, 1],
        direction: [0, 0, -1],
        cosOuter,
        cosInner,
        exposure: 1,
        window: {x: width / 2, y: height / 2, width, height, columns: 3, rows: 2, softness: 8, skew: 0},
        // 只有挂在光标上的那盏小灯会随光标挪。台灯与月光都只看纸的尺寸与房间的预设，
        // carrier 那种「一打字就重算整屏」的代价正是这一条要省掉的东西
        tracksCaret: room.light.source === "carriage",
    }

    if (room.light.source === "still") {
        // 静止漫射光：没有灯座，没有光锥，也没有热点。整片纸的明暗只由尺寸与强度决定，
        // 所以同一张纸每次算出来的图一模一样——挂载层据此把整条帧循环停掉
        // （这是默认的那一路：一盏跟着光标跑的灯在长会话里每动一次就要重算一遍纸面）
        return {...base, source: "still", exposure: settings.intensity, tracksCaret: false}
    }

    if (room.light.source === "carriage") {
        // 灯座钉在纸的横向中心，只随光标轻微偏移（±30%）。nocturne 的灯跟着打字机小车横移，
        // 那是因为终端的光标常在左侧；正文界面若照搬，光锥会永远挤在左边缘
        const centre = width / 2
        const lampX = clamp(centre + (caretSheetX - centre) * .3, 40, width - 40)
        const lampY = height - Math.max(18, height * .03)
        const lamp: [number, number, number] = [lampX, lampY, 12 + .02 * height]
        const throwLength = .6 * settings.reach * height
        const aimX = lampX + Math.tan(swivel) * throwLength
        const aimY = lampY - throwLength
        const rig: LightRig = {
            ...base,
            source: "carriage",
            position: lamp,
            direction: norm([aimX - lamp[0], aimY - lamp[1], 0 - lamp[2]]),
        }
        const referenceLength = .5 * settings.reach * height
        return {
            ...rig,
            exposure: referenceExposure(rig, settings.intensity, lampX + Math.tan(swivel) * referenceLength, lampY - referenceLength),
        }
    }

    if (room.light.source === "desk-lamp") {
        const position = room.light.position
        const lamp: [number, number, number] = [position.x * width, position.y * height, (.3 + .4 * settings.reach) * height]
        const dx = width * .5 - lamp[0]
        const dy = height * .55 - lamp[1]
        const cos = Math.cos(swivel)
        const sin = Math.sin(swivel)
        const aimX = lamp[0] + dx * cos - dy * sin
        const aimY = lamp[1] + dx * sin + dy * cos
        const rig: LightRig = {
            ...base,
            source: "desk-lamp",
            position: lamp,
            direction: norm([aimX - lamp[0], aimY - lamp[1], 0 - lamp[2]]),
        }
        return {...rig, exposure: referenceExposure(rig, settings.intensity, aimX, aimY)}
    }

    // 月光：从房间给的角上斜进来，穿一扇 3 × 2 的窗
    const position = room.light.position
    const azimuth = Math.atan2(.5 - position.y, .5 - position.x) + swivel
    const elevation = (40 * Math.PI) / 180
    const direction = norm([
        Math.cos(azimuth) * Math.cos(elevation),
        Math.sin(azimuth) * Math.cos(elevation),
        -Math.sin(elevation),
    ])
    const frame = settings.window
    const pane = Math.max(60, (Math.min(width * .62, height * .7) * settings.reach) / 2)
    const rig: LightRig = {
        ...base,
        source: "moonlight",
        direction,
        window: {
            x: width * frame.x,
            y: height * frame.y,
            width: pane * frame.columns,
            height: pane * frame.rows,
            columns: frame.columns,
            rows: frame.rows,
            // 窗光自成一组参数：借台灯的 softness（0.65）会算出比窗格还宽的柔边，3 × 2 的方窗糊成一片白
            softness: 4 + 40 * frame.softness,
            skew: Math.tan((clamp(frame.slant, -35, 35) * Math.PI) / 180),
        },
    }
    const facing = Math.max(0, -direction[2])
    return {...rig, exposure: facing > 0 ? settings.intensity / facing : 0}
}

/**
 * 环境光的水平，0 到 1。
 *
 * 它是一道下限，不是一项加光：灯照不到的地方靠它兜住，正文才不会糊进纸里。nocturne 把上游的
 * 0.55 抬到 0.64——理由写在它文档 3.3：那只够等宽的终端字，衬线散文笔画细、字面小，
 * 同样的下限让正文发灰（实测 p3 亮度 70，上游同区域 45）。抬到 0.64 之后 p3 落到 52
 *
 * 这个数是量出来的，不是随手调的：改它之前先重跑一遍那张对齐表
 */
export function ambientLevel(mode: PaperMode): number {
    // 静止的台灯只在自己脚下那一圈亮，剩下整片纸全靠这道下限兜住。nocturne 的 0.64 是按一盏
    // 罩住半个屏幕的锥形灯调的；换成圆形光斑之后，灯外那八成面积会整片发灰，下限因此一路抬上来。
    //
    // 这几个数是照着合成结果反推的，不是照抄。分成两件事看：
    //
    // 一是下限本身。亮纸 0.86——离灯最远的地方也只比纸原色暗一档。它在中途调过两轮
    // （0.82 → 0.94 → 0.86），改它之前先重跑一遍那张对齐表。
    //
    // 二是这件事与强度脱钩。原来那道式子里环境光跟着 intensity 走，强度一抬整片纸一起变亮，
    // 灯的那份好处反而被摊平了。现在写成常数：环境光是环境光，灯是灯，两者各管各的
    // 亮档 0.86 是按米白纸调出来的；暗档取 PAPER_DARK_RENDER.ambientFloor——环境光越足，
    // 纸纹被摊平得越彻底，而暗纸上那点起伏本来就所剩无几，留一点暗部才看得见。
    // 那一项读者调过一轮（0.84 → 0.66 → 0.72），现值以 paper-tables 里的字面量为准
    return mode === "light" ? .86 : PAPER_DARK_RENDER.ambientFloor
}
