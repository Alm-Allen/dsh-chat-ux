/**
 * 「这份文件此刻在不在」——折叠态那一截拿它把「可能写入文件」说成「可能写入新文件」或「可能覆盖」。
 *
 * ## 为什么只能问 host
 *
 * 准备态手里只有程序文本：路径读得出，但文件在不在是文件系统的事实（`tools.glob`、`tools.read` 的
 * 结果都要等程序跑起来才有）。dsh 自己有一条现成的只读通道：`remote.workspaceFiles.stat(sessionId,
 * path)`——`workspace-files` 是 dsh 内置挂载的那一份，聊天区里预览文件用的就是它，它也只要一个会话
 * 身份与一个路径，不改任何东西。
 *
 * ## 它绝不拖慢那一行
 *
 * 查询是**异步**的，渲染只读手上已有的答案（`knownFileExistence`）：没查出来就是 `unknown`，那一截
 * 照旧先说「可能写入文件」；结果回来才换成「可能写入新文件」或「可能覆盖」。所以要等也只等一句措辞，
 * 读者看到的那一行不会晚出来一帧。三道闸兜住意外：同一份路径只问一次（记住答案）、正在飞的查询不
 * 重复发、1.5 秒没回来就当查不到。
 *
 * ## 任何一步出岔子都只是「不知道」
 *
 * 远程服务取不出来、那个命名空间没装配、参数被拒、host 答的是别的错——一律 `unknown`，那一截退回
 * 「可能写入」。**这些岔子里一个同步异常都不许漏出去**：查询是挂在渲染路径上的，抛出来会把整行带走
 * （2026-10-11 读到读者「看不到那段代码了」时补的这条）。所以发起查询的每一步都在 try 里，订阅与
 * 取值都只走缓存。
 *
 * @module dsh-chat-ux/client/chat/code-progress/file-existence
 */
import {useEffect, useState} from 'react'

/** 一份文件此刻在不在。 */
export type FileExistence = 'exists' | 'missing' | 'unknown'

/**
 * 这条通道只用到 `stat` 一个方法，返回值的形状照 dsh 的 `RemoteResult` 复述：成功带 `value`、
 * 失败带 `error`（这一处只看 `ok` 与 error 上那个码）。
 */
export interface FileRemote {
    workspaceFiles?: {
        stat(sessionId: string, path: string, signal: AbortSignal):
            Promise<{readonly ok: boolean, readonly error?: unknown}>
    } | undefined
}

/** 一次查询最多等这么久；过了就当查不到——不重试，也不让那一行一直等它。 */
const QUERY_TIMEOUT_MS = 1500

/** 空表：第一次拿到答案之前用它，引用稳定，免得每帧都换一个新的。 */
const EMPTY_EXISTENCE: ReadonlyMap<string, FileExistence> = new Map()

/** 问过就记住：同一份路径不再问第二遍。 */
const answers = new Map<string, FileExistence>()

/** 正在飞的查询，用来去重。 */
const inFlight = new Set<string>()

/** 答案回来时叫一声，让那一行重渲染。 */
const listeners = new Set<() => void>()

/** 远程服务；宿主没给、或这个部署里没有那个命名空间时一律 unknown。 */
let readRemote: () => FileRemote | undefined = () => undefined

/**
 * 装上取远程服务的把手。渲染期现读，所以取不到服务也不影响别的功能。
 * @param remote - 现读远程服务；拿不到时返回 undefined。
 */
export function installFileExistence(remote: () => FileRemote | undefined): void {
    readRemote = remote
}

/**
 * 此刻知道的答案：**只读缓存，不发查询**——渲染期就调它。
 * @param sessionId - 这次调用属于哪个会话；取不到时为 undefined。
 * @param path - 路径。
 * @returns 知道的答案；没问过的是 `unknown`。
 */
export function knownFileExistence(sessionId: string | undefined, path: string | undefined): FileExistence {
    if (sessionId === undefined || sessionId === '' || path === undefined || path === '') return 'unknown'
    return answers.get(sessionId + '\n' + path) ?? 'unknown'
}

/**
 * 问一次这份路径在不在。**在副作用里调，别在渲染期调**——渲染期发请求会被 React 的严格模式与并发
 * 渲染重放，而这一处要的只是「答案到了就重渲染一次」。
 *
 * 任何一步出岔子都只落到 `unknown`：服务取不出来、命名空间不在、方法同步抛、promise 被拒、1.5 秒
 * 没回来。查询挂在渲染路径上，抛出去就是整行消失——这一句措辞不值得那个代价。
 * @param sessionId - 这次调用属于哪个会话；取不到时为 undefined。
 * @param path - 路径。
 */
export function requestFileExistence(sessionId: string | undefined, path: string | undefined): void {
    if (sessionId === undefined || sessionId === '' || path === undefined || path === '') return
    const key = sessionId + '\n' + path
    if (answers.has(key) || inFlight.has(key)) return
    let files: FileRemote['workspaceFiles']
    try {
        files = readRemote()?.workspaceFiles
    } catch {
        return
    }
    if (files === undefined) return
    inFlight.add(key)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)
    const settle = (value: FileExistence): void => {
        inFlight.delete(key)
        clearTimeout(timer)
        answers.set(key, value)
        for (const listener of listeners) listener()
    }
    try {
        files.stat(sessionId, path, controller.signal).then(
            result => settle(result.ok ? 'exists' : isMissing(result.error) ? 'missing' : 'unknown'),
            () => settle('unknown'),
        )
    } catch {
        settle('unknown')
    }
}

/**
 * 订阅答案的变化。
 * @param listener - 有答案回来时叫一次。
 * @returns 退订函数。
 */
export function subscribeFileExistence(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

/**
 * 一批路径此刻的答案（只读）。
 * @param sessionId - 这次调用属于哪个会话。
 * @param paths - 要问的路径。
 * @returns 路径到答案的表；没问过的记 `unknown`。
 */
export function fileExistenceSnapshot(
    sessionId: string | undefined,
    paths: readonly string[],
): ReadonlyMap<string, FileExistence> {
    const snapshot = new Map<string, FileExistence>()
    for (const path of paths) snapshot.set(path, knownFileExistence(sessionId, path))
    return snapshot
}

/**
 * 一批路径此刻的答案，并且把「答案回来时重渲染」接上；查询在 effect 里发。
 *
 * 依赖数组用的是路径拼出来的签名、而不是那个数组本身：调用方每次渲染都新建一个同内容的数组，照引用比
 * 会把订阅每批都拆了重装。
 * @param sessionId - 这次调用属于哪个会话。
 * @param paths - 要问的路径。
 * @returns 路径到答案的表。
 */
export function useFileExistence(
    sessionId: string | undefined,
    paths: readonly string[],
): ReadonlyMap<string, FileExistence> {
    const signature = paths.join('\n')
    const [snapshot, setSnapshot] = useState<ReadonlyMap<string, FileExistence>>(EMPTY_EXISTENCE)
    useEffect(() => {
        const update = (): void => setSnapshot(fileExistenceSnapshot(sessionId, paths))
        update()
        for (const path of paths) requestFileExistence(sessionId, path)
        return subscribeFileExistence(update)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 见上面那段说明：比的是内容签名。
    }, [sessionId, signature])
    return snapshot
}

/**
 * host 答的是不是「这份文件不在」。
 *
 * 只有 `workspace-file/not-found` 才能读成「不在」，那是新建；其余（不是普通文件、超了读的上限、会话
 * 身份解析不了……）都算不知道——猜错方向比不说更糟。
 * @param error - 远程调用交回的错误。
 * @returns 是不是「不在」。
 */
function isMissing(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false
    return (error as {code?: unknown}).code === 'workspace-file/not-found'
}
