/**
 * 字体接管的可调部分：那个开关，以及读者自己填的两条字体栈。
 *
 * 样式表里那一条 `body[data-chat-ux-fonts]` 给的是自带那两套的默认值，这一份负责它做不到的两件事：
 * 把开关写成属性，以及把读者填的栈写到同一条规则的三个自定义属性上。用 inline 覆盖而不是重新生成
 * 样式表：同元素的 inline 声明一定赢过样式表规则，所以换字体不必动那一张表。
 *
 * 读者填的是**前置**不是替换——最终值是 `<他填的栈>, <自带的那条栈>`。所以名字打错、字体没装、语法
 * 写岔，退回去的就是自带那一套，最坏也不比不填更差。合法性交给浏览器自己判（`CSS.supports`），
 * 也没有拼接字符串带来的注入面：写值走的是 CSSOM。
 *
 * @module dsh-chat-ux/client/font-override
 */
import {
  CODE_VARIABLE, EMBEDDED_MONO, EMBEDDED_SANS, FONT_ATTRIBUTE, MONO_VARIABLE, SANS_VARIABLE,
} from './font-styles'

/** 这一处要落到 body 上的三项选择。 */
export interface FontChoice {
  /** 是否用自带字体接管界面。关掉时这一处什么都不写，dsh 自己的字体栈原样生效。 */
  embedded: boolean
  /** 自定义的正文字体栈；空串用自带的。 */
  sans: string
  /** 自定义的等宽字体栈；空串用自带的。 */
  code: string
}

/**
 * 一串字是不是合法的 `font-family` 声明。空串不算——那是「没有自定义」，不是一条字体栈。
 *
 * 判据用浏览器自己的解析器：`CSS.supports` 对声明值的宽严就是它渲染时的那一套，不用另外写一份
 * 语法。dsh 面向的浏览器都有它（2015 年起）。
 * @param value - 读者填的那串字体名。
 * @returns 浏览器认它为一个字体栈时为真。
 */
export function isFontFamilyValue(value: string): boolean {
  const text = value.trim()
  return text !== '' && hasPairedQuotes(text) && CSS.supports('font-family', text)
}

/**
 * 把当前选择写到 body 上。属性使样式表里那一条命中，三个自定义属性各自覆盖对应的那一条栈。
 * @param choice - 开关与两条自定义栈。
 */
export function applyFontChoice(choice: FontChoice): void {
  if (!choice.embedded) {
    clearFontChoice()
    return
  }
  document.body.setAttribute(FONT_ATTRIBUTE, '')
  applyFamily(SANS_VARIABLE, choice.sans, EMBEDDED_SANS)
  applyFamily(CODE_VARIABLE, choice.code, EMBEDDED_MONO)
  applyFamily(MONO_VARIABLE, choice.code, EMBEDDED_MONO)
}

/**
 * 撤掉这一处写在 body 上的一切：属性与三个自定义属性。界面回到 dsh 自己的字体栈，字体文件也回到
 * 谁都不引用它们的状态（浏览器就不会去取）。
 */
export function clearFontChoice(): void {
  const { body } = document
  body.removeAttribute(FONT_ATTRIBUTE)
  body.style.removeProperty(SANS_VARIABLE)
  body.style.removeProperty(CODE_VARIABLE)
  body.style.removeProperty(MONO_VARIABLE)
}

/**
 * 引号是不是成对。落单的那个引号会把**后面整条栈**吞进它自己——CSS 会把 `"Microsoft YaHei, 'Chat UX
 * Sans', …` 读成**一个**字体名，那个名字谁的机器上都没有，接在后面的自带字体于是接不住，界面掉到
 * 浏览器默认字体。这不是假设：实测 Chromium 就是这么解的，而 CSS.supports 认它合法。漏打一个后
 * 引号是最像样的手误，所以这一道得自己来。
 *
 * 它只做配平，不判语法：剩下的交给浏览器。代价是一个真在引号里带撇号的名字（`"a'b"`）会被误拒，
 * 而那种写法的字体名不值得为它放宽。
 * @param value - 读者填的那串字体名。
 * @returns 单双引号各自成对时为真。
 */
function hasPairedQuotes(value: string): boolean {
  let singles = 0
  let doubles = 0
  for (const character of value) {
    if (character === "'") singles += 1
    else if (character === '"') doubles += 1
  }
  return singles % 2 === 0 && doubles % 2 === 0
}

/**
 * 写一条自定义属性：读者填的栈排在最前，自带的那条接在后面接住它缺的字。
 * @param variable - 要写的自定义属性名。
 * @param custom - 读者填的栈；空串或不合法的值只是清掉覆盖，样式表里的默认值接手。
 * @param embedded - 自带的那条栈。
 */
function applyFamily(variable: string, custom: string, embedded: string): void {
  if (!isFontFamilyValue(custom)) {
    document.body.style.removeProperty(variable)
    return
  }
  document.body.style.setProperty(variable, custom.trim() + ', ' + embedded)
}
