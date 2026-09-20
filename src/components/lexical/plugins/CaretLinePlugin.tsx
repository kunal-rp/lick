import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
} from 'lexical'

interface Props {
  /** Called with the caret's 0-based source line whenever it moves. */
  onCaretLine?: (line: number) => void
}

/**
 * Reports which source line the caret is on.
 *
 * The Outline marks the entry you're currently inside, which it can only do if
 * something tells it where that is. Reading it from the selection rather than
 * from scroll position is deliberate: "where am I working" is the caret, and a
 * writer who scrolls away to look at something else hasn't moved.
 *
 * Each line is its own paragraph (see document.ts), so the line number is just
 * the caret's paragraph index — no text measuring, and cheap enough to run on
 * every update.
 */
export function CaretLinePlugin({ onCaretLine }: Props) {
  const lastRef = useRef(-1)

  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (onCaretLine === undefined) return
    const read = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        const node = selection.anchor.getNode()
        const paragraph = $isElementNode(node) ? node : node.getParent()
        if (paragraph === null) return
        const key = paragraph.getKey()
        const line = $getRoot()
          .getChildren()
          .findIndex((child) => child.getKey() === key)
        // Only report changes: this runs on every keystroke, and re-reporting
        // the same line would re-render the outline for every character typed.
        if (line < 0 || line === lastRef.current) return
        lastRef.current = line
        onCaretLine(line)
      })
    }
    read()
    return editor.registerUpdateListener(read)
  }, [editor, onCaretLine])

  return null
}
