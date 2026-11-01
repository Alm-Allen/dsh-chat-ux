/**
 * 纸与房间：五张纸、三个房间，以及从它们派生出来的颜色。
 *
 * 纸管纸面与墨，房间管纸面的光色与暗角，两者正交，所以是 5 × 3 = 15 种组合。
 * 组合 id 就用双下划线把两段拼起来：cotton__paper-and-ink。它既是配置里存的那一个字符串，
 * 也是本模块唯一接受的输入形式，认不出的两半各自落到默认
 *
 * 与 nocturne 的差别只在命名：那边的 THEMES 在这里叫 ROOMS。字段一个没动——它们直接喂给
 * buildRig 与 paper-light 的 uniform，改名只会让对照原文变难
 */
import {toUnit} from "./paper-math"

// 一整套纸与房间的字符面：纸与房间各一份 id，拼起来是配置里那个值
export interface PaperProfile {
	// 纸的 id，见 PAPER_ID_LIST
	paperId: string
	// 房间的 id，见 ROOM_ID_LIST
	roomId: string
}

// 16 色 ANSI 的浅色那一套。纸感目前不画终端，但纸的墨色与选择色跟它是同一组来源，留着以便一致
export const LIGHT_ANSI: Readonly<Record<string, string>> = {
	black: "#2b231c",
	red: "#9c3a2a",
	green: "#4c6b2f",
	yellow: "#8a6a1c",
	blue: "#2f5277",
	magenta: "#7b3f6e",
	cyan: "#2e6b6a",
	white: "#7d7060",
	lightBlack: "#6e6153",
	lightRed: "#b0452a",
	lightGreen: "#557a33",
	lightYellow: "#94701a",
	lightBlue: "#3a6491",
	lightMagenta: "#8c4a7e",
	lightCyan: "#317876",
	lightWhite: "#5b4f43",
}

// 深色那一套
export const NIGHT_ANSI: Readonly<Record<string, string>> = {
	black: "#2a2b42",
	red: "#d88a9a",
	green: "#9cc3a4",
	yellow: "#e2cf9a",
	blue: "#8ea8e0",
	magenta: "#b79ce0",
	cyan: "#8cc8d6",
	white: "#c9cadf",
	lightBlack: "#6f7192",
	lightRed: "#eba5b3",
	lightGreen: "#b4d8bc",
	lightYellow: "#efdfb2",
	lightBlue: "#aac0ef",
	lightMagenta: "#cbb5ef",
	lightCyan: "#a8dbe6",
	lightWhite: "#f0f0fa",
}

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

// 一张纸
export interface PaperDefinition {
	id: string
	name: string
	// light 或 dark。夜里那张是暗纸浅墨，环境光下限与辉光强度都按它分流
	appearance: "light" | "dark"
	// 纸本色
	paper: string
	// 正文墨色
	ink: string
	// 次要文字
	inkMuted: string
	// 光标（羽毛笔）的墨色
	cursor: string
	// 选区底色
	selection: string
	ansi: Readonly<Record<string, string>>
	surface: PaperSurface
}

/**
 * 五张纸。名字与 nocturne 文档 4.5 那张表的「性格」列一一对应，除了羊皮纸——它已经下线。
 * 默认也不用上游的 onionskin：它极薄极平，铺满一整扇窗之后几乎没有可看的东西
 */
export const PAPERS: Readonly<Record<string, PaperDefinition>> = {
	cotton: {
		id: "cotton",
		name: "Cotton",
		appearance: "light",
		paper: "#eee6d5",
		ink: "#2a2019",
		inkMuted: "#6b5f52",
		cursor: "#3a2c20",
		selection: "rgba(52, 64, 112, 0.2)",
		ansi: LIGHT_ANSI,
		surface: {crinkle: .3, felt: 1, laid: 0, linen: 0, mottle: .08, age: 0},
	},
	laid: {
		id: "laid",
		name: "Laid",
		appearance: "light",
		paper: "#f1e9d6",
		ink: "#2a2019",
		inkMuted: "#6b5f52",
		cursor: "#3a2c20",
		selection: "rgba(52, 64, 112, 0.2)",
		ansi: LIGHT_ANSI,
		surface: {crinkle: .22, felt: 0, laid: 1, linen: 0, mottle: .18, age: 0},
	},
	linen: {
		id: "linen",
		name: "Linen",
		appearance: "light",
		paper: "#ebe5d8",
		ink: "#2a2019",
		inkMuted: "#6b5f52",
		cursor: "#3a2c20",
		selection: "rgba(52, 64, 112, 0.2)",
		ansi: LIGHT_ANSI,
		surface: {crinkle: .2, felt: 0, laid: 0, linen: 1, mottle: .08, age: 0},
	},
	onionskin: {
		id: "onionskin",
		name: "Onionskin",
		appearance: "light",
		paper: "#f2f1ea",
		ink: "#2a2019",
		inkMuted: "#6b5f52",
		cursor: "#3a2c20",
		selection: "rgba(52, 64, 112, 0.2)",
		ansi: LIGHT_ANSI,
		surface: {crinkle: .08, felt: 0, laid: 0, linen: 0, mottle: .04, age: 0},
	},
	night: {
		id: "night",
		name: "Night",
		appearance: "dark",
		paper: "#1d1a20",
		ink: "#e6e1ea",
		inkMuted: "#9a94a6",
		cursor: "#e9e7ff",
		selection: "rgba(196, 188, 255, 0.2)",
		ansi: NIGHT_ANSI,
		surface: {crinkle: .3, felt: 0, laid: 0, linen: 0, mottle: .1, age: 0},
	},
}

/**
 * 纸的 id 列表。顺序是界面上那几张卡片的顺序，不与 PAPERS 的书写顺序绑定。
 *
 * 羊皮纸（parchment）已下线：它那套 mottle 1.0 + age .75 的做旧——狐斑、水渍、折痕、烧边——在
 * 一整扇窗的尺度上读起来是脏，不是旧。纸纹参数留在别处也不用，整块删掉比留个默认落点更省心
 */
export const PAPER_ID_LIST: readonly string[] = ["onionskin", "cotton", "laid", "linen", "night"]

// 房间的调色板。palette.paper 是房间预设自带的那份纸色，渲染核不读它——
// 纸色由纸自己与 paper-tokens 决定，两处对不上时以纸为准
export interface RoomPalette {
	room: string
	roomEdge: string
	paper: string
	paperEdge: string
	ink: string
	inkMuted: string
	inkFaint: string
	accent: string
	accentSoft: string
	border: string
}

// 房间的灯：三种光源各自带一组参量，buildRig 按 source 分三路
export interface RoomLight {
	/**
	 * 三个房间统一用 desk-lamp（桌面台灯）。
	 *
	 * 它是唯一一路「灯从纸的上方照下来」的光：平方反比衰减加柔边，在纸面截出一个圆形光斑，
	 * 而不是一道锥形光柱。另外两路是从 nocturne 原样保留的——carriage 是一盏挂在光标上的小灯，
	 * 打出来的是锥形；moonlight 是穿窗的平行光带窗棂。
	 *
	 * 选 desk-lamp 还有一半理由是性能：它的灯位只由房间与纸的尺寸决定，**完全不看光标**，
	 * 所以同一张纸每次算出来的纸面一模一样。挂载层据此把整条帧循环停掉，打字与滚动都不再重算。
	 * carriage 只要光标一动就要重算一遍全屏纸面，长会话里那份代价换不来相应的观感
	 */
	source: "carriage" | "desk-lamp" | "moonlight" | "still"
	color: string
	// 灯在画布上的相对位置，0 到 1。carriage 不用它（灯座钉在纸心）
	position: {x: number; y: number}
	// 阴影的深浅，决定环境光的下限
	shade: number
}

// 房间的大气：尘埃、胶片颗粒、暗角
export interface RoomAtmosphere {
	particles: number
	filmGrain: number
	vignette: number
}

// 一个房间
export interface RoomDefinition {
	id: string
	name: string
	selection: string
	palette: RoomPalette
	light: RoomLight
	atmosphere: RoomAtmosphere
}

// 三个房间。角色上对应 nocturne 的 THEMES，改名是因为这里的纸与房间是正交的两件事
export const ROOMS: Readonly<Record<string, RoomDefinition>> = {
	"paper-and-ink": {
		id: "paper-and-ink",
		name: "Paper & Ink",
		selection: "rgba(176,138,74,.30)",
		palette: {
			room: "#241a14", roomEdge: "#070504", paper: "#f4ecdb", paperEdge: "#e1d1b0",
			ink: "#2b231c", inkMuted: "#6e6153", inkFaint: "#a89a85",
			accent: "#b08a4a", accentSoft: "#d9c08a", border: "#c9b48e",
		},
		light: {source: "desk-lamp", color: "#ffd29a", position: {x: .5, y: .5}, shade: .42},
		atmosphere: {particles: .1, filmGrain: .08, vignette: .35},
	},
	"midnight-study": {
		id: "midnight-study",
		name: "Midnight Study",
		selection: "rgba(201,164,92,.30)",
		palette: {
			room: "#140f0b", roomEdge: "#030202", paper: "#1c1714", paperEdge: "#2c241e",
			ink: "#eadfc8", inkMuted: "#a39580", inkFaint: "#6b5f52",
			accent: "#c9a45c", accentSoft: "#8a6f3d", border: "#3a2f27",
		},
		light: {source: "desk-lamp", color: "#ffb35c", position: {x: .5, y: .5}, shade: .5},
		atmosphere: {particles: .2, filmGrain: .12, vignette: .6},
	},
	"moonlit-poetry": {
		id: "moonlit-poetry",
		name: "Moonlit Poetry",
		selection: "rgba(160,168,214,.28)",
		palette: {
			room: "#0e0e1a", roomEdge: "#030307", paper: "#171826", paperEdge: "#26283e",
			ink: "#dcdcec", inkMuted: "#9496b4", inkFaint: "#5c5e7c",
			accent: "#b7bdd6", accentSoft: "#6e7396", border: "#2c2e48",
		},
		light: {source: "desk-lamp", color: "#c9d4ff", position: {x: .5, y: .5}, shade: .48},
		atmosphere: {particles: .35, filmGrain: .1, vignette: .55},
	},
}

// 房间的 id 列表，顺序就是界面上的顺序
export const ROOM_ID_LIST: readonly string[] = ["paper-and-ink", "midnight-study", "moonlit-poetry"]

// 纸与房间之间的分隔符，组合 id 靠它拼
export const PROFILE_SEPARATOR = "__"

// 默认的那张纸：棉浆纸。上游默认是 onionskin（极薄极平，几乎没有纹理），
// 一整扇窗铺下来反而像没铺；棉浆纸有毡压的纸齿，空处也有东西可看
export const DEFAULT_PAPER_ID = "cotton"

// 默认的那个房间
export const DEFAULT_ROOM_ID = "paper-and-ink"

// 渲染参数。nocturne 把它们放在一份可写的全局 SETTINGS 里；这里是一份快照，由 adapter 按配置现算一份交进来。
// 默认值就是那边出厂设置的那一套（TN balanced 灯预设）
export interface PaperSettings {
	// 灯开着没有。关掉时 LIGHT 那次 pass 的 uLamp 是 0，纸只剩环境光
	lamp: boolean
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
 * 出厂参数。底色仍是 nocturne 的 SETTINGS，改过的四项都在下面各自写着理由：
 * 开的是静止的台灯，颗粒与尘埃关掉，纸纹与浮雕降下来
 */
export const PAPER_DEFAULT_SETTINGS: Readonly<PaperSettings> = {
	lamp: true,
	enabled: true,
	// 灯的强度。静止的台灯光斑只占屏幕一小块，1.1 那点亮度在环境光占到八成之后几乎看不出来，
	// 所以抬到 2.6：灯下纹丝不差地亮到接近纸的原色，灯外由 ambientLevel 那道下限兜住
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
 * 把配置里那个组合 id 拆成纸与房间。
 *
 * 认不出的一律落到默认：配置是读者手改过的历史值、或者两个字段的拼法变过，
 * 都不该让整块纸不画。空值、只有一个分隔符、多出第二段，走的都是这条路
 */
export function resolveProfile(profileId: string | null | undefined): PaperProfile {
	const [paperPart, roomPart] = (profileId ?? "").split(PROFILE_SEPARATOR)
	const paperId = paperPart ?? ""
	const roomId = roomPart ?? ""
	return {
		paperId: PAPERS[paperId] === undefined ? DEFAULT_PAPER_ID : paperId,
		roomId: ROOMS[roomId] === undefined ? DEFAULT_ROOM_ID : roomId,
	}
}

// 组合 id 拼回去。界面上那 5 乘 3 共 15 种组合与配置里存的值走的都是它
export function profileId(paperId: string, roomId: string): string {
	return paperId + PROFILE_SEPARATOR + roomId
}

/**
 * 配置里那个值直接查纸与房间，一步到位——挂载那一层每帧都要的结果。
 *
 * 认不出的组合由 resolveProfile 落到默认，所以这里永远拿得到
 */
export function paperAndRoomOf(profileId: string | null | undefined): {paper: PaperDefinition; room: RoomDefinition} {
	const profile = resolveProfile(profileId)
	return {paper: paperOf(profile), room: roomOf(profile)}
}

/**
 * 一份 profile 对应的纸。
 *
 * resolveProfile 已经保证 id 在表里，所以这里取第二次仍然为空只可能是表自己坏了——
 * 那是同一份文件里的字面量，编译期就该发现，所以直接抛，不把一张没有参数的纸喂进着色器
 */
export function paperOf(profile: PaperProfile): PaperDefinition {
	const paper = PAPERS[profile.paperId]
	if (paper === undefined) throw new Error("dsh-chat-ux paper: unknown paper " + profile.paperId)
	return paper
}

// 一份 profile 对应的房间。空值的处置同 paperOf
export function roomOf(profile: PaperProfile): RoomDefinition {
	const room = ROOMS[profile.roomId]
	if (room === undefined) throw new Error("dsh-chat-ux paper: unknown room " + profile.roomId)
	return room
}

/**
 * 选区的底色：纸自己的调子，不是浏览器的蓝。
 *
 * 浅色纸用房间的描金（与细边、页码同源），深色纸用纸自带的月白。nocturne 那边的规则是
 * "主题选色优先、纸选色兜底"；这里的纸与房间正交，所以按纸的明暗分流
 */
export function washColor(profile: PaperProfile): string {
	const paper = paperOf(profile)
	if (paper.appearance === "dark") return paper.selection
	// 房间没有自己的选区色时退回纸自带的那一支：空字符串在 CSS 里等于没写，
	// 而选区总得有个颜色
	const roomSelection = roomOf(profile).selection
	return roomSelection === "" ? paper.selection : roomSelection
}

/**
 * 纸面上的"另一层纸"：把纸色朝墨色调一点。
 *
 * 气泡、输入框、菜单、侧栏都用它——整扇窗是一张纸，这些是纸上压出来的一层，不是浮在纸上的白卡片。
 * 深色纸上 ink 是浅的，所以这条在夜纸上会自动变成"略亮"，不需要第二套值
 */
export function surfaceColor(profile: PaperProfile, amount: number): string {
	const paper = paperOf(profile)
	const base = toUnit(paper.paper)
	const ink = toUnit(paper.ink)
	const mixed = [0, 1, 2].map((index) => Math.round(((base[index] ?? 0) * (1 - amount) + (ink[index] ?? 0) * amount) * 255))
	return "#" + mixed.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")
}
