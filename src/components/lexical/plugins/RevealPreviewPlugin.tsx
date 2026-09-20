import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

interface Props {
  /** Called with the source line double-clicked in the editor. */
  onReveal?: (line: number) => void
}

// The 0-based source line of the current selection anchor within the editor.
// Each source line is its own paragraph (see document.ts), so the line index is
// the index of the root child containing the anchor.
function lineOfSelection(root: HTMLElement): number | null {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0) return null
  const node = selection.anchorNode
  if (node === null || !root.contains(node)) return null

  const lines = Array.from(root.children)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === node || lines[i].contains(node)) return i
  }
  return null
}

/**
 * Double-clicking in the editor reveals the correlated spot in the preview:
 * it reports the double-clicked source line so the preview can scroll to it.
 */
export function RevealPreviewPlugin({ onReveal }: Props) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const root = editor.getRootElement()
    if (root === null || onReveal === undefined) return
    const reveal = () => {
      const line = lineOfSelection(root)
      if (line !== null) onReveal(line)
    }
    // Desktop: a double-click selects a word and fires `dblclick`.
    const onDblClick = () => reveal()
    // Touch: mouse events don't fire while selecting, so mirror the gesture
    // via `touchend`. A double-tap selects a word (a non-collapsed selection);
    // read it on the next frame, once the browser has applied the selection.
    const onTouchEnd = () => {
      requestAnimationFrame(() => {
        const selection = window.getSelection()
        if (selection === null || selection.isCollapsed) return // plain tap
        reveal()
      })
    }
    root.addEventListener('dblclick', onDblClick)
    root.addEventListener('touchend', onTouchEnd)
    return () => {
      root.removeEventListener('dblclick', onDblClick)
      root.removeEventListener('touchend', onTouchEnd)
    }
  }, [editor, onReveal])

  return null
}
