/**
 * 按节拍交出读数：流式期间最多每 PACE_STEP_MS 换一次，其余情形实时跟随。
 *
 * 节拍只压换数的频率，不压真值：交给下游的仍是最新读数，只是晚到下一拍，所以一轮数字滚动的动画不会被
 * 下一批参数打断。这是有意的取舍，优先让动画走完整，宁可读数滞后一拍。
 * 一拍都没到的那几批不丢，最新读数一直写在 ref 里，到点应用的是那一刻的真值，陡增时不会一跳一跳地补播中间值
 */
import {useEffect, useRef, useState} from "react"

// 流式期间两拍之间的间隔（毫秒）。
// 它要盖过快档那一轮的完整周期：新数字落回来 220 ms，低位再按位序晚起手（最多三位 70 ms），
// 所以取 300 而不是 220，到点换数时上一轮已经走完
export const PACE_STEP_MS = 300

export function usePacedValue<T>(target: T, paced: boolean): T {
    const [shownValue, setShownValue] = useState(target)
    const targetRef = useRef(target)
    const nextAtRef = useRef<number | null>(null)
    const pendingRef = useRef(false)
    targetRef.current = target
    useEffect(() => {
        // 不在流式：实时跟随，并把节拍归零，上一次流式的相位不该影响下一次
        if (!paced) {
            nextAtRef.current = null
            pendingRef.current = false
            setShownValue(target)
            return
        }
        const now = Date.now()
        // 第一次换数：读数刚出现，直接给。若这里也等一拍，节拍会因为 nextAtRef 一直为 null 而永远起不来
        if (nextAtRef.current === null) {
            nextAtRef.current = now + PACE_STEP_MS
            setShownValue(target)
            return
        }
        const waitMs = nextAtRef.current - now
        if (waitMs <= 0) {
            nextAtRef.current = now + PACE_STEP_MS
            setShownValue(target)
            return
        }
        // 这一段里读数还会继续长，到点取那一刻的最新值，所以只需一个定时器，不必每批都重排
        if (pendingRef.current) return
        pendingRef.current = true
        const timer = setTimeout(() => {
            pendingRef.current = false
            nextAtRef.current = Date.now() + PACE_STEP_MS
            setShownValue(targetRef.current)
        }, waitMs)
        return () => {
            pendingRef.current = false
            clearTimeout(timer)
        }
    }, [paced, target])
    return shownValue
}
