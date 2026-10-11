/**
 * 按节拍交出读数：流式期间最多每 `PACE_STEP_MS` 换一次，其余情形实时跟随。
 *
 * 节拍只压「换数的频率」，不压真值——交给下游的仍是最新读数（只是晚到下一拍），所以一轮数字轮的动画
 * 不会被下一批参数打断，读者看到的每一次都是完整的一跳。这是有意的取舍：**优先让动画走完整，宁可读数
 * 滞后一拍**。过冲与位移只有 6px，一轮被打断就等于白动。
 *
 * 一拍都没到的那几批不是丢掉、是记住（最新读数一直写在 ref 里），到点应用的是那一刻的真值，所以陡增时
 * 不会一跳一跳地补播中间值。
 *
 * @module dsh-chat-ux/chat/paced-value
 */
import {useEffect, useRef, useState} from 'react'

/**
 * 流式期间两拍之间的间隔（毫秒）。
 *
 * 它要盖过快档那一轮的**完整周期**——新数字落回来 220 ms，低位再按位序晚起手（最多三位 70 ms）——
 * 所以取 300 而不是 220：到点换数时上一轮已经走完，不会被下一批参数打断。
 */
export const PACE_STEP_MS = 300

/**
 * @param target - 最新读数。
 * @param paced - 要不要按节拍走（流式期间）。
 * @returns 现在该显示的读数。
 */
export function usePacedValue<T>(target: T, paced: boolean): T {
    const [shown, setShown] = useState(target)
    const targetRef = useRef(target)
    const nextAtRef = useRef<number | null>(null)
    const pendingRef = useRef(false)
    targetRef.current = target
    useEffect(() => {
        // 不在流式（或这一处没有读数）：实时跟随，并让节拍归零——上一次流式的相位不该影响下一次。
        if (!paced) {
            nextAtRef.current = null
            pendingRef.current = false
            setShown(target)
            return
        }
        const now = Date.now()
        // 第一次换数：读数刚出现，直接给（这一拍就是它的起点）。若这里也走「等一拍」，节拍会因为
        // `nextAtRef` 一直是 null 而永远起不来。
        if (nextAtRef.current === null) {
            nextAtRef.current = now + PACE_STEP_MS
            setShown(target)
            return
        }
        const wait = nextAtRef.current - now
        if (wait <= 0) {
            nextAtRef.current = now + PACE_STEP_MS
            setShown(target)
            return
        }
        // 这一段里读数还会继续长；到点取那一刻的最新值，所以只需一个定时器，不必每批都重排。
        if (pendingRef.current) return
        pendingRef.current = true
        const timer = setTimeout(() => {
            pendingRef.current = false
            nextAtRef.current = Date.now() + PACE_STEP_MS
            setShown(targetRef.current)
        }, wait)
        return () => {
            pendingRef.current = false
            clearTimeout(timer)
        }
    }, [paced, target])
    return shown
}
