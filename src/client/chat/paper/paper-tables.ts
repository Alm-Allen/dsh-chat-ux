/**
 * 纸与灯：一张葱皮、一个房间、两档明暗，以及从它们派生出来的颜色。
 *
 * 纸只有一张，明暗由 dsh 当前的主题决定：亮档是原来那张葱皮，暗档是它的暗版。
 * 两者共用同一套纸纹参数，分叉只在纸色、墨色、选区与纸纹强度上——灯两档都不点（见 PAPER_DEFAULT_SETTINGS.lamp）。
 *
 * 明暗这一维单独叫 PaperMode，它的来源不在这份文件里：入口（paper-theme.ts）读 dsh 的主题，
 * 再把它交给纸上每一处。表里没有任何一档写明"什么时候用我"
 *
 * 与 nocturne 的差别在命名与范围：那边的 THEMES 在这里叫房间，而五张纸乘三个房间的组合已经下线，
 * 只剩葱皮配纸与墨。buildRig 那几路光源原样留着，换光源只改 ROOM 的 light.source
 */
import {toUnit} from "./paper-math"

// 明暗两档。dsh 的深色模式对应 dark，其余对应 light
export type PaperMode = "light" | "dark"

// 纸面的材质参数，逐个喂给 SURFACE 的 uniform。数值来自 nocturne 的 papers.ts，一个没改
export interface PaperSurface {
    // 褶皱的强度，越大法线越陡
    crinkle: number
    // 毡压纸齿（棉浆纸是 1），不是褶皱
    felt: number
    // 帘纹：横向 4.2px 的帘线
    laid: number
    // 亚麻织纹：3.4px 的交叉
    linen: number
    // 云斑，羊皮纸是 1
    mottle: number
    // 做旧：狐斑、水渍、折痕、烧边
    age: number
}

// 一档纸
export interface PaperDefinition {
    mode: PaperMode
    // 纸本色
    paper: string
    // 正文墨色
    ink: string
    // 次要文字
    inkMuted: string
    // 选区底色
    selection: string
    surface: PaperSurface
}

/**
 * 葱皮的两档。
 *
 * 亮档是原样保留的那张葱皮：极薄极平（褶皱 0.08、云斑 0.04），铺满一整扇窗之后几乎没有可看的东西。
 * 暗档沿用它的纸纹参数与暖调色相，只把明度压下去——夜纸那种偏紫的冷色已经下线，理由是它读起来
 * 像换了一种材质，而不是同一张纸到了夜里
 */
export const PAPER_LIGHT: PaperDefinition = {
    mode: "light",
    paper: "#f2f1ea",
    ink: "#2a2019",
    inkMuted: "#6b5f52",
    // 亮档用房间的描金，与细边、页码同源
    selection: "rgba(176, 138, 74, 0.30)",
    surface: {crinkle: .08, felt: 0, laid: 0, linen: 0, mottle: .04, age: 0},
}

/**
 * 暗档。纸比 dsh 的深色画布（#151517）亮 64 阶，铺上去才看得出是一张纸；墨是暖白，与纸的色相相同。
 *
 * **纸纹参数与亮档不是同一套，差得还很远。** 亮档极薄极平（褶皱 0.08、云斑 0.04）：米白的纸上
 * 那点起伏已经够看，再强就是「像墙面」。暗档反过来——同一组参数压在 #22221d 上，纸面层只压出
 * 29 到 31 的灰度（一共两个色阶），读者看到的是一整块平色，正是"颜色对了但不像纸"。
 * 所以暗档把褶皱、云斑、纸纹强度与浮雕一起抬上去，压出来的范围落在 15 到 34，纸上才有起伏
 */
export const PAPER_DARK: PaperDefinition = {
    mode: "dark",
    // 纸色比 dsh 的深色画布（#151517）亮 64 阶：暗纸上纸纹只能把纸往下压，纸色压得太低就没有下压空间，
    // 压出来的是一团脏而不是纹理。#3a3a32（亮 37 阶）那一版才有可压空间，见 PAPER_DARK.surface。
    // 再亮一档是为了台灯：纸色每暗一档，最终像素上一个色阶就要吃掉更多 canvas 级，光斑的台阶就更宽。
    //
    // 2026-11-03 抬到 #55554a：台灯关掉了（见 PAPER_DEFAULT_SETTINGS.lamp），整片纸只剩环境光一档，
    // 纸色成了唯一的亮度旋钮。关灯本身把纸从「灯外 55 / 灯心 69」拉成均匀的一片约 68 阶；再抬 15 阶
    // 之后落在约 82 阶——比原来灯心还亮，与深色画布差 61 阶，翻看仍是一张深色的纸
    paper: "#55554a",
    ink: "#e8e6dd",
    // 次墨跟着纸走：纸从 #46463d 抬到 #55554a 之后，原来那一档（#b0aca0）对纸的对比从 4.20 掉到 3.23，
    // 次要文字（宿主的 secondary / tertiary / caption 三档都读它）会发灰；#cac6ba 把它拉回 4.29，
    // 与纸抬亮之前看不出差别
    inkMuted: "#cac6ba",
    // 暗档的描金提亮一档：原来那一笔压在暗纸上几乎看不见
    selection: "rgba(214, 178, 112, 0.26)",
    // 褶皱与云斑比亮档重：纸纹在那套着色器里是乘法扰动，当初定这个档位时还要留出让灯光斑看得见的余量
    // （±46% 的扰动配 +21% 的灯差，灯斑一个字都看不出来），所以只给到 ±8%。暗档现在不点灯了，这个上限
    // 不再由灯约束；这一组留着没动，因为 ±8% 在均匀的纸上已经够看出起伏
    surface: {crinkle: .5, felt: 0, laid: 0, linen: 0, mottle: .18, age: 0},
}

/**
 * 暗档的渲染参数。PAPER_DEFAULT_SETTINGS 那一套是按亮档调的：纸纹 0.18 在米白纸上刚好，
 * 落在暗纸上连两个色阶都压不出来。这里只动两项，其余沿用出厂值
 */
export const PAPER_DARK_RENDER = {
    // 纸纹强度：0.18 → 0.55。它同时乘在褶皱与法线上，是暗纸上能不能看见起伏的主开关
    texture: .55,
    // 浮雕：0.22 → 0.45。纸面层的那道法线扰动由它放大
    paperIllumination: .45,
    // 暗档的环境光取满：它的纸色（#55554a）就是按「关灯后整片一个明度」校的，
    // 亮档那个 0.98 是在米白纸上把亮度往回收一点，暗档照收会暗掉两个色阶，白白丢掉那次校准
    ambientLevel: 1,
}

// 一张纸的两档都由这里取，调用方不必自己认 mode
export function paperOf(mode: PaperMode): PaperDefinition {
    return mode === "dark" ? PAPER_DARK : PAPER_LIGHT
}

// 房间的灯：三种光源各自带一组参量，buildRig 按 source 分三路
export interface RoomLight {
    /**
     * 用的是 desk-lamp（桌面台灯）。
     *
     * 它是唯一一路「灯从纸的上方照下来」的光：平方反比衰减加柔边，在纸面截出一个圆形光斑，
     * 而不是一道锥形光柱。另外两路是从 nocturne 原样保留的——carriage 是一盏挂在光标上的小灯，
     * 打出来的是锥形；moonlight 是穿窗的平行光带窗棂。
     *
     * 选 desk-lamp 还有一半理由是性能：它的灯位只由房间与纸的尺寸决定，**完全不看光标**，
     * 所以同一张纸每次算出来的纸面一模一样。挂载层据此把整条帧循环停掉，打字与滚动都不再重算。
     * carriage 只要光标一动就要重算一遍全屏纸面，长会话里那份代价换不来相应的观感
     *
     * 这一路现在不被求值：两档的 lamp 都是 false（PAPER_DEFAULT_SETTINGS），灯架照建、着色器里
     * 那一支不参与。留着是因为换回点灯只改一个布尔值
     */
    source: "carriage" | "desk-lamp" | "moonlight" | "still"
    color: string
    // 灯在画布上的相对位置，0 到 1。carriage 不用它（灯座钉在纸心）
    position: { x: number; y: number }
    // 阴影的深浅，决定环境光的下限
    shade: number
}

// 一个房间
export interface RoomDefinition {
    name: string
    // 房间的地面色与它最深那一档
    palette: {
        room: string
        roomEdge: string
    }
    light: RoomLight
    // 暗角下线之后这个字段没有读者，留着是备位；房间这边眼下只剩灯与地面
    atmosphere: {
        vignette: number
    }
}

// 房间：纸与墨。三个房间随着换纸一起下线，纸与灯的观感只留这一套
export const ROOM: RoomDefinition = {
    name: "Paper & Ink",
    palette: {
        room: "#241a14",
        roomEdge: "#070504",
    },
    light: {source: "desk-lamp", color: "#ffd29a", position: {x: .5, y: .5}, shade: .42},
    atmosphere: {vignette: .35},
}

// 渲染参数。nocturne 把它们放在一份可写的全局 SETTINGS 里；这里是一份快照，由 adapter 按配置现算一份交进来。
// 默认值就是那边出厂设置的那一套（TN balanced 灯预设），只把灯关掉了
export interface PaperSettings {
    // 灯开着没有。关掉时 LIGHT 那次 pass 的 uLamp 是 0，纸只剩环境光那一档
    lamp: boolean
    // 灯关着时纸面的环境光水平，也就是整片纸的明度：<1 比纸的原色暗、1 就是纸的原色。
    // 灯开着时这一项不参与（那一路由 uAmbient 与暗角算），它是"关灯之后纸有多亮"的唯一旋钮
    ambientLevel: number
    // 整体开关，与 lamp 一起决定 uLamp
    enabled: boolean
    // 灯的强度，同时决定环境的明暗
    intensity: number
    // 光锥的张角（度）。74 是 balanced 预设
    spread: number
    // 光锥的边缘：soft 是一条软边，pointed 是一条硬边
    beam: "soft" | "pointed"
    // 灯偏转的角度（度），±45
    aim: number
    // 灯打多远，1 是预设
    reach: number
    // 光锥的浓度，越大越集中
    softness: number
    // 胶片颗粒
    grain: number
    // 光标周围那一圈余辉的强度
    cursorGlow: number
    // 纸纹的起伏强度。它同时乘在 crinkle / laid / linen 上
    texture: number
    // 纸面的浮雕，乘 2 才是 uRelief
    paperIllumination: number
    // 尘埃的浓度
    particles: number
    // 窗光的窗框：位置、格数、柔边、斜度。只对 moonlight 有意义
    window: {
        x: number
        y: number
        columns: number
        rows: number
        softness: number
        slant: number
    }
}

/**
 * 出厂参数。底色仍是 nocturne 的 SETTINGS，改过的几项都在下面各自写着理由：
 * 不点灯，颗粒与尘埃关掉，纸纹与浮雕降下来
 */
export const PAPER_DEFAULT_SETTINGS: Readonly<PaperSettings> = {
    /**
     * 不点灯，两档都是。2026-11-03 之前亮档点着那盏圆形光斑、暗档关着；现在两档都不要它——
     * 读者要的是一张均匀的纸，光斑那道由亮到暗的渐变是它的反面。
     *
     * 关灯之后纸面只剩环境光那一档：着色器里 uLamp 为 0 时 ambient 取 ambientLevel，
     * 整片纸由纸色、房间那一点暖色调与它共同决定，不再有灯心。要把它点亮，把这里改回 true——
     * 灯架（buildRig）与四路光源都还在，只是不再被求值
     */
    lamp: false,
    /**
     * 0.98。关灯那一刻它是 1.0（纸的原色），读者随即看出整片纸比点灯时亮了一档：原先灯外那八成
     * 面积吃的是 0.96 的环境光，关灯之后这一档直接取满。压到 0.98 把亮档的合成读数从 235 收到 230，
     * 与点灯时那版的平均 232 基本对上。
     *
     * 暗档不吃这一档（PAPER_DARK_RENDER 里它是 1.0）：那边关灯时按纸色重新校过一次，观感已经对了
     */
    ambientLevel: .98,
    enabled: true,
    // 灯的强度。灯关着的时候这一项没有读者；留着是因为 buildRig 仍按它标定曝光，
    // 哪天把 lamp 打开就是现成的：灯下纹丝不差地亮到接近纸的原色，灯外由环境光兜住
    intensity: 2.6,
    spread: 74,
    beam: "pointed",
    aim: 0,
    reach: 1,
    softness: .65,
    // 胶片颗粒与空气中的尘埃都关掉：它们是「一盏真实的灯照在一张真实的纸上」的一部分，
    // 但整扇窗的尺度上，颗粒读起来是显示器的噪点，尘埃读起来是脏。0 之后这两样都不会再画
    grain: 0,
    cursorGlow: .35,
    // 纸纹强度。nocturne 的 1 是按 ~660×620 的纸调的，铺到 1440 宽的一整扇窗上，同一组噪声频率
    // 就显得又密又硬——读者的话是「像墙面而不是纸」。降到 0.28 之后纹理退成纸的底色变化，
    // 凑近看得出织纹，退开就是一整片纸
    texture: .18,
    paperIllumination: .22,
    particles: 0,
    window: {x: .5, y: .5, columns: 3, rows: 2, softness: .15, slant: 0},
}

/**
 * 亮档那一条：纯白，不再是玻璃的实色。
 *
 * 2026-11-03 之前它是输入卡片那块玻璃的合成结果（#f3f5f9），与纸只差 R+1 / G+4 / B+15——
 * 那时纸面上罩着一盏灯，气泡落进灯下那一片时看得出浮起。灯关掉之后纸面整片均匀，这一点差
 * 就读不出来了，读者的话是「气泡看着不明显」。所以亮档直接取纯白：混出来的成品 #fcfcfa
 * 对纸 #f2f1ea 是 +10 / +11 / +16，仍带着米的底子，但一眼能认出那是压在纸上的一张薄片
 *
 * 它不再读 composer-glass 的 --dsh-chat-ux-glass-base：那一条只在毛玻璃开着时才定义，
 * 而气泡的观感不该跟着毛玻璃的开关走。两档各一个目标色，混法也各一份（paper-bubble）
 */
const GLASS_SOLID_LIGHT = "#ffffff"

/**
 * 暗档那一档：玻璃的亮面，不是它的底。
 *
 * 亮档之所以看得出气泡，一半靠它比纸冷一点点。暗档照搬那个方向就错了：玻璃的底是近黑，
 * 往它混等于把气泡压进纸里，两者只差 0.02 的亮度，读者看到的是一整片。所以暗档反过来朝亮面混——
 * 混出来比纸亮一档（#69695f 对纸 #55554a 是 +20 阶），像纸面上浮起的一块材质，
 * 与亮档「浅色卡片压在纸上」同一种读法。
 *
 * **纸色动了这一档要跟着动。** 纸从 #46463d 抬到 #55554a 之后，目标色若不动，混出来的气泡只比纸
 * 亮 11 阶（#606056 对 #55554a），读不出是一层材质；抬到 #75766c 才把落差拉回原来那 20 阶
 */
const GLASS_SOLID_DARK = "#75766c"

/**
 * 纸面上那块玻璃的调子：把纸色朝玻璃的实色混一截。
 *
 * 用户气泡要与输入框的毛玻璃对上，所以混的是玻璃那一支，不是"朝墨"的那一支——朝墨混出来的是一张
 * 更暗的纸，与读者按过的那张输入卡片对不上。两档都是"纸上的一层材质"：亮档的玻璃比纸亮，混出来
 * 是浮起一层；暗档的玻璃也贴着纸的亮面（#5b5b50 对纸 #55554a，亮 6 阶），混出来同样是浮在纸上的
 * 一层，不再是压进纸里的一道暗
 */
export function glassColor(mode: PaperMode, amount: number): string {
    const paper = paperOf(mode)
    const target = toUnit(mode === "dark" ? GLASS_SOLID_DARK : GLASS_SOLID_LIGHT)
    const base = toUnit(paper.paper)
    const mixed = [0, 1, 2].map((index) => Math.round(((base[index] ?? 0) * (1 - amount) + (target[index] ?? 0) * amount) * 255))
    return "#" + mixed.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")
}
