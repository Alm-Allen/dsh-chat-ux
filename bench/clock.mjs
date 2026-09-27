/**
 * 确定性时钟与帧驱动。
 *
 * 这是整套基准的**地基**：之前每个探针各写一份帧推进，各自有时序漏洞，于是同一份代码两次跑出
 * 不同结果，害我在一个不存在的 bug 上追了三轮。所有基准都必须用这里的 `makeStepper`。
 *
 * ## 为什么需要它
 *
 * 插件每个逻辑帧会读两次 `performance.now()`：
 *
 *   A) mutation 微任务里 -> `scan()` -> `paint(performance.now())`
 *   B) rAF 回调里        -> `paint(now)`
 *
 * 若在 A 与 B 之间推进时钟，两者看到不同时刻，而差多少又取决于微任务被抽干的深度——于是
 * 「新字符落在哪一档」在同一份代码的两次运行之间抖动，逐帧对比出现假差异。
 *
 * ## 不变量
 *
 * **一个逻辑帧内，时钟只有一个值。** 顺序固定：
 *
 *   1. 施加 mutation（调用方做）
 *   2. 时钟推进到本帧时刻，此后到本帧结束不再变
 *   3. 抽干微任务——MutationObserver 回调在此跑，读到的是本帧时刻
 *   4. 跑 rAF 队列——读到的还是本帧时刻
 *   5. flush 空闲回调队列——同样是本帧时刻
 *
 * ## 与真实浏览器的差异
 *
 * 真实浏览器里 1 帧 = 一个渲染步骤，时钟连续推进；这里离散成「每帧一个时刻」，且微任务与 rAF
 * 共享同一时刻。对「档位 = floor(age / REVEAL_MS * 24)」这种判据，离散化只影响落在档位边界上的
 * 那一两个区间，不影响任何被优化的调用次数与总体趋势。
 */

/** 默认按 60 Hz 折算一帧的毫秒数。 */
export const FRAME_MS = 1000 / 60

/**
 * 让 `win.performance.now()` 与 rAF 都受控。
 *
 * @param {object} win - jsdom window（调用前应已装好 shims）
 * @returns 一个驱动器：`frame()` 推进一帧，`now` 读当前时刻
 */
export function makeStepper(win) {
  let now = 0
  let rafQueue = []
  let rafSeq = 0

  win.performance.now = () => now
  win.requestAnimationFrame = (cb) => {
    const id = ++rafSeq
    rafQueue.push({ id, cb })
    return id
  }
  win.cancelAnimationFrame = (id) => {
    const i = rafQueue.findIndex((e) => e.id === id)
    if (i >= 0) rafQueue.splice(i, 1)
  }

  /** 把已排队的微任务抽干。 */
  const drainMicrotasks = async () => {
    // 三跳足够：MutationObserver 的投递在第一个微任务检查点就完成（实测验证过）。
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  }

  /**
   * 推进一帧。时钟先前进，再让所有回调在**同一个时刻**上跑。
   * @param {number} ms - 本帧前进多少毫秒，默认 {@link FRAME_MS}
   */
  const frame = async (ms = FRAME_MS) => {
    now += ms
    await drainMicrotasks()
    const ts = now
    const due = rafQueue
    rafQueue = []
    for (const { cb } of due) cb(ts)
    if (typeof win.__flushIdle === 'function') win.__flushIdle()
    await drainMicrotasks()
  }

  return {
    frame,
    drainMicrotasks,
    get now() { return now },
    /** 排队的 rAF 回调数，用于断言「没有失控的排帧」。 */
    get pendingFrames() { return rafQueue.length },
  }
}
