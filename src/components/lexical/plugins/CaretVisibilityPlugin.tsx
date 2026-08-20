import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useIsMobile } from '../../../useIsMobile'

interface Props {
  /** The scrolling editor surface whose scrollTop we nudge to reveal the caret. */
  scrollRef: RefObject<HTMLDivElement | null>
}

// Keep the caret this far inside the visible band, so it never sits flush
// against the keyboard's top edge or under the version bar.
const MARGIN = 28

/**
 * Keeps the text caret visible above the on-screen keyboard while editing.
 *
 * The browser's native "scroll caret into view" is unreliable once the keyboard
 * animates in on mobile — it measures against the layout viewport, which the
 * keyboard doesn't shrink. So on mobile we measure the caret against the
 * *visual* viewport (the real on-screen area) after every edit and when the
 * viewport resizes (keyboard open/close), and scroll the surface to bring it
 * back into the band. Desktop keeps the native behaviour.
 */
export function CaretVisibilityPlugin({ scrollRef }: Props) {
  const [editor] = useLexicalComposerContext()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!isMobile) return

    let raf = 0
    const ensureVisible = () => {
      raf = 0
      const scrollEl = scrollRef.current
      const root = editor.getRootElement()
      // Only act while the editor actually holds focus (keyboard is up).
      if (scrollEl === null || root === null || document.activeElement !== root)
        return

      const selection = window.getSelection()
      if (selection === null || selection.rangeCount === 0) return
      const range = selection.getRangeAt(0)
      if (!root.contains(range.startContainer)) return

      // The caret rect. A collapsed range can report an empty rect (notably on
      // empty lines in Safari), so fall back to the enclosing element's rect.
      const caret = range.cloneRange()
      caret.collapse(false)
      let rect: DOMRect | undefined = caret.getClientRects()[0]
      if (rect === undefined || (rect.height === 0 && rect.top === 0)) {
        let node: Node | null = caret.startContainer
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
        if (node instanceof Element) rect = node.getBoundingClientRect()
      }
      if (rect === undefined) return

      const vv = window.visualViewport
      const viewBottom = vv !== null ? vv.offsetTop + vv.height : window.innerHeight
      const viewTop = vv !== null ? vv.offsetTop : 0
      // Never scroll the caret up under the version bar / surface top.
      const topBound = Math.max(viewTop, scrollEl.getBoundingClientRect().top)

      if (rect.bottom > viewBottom - MARGIN) {
        scrollEl.scrollTop += rect.bottom - (viewBottom - MARGIN)
      } else if (rect.top < topBound + MARGIN) {
        scrollEl.scrollTop -= topBound + MARGIN - rect.top
      }
    }

    const schedule = () => {
      if (raf !== 0) return
      raf = requestAnimationFrame(ensureVisible)
    }

    // Re-check after every edit/selection change and whenever the visual
    // viewport resizes (keyboard shown/hidden, browser chrome collapse).
    const unregister = editor.registerUpdateListener(schedule)
    const vv = window.visualViewport
    vv?.addEventListener('resize', schedule)

    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      unregister()
      vv?.removeEventListener('resize', schedule)
    }
  }, [editor, isMobile, scrollRef])

  return null
}
