/**
 * 纸的明暗：跟着 dsh 的主题走。
 *
 * dsh 的 ui-layout 把配色方案投影到文档上：深色时给 body 挂 data-ds-dark-theme，同时把 color-scheme
 * 写在根元素上。纸只认前者——那是宿主自己选配色的那个属性，正文、代码块、菜单读的也是它。
 *
 * 纸这边不缓存这个值：每帧现读一次属性，代价是一次 hasAttribute，比维护一份可能与宿主分叉的副本便宜
 */
import {DARK_THEME_ATTRIBUTE} from "../../dom-contract"
import type {PaperMode} from "./paper-tables"

// 当下是哪一档。body 还没建出来时按亮档：那种时候页面还什么都没画
export function currentPaperMode(): PaperMode {
    return document.body?.hasAttribute(DARK_THEME_ATTRIBUTE) === true ? "dark" : "light"
}

/**
 * 主题变了就叫一次。
 *
 * 只盯 body 那一个属性：dsh 切深浅时只动它（从无到有、从有到无），一次切换一条记录。
 * 叫醒之后由调用方重落令牌、重算光照；纸纹不必重算，两档是同一张纸的两种颜色
 */
export function watchThemeMode(onChange: () => void): () => void {
    const observer = new MutationObserver((records) => {
        for (const record of records) {
            if (record.attributeName !== DARK_THEME_ATTRIBUTE) continue
            onChange()
            return
        }
    })
    observer.observe(document.body, {attributes: true, attributeFilter: [DARK_THEME_ATTRIBUTE]})
    return () => observer.disconnect()
}
