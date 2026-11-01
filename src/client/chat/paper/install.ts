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
import {paperIncludesSidebar} from "./paper-layout"
import {applyPaperTokens, clearPaperTokens, PAPER_ROOT_ATTRIBUTE, paperTokenSet} from "./paper-tokens"
import {currentPaperMode} from "./paper-theme"

// 安装时现读的配置。两个字段的默认值在 settings-scope.ts 里也有一份
export interface PaperSettingsInput {
    // 纸感总开关
    on: boolean
    // 左侧栏是否也铺纸
    sidebar: boolean
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
    // 侧栏那一项要走同一个平台判据，否则首帧与挂载层的几何会分叉：那一刻侧栏的填充色被写了，纸却让开了
    const mode = currentPaperMode()
    applyPaperTokens(paperTokenSet(mode), mode, paperIncludesSidebar(settings.sidebar))
    return installPaper(() => {
        const current = readSettings()
        return {on: current.on, includeSidebar: current.sidebar}
    })
}

// 撤掉纸：两片 canvas、暗角、令牌与全部监听都由挂载层收尾，这里只补摘一次范围标记
export function clearPaperLayer(): void {
    clearPaperTokens()
    document.documentElement.removeAttribute(PAPER_ROOT_ATTRIBUTE)
}
