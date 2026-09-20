import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SearchIcon } from './icons'
import './CommandPalette.css'

export interface Command {
  id: string
  label: string
  /** Section heading this command files under. */
  group: string
  /** Shortcut or state shown right-aligned, e.g. "⌘S" or "On". */
  hint?: string
  /** Extra words that should match this command but aren't in the label. */
  keywords?: string
  disabled?: boolean
  run: () => void
}

interface CommandPaletteProps {
  commands: Command[]
  onClose: () => void
}

/**
 * ⌘K palette over every command in the app.
 *
 * The top bar used to carry Export PDF, New version, History, the section
 * toggle and the preview Fit control as permanent buttons — four different
 * classes of command (document identity, document state, workspace layout,
 * document operations) in one flat undifferentiated row, with the rarest action
 * of the lot rendered in the accent colour and therefore the loudest thing on
 * screen.
 *
 * A palette is the standard answer to that shape of problem: many low-frequency
 * commands, no room to show them, and no useful hierarchy among them. Reach
 * goes *up* (everything is one keystroke and a few letters away, including
 * things that were never in the bar at all) while the permanent chrome shrinks
 * to the two or three things worth a dedicated control.
 */

/**
 * Subsequence match — the letters of `query` appear in `text` in order, but not
 * necessarily adjacently, so "epdf" finds "Export PDF". Returns a score where
 * lower is better: matches packed near the start of the string win.
 */
function score(text: string, query: string): number | null {
  if (query === '') return 0
  const hay = text.toLowerCase()
  let at = 0
  let total = 0
  for (const ch of query.toLowerCase()) {
    if (ch === ' ') continue
    const found = hay.indexOf(ch, at)
    if (found === -1) return null
    // Distance travelled since the last hit: adjacent letters cost nothing,
    // scattered ones cost more, so tight matches sort first.
    total += found - at
    at = found + 1
  }
  return total
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const scored: { cmd: Command; score: number }[] = []
    for (const cmd of commands) {
      if (cmd.disabled === true) continue
      const hay = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ''}`
      const s = score(hay, query)
      if (s !== null) scored.push({ cmd, score: s })
    }
    // A stable sort keeps the caller's ordering intact for equal scores, which
    // is what makes the unfiltered list read as authored groups rather than
    // alphabetical noise.
    return scored.sort((a, b) => a.score - b.score).map((m) => m.cmd)
  }, [commands, query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Any change to the result set puts the selection back on the first row —
  // holding position would leave it on whatever happened to be at that index.
  useEffect(() => {
    setActive(0)
  }, [query])

  // Follow the selection with the scroll container when the arrows walk it off
  // the visible area.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, matches])

  const runAt = (index: number) => {
    const cmd = matches[index]
    if (cmd === undefined) return
    // Close first: a command that opens a dialog shouldn't have to fight the
    // palette for focus on the way in.
    onClose()
    cmd.run()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (matches.length === 0 ? 0 : (i + 1) % matches.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) =>
        matches.length === 0 ? 0 : (i - 1 + matches.length) % matches.length,
      )
    } else if (e.key === 'Enter') {
      e.preventDefault()
      runAt(active)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Group headings are emitted inline as the list is walked, so a heading only
  // appears when that group actually has a surviving match.
  let lastGroup: string | null = null

  return createPortal(
    <div className="palette" role="dialog" aria-modal="true" aria-label="Commands">
      <div className="palette__backdrop" onClick={onClose} />
      <div className="palette__panel" onKeyDown={onKeyDown}>
        <div className="palette__search">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            className="palette__input"
            placeholder="Search commands…"
            aria-label="Search commands"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={
              matches[active] !== undefined ? `cmd-${matches[active].id}` : undefined
            }
          />
        </div>

        <div className="palette__list" id="palette-list" role="listbox" ref={listRef}>
          {matches.length === 0 ? (
            <p className="palette__empty">No matching command.</p>
          ) : (
            matches.map((cmd, i) => {
              const heading = cmd.group !== lastGroup ? cmd.group : null
              lastGroup = cmd.group
              return (
                <div key={cmd.id}>
                  {heading !== null && (
                    <div className="palette__group">{heading}</div>
                  )}
                  <div
                    id={`cmd-${cmd.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    className={`palette__item${
                      i === active ? ' palette__item--active' : ''
                    }`}
                    // Pointer-down rather than click: the input must not lose
                    // focus before the command runs.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      runAt(i)
                    }}
                    onMouseMove={() => setActive(i)}
                  >
                    <span className="palette__label">{cmd.label}</span>
                    {cmd.hint !== undefined && (
                      <span className="palette__hint">{cmd.hint}</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
