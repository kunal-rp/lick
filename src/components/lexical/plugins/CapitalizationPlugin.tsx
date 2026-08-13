import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from 'lexical'
import {
  applyCapSuggestions,
  detectCapitalization,
  type CapSuggestion,
} from '../../../fountain'
import { rangeForSpan } from '../offsets'

// One on-screen highlight box: a client rect of a suggestion's range, mapped to
// the editor content's coordinate space (a suggestion can wrap onto several).
interface Highlight {
  key: string
  id: string
  direction: 'up' | 'down'
  top: number
  left: number
  width: number
  height: number
}

/**
 * Flags text whose capitalization departs from standard screenplay format and
 * offers to fix it. Detected spans are underlined in the editor; clicking one
 * opens a dialog listing every proposed change (capitalize / un-capitalize) with
 * a button to apply the selected ones. The Fountain source is only ever changed
 * on apply — detection and highlighting never mutate it.
 *
 * Self-contained: it reads the editor's own text on each update, so it needs no
 * wiring from the app. Applying replaces the document text in a single, undoable
 * step (⌘Z reverts the whole batch).
 */
export function CapitalizationPlugin() {
  const [editor] = useLexicalComposerContext()
  const [suggestions, setSuggestions] = useState<CapSuggestion[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [open, setOpen] = useState(false)
  // Session-level hide: the writer dismissed the highlights. Re-shown as soon as
  // the set of suggestions changes (i.e. they kept editing).
  const [dismissed, setDismissed] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const sigRef = useRef('')

  // Recompute suggestions and their on-screen boxes on every editor update and
  // on resize. Boxes are measured against the live DOM (after the update has
  // committed), so they track wrapping — exactly as the page-break and section
  // overlays do, and synchronously like them. The root element is fetched on
  // each pass (it may not be attached when this effect first runs, since the
  // plugin is a sibling of the contentEditable) and the resize observer is bound
  // to it lazily once it exists; the update that attaches the root also fires
  // the listener, so the first real measurement self-heals.
  useEffect(() => {
    let observer: ResizeObserver | null = null
    let observed: HTMLElement | null = null

    function recompute() {
      const root = editor.getRootElement()
      if (root === null) return
      if (observed !== root) {
        observer?.disconnect()
        observer = new ResizeObserver(recompute)
        observer.observe(root)
        observed = root
      }

      const text = editor.getEditorState().read(() => $getRoot().getTextContent())
      const next = detectCapitalization(text)

      const sig = next.map((s) => s.id).join('|')
      if (sig !== sigRef.current) {
        sigRef.current = sig
        setDismissed(false) // fresh edits re-surface the highlights
      }
      setSuggestions(next)

      const rootBox = root.getBoundingClientRect()
      const boxes: Highlight[] = []
      for (const s of next) {
        const range = rangeForSpan(root, s.start, s.end)
        if (range === null) continue
        const rects = range.getClientRects()
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]
          if (r.width === 0 && r.height === 0) continue
          boxes.push({
            key: `${s.id}:${i}`,
            id: s.id,
            direction: s.direction,
            top: r.top - rootBox.top,
            left: r.left - rootBox.left,
            width: r.width,
            height: r.height,
          })
        }
      }
      setHighlights(boxes)
    }

    recompute()
    const unregister = editor.registerUpdateListener(recompute)
    return () => {
      observer?.disconnect()
      unregister()
    }
  }, [editor])

  // Opening the dialog selects every suggestion by default. Nothing left to fix
  // closes it.
  useEffect(() => {
    if (open && suggestions.length === 0) setOpen(false)
  }, [open, suggestions.length])

  useEffect(() => {
    if (open) setChecked(new Set(suggestions.map((s) => s.id)))
  }, [open, suggestions])

  // Replace the whole document with `text`, preserving the scroll position. The
  // structure mirrors the editor's seed (one paragraph, lines split by break
  // nodes) so every offset-based overlay keeps working after an apply. The write
  // flows through onChange → autosave like any edit, and each save is captured
  // in the History drawer, so a batch is always recoverable there.
  const replaceText = (text: string) => {
    const root = editor.getRootElement()
    const surface = root?.closest('.editor__surface') as HTMLElement | null
    const savedScroll = surface?.scrollTop ?? null
    editor.update(() => {
      const r = $getRoot()
      r.clear()
      const paragraph = $createParagraphNode()
      text.split('\n').forEach((line, i) => {
        if (i > 0) paragraph.append($createLineBreakNode())
        if (line.length > 0) paragraph.append($createTextNode(line))
      })
      r.append(paragraph)
      r.selectEnd()
    })
    if (surface !== null && savedScroll !== null) {
      requestAnimationFrame(() => {
        surface.scrollTop = savedScroll
      })
    }
    editor.focus()
  }

  const applySelected = () => {
    const chosen = suggestions.filter((s) => checked.has(s.id))
    if (chosen.length === 0) return
    const text = editor.getEditorState().read(() => $getRoot().getTextContent())
    replaceText(applyCapSuggestions(text, chosen))
    setOpen(false)
  }

  if (suggestions.length === 0) return null

  return (
    <>
      {!dismissed && (
        <div className="caps-overlay" aria-hidden="true">
          {highlights.map((h) => (
            <button
              key={h.key}
              type="button"
              className={`caps-hit caps-hit--${h.direction}`}
              style={
                {
                  top: h.top,
                  left: h.left,
                  width: h.width,
                  height: h.height,
                } as CSSProperties
              }
              title="Review screenplay capitalization"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(true)}
            />
          ))}
        </div>
      )}
      {open && (
        <CapitalizationDialog
          suggestions={suggestions}
          checked={checked}
          onToggle={(id) =>
            setChecked((prev) => {
              const next = new Set(prev)
              if (next.has(id)) next.delete(id)
              else next.add(id)
              return next
            })
          }
          onToggleAll={(all) =>
            setChecked(all ? new Set(suggestions.map((s) => s.id)) : new Set())
          }
          onApply={applySelected}
          onDismiss={() => {
            setDismissed(true)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

const DIRECTION_LABEL: Record<'up' | 'down', string> = {
  up: 'Capitalize',
  down: 'Un-capitalize',
}

function CapitalizationDialog({
  suggestions,
  checked,
  onToggle,
  onToggleAll,
  onApply,
  onDismiss,
  onClose,
}: {
  suggestions: CapSuggestion[]
  checked: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (all: boolean) => void
  onApply: () => void
  onDismiss: () => void
  onClose: () => void
}) {
  const selectedCount = useMemo(
    () => suggestions.filter((s) => checked.has(s.id)).length,
    [suggestions, checked],
  )
  const allChecked = selectedCount === suggestions.length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="caps-modal" role="dialog" aria-modal="true" aria-label="Capitalization">
      <div className="caps-modal__backdrop" onClick={onClose} />
      <div className="caps-modal__panel">
        <div className="caps-modal__head">
          <span className="caps-modal__title">Capitalization</span>
          <span className="caps-modal__count">
            {suggestions.length} suggested {suggestions.length === 1 ? 'change' : 'changes'}
          </span>
          <button
            type="button"
            className="caps-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="caps-modal__subhead">
          <label className="caps-modal__all">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
            Select all
          </label>
        </div>

        <ul className="caps-modal__list">
          {suggestions.map((s) => (
            <li key={s.id} className="caps-modal__item">
              <label className="caps-row">
                <input
                  type="checkbox"
                  className="caps-row__check"
                  checked={checked.has(s.id)}
                  onChange={() => onToggle(s.id)}
                />
                <span className="caps-row__body">
                  <span className="caps-row__meta">
                    <span className={`caps-tag caps-tag--${s.direction}`}>
                      {DIRECTION_LABEL[s.direction]}
                    </span>
                    <span className="caps-row__label">{s.label}</span>
                    <span className="caps-row__line">Line {s.line + 1}</span>
                  </span>
                  <span className="caps-row__diff">
                    <span className="caps-row__from">{s.from}</span>
                    <span className="caps-row__arrow">→</span>
                    <span className="caps-row__to">{s.to}</span>
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="caps-modal__foot">
          <button type="button" className="caps-btn" onClick={onDismiss}>
            Dismiss
          </button>
          <button
            type="button"
            className="caps-btn caps-btn--primary"
            onClick={onApply}
            disabled={selectedCount === 0}
          >
            Apply {selectedCount > 0 ? selectedCount : ''}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
