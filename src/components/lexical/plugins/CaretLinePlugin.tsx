import { useEffect, useRef } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  type Point,
} from 'lexical'

interface Props {
  /** Called with the caret's 0-based source line whenever it moves. */
  onCaretLine?: (line: number) => void
  /**
   * Called with the 0-based line range the selection spans, or null when it's
   * collapsed. Lines rather than character offsets because that's the unit a
   * script reference is addressed in.
   */
  onSelectedLines?: (range: { startLine: number; endLine: number } | null) => void
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
export function CaretLinePlugin({ onCaretLine, onSelectedLines }: Props) {
  const lastRef = useRef(-1)
  const lastRangeRef = useRef('')

  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const read = () => {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          if (lastRangeRef.current !== '') {
            lastRangeRef.current = ''
            onSelectedLines?.(null)
          }
          return
        }

        const lines = $getRoot().getChildren()
        const lineOf = (key: string) =>
          lines.findIndex((child) => child.getKey() === key)
        const paragraphOf = (point: Point) => {
          const node = point.getNode()
          return $isElementNode(node) ? node : node.getParent()
        }

        const anchorPara = paragraphOf(selection.anchor)
        const focusPara = paragraphOf(selection.focus)
        if (anchorPara === null || focusPara === null) return

        const anchorLine = lineOf(anchorPara.getKey())
        const focusLine = lineOf(focusPara.getKey())
        if (anchorLine < 0 || focusLine < 0) return

        // Only report changes: this runs on every keystroke, and re-reporting
        // the same values would re-render the sidebar for every character.
        if (focusLine !== lastRef.current) {
          lastRef.current = focusLine
          onCaretLine?.(focusLine)
        }

        const range = selection.isCollapsed()
          ? null
          : {
              startLine: Math.min(anchorLine, focusLine),
              endLine: Math.max(anchorLine, focusLine),
            }
        const sig = range === null ? '' : `${range.startLine}:${range.endLine}`
        if (sig !== lastRangeRef.current) {
          lastRangeRef.current = sig
          onSelectedLines?.(range)
        }
      })
    }
    read()
    return editor.registerUpdateListener(read)
  }, [editor, onCaretLine, onSelectedLines])

  return null
}
