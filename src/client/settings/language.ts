/**
 * 插件自己的那几段文案按哪门语言写。
 *
 * 只给**插件自己的句子**用——dsh 词典里已有的键照旧走 `t` 座位。设置卡片与 `run_code` 那一行的预览
 * 区都要选这一份，所以判据只写在这里一处。
 *
 * @module dsh-chat-ux/settings/language
 */
import {useCallback, useSyncExternalStore} from 'react'
import type {LocaleLike} from './settings-scope'

/**
 * 读者的界面语言。
 *
 * dsh 的活跃语言优先，认得就跟着它——`zh-Hant` 这类子标签按主语言子标签归到中文。它缺席（没有 locale
 * 服务的部署）或拿不出内容时问浏览器语言；两条都认不出英文就用中文，中文在这里是兜底，而不是「非英文
 * 即中文」的巧合。dsh 自己把认不出的语言落回英文，这一处不跟它：中文是这套文案的主要读者。
 * @param locale - locale 服务；部署里没有就传 undefined。
 * @returns `zh` 或 `en`。
 */
export function useInterfaceLanguage(locale: LocaleLike | undefined): 'zh' | 'en' {
    const active = useSyncExternalStore(
        useCallback((listener: () => void) => (locale ? locale.subscribe(listener) : () => {
        }), [locale]),
        useCallback(() => (locale ? locale.getSnapshot().active : null), [locale]),
    )
    const language = nonEmpty(active) ?? nonEmpty(browserLanguage()) ?? 'zh'
    return language.toLowerCase().split('-')[0] === 'en' ? 'en' : 'zh'
}

/**
 * 浏览器报的语言。
 * @returns 语言标签，没有 `navigator` 时为 null。
 */
function browserLanguage(): string | null {
    return typeof navigator === 'undefined' ? null : navigator.language
}

/**
 * 空串算没内容。
 * @param value - 语言标签。
 * @returns 有内容时原样返回，否则 undefined。
 */
function nonEmpty(value: string | null | undefined): string | undefined {
    if (value === null || value === undefined || value === '') return undefined
    return value
}
