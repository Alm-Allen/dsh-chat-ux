/**
 * 冒头那一条行程曲线：八个控制点的七次贝塞尔
 *
 * 动效那边按时间进度取行程；卡片上的曲线图用同一份算法画线，拖曲线时也从这里把横坐标反解成参数。
 * 首尾两个控制点钉在 (0,0) 与 (1,1)，中间六个横纵都能动，横坐标保持递增
 */
import {BUBBLE_CURVE_POINTS, DEFAULT_BUBBLE_CURVE_X, DEFAULT_BUBBLE_CURVE_Y} from "./settings-scope"

// 七次贝塞尔的二项式系数：1, 7, 21, 35, 35, 21, 7, 1
const BINOMIAL_SEVEN = [1, 7, 21, 35, 35, 21, 7, 1]

// 相邻两个控制点的横坐标至少留这么宽：贴在一起时按横坐标反解时间会跳
export const CURVE_GAP = 0.02

// 一条行程曲线：时间进度换行程，以及反查参数
export interface TravelCurve {
	// 0 到 1 的时间进度换成行程；末尾冲过 1 的那点过冲也在这里
	readonly at: (progress: number) => number
	// 横坐标这一点对应贝塞尔的哪个参数：拖曲线时要从它反推各把手的分摊
	readonly paramAt: (progress: number) => number
}

/**
 * 第 index 个控制点在参数 param 处的权重
 * @param index 控制点序号，0 到 7
 * @param param 贝塞尔参数，0 到 1
 */
export function bernsteinWeight(index: number, param: number): number {
	return atPoint(BINOMIAL_SEVEN, index) * param ** index * (1 - param) ** (BUBBLE_CURVE_POINTS - 1 - index)
}

/**
 * 把八个控制点封成一条行程曲线
 * 横坐标先反解出参数，再取纵坐标——与浏览器画 cubic-bezier() 用的是同一套办法
 * @param curveX 八个控制点横坐标，首尾钉在 0 与 1
 * @param curveY 八个控制点纵坐标，首尾钉在 0 与 1，中间可以出界
 */
export function createTravelCurve(curveX: readonly number[], curveY: readonly number[]): TravelCurve {
	const xs = normalizeCurveX(curveX)
	const ys = normalizeCurveY(curveY)
	// 七次贝塞尔在某一参数下的取值：八个控制点各按权重摊一次
	const sample = (param: number, points: readonly number[]): number => {
		let sum = 0
		for (let index = 0; index < BUBBLE_CURVE_POINTS; index++) {
			sum += bernsteinWeight(index, param) * atPoint(points, index)
		}
		return sum
	}
	// 横坐标随参数单调递增，二分就够了
	const paramAt = (progress: number): number => {
		const target = clamp01(progress)
		if (target <= 0) return 0
		if (target >= 1) return 1
		let low = 0
		let high = 1
		for (let step = 0; step < 24; step++) {
			const middle = (low + high) / 2
			if (sample(middle, xs) < target) low = middle
			else high = middle
		}
		return (low + high) / 2
	}
	return {
		at: (progress: number): number => {
			const target = clamp01(progress)
			if (target <= 0) return atPoint(ys, 0)
			if (target >= 1) return atPoint(ys, BUBBLE_CURVE_POINTS - 1)
			return sample(paramAt(target), ys)
		},
		paramAt,
	}
}

// 点只在那八个里取，越界只可能是数据本身坏了：一律当成 0，不让 NaN 一路传到 transform
function atPoint(points: readonly number[], index: number): number {
	return points[index] ?? 0
}

// 曲线那两个数组什么形状都可能：点数不对，或者混进了不是数字的东西，就整条退回默认那一条
function normalizePoints(values: readonly number[], fallback: readonly number[]): readonly number[] {
	if (values.length !== BUBBLE_CURVE_POINTS) return fallback
	const points = values.slice()
	return points.every(value => Number.isFinite(value)) ? points : fallback
}

// 横坐标必须严格递增，否则按它反解时间会有多个解：首尾钉死，相邻两点之间至少留 CURVE_GAP
function normalizeCurveX(values: readonly number[]): readonly number[] {
	const xs = normalizePoints(values, DEFAULT_BUBBLE_CURVE_X).slice()
	xs[0] = 0
	xs[BUBBLE_CURVE_POINTS - 1] = 1
	for (let index = 1; index < BUBBLE_CURVE_POINTS - 1; index++) {
		const lowest = atPoint(xs, index - 1) + CURVE_GAP
		const highest = 1 - (BUBBLE_CURVE_POINTS - 1 - index) * CURVE_GAP
		xs[index] = Math.min(highest, Math.max(lowest, atPoint(xs, index)))
	}
	return xs
}

// 纵坐标同样首尾钉死：起点是 0（还整个藏着），终点是 1（正好落在落点），落定那一帧清掉 transform 不跳
function normalizeCurveY(values: readonly number[]): readonly number[] {
	const ys = normalizePoints(values, DEFAULT_BUBBLE_CURVE_Y).slice()
	ys[0] = 0
	ys[BUBBLE_CURVE_POINTS - 1] = 1
	return ys
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value))
}
