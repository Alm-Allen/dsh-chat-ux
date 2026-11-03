/**
 * 纸感的安装入口：按配置装上或卸下这一整块。
 *
 * 它比聊天区其他几块多一层分支。其他几块关掉时只是「不装」，纸关掉时却要让页面回到 dsh 原来的样子，
 * 而那件事有一半落在令牌上（整页底色与文字那几条）。所以这里把两件事分开：装上的那一刻先把令牌落下去，
 * 免得首帧之前页面还是白的；两片 canvas 由挂载层自己按帧接上来
 *
 * 明暗不在这里：纸用哪一档跟着 dsh 的主题走，由挂载层每一帧现读
 */
import {installPaper} from "./paper-mount"
import type {PaperHandle} from "./paper-mount"

export type {PaperHandle}
import {sideColumns} from "./paper-layout"
import {
    applyPaperTokens, applySidebarHostTokens, captureHostTokens, clearPaperTokens, PAPER_ROOT_ATTRIBUTE,
    paperTokenSet,
} from "./paper-tokens"
import {currentPaperMode} from "./paper-theme"

// 安装时现读的配置。默认值在 settings-scope.ts 里也有一份
export interface PaperSettingsInput {
    // 纸感总开关。开着时这一整块都在（纸、令牌、羽毛），关掉就一处不剩
    on: boolean
    // 纸感要不要接管字族。关掉时纸照铺，正文与代码那两栈回到读者自己那套
    font: boolean
}

/**
 * 装上纸。
 *
 * 关着的时候返回一个空把手：调用方不必判断「这次装上了没有」，卸载路径只有一条
 */
export function installPaperLayer(readSettings: () => PaperSettingsInput): PaperHandle {
    const settings = readSettings()
    if (!settings.on) {
        document.documentElement.removeAttribute(PAPER_ROOT_ATTRIBUTE)
        return {
            dispose: () => {
            }, refresh: () => {
            }
        }
    }
    // 先落令牌：这一步与 WebGL 无关，显卡起不来的时候页面也该是纸的调子。
    // 宿主令牌的原值要在写之前量：写进去之后读到的就是我们自己那一份了
    const mode = currentPaperMode()
    captureHostTokens()
    applyPaperTokens(paperTokenSet(mode), mode, settings.font)
    // 首帧之前就把左右两栏写回宿主原值。等挂载层来抄的话，那一瞬侧栏会先按纸的字与墨画一次
    applySidebarHostTokens(sideColumns())
    return installPaper(() => {
        const current = readSettings()
        return {on: current.on, font: current.font}
    })
}

// 撤掉纸：两片 canvas、令牌与全部监听都由挂载层收尾，这里只补摘一次范围标记
export function clearPaperLayer(): void {
    clearPaperTokens()
    document.documentElement.removeAttribute(PAPER_ROOT_ATTRIBUTE)
}
