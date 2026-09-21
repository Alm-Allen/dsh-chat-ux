/**
 * DSH 客户端模块加载器从它冻结的基座模块表（`PLATFORM_MODULES`）里提供的平台模块，
 * 在这里做环境声明。加载器交给插件 bundle 的 `require` 绑定在那张表上，所以这些模块
 * 是运行时解析的，本项目刻意不安装它们。
 *
 * 只声明本插件真正用到的东西，而且只声明到调用点需要的宽度：目的是让编译器对这里发出的
 * 调用保持诚实，而不是复述平台自己的类型。
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /**
   * 一个只读胶囊徽标。
   * @param props.tone - 用哪套配色；`neutral` 是低饱和的那套。
   * @param props.className - 额外的类名，用于布局定位。
   * @param props.children - 徽标文字，由渲染它的地方拥有。
   */
  export function Tag(props: {
    tone?: 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'
    className?: string
    children?: ReactNode
  }): ReactElement

  /**
   * 一份 Markdown 文档的本地化外壳文案。插件够不到聊天的 locale 命名空间，
   * 所以由它自己提供这三条字符串。
   */
  export interface MarkdownLabels {
    code: { copyLabel: string; copiedLabel: string }
    footnotes: string
  }

  /** 引用投影为已解析的提及提供的导航动作。 */
  export interface UserTextReferences {
    openFile: (path: string) => void
    openSkill: (name: string) => void
  }

  /**
   * 助手回答所用的 GFM + TeX 渲染器。
   * @param props.text - markdown 源文。
   * @param props.labels - 代码围栏与脚注的外壳文案。
   */
  export function MarkdownText(props: {
    text: string
    streaming?: boolean
    labels: MarkdownLabels
    fileMentions?: unknown
    pathImages?: unknown
    variant?: 'body' | 'compact'
  }): ReactElement

  /**
   * 已发送的用户文本里那些引用形式的展示投影：会话、技能、文件提及变成 chip，
   * 其余文本原样返回。
   * @returns 覆盖整串文本的行内节点。
   */
  export function projectUserText(
    text: string,
    sessionLabels: readonly string[],
    slashNames?: readonly string[],
    slashKind?: 'skill' | 'command',
    references?: UserTextReferences,
  ): ReactNode

  /** 气泡自己不呈现的块，交给这个可折叠的 JSON 查看器。 */
  export function JsonBlock(props: {
    label: string
    payload: unknown
    truncatedLabel: (total: number) => string
  }): ReactElement

  /** 按路径扩展名取的 file-type 字形。 */
  export function FileTypeIcon(props: { path: string; className?: string }): ReactElement

  /** 文件名的小写扩展名，不带点。 */
  export function fileExtension(name: string): string

  /** 人类可读的字节大小。 */
  export function fileSizeText(bytes: number): string

  /** 给一个元素包上悬停/聚焦时显示的标签。 */
  export function Tooltip(props: {
    label: string
    side?: 'top' | 'bottom' | 'left' | 'right'
    children?: ReactNode
  }): ReactElement

  /** 把纯文本写进剪贴板；被拒绝时 resolve 成 false。 */
  export function writeClipboard(text: string): Promise<boolean>

  export function IconCopyOutline16(): ReactElement
  export function IconCheckOutline16(): ReactElement
}
