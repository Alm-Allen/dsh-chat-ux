/**
 * Ambient declarations for the platform modules the DSH client module loader
 * serves from its frozen baseline table (`PLATFORM_MODULES`). The loader hands a
 * plugin bundle a `require` bound to that table, so these are resolved at run
 * time and are deliberately not installed into this project.
 *
 * Only what this plugin actually uses is declared, and only as narrowly as the
 * call sites need: the point is to keep the compiler honest about the calls made,
 * not to restate the platform's own types.
 */

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactElement, ReactNode } from 'react'

  /**
   * A read-only capsule badge.
   * @param props.tone - which palette to use; `neutral` is the muted one.
   * @param props.className - extra class for layout placement.
   * @param props.children - the label, owned by the render site.
   */
  export function Tag(props: {
    tone?: 'outline' | 'solid' | 'neutral' | 'quiet' | 'success' | 'info' | 'warning' | 'danger'
    className?: string
    children?: ReactNode
  }): ReactElement
}
