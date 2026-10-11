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
    import type {CSSProperties, ReactElement, ReactNode} from 'react'

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
     * 两态开关，dsh 自己的开关就是它——配置卡片用它，外观与设置页里那些开关是同一套。
     * @param props.checked - 当前状态；控件完全受控。
     * @param props.onChange - 点击要求切到的那个状态。
     * @param props.label - 可访问名，由渲染它的地方拥有（必填）。
     * @param props.disabled - 是否拒绝输入；写入在途时也要置上。
     * @param props.className - 额外的类名，用于布局定位。
     */
    export function Switch(props: {
        checked: boolean
        onChange: (next: boolean) => void
        label: string
        disabled?: boolean
        className?: string | undefined
    }): ReactElement

    /** 分段控件的一段。 */
    export interface SegmentedControlOption<Value extends string> {
        /** 选中这一段时交回去的值。 */
        value: Value
        /** 这一段的文字，由渲染它的地方拥有。 */
        label: string
    }

    /**
     * 两段以上的分段控件，带一个滑动指示器——把一张卡片在几档之间切换，光标动效那三档就是它。
     * @param props.id - 基础 id：每一段是 `<id>-<value>`，并指向面板 `<id>-<value>-panel`。
     * @param props.value - 当前选中项的值；控件完全受控。
     * @param props.options - 按显示顺序排列的段，至少两段。
     * @param props.onChange - 点击或走位键要求切到的值，不会是当前已经选中的那个。
     * @param props.label - tablist 的可访问名（必填）。
     * @param props.disabled - 是否锁住每一段，写入在途时也要置上。
     * @param props.className - 额外的类名，用于布局定位。
     */
    export function SegmentedControl<Value extends string>(props: {
        id: string
        value: Value
        options: readonly SegmentedControlOption<Value>[]
        onChange: (next: Value) => void
        label: string
        disabled?: boolean
        className?: string | undefined
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

    /**
     * 一段随活动状态扫光的文字。
     *
     * 子节点按平台的契约是任意节点，不是只有字符串：活动期间它会被另渲染一棵惰性副本，所以放进去的
     * 东西必须**纯展示**——没有副作用、没有元素 id。文件变更行行尾那两个数就是这样放进去的。
     */
    export interface TextShimmerProps {
        children: ReactNode
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

    export function IconDatabaseOutlineRegular(props: IconProps): ReactElement

    /** 弹窗定位的输入：锚点、面板与夹取量。 */
    export interface AnchoredPositionOptions {
        /** 面板是否开着；关着时不测量。 */
        open: boolean
        /** 触发点，定位以它为准。 */
        anchorRef: { current: HTMLElement | null }
        /** 面板本身，量的是它的尺寸。 */
        panelRef: { current: HTMLElement | null }
        /** 面板落在锚点哪一侧。 */
        side: 'top'
        /** 锚点与面板之间那道缝。 */
        gap: number
        /** 与视口边缘留的余量。 */
        margin: number
    }

    /** @returns 夹进视口之后的固定定位；还没量出来时是 null。 */
    export function useAnchoredPosition(options: AnchoredPositionOptions): CSSProperties | null

    /** 点到锚点与面板之外时关掉。 */
    export function useDismissOnOutsidePointer(
        rootRef: { current: HTMLElement | null },
        open: boolean,
        setOpen: (open: boolean) => void,
        panelRef: { current: HTMLElement | null },
    ): void
}

declare module 'react-dom/client' {
    import type {ReactNode} from 'react'

    /** 一棵挂在文档里的 React 树。 */
    export interface Root {
        /**
         * 换一份节点上去。
         * @param children - 新的节点。
         */
        render(children: ReactNode): void

        /** 卸下这棵树。 */
        unmount(): void
    }

    /**
     * 把一棵 React 树挂到容器里：上下文占用那串百分比不是座位（那是 dsh 自己渲染的文本），数字轮
     * 只能挂进它里面。
     * @param container - 挂到哪儿。
     * @returns 那棵树。
     */
    export function createRoot(container: Element | DocumentFragment): Root
}

declare module 'react-dom' {
    import type {ReactElement, ReactNode} from 'react'

    /**
     * 把一段节点挂到别的容器下：明细面板要脱开输入框那一层的布局去定位。
     * @param children - 要挂上去的节点。
     * @param container - 挂到哪儿。
     * @returns 挂上去的节点。
     */
    export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactElement
}
