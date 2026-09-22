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
}
