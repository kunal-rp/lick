import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $isElementNode, $isTextNode } from 'lexical'

interface Props {
  /**
   * Line to move the caret to and scroll into view. The `nonce` lets the same
   * line be requested repeatedly (each click re-triggers the jump).
   */
  target: { line: number; nonce: number } | null
}

/** Character offset of the start of a 0-based line within the source text. */
function lineStartOffset(text: string, line: number): number {
  const parts = text.split('\n')
  const clamped = Math.max(0, Math.min(line, parts.length - 1))
  let acc = 0
  for (let k = 0; k < clamped; k++) acc += parts[k].length + 1
  return acc
}

/**
 * Moves the editor caret to a source line and scrolls it into view. Used by the
 * Characters & Locations panel so clicking a reference jumps to it in the text.
 */
export function JumpToLinePlugin({ target }: Props) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (target === null) return

    editor.update(() => {
      const root = $getRoot()
      const para = root.getFirstChild()
      if (!$isElementNode(para)) {
        root.selectEnd()
        return
      }
      const offset = lineStartOffset(root.getTextContent(), target.line)
      let acc = 0
      for (const child of para.getChildren()) {
        if ($isTextNode(child)) {
          const len = child.getTextContentSize()
          if (offset <= acc + len) {
            const rel = Math.max(0, Math.min(offset - acc, len))
            child.select(rel, rel)
            return
          }
          acc += len
        } else {
          // Line breaks contribute one character to the text content.
          acc += 1
        }
      }
      root.selectEnd()
    })

    editor.focus()

    // After reconciliation, scroll the caret's line toward the top of the
    // editor's scroll surface so the jumped-to spot is comfortably visible.
    requestAnimationFrame(() => {
      const root = editor.getRootElement()
      const surface = root?.closest('.editor__surface') as HTMLElement | null
      const selection = window.getSelection()
      if (surface === null || selection === null || selection.rangeCount === 0) {
        return
      }
      const caret = selection.getRangeAt(0).getBoundingClientRect()
      const view = surface.getBoundingClientRect()
      surface.scrollTop += caret.top - view.top - view.height * 0.3
    })
  }, [editor, target])

  return null
}
