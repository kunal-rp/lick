import { useCallback, useEffect, useRef, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $getRoot, $isRangeSelection } from 'lexical'
import { scrollOffsetIntoView, selectRange } from './offsets'

/** All start offsets where `query` occurs in `text` (case-insensitive). */
function findMatches(text: string, query: string): number[] {
  if (query === '') return []
  const hay = text.toLowerCase()
  const needle = query.toLowerCase()
  const out: number[] = []
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    out.push(i)
  }
  return out
}

/**
 * Always-visible find-in-editor bar that lives in the toolbar. Highlights the
 * active match by selecting it and scrolling it into view; ⏎ / ⇧⏎ step through
 * matches and Esc clears the query. Matching is plain-text and case-insensitive
 * over the Fountain source (markers included). A toggle opens a find & replace
 * popup that shares this query.
 */
export function SearchBar() {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [matches, setMatches] = useState<number[]>([])
  const [current, setCurrent] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Recompute matches whenever the query changes or the document is edited.
  useEffect(() => {
    const recompute = () => {
      const text = editor
        .getEditorState()
        .read(() => $getRoot().getTextContent())
      setMatches(findMatches(text, query))
    }
    recompute()
    return editor.registerUpdateListener(recompute)
  }, [editor, query])

  // Keep the active index within range as the match set changes.
  useEffect(() => {
    setCurrent((c) => (matches.length === 0 ? 0 : Math.min(c, matches.length - 1)))
  }, [matches])

  // Reveal the active match: select its text and scroll it into view.
  const reveal = useCallback(
    (index: number) => {
      const start = matches[index]
      if (start === undefined) return
      const end = start + query.length
      editor.update(() => {
        selectRange(start, end)
      })
      requestAnimationFrame(() => scrollOffsetIntoView(editor, start))
    },
    [editor, matches, query.length],
  )

  const step = useCallback(
    (delta: number) => {
      if (matches.length === 0) return
      const next = (current + delta + matches.length) % matches.length
      setCurrent(next)
      reveal(next)
    },
    [current, matches.length, reveal],
  )

  // Replace the active match with the replacement text, then keep the cursor on
  // whatever match slides into its place (the update listener recomputes).
  const replaceCurrent = useCallback(() => {
    const start = matches[current]
    if (start === undefined) return
    editor.update(() => {
      if (!selectRange(start, start + query.length)) return
      const sel = $getSelection()
      if ($isRangeSelection(sel)) sel.insertText(replacement)
    })
    requestAnimationFrame(() => scrollOffsetIntoView(editor, start))
  }, [editor, matches, current, query.length, replacement])

  // Replace every match in one undo step. Work back-to-front so each edit
  // doesn't shift the offsets of matches still to be replaced.
  const replaceAll = useCallback(() => {
    if (matches.length === 0) return
    editor.update(() => {
      for (let i = matches.length - 1; i >= 0; i--) {
        const start = matches[i]
        if (!selectRange(start, start + query.length)) continue
        const sel = $getSelection()
        if ($isRangeSelection(sel)) sel.insertText(replacement)
      }
    })
  }, [editor, matches, query.length, replacement])

  const count =
    query === ''
      ? ''
      : matches.length === 0
        ? '0/0'
        : `${current + 1}/${matches.length}`

  const noMatches = matches.length === 0

  return (
    <div className="toolbar__search" role="search">
      <span className="toolbar__search-icon" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={inputRef}
        type="text"
        className="toolbar__search-input"
        placeholder="Find"
        aria-label="Find in screenplay"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setQuery('')
          }
        }}
      />
      <span className="toolbar__search-count">{count}</span>
      <button
        type="button"
        title="Previous match (⇧⏎)"
        className="toolbar__btn toolbar__search-nav"
        disabled={noMatches}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => step(-1)}
      >
        <span className="toolbar__glyph" aria-hidden="true">
          ‹
        </span>
      </button>
      <button
        type="button"
        title="Next match (⏎)"
        className="toolbar__btn toolbar__search-nav"
        disabled={noMatches}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => step(1)}
      >
        <span className="toolbar__glyph" aria-hidden="true">
          ›
        </span>
      </button>
      <button
        type="button"
        title="Find & replace"
        aria-pressed={replaceOpen}
        className={`toolbar__btn toolbar__search-nav${
          replaceOpen ? ' toolbar__search-nav--active' : ''
        }`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setReplaceOpen((o) => !o)}
      >
        <span className="toolbar__glyph" aria-hidden="true">
          ⇄
        </span>
      </button>

      {replaceOpen && (
        <div className="toolbar__replace" role="dialog" aria-label="Find and replace">
          <div className="toolbar__replace-row">
            <input
              type="text"
              className="toolbar__replace-input"
              placeholder="Find"
              aria-label="Find"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="toolbar__search-count">{count}</span>
          </div>
          <div className="toolbar__replace-row">
            <input
              type="text"
              className="toolbar__replace-input"
              placeholder="Replace with"
              aria-label="Replace with"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  replaceCurrent()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setReplaceOpen(false)
                }
              }}
            />
          </div>
          <div className="toolbar__replace-actions">
            <button
              type="button"
              className="toolbar__replace-btn"
              disabled={noMatches}
              onMouseDown={(e) => e.preventDefault()}
              onClick={replaceCurrent}
            >
              Replace
            </button>
            <button
              type="button"
              className="toolbar__replace-btn"
              disabled={noMatches}
              onMouseDown={(e) => e.preventDefault()}
              onClick={replaceAll}
            >
              Replace all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
