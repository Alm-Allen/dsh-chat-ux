/**
 * 系统通知的 tag。
 *
 * 它与 origin 一起被拼成系统那一侧的通知标识，那条标识在 Windows 上卡在 64 个字符
 * （Win10 15063 之前只有 16）。Electron 44 把整条标识原样当 toast 的 Tag 交给系统，超限时
 * put_Tag 失败、通知被销毁，而销毁前的失败回调在 JS 侧没有对应实现——既不会有 show，也不会有 error。
 * 2026-11-02 那次「shown 在涨、屏幕不画」就是这样：done 那条把 sessionId 拼进 tag，53 个字符越了界。
 *
 * 所以 tag 只从种子算一个短哈希：同一个种子稳定落到同一条通知，不同种子几不碰撞，长度固定。
 * 通道前缀让两条通道互不替换——同一个哈希在两处同时出现时，后一条会把前一条顶掉。
 */
export function noticeTag(channel: "ask" | "done", seed: string): string {
    // FNV-1a 32 位。这里不需要抗碰撞强度，只要同一种子稳定、不同种子分开、越短越好
    let hash = 0x811c9dc5
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return channel + "-" + hash.toString(36)
}
