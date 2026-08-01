import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import { lineBounds, scrollOffsetIntoView, selectRange } from '../offsets'

interface Props {
  /**
   * Line to reveal in the editor. `nonce` lets the same line re-fire on
   * repeated requests. The editor scrolls to the line, selects that line's
   * text, and takes focus.
   */
  target: { line: number; nonce: number } | null
}

/**
 * Reveals a source line in the editor: scrolls to it, selects that line's text,
 * and focuses. Used by the preview (on text selection) and the Characters &
 * Locations panel (on reference click).
 */
export function JumpToLinePlugin({ target }: Props) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (target === null) return

    editor.update(() => {
      const { start, end } = lineBounds($getRoot().getTextContent(), target.line)
      if (!selectRange(start, end)) $getRoot().selectEnd()
    })

    editor.focus()

    // Scroll after reconciliation, using a computed range (independent of the
    // selection we just set).
    requestAnimationFrame(() =>
      editor.getEditorState().read(() => {
        const { start } = lineBounds($getRoot().getTextContent(), target.line)
        scrollOffsetIntoView(editor, start)
      }),
    )
  }, [editor, target])

  return null
}
