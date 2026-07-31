import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { LexicalEditor, LexicalNode, TextNode } from 'lexical'
import {
  $createRangeSelection,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
} from 'lexical'

interface Props {
  /**
   * Line to reveal in the editor. `nonce` lets the same line re-fire on
   * repeated requests. The editor scrolls to the line, selects that line's
   * text, and takes focus.
   */
  target: { line: number; nonce: number } | null
}

/** Start/end character offsets of a 0-based line within the source text. */
function lineBounds(text: string, line: number): { start: number; end: number } {
  const parts = text.split('\n')
  const clamped = Math.max(0, Math.min(line, parts.length - 1))
  let start = 0
  for (let k = 0; k < clamped; k++) start += parts[k].length + 1
  return { start, end: start + parts[clamped].length }
}

/** Map an absolute offset to a {text node, local offset} among the children. */
function locate(
  children: LexicalNode[],
  offset: number,
): { node: TextNode; offset: number } | null {
  let acc = 0
  let last: TextNode | null = null
  for (const child of children) {
    if ($isTextNode(child)) {
      const len = child.getTextContentSize()
      if (offset <= acc + len) return { node: child, offset: offset - acc }
      acc += len
      last = child
    } else {
      // Line breaks contribute one character to the text content.
      acc += 1
    }
  }
  return last === null ? null : { node: last, offset: last.getTextContentSize() }
}

/** A collapsed DOM Range at `offset` within the contentEditable, or null. */
function rangeAtOffset(root: HTMLElement, offset: number): Range | null {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  )
  let acc = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue?.length ?? 0
      if (offset <= acc + len) {
        const range = document.createRange()
        range.setStart(node, offset - acc)
        range.collapse(true)
        return range
      }
      acc += len
    } else if (node.nodeName === 'BR') {
      if (offset === acc) {
        const range = document.createRange()
        range.setStartBefore(node)
        range.collapse(true)
        return range
      }
      acc += 1
    }
  }
  return null
}

/** Scroll the line toward the top of the editor's scroll surface. */
function scrollLineIntoView(editor: LexicalEditor, line: number): void {
  const root = editor.getRootElement()
  const surface = root?.closest('.editor__surface') as HTMLElement | null
  if (root === null || surface === null) return
  const text = editor.getEditorState().read(() => $getRoot().getTextContent())
  const range = rangeAtOffset(root, lineBounds(text, line).start)
  if (range === null) return
  const caret = range.getBoundingClientRect()
  const view = surface.getBoundingClientRect()
  surface.scrollTop += caret.top - view.top - view.height * 0.3
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
      const root = $getRoot()
      const para = root.getFirstChild()
      if (!$isElementNode(para)) {
        root.selectEnd()
        return
      }
      const { start, end } = lineBounds(root.getTextContent(), target.line)
      const children = para.getChildren()
      const from = locate(children, start)
      const to = locate(children, end)
      if (from === null || to === null) {
        root.selectEnd()
        return
      }
      const selection = $createRangeSelection()
      selection.anchor.set(from.node.getKey(), from.offset, 'text')
      selection.focus.set(to.node.getKey(), to.offset, 'text')
      $setSelection(selection)
    })

    editor.focus()

    // Scroll after reconciliation, using a computed range (independent of the
    // selection we just set).
    requestAnimationFrame(() => scrollLineIntoView(editor, target.line))
  }, [editor, target])

  return null
}
