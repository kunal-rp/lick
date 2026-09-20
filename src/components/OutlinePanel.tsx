import { useMemo } from 'react'
import { buildOutline } from '../fountain'
import './OutlinePanel.css'

interface OutlinePanelProps {
  source: string
  /** 0-based source line the editor's caret is nearest, for the "you are here". */
  currentLine?: number
  onJump: (line: number) => void
}

/**
 * The script's structure as a navigator: section ranges and scene headings in
 * document order, click to jump.
 *
 * This is the surface Beat, Highland 2 and Slugline all put in a persistent
 * left sidebar, and it's the one thing this app had no home for. The pieces
 * existed — sections were a collapsed group inside Characters & Locations,
 * which itself only appeared underneath the preview — but "jump to a scene" is
 * navigation, and navigation belongs beside the file tree, not two levels deep
 * inside a panel that only exists while another panel is open.
 */
export function OutlinePanel({
  source,
  currentLine,
  onJump,
}: OutlinePanelProps) {
  const entries = useMemo(() => buildOutline(source), [source])

  // The entry the caret is sitting in: the last one at or before the caret's
  // line. Scanning backwards means a script with hundreds of scenes costs one
  // pass and no allocation.
  const activeId = useMemo(() => {
    if (currentLine === undefined) return null
    let found: string | null = null
    for (const e of entries) {
      if (e.line > currentLine) break
      found = e.id
    }
    return found
  }, [entries, currentLine])

  if (entries.length === 0) {
    return (
      <p className="outline__empty">
        No scenes yet. A line like <code>INT. KITCHEN - DAY</code> starts one;
        wrap a stretch in <code>{'{{section: Act One}}'}</code> to group it.
      </p>
    )
  }

  return (
    <div className="outline">
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          className={`outline__row outline__row--${e.kind}${
            e.id === activeId ? ' is-current' : ''
          }`}
          // Indent is capped: past three levels the nesting stops being
          // legible and starts eating the label.
          style={{ paddingLeft: 8 + Math.min(e.depth, 3) * 12 }}
          title={e.description ?? e.label}
          onClick={() => onJump(e.line)}
        >
          {e.kind === 'section' ? (
            <span
              className="outline__swatch"
              style={{ background: e.color }}
              aria-hidden="true"
            />
          ) : (
            <span className="outline__scene-no">{e.sceneNumber}</span>
          )}
          <span className="outline__label">{e.label}</span>
        </button>
      ))}
    </div>
  )
}
