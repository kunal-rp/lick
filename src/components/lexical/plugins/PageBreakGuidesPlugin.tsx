import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'

interface Props {
  /** Source line indices where the preview breaks a page (in order). */
  breakLines: number[]
}

/** Character offset of the start of each requested line, from the source. */
function lineStartOffsets(text: string, lines: number[]): number[] {
  const parts = text.split('\n')
  const prefix = new Array(parts.length + 1)
  prefix[0] = 0
  for (let k = 0; k < parts.length; k++) prefix[k + 1] = prefix[k] + parts[k].length + 1
  return lines.map((l) => prefix[Math.max(0, Math.min(l, parts.length - 1))])
}

/**
 * Viewport `top` of the given character offset within the contentEditable,
 * walking text nodes and <br> line breaks (each <br> == one "\n"). Returns null
 * if the offset can't be located.
 */
function topOfOffset(root: HTMLElement, target: number): number | null {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  )
  let acc = 0
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue?.length ?? 0
      if (target <= acc + len) {
        const range = document.createRange()
        range.setStart(node, target - acc)
        range.collapse(true)
        const rects = range.getClientRects()
        const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect()
        return rect.top
      }
      acc += len
    } else if (node.nodeName === 'BR') {
      if (target === acc) return (node as HTMLElement).getBoundingClientRect().top
      acc += 1
    }
  }
  return null
}

/**
 * Overlays a subtle dashed line in the editor at each preview page boundary.
 *
 * Purely an on-screen indicator — the Fountain source is never modified. Line
 * positions are measured against the live DOM, so they track wrapping and
 * resize, and are recomputed whenever the content or the break list changes.
 */
export function PageBreakGuidesPlugin({ breakLines }: Props) {
  const [editor] = useLexicalComposerContext()
  const [tops, setTops] = useState<number[]>([])

  useEffect(() => {
    const root = editor.getRootElement()
    if (root === null) return

    const recompute = () => {
      if (breakLines.length === 0) {
        setTops([])
        return
      }
      const text = editor.getEditorState().read(() => $getRoot().getTextContent())
      const offsets = lineStartOffsets(text, breakLines)
      const rootTop = root.getBoundingClientRect().top
      const ys: number[] = []
      for (const offset of offsets) {
        const top = topOfOffset(root, offset)
        if (top !== null) ys.push(top - rootTop)
      }
      setTops(ys)
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(root)
    const unregister = editor.registerUpdateListener(recompute)

    return () => {
      observer.disconnect()
      unregister()
    }
  }, [editor, breakLines])

  if (tops.length === 0) return null

  return (
    <div className="editor__guides" aria-hidden="true">
      {tops.map((y, i) => (
        <div key={i} className="editor__page-break" style={{ top: y }} />
      ))}
    </div>
  )
}
