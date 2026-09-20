import type { LexicalEditor } from 'lexical'
import {
  $createRangeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
} from 'lexical'

/**
 * Absolute character offsets within the editor's Fountain source, mapped to
 * concrete Lexical and DOM positions.
 *
 * The document is one paragraph per source line (see document.ts), so the
 * newline between two lines is a *paragraph boundary* rather than a character
 * in any text node. Everything here walks paragraphs and adds one for each
 * boundary crossed — the previous shape put a `<br>` in the flow and counted
 * that instead.
 *
 * Walking `root.children` directly, rather than a TreeWalker over every text
 * node, is what makes an empty line unambiguous: Lexical renders it as a
 * `<p><br></p>`, whose paragraph box has a real rect even though it holds no
 * text, so a caret there can still be located and measured.
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

/** Start offset of the line containing `offset` within `text`. */
export function lineStartAt(text: string, offset: number): number {
  const before = text.lastIndexOf('\n', Math.max(0, offset - 1))
  return before === -1 ? 0 : before + 1
}

/** The line elements of the contentEditable — one per source line. */
function lineElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children) as HTMLElement[]
}

/**
 * Split an absolute offset into a line index and a column within that line,
 * measured against the DOM (so it stays correct even if the caller's copy of
 * the source is a render behind). Returns null when the offset is past the end.
 */
function locateInDom(
  root: HTMLElement,
  target: number,
): { line: HTMLElement; column: number } | null {
  const lines = lineElements(root)
  let acc = 0
  for (let i = 0; i < lines.length; i++) {
    const length = lines[i].textContent?.length ?? 0
    if (target <= acc + length) return { line: lines[i], column: target - acc }
    acc += length + 1 // the paragraph boundary is the "\n"
  }
  const last = lines[lines.length - 1]
  return last === undefined
    ? null
    : { line: last, column: last.textContent?.length ?? 0 }
}

/**
 * Resolve a column within one line element to a DOM {node, offset} pair usable
 * with `Range.setStart`. Empty lines have no text node, so the paragraph itself
 * is returned with offset 0 — a range there still measures.
 */
function domPoint(
  line: HTMLElement,
  column: number,
): { node: Node; offset: number } {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  let acc = 0
  let last: Text | null = null
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text
    const length = text.nodeValue?.length ?? 0
    if (column <= acc + length) return { node: text, offset: column - acc }
    acc += length
    last = text
  }
  return last === null
    ? { node: line, offset: 0 }
    : { node: last, offset: last.nodeValue?.length ?? 0 }
}

/** A collapsed DOM Range at `offset` within the contentEditable, or null. */
export function rangeAtOffset(root: HTMLElement, offset: number): Range | null {
  const at = locateInDom(root, offset)
  if (at === null) return null
  const point = domPoint(at.line, at.column)
  const range = document.createRange()
  range.setStart(point.node, point.offset)
  range.collapse(true)
  return range
}

/**
 * A DOM Range spanning the absolute offsets `[start, end)`, or null if either
 * endpoint can't be mapped. Callers use `getClientRects()` on it to draw
 * highlights over the spanned text.
 */
export function rangeForSpan(
  root: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const from = locateInDom(root, start)
  const to = locateInDom(root, end)
  if (from === null || to === null) return null
  const a = domPoint(from.line, from.column)
  const b = domPoint(to.line, to.column)
  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  return range
}

/**
 * Viewport `top` of an absolute character offset within the contentEditable.
 * A collapsed range on an empty line reports a zero rect in Chrome, so the
 * line element's own box is used whenever the range doesn't measure.
 */
export function topOfOffset(root: HTMLElement, target: number): number | null {
  const at = locateInDom(root, target)
  if (at === null) return null
  const point = domPoint(at.line, at.column)
  const range = document.createRange()
  range.setStart(point.node, point.offset)
  range.collapse(true)
  const rects = range.getClientRects()
  if (rects.length > 0) return rects[0].top
  const rect = range.getBoundingClientRect()
  if (rect.height > 0 || rect.top !== 0) return rect.top
  return at.line.getBoundingClientRect().top
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
 * Absolute character offset of the caret (the selection's focus), or null when
 * there's no range selection.
 *
 * An anchor of type 'element' addresses a child *index* rather than a character
 * offset — Lexical reports that when the caret sits on an empty line — so that
 * case sums the children before the index instead of adding into one.
 */
export function caretOffset(): number | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null

  const point = selection.focus
  const node = point.getNode()
  const paragraph = $isElementNode(node) ? node : node.getParent()
  if (paragraph === null) return null

  // Offsets of every line up to the one the caret is in.
  let acc = 0
  for (const child of $getRoot().getChildren()) {
    if (child.getKey() === paragraph.getKey()) break
    acc += child.getTextContentSize() + 1
  }

  if (point.type === 'element') {
    // Child index within the paragraph: sum the text before it.
    let column = 0
    const children = $isElementNode(node) ? node.getChildren() : []
    for (let i = 0; i < point.offset && i < children.length; i++) {
      column += children[i].getTextContentSize()
    }
    return acc + column
  }

  // Text point: sum the siblings before this text node, then add the offset.
  let column = 0
  for (const child of $isElementNode(paragraph) ? paragraph.getChildren() : []) {
    if (child.getKey() === point.key) return acc + column + point.offset
    column += child.getTextContentSize()
  }
  return acc + column
}

/**
 * Select the text between two absolute offsets. Walks paragraphs to find the
 * text node and column each offset lands in; returns false if either can't be
 * mapped (in which case the caller may fall back, e.g. to selectEnd).
 */
export function selectRange(start: number, end: number): boolean {
  const from = locateInState(start)
  const to = locateInState(end)
  if (from === null || to === null) return false
  const selection = $createRangeSelection()
  selection.anchor.set(from.key, from.offset, from.type)
  selection.focus.set(to.key, to.offset, to.type)
  $setSelection(selection)
  return true
}

/**
 * Map an absolute offset to a Lexical selection point. Lands on a text node
 * where one exists; an empty line has none, so the point addresses the
 * paragraph itself ('element' type, offset 0).
 */
function locateInState(
  target: number,
): { key: string; offset: number; type: 'text' | 'element' } | null {
  let acc = 0
  const lines = $getRoot().getChildren()
  for (const line of lines) {
    const length = line.getTextContentSize()
    if (target <= acc + length) {
      let column = target - acc
      if (!$isElementNode(line)) return null
      const children = line.getChildren()
      for (const child of children) {
        const size = child.getTextContentSize()
        if ($isTextNode(child) && column <= size) {
          return { key: child.getKey(), offset: column, type: 'text' }
        }
        column -= size
      }
      // No text node (an empty line): address the paragraph.
      return { key: line.getKey(), offset: 0, type: 'element' }
    }
    acc += length + 1
  }
  const last = lines[lines.length - 1]
  if (last === undefined || !$isElementNode(last)) return null
  const lastText = last.getChildren().filter($isTextNode).pop()
  return lastText === undefined
    ? { key: last.getKey(), offset: 0, type: 'element' }
    : {
        key: lastText.getKey(),
        offset: lastText.getTextContentSize(),
        type: 'text',
      }
}
