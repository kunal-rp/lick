import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { readSource } from '../document'
import { topOfOffset } from '../offsets'

interface Props {
  /** Source line indices where the preview breaks a page (in order). */
  breakLines: number[]
}

// The shared implementation now lives in ../offsets — this file used to carry
// its own copy of the DOM walker, which had to be kept in step by hand.
/** Character offset of the start of each requested line, from the source. */
function lineStartOffsets(text: string, lines: number[]): number[] {
  const parts = text.split('\n')
  const prefix = new Array(parts.length + 1)
  prefix[0] = 0
  for (let k = 0; k < parts.length; k++) prefix[k + 1] = prefix[k] + parts[k].length + 1
  return lines.map((l) => prefix[Math.max(0, Math.min(l, parts.length - 1))])
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
      const text = readSource(editor)
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
