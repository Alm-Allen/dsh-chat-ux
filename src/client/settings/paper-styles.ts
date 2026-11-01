/**
 * 纸样的取值：五张纸乘三个房间，一个配置字段里存一对。
 *
 * 字面量是 纸__房间（双下划线），比如 cotton__paper-and-ink。两个 id 必须与渲染核
 * （src/client/chat/paper/paper-tables.ts）里 PAPERS 与 ROOMS 的键一字不差：卡片这一侧认不出的
 * 取值在下面兜底成标定那一对，渲染核那边认不出的 id 自己退回默认那张纸，两边都不会因为一个生词整块不装
 */
import {DEFAULT_PAPER_STYLE} from "./settings-scope"

// 五张纸，顺序就是卡片上色片网格的顺序，取值与渲染核的 PAPERS 键一致。
// 羊皮纸已下线：它那套做旧在一整扇窗的尺度上读起来是脏
export const PAPER_IDS = ["cotton", "linen", "laid", "onionskin", "night"] as const

// 三个房间，取值与渲染核的 ROOMS 键一致
export const ROOM_IDS = ["paper-and-ink", "midnight-study", "moonlit-poetry"] as const

// 纸与房间在一个字段里的分隔符
export const PAPER_STYLE_SEPARATOR = "__"

// 最后一道保险：连 DEFAULT_PAPER_STYLE 都拆不开时才落到这一对。正常路径上轮不到它，
// 它存在只是为了让这个函数永远有一个认得出来的选择可以返回
const LAST_RESORT_SELECTION: PaperSelection = {paper: "cotton", room: "paper-and-ink"}

export type PaperId = typeof PAPER_IDS[number]
export type RoomId = typeof ROOM_IDS[number]

// 一对挑好的纸与房间
export interface PaperSelection {
	paper: PaperId
	room: RoomId
}

// 把一对值拼回一个字段：换纸或换房间，都只重写这一个字段
export function joinPaperStyle(paper: PaperId, room: RoomId): string {
	return paper + PAPER_STYLE_SEPARATOR + room
}

// 拆开一个字段里的取值。空的、没有分隔符的、有一段是生词的，都退回标定那一对：
// 读者手改过 profile 也不该让这一行读不出当前选择
export function splitPaperStyle(value: string | undefined): PaperSelection {
	const known = readPaperSelection(value) ?? readPaperSelection(DEFAULT_PAPER_STYLE)
	return known ?? LAST_RESORT_SELECTION
}

function readPaperSelection(value: string | undefined): PaperSelection | null {
	const parts = value?.split(PAPER_STYLE_SEPARATOR) ?? []
	const paper = parts[0]
	const room = parts[1]
	if (paper === undefined || room === undefined) return null
	if (!isPaperId(paper) || !isRoomId(room)) return null
	return {paper, room}
}

function isPaperId(value: string): value is PaperId {
	return (PAPER_IDS as readonly string[]).includes(value)
}

function isRoomId(value: string): value is RoomId {
	return (ROOM_IDS as readonly string[]).includes(value)
}
