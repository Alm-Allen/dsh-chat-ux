/**
 * DSH 客户端模块加载器从冻结的基座模块表（`PLATFORM_MODULES`）里提供的平台模块，在这里做环境声明
 *
 * 那张表只认九个键：react、react/jsx-runtime、react-dom、react-dom/client、@deepseek-ai/cordis、
 * dsh-client-store、dsh-client-ui-slots、dsh-client-ui-primitives、dsh-client-ui-dockkit
 * 表外的一切（clsx、内置工具行所在的 @deepseek-ai/dsh-client-ui-tool、各种 util 包）都拿不到，
 * 本插件也不安装它们，所以只声明真正用到的部分，宽度到调用点够用为止
 */

declare module "@deepseek-ai/dsh-client-ui-primitives" {
	import type {CSSProperties, ReactElement, ReactNode} from "react"

	// 只读胶囊徽标。neutral 是低饱和的那一套
	export function Tag(props: {
		tone?: "outline" | "solid" | "neutral" | "quiet" | "success" | "info" | "warning" | "danger"
		className?: string
		children?: ReactNode
	}): ReactElement

	// 两态开关，dsh 自己的开关就是它，外观与设置页里那些开关是同一套
	// 完全受控：label 是读屏用的名字、必填；写入在途时把 disabled 置上
	export function Switch(props: {
		checked: boolean
		onChange: (next: boolean) => void
		label: string
		disabled?: boolean
		className?: string | undefined
	}): ReactElement

	// 分段控件的一段
	export interface SegmentedControlOption<Value extends string> {
		value: Value
		label: string
	}

	// 两段以上的分段控件，带一个滑动指示器，光标动效那三档就是它
	// 完全受控：id 是基础 id，第 n 段是 <id>-<value>，并指向面板 <id>-<value>-panel；
	// onChange 交回的值不会是当前选中的那个；label 是 tablist 的可访问名、必填；写入在途时把 disabled 置上
	export function SegmentedControl<Value extends string>(props: {
		id: string
		value: Value
		options: readonly SegmentedControlOption<Value>[]
		onChange: (next: Value) => void
		label: string
		disabled?: boolean
		className?: string | undefined
	}): ReactElement

	// 共享的 24px 可展开行外壳：思考行、工具行、过程组头都是它画的
	export interface DisclosureRowProps {
		icon: ReactNode
		title: string
		open: boolean
		expandable: boolean
		onToggle: () => void
		// 让标题随所属操作扫光
		running?: boolean | undefined
		// 整行都是开合目标
		expandOnRowClick?: boolean | undefined
		// 展开时仍把 collapsedContent 留在行内
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

	// 一段随活动状态扫光的文字
	//
	// 活动期间子节点会被另渲染一棵惰性副本，所以放进去的必须是纯展示：没有副作用、没有元素 id
	// 文件变更行行尾那两个数就是这样放进去的
	export interface TextShimmerProps {
		children: ReactNode
		active: boolean
		className?: string | undefined
	}

	export function TextShimmer(props: TextShimmerProps): ReactElement

	// 一次文件改动；oldText 为 null 表示没有先前内容（新建或整文件覆盖）
	export interface DiffHunk {
		path: string
		oldText: string | null
		newText: string
	}

	// 代码卡片工具条上的三个动作
	export interface CodeToolbarLabels {
		codeLabel: string
		wrapLabel: string
		unwrapLabel: string
	}

	// diff 卡片外壳上的文案
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
		// 折叠中段之前展示的行数上限（默认 16）
		maxLines?: number | undefined
		className?: string | undefined
	}

	export function DiffBlock(props: DiffBlockProps): ReactElement

	// 数一遍要展示的增删行数，行尾那个 +n -m 就是它
	export function diffTotals(diffs: DiffHunk[]): { added: number; removed: number }

	// 产品图标：颜色走 currentColor，尺寸是 prop 而不是名字的一部分
	export interface IconProps {
		size?: number | undefined
		className?: string | undefined
	}

	export function IconEditOutlineRegular(props: IconProps): ReactElement

	export function IconInspectOutlineRegular(props: IconProps): ReactElement

	export function IconDatabaseOutlineRegular(props: IconProps): ReactElement

	// 弹窗定位的输入：锚点、面板与夹取量
	export interface AnchoredPositionOptions {
		// 面板是否开着；关着时不测量
		open: boolean
		anchorRef: { current: HTMLElement | null }
		panelRef: { current: HTMLElement | null }
		// 只落上方
		side: "top"
		// 锚点与面板之间那道缝
		gap: number
		// 与视口边缘留的余量
		margin: number
	}

	// 夹进视口之后的固定定位；还没量出来时是 null
	export function useAnchoredPosition(options: AnchoredPositionOptions): CSSProperties | null

	// 点到锚点与面板之外时关掉
	export function useDismissOnOutsidePointer(
		rootRef: { current: HTMLElement | null },
		open: boolean,
		setOpen: (open: boolean) => void,
		panelRef: { current: HTMLElement | null },
	): void
}

declare module "react-dom/client" {
	import type {ReactNode} from "react"

	// 一棵挂在文档里的 React 树
	export interface Root {
		render(children: ReactNode): void

		unmount(): void
	}

	// 把一棵 React 树挂到容器里：上下文占用那串百分比不是座位（那是 dsh 自己渲染的文本），数字滚动只能挂进它里面
	export function createRoot(container: Element | DocumentFragment): Root
}

declare module "react-dom" {
	import type {ReactElement, ReactNode} from "react"

	// 把一段节点挂到别的容器下：明细面板要脱开输入框那一层的布局去定位
	export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactElement
}
