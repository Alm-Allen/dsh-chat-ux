/**
 * DSH 客户端模块加载器从它冻结的基座模块表（`PLATFORM_MODULES`）里提供的平台模块，
 * 在这里做环境声明。加载器交给插件 bundle 的 `require` 绑定在那张表上，所以这些模块
 * 是运行时解析的，本项目刻意不安装它们。
 *
 * 那张表只有九个键：react、react/jsx-runtime、react-dom、react-dom/client、
 * @deepseek-ai/cordis、dsh-client-store、dsh-client-ui-slots、
 * dsh-client-ui-primitives、dsh-client-ui-dockkit。表外的一切都拿不到——`clsx`、
 * `@deepseek-ai/dsh-client-ui-tool`（内置工具行住在那儿，但它的 client 入口只导出
 * 插件本身与类型，不导出组件）、各种 util 包都一样——所以这一侧凡是需要它们的形状，
 * 都在本文件或调用点就地声明。
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

  /** 共享的 24px 可展开行 chrome：思考行、工具行、过程组头都是它画的。 */
  export interface DisclosureRowProps {
    icon: ReactNode
    title: string
    open: boolean
    expandable: boolean
    onToggle: () => void
    /** 让标题随所属操作扫光。 */
    running?: boolean | undefined
    /** 整行都是开合目标。 */
    expandOnRowClick?: boolean | undefined
    /** 收起时把图标换成 chevron（默认跟随 `expandable`）。 */
    previewChevron?: boolean | undefined
    /** 展开时仍把 `collapsedContent` 留在行内。 */
    keepContentWhenOpen?: boolean | undefined
    collapsedContent?: ReactNode
    children?: ReactNode
    className?: string | undefined
    rowClassName?: string | undefined
    leadingClassName?: string | undefined
    chevronClassName?: string | undefined
    titleClassName?: string | undefined
  }
  export function DisclosureRow(props: DisclosureRowProps): ReactElement

  /** 一段随活动状态扫光的文字。 */
  export interface TextShimmerProps {
    children: string
    active: boolean
    className?: string | undefined
  }
  export function TextShimmer(props: TextShimmerProps): ReactElement

  /** 一次文件改动；`oldText` 为 null 表示没有先前内容（新建或整文件覆盖）。 */
  export interface DiffHunk {
    path: string
    oldText: string | null
    newText: string
  }

  /** 代码卡片工具条上的三个动作。 */
  export interface CodeToolbarLabels {
    codeLabel: string
    wrapLabel: string
    unwrapLabel: string
  }

  /** diff 卡片自己的 chrome 文案。 */
  export interface DiffBlockLabels extends CodeToolbarLabels {
    copy: string
    copied: string
    collapseAria: string
    expandAria: (hidden: number) => string
    collapse: string
    expand: (hidden: number) => string
  }

  export interface DiffBlockProps {
    diffs: DiffHunk[]
    labels: DiffBlockLabels
    /** 折叠中段之前展示的行数上限（默认 16）。 */
    maxLines?: number | undefined
    className?: string | undefined
  }
  export function DiffBlock(props: DiffBlockProps): ReactElement

  /**
   * 数一遍要展示的增删行数——行尾那个 `+n -m` 就是它。
   * @param diffs - 要统计的 hunks。
   * @returns 增删行数。
   */
  export function diffTotals(diffs: DiffHunk[]): { added: number; removed: number }

  /** 产品图标：颜色走 currentColor，尺寸是 prop 而不是名字的一部分。 */
  export interface IconProps {
    size?: number | undefined
    className?: string | undefined
  }
  export function IconEditOutlineRegular(props: IconProps): ReactElement
  export function IconInspectOutlineRegular(props: IconProps): ReactElement
}
