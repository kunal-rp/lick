import { useEffect, useState, type CSSProperties } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'
import type { Section } from '../../../fountain'
import { lineBounds, topOfOffset } from '../offsets'

interface Props {
  /** Section ranges parsed from the current source. */
  sections: Section[]
}

// A resolved on-screen band: vertical extent (relative to the editor content
// top) plus the styling drawn from its section.
interface Band {
  id: string
  top: number
  height: number
  color: string
  label: string
  depth: number
}

/**
 * Paints a tinted background band behind each section range in the editor.
 *
 * Purely an on-screen indicator — the Fountain source is never modified. Bands
 * are measured against the live DOM (so they track wrapping and resize) from
 * the start marker's line to just past the end marker's line, and are
 * recomputed whenever the content or the section list changes. Nested ranges
 * are inset by depth so overlapping bands stay legible.
 */
export function SectionBackgroundsPlugin({ sections }: Props) {
  const [editor] = useLexicalComposerContext()
  const [bands, setBands] = useState<Band[]>([])

  useEffect(() => {
    const root = editor.getRootElement()
    if (root === null) return

    const recompute = () => {
      if (sections.length === 0) {
        setBands([])
        return
      }
      const text = editor.getEditorState().read(() => $getRoot().getTextContent())
      const lineCount = text.split('\n').length
      const rootTop = root.getBoundingClientRect().top
      const next: Band[] = []

      for (const s of sections) {
        const topY = topOfOffset(root, lineBounds(text, s.startLine).start)
        if (topY === null) continue

        // Bottom of the band: the top of the line after the end marker, which
        // naturally accounts for any wrapping of the final line. If the range
        // runs to the end of the document, extend to the content's full height.
        let bottomRel: number
        if (s.endLine + 1 < lineCount) {
          const below = topOfOffset(root, lineBounds(text, s.endLine + 1).start)
          bottomRel = below !== null ? below - rootTop : root.scrollHeight
        } else {
          bottomRel = root.scrollHeight
        }

        const top = topY - rootTop
        next.push({
          id: s.id,
          top,
          height: Math.max(0, bottomRel - top),
          color: s.color,
          label: s.label,
          depth: s.depth,
        })
      }
      setBands(next)
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(root)
    const unregister = editor.registerUpdateListener(recompute)

    return () => {
      observer.disconnect()
      unregister()
    }
  }, [editor, sections])

  if (bands.length === 0) return null

  // Two layers: the tint bands sit behind the text (z-index 0), while the label
  // chips sit above it (z-index 2) so they stay readable. A label can't be a
  // child of the tint band — the band's stacking context would trap it beneath
  // the content — so it lives in its own overlay, pinned to the band's top.
  return (
    <>
      <div className="editor__sections" aria-hidden="true">
        {bands.map((b) => (
          <div
            key={b.id}
            className="editor__section-band"
            style={
              {
                top: b.top,
                height: b.height,
                left: b.depth * 6,
                '--section-color': b.color,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="editor__section-labels" aria-hidden="true">
        {bands.map((b) => (
          // The track spans the band's full extent; the label inside sticks to
          // the top of the editor's scroll viewport while any of the band is on
          // screen, then rides the band's bottom out of view.
          <div
            key={b.id}
            className="editor__section-label-track"
            style={{ top: b.top, height: b.height } as CSSProperties}
          >
            <span
              className="editor__section-label"
              style={{ '--section-color': b.color } as CSSProperties}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
