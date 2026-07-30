import { $getSelection, $isRangeSelection, type LexicalEditor } from 'lexical'

// The Fountain 1.1 inline emphasis markers (https://fountain.io/syntax):
//   italic -> *text*      bold -> **text**      underline -> _text_
// Bold + italic combine naturally by nesting into ***text***.
export const MARKERS = {
  bold: '**',
  italic: '*',
  underline: '_',
} as const

export type EmphasisKind = keyof typeof MARKERS

// Peel the emphasis markers that already wrap the selection, working from the
// inside out. `before`/`after` are the text flanking the selection; a marker
// counts as applied only when it appears symmetrically on both sides. `**` is
// tested before `*` so bold isn't mistaken for italic. Returns the applied
// markers inner -> outer.
function peelStack(before: string, after: string): string[] {
  const stack: string[] = []
  let b = before
  let a = after

  for (;;) {
    if (b.endsWith('_') && a.startsWith('_')) {
      stack.push('_')
      b = b.slice(0, -1)
      a = a.slice(1)
    } else if (b.endsWith('**') && a.startsWith('**')) {
      stack.push('**')
      b = b.slice(0, -2)
      a = a.slice(2)
    } else if (b.endsWith('*') && a.startsWith('*')) {
      stack.push('*')
      b = b.slice(0, -1)
      a = a.slice(1)
    } else {
      break
    }
  }

  return stack
}

/**
 * Toggle a Fountain emphasis marker on the current selection.
 *
 * If the selection is already wrapped in `marker` — including when the marker
 * characters sit just outside the selection, e.g. selecting `cramped` inside
 * `**cramped**` — the effect is reverted by stripping that layer. Otherwise the
 * marker is added as the innermost layer. Other emphasis already present is
 * preserved (removing bold from `***x***` leaves `*x*`).
 */
export function toggleEmphasis(editor: LexicalEditor, marker: string): void {
  editor.update(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return

    const { anchor, focus } = selection

    // Toggling needs to read the text around the selection, which is only
    // reliable inside a single text node. Otherwise fall back to a plain wrap.
    if (
      anchor.type !== 'text' ||
      focus.type !== 'text' ||
      anchor.key !== focus.key
    ) {
      selection.insertText(marker + selection.getTextContent() + marker)
      return
    }

    const node = anchor.getNode()
    const text = node.getTextContent()
    const start = Math.min(anchor.offset, focus.offset)
    const end = Math.max(anchor.offset, focus.offset)

    const selected = text.slice(start, end)
    let before = text.slice(0, start)
    let after = text.slice(end)

    const stack = peelStack(before, after)
    const layer = stack.indexOf(marker)

    const newStack =
      layer >= 0
        ? [...stack.slice(0, layer), ...stack.slice(layer + 1)] // revert
        : [marker, ...stack] // apply (innermost)

    // Detach the markers we peeled, then reattach the new stack. The peeled
    // length is symmetric, so the same count comes off each side.
    const peeled = stack.reduce((sum, m) => sum + m.length, 0)
    before = before.slice(0, before.length - peeled)
    after = after.slice(peeled)

    const leftMarkers = [...newStack].reverse().join('') // outer -> inner
    const rightMarkers = newStack.join('') // inner -> outer
    const newText = before + leftMarkers + selected + rightMarkers + after

    const selStart = before.length + leftMarkers.length
    const selEnd = selStart + selected.length

    // Rewrite the node's text, then restore the selection over the inner run.
    selection.anchor.set(node.getKey(), 0, 'text')
    selection.focus.set(node.getKey(), text.length, 'text')
    selection.insertText(newText)

    const key = selection.anchor.key
    selection.anchor.set(key, selStart, 'text')
    selection.focus.set(key, selEnd, 'text')
  })

  editor.focus()
}
