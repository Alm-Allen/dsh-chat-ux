/**
 * 组体跟随：封顶的过程组里，思考与工具输出不会掉队。
 *
 * 「标准」与「简洁」两档把一段过程收进一个封顶的组体（\`max-height: min(400px, 50vh)\`），组体
 * 自己带滚动条。dsh 给这一层的跟随是 \`use-process-scroll\` 那套：内容一变就
 * \`toBottom(body, metrics, 'smooth')\`——一次原生平滑滚动。两个地方让它在流式输出时追不上：
 *
 *   速度    原生平滑滚动的行程按距离调，越接近目标越慢；而内容的增长是匀速的，一段思考连着
 *           一串工具调用时，长出去的量并不比它慢。
 *   单发    \`toBottom\` 只在没有动画在飞时才发起新的滚动（\`if (this.target === null)\`），动画
 *           跑完之前内容再长多少都不追，只能等这一次落地再补下一次。
 *
 * 两者叠起来，位置就长期停在离底二三十到五十像素的地方——正好是最新那两行。
 *
 * 这一处不改 dsh 的状态，只在它旁边补一件事：落后超过 CATCH_UP_GAP_PX 才接管，把位置直接补到
 * 组体的底（\`scrollTop = scrollHeight\`，即时）。阈值以内一次都不动手——那一截距离留给 dsh 自己的
 * 平滑滚动，追得上的时候它是好看的；只有它追不回来时才由这一处兜住，免得最新那两行一直悬着。
 * 读者一旦在这个组体里滚过就让位，直到他自己滚回组体的底为止。
 *
 * 补齐与 dsh 那套不冲突：写 \`scrollTop\` 会走它的 \`onScroll\`，而它把「位置到底」认成读者到底，
 * 于是重新点亮自己的跟随，并放下那个卡住的动画目标。
 *
 * @module dsh-chat-ux/client/process-follow
 */

import { PROCESS_BODY_SELECTOR, PROCESS_CONTENT_SELECTOR, SCROLL_KEYS } from './dom-contract'

/** 读者滚回组体底部多近算「看完了」。 */
const RELEASE_THRESHOLD_PX = 4

/**
 * 落后超过它才接管。
 *
 * 阈值以内归 dsh 的平滑滚动——它追得上的正是这一截，追得上的时候它是好看的。实测流式输出时它
 * 的稳态落后在二三十到五十像素之间，40 卡在中间：让大部分平滑滚动获得自由，又能在真的掉队之前
 * 兜住。
 */
const CATCH_UP_GAP_PX = 40

/** 同步被观察组体的间隔；会话切换与过程组增减都靠它跟上。 */
const SYNC_INTERVAL_MS = 500

/** 读者接管组体滚动的意图。与 dsh 自己的那一组同源。 */
const INTENT_TYPES = ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown'] as const

/**
 * 给整页安装组体跟随。
 * @param readEnabled - 读此刻生效的开关；关着时一次都不动手。
 * @returns disposer：断开 observer、摘掉监听与定时器。
 */
export function installProcessFollow(readEnabled: () => boolean): () => void {
  /** 读者在这个组体里真的滚过之后，直到他自己回到底为止，这一处不动手。 */
  const takenOver = new WeakSet<Element>()
  /** 已经交给 observer 的组体，以及它当时的内容层。 */
  const watched = new Map<HTMLElement, Element | null>()

  /** 这个组体现在归不归我们管。 */
  const followable = (body: HTMLElement): boolean => {
    // 收起时它整块不可见。
    if (body.hasAttribute('hidden')) return false
    // 「详细」与「完全展开」不收纳：组体不封顶、没有内层滚动条，也就没有跟随可言。
    if (body.closest('[data-group-expanded-mode]') !== null) return false
    // 没有可滚的余量时什么都做不了。
    return body.scrollHeight - body.clientHeight > 0
  }

  /** 离组体自己的底还差多远。 */
  const gapOf = (body: HTMLElement): number => body.scrollHeight - body.clientHeight - body.scrollTop

  /** 落后得太多、dsh 的平滑滚动追不回来时，直接补到组体的底。 */
  const catchUp = (body: HTMLElement): void => {
    if (!readEnabled()) return
    if (takenOver.has(body)) return
    if (!followable(body)) return
    if (gapOf(body) <= CATCH_UP_GAP_PX) return
    body.scrollTop = body.scrollHeight
  }

  /**
   * 记下读者接管这个组体滚动的意图。
   *
   * 落在组体内容上的指针不算：那是点开某一行，不是碰滚动条。滚动条是组体自己那一段，按在它上面
   * 时事件的目标正是组体。
   */
  const noteIntent = (event: Event): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const body = target.closest<HTMLElement>(PROCESS_BODY_SELECTOR)
    if (body === null) return
    if (event.type === 'pointerdown' && target !== body) return
    if (event.type === 'keydown') {
      if (!(event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key))) return
      if (event.defaultPrevented) return
    }
    takenOver.add(body)
  }

  /** 读者自己滚回组体的底，让位就结束。 */
  const noteScroll = (event: Event): void => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (!target.matches(PROCESS_BODY_SELECTOR)) return
    if (gapOf(target) > RELEASE_THRESHOLD_PX) return
    takenOver.delete(target)
  }

  // 内容一变就判一次。观察组体自己也必要：窗口换宽窄会让封顶高度换一档。
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const target = entry.target
      if (!(target instanceof HTMLElement)) continue
      const body = target.closest<HTMLElement>(PROCESS_BODY_SELECTOR)
      if (body === null) continue
      catchUp(body)
    }
  })

  /** 会话切换与过程组增减都会换掉组体，跟着走。 */
  const sync = (): void => {
    const present = new Set(document.querySelectorAll<HTMLElement>(PROCESS_BODY_SELECTOR))
    for (const body of present) {
      if (watched.has(body)) continue
      const content = body.querySelector(PROCESS_CONTENT_SELECTOR)
      watched.set(body, content)
      observer.observe(body)
      if (content !== null) observer.observe(content)
    }
    for (const [body, content] of [...watched]) {
      if (present.has(body)) {
        // 收起过的组体重新展开时，上一次那回让位不该跟过来。
        if (body.hasAttribute('hidden')) takenOver.delete(body)
        continue
      }
      watched.delete(body)
      takenOver.delete(body)
      observer.unobserve(body)
      if (content !== null) observer.unobserve(content)
    }
  }

  const timer = window.setInterval(sync, SYNC_INTERVAL_MS)
  window.addEventListener('scroll', noteScroll, { capture: true, passive: true })
  for (const type of INTENT_TYPES) window.addEventListener(type, noteIntent, { capture: true, passive: true })
  sync()

  return () => {
    window.clearInterval(timer)
    observer.disconnect()
    window.removeEventListener('scroll', noteScroll, true)
    for (const type of INTENT_TYPES) window.removeEventListener(type, noteIntent, true)
  }
}
