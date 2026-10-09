/**
 * 无极色阶的公共部分：把读数落成「段标记 + 段内位置」。
 *
 * 色值不在这里——它们留在各自的样式表里（命中率那六个色标、上下文占用那六个色标），这一侧只算
 * 「落在哪一段、段内位置多少」，锚点之间的插值交给 CSS 的 `color-mix(in oklch, …)`。两处共用它，
 * 是因为要的是同一件事：在一个区间里连续取色，而两头各自恒定——命中率到 99.0 就绿、占用到 40 就红，
 * 都不必等到满。
 *
 * @module dsh-chat-ux/chat/ramp
 */

/** 段标记与段内位置写在这两个名字上：样式表按段标记选段，按位置算色。 */
export const RAMP_SPAN_ATTRIBUTE = 'data-dsh-chat-ux-ramp-span'

/** 段内位置的变量名。 */
export const RAMP_POSITION_VAR = '--dsh-chat-ux-ramp-position'

/** 低于第一个色标的那一段：两端同色，插值恒等。 */
export const RAMP_SPAN_LOW = 'low'

/** 从最后一个色标起的那一段：同样恒定。 */
export const RAMP_SPAN_HIGH = 'high'

/**
 * 两处色阶共用的七个色调，深浅两套各一份。
 *
 * 写成字面值而不是再套一层 `var()`：读色值的那一侧——上下文占用那颗饼要把色涂进内联 SVG——读的是
 * 求值后的 `color`，但这条约定仍然守着，免得下一个人以为可以随手改掉。深浅两套的色相不变、明度各自
 * 适配画布。
 */
export const RAMP_TONE_CSS = `
body {
  --dsh-chat-ux-tone-red: #cf222e;
  --dsh-chat-ux-tone-red-orange: #cd4400;
  --dsh-chat-ux-tone-orange: #c76a00;
  --dsh-chat-ux-tone-yellow: #9a6700;
  --dsh-chat-ux-tone-lime: #699d1a;
  --dsh-chat-ux-tone-green-light: #4ba95b;
  --dsh-chat-ux-tone-green: #1a7f37;
}

body[data-ds-dark-theme] {
  --dsh-chat-ux-tone-red: #f85149;
  --dsh-chat-ux-tone-red-orange: #f26e3d;
  --dsh-chat-ux-tone-orange: #e3873c;
  --dsh-chat-ux-tone-yellow: #d29922;
  --dsh-chat-ux-tone-lime: #a7cf5a;
  --dsh-chat-ux-tone-green-light: #7ee787;
  --dsh-chat-ux-tone-green: #3fb950;
}
`

/** 读数落在色标的哪一段、段内位置多少。 */
export interface RampPosition {
    /** 段标记：`'low'` / `'high'`，或者段序号的字符串（`'0'`…`'4'`）。 */
    span: string
    /** 段内位置，`37.5%` 这样的百分比。 */
    mix: string
}

/**
 * 把一个读数落到色标上。
 *
 * `stops` 是色标在读数轴上的位置（升序、至少两个），个数与样式表里那组色标一一对应。落在第一个
 * 之前（`'low'`）或最后一个之后（`'high'`）时只给段标记：那两段的两端是同一个色，插值走不出别的颜色。
 * @param value - 显示值（读者看到的那一份读数）。
 * @param stops - 色标位置，升序。
 * @returns 段标记与段内位置。
 */
export function rampPosition(value: number, stops: readonly number[]): RampPosition {
    const floor = stops[0] ?? value
    const top = stops[stops.length - 1] ?? value
    if (value < floor) return {span: RAMP_SPAN_LOW, mix: '0%'}
    if (value >= top) return {span: RAMP_SPAN_HIGH, mix: '0%'}
    let segment = 0
    for (let index = 1; index < stops.length - 1; index += 1) {
        const stop = stops[index]
        if (stop !== undefined && value >= stop) segment = index
    }
    const from = stops[segment] ?? floor
    const to = stops[segment + 1] ?? top
    // 位置写成一位小数的百分比：精度比读数细两个量级，字符串也稳定，读数没变就不会重写 DOM。
    return {span: String(segment), mix: (Math.round((value - from) / (to - from) * 1000) / 10) + '%'}
}
