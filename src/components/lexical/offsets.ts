import type { LexicalEditor, LexicalNode, TextNode } from 'lexical'
import {
  $createRangeSelection,
  $getRoot,
  $isElementNode,
  $isTextNode,
  $setSelection,
} from 'lexical'

/**
 * Absolute character offsets within the editor's plain-text content, mapped to
 * concrete Lexical/DOM positions. The document is a single paragraph whose lines
 * are separated by line-break nodes, and each break contributes one "\n" to the
 * text content — the helpers here account for that.
 */

/** Start/end character offsets of a 0-based line within the source text. */
export function lineBounds(
  text: string,
  line: number,
): { start: number; end: number } {
  const parts = text.split('\n')
  const clamped = Math.max(0, Math.min(line, parts.length - 1))
  let start = 0
  for (let k = 0; k < clamped; k++) start += parts[k].length + 1
  return { start, end: start + parts[clamped].length }
}

/** Map an absolute offset to a {text node, local offset} among the children. */
export function locate(
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
export function rangeAtOffset(root: HTMLElement, offset: number): Range | null {
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

/** Scroll the given absolute offset toward the top of the editor's surface. */
export function scrollOffsetIntoView(
  editor: LexicalEditor,
  offset: number,
): void {
  const root = editor.getRootElement()
  const surface = root?.closest('.editor__surface') as HTMLElement | null
  if (root === null || surface === null) return
  const range = rangeAtOffset(root, offset)
  if (range === null) return
  const caret = range.getBoundingClientRect()
  const view = surface.getBoundingClientRect()
  surface.scrollTop += caret.top - view.top - view.height * 0.3
}

/**
 * Select the text between two absolute offsets in the single-paragraph document.
 * Returns true if the selection was applied, false if the offsets couldn't be
 * mapped (in which case the caller may fall back, e.g. to selectEnd).
 */
export function selectRange(start: number, end: number): boolean {
  const root = $getRoot()
  const para = root.getFirstChild()
  if (!$isElementNode(para)) return false
  const children = para.getChildren()
  const from = locate(children, start)
  const to = locate(children, end)
  if (from === null || to === null) return false
  const selection = $createRangeSelection()
  selection.anchor.set(from.node.getKey(), from.offset, 'text')
  selection.focus.set(to.node.getKey(), to.offset, 'text')
  $setSelection(selection)
  return true
}
