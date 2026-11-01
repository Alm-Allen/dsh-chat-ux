/**
 * 纸光要用的那几个小函数：clamp、smoothstep、十六进制转单位向量，以及三个短向量上的点积。
 *
 * 照 nocturne 的 core/math.js 搬过来。它原来把 reduceMotion 的 matchMedia 也放在这里，
 * 这里没有：那是"谁的动效要不要跑"的策略，归 paper-mount 那一层，渲染核只认传进来的数
 */

/**
 * 把值夹在两个端点之间。
 *
 * 三个参数都按"下界在前"读：clamp(value, low, high)。上游就是这个顺序，照搬省得两处对不上
 */
export function clamp(value: number, low: number, high: number): number {
	return Math.min(high, Math.max(low, value))
}

// 三次平滑阶跃。两端相等时退化成硬阶跃，与 GLSL 里那条一致
export function smoothstep(edge0: number, edge1: number, value: number): number {
	if (edge0 === edge1) return value < edge0 ? 0 : 1
	const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
	return t * t * (3 - 2 * t)
}

/**
 * "#ffd29a" 这种写法转成三个 0 到 1 的分量。
 *
 * 只认 `#rrggbb`：表里的颜色全是这个形状，多一种写法就要多一条分支，而多出来的分支永远走不到
 */
export function toUnit(hexColor: string): [number, number, number] {
	return [
		parseInt(hexColor.slice(1, 3), 16) / 255,
		parseInt(hexColor.slice(3, 5), 16) / 255,
		parseInt(hexColor.slice(5, 7), 16) / 255,
	]
}

// 单位化。长度为零时给回原向量而不是 NaN——光照里一个 NaN 会让整张纸变黑
export function norm(vector: readonly [number, number, number]): [number, number, number] {
	const length = Math.hypot(vector[0], vector[1], vector[2]) || 1
	return [vector[0] / length, vector[1] / length, vector[2] / length]
}

// 三维点积
export function dot3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * 光锥的张角（度）转成余弦。
 *
 * 半角是它的一半，所以在这里先除 360 而不是 180。夹在 5 到 170 度之间：
 * 0 度是一条射线（除零），180 度是一整片（光锥失效），两头都没有意义
 */
export function spreadToCosine(degrees: number): number {
	return Math.cos((clamp(degrees, 5, 170) * Math.PI) / 360)
}
