import { useMemo, useState, type ReactNode } from 'react'
import { analyzeScript, type Reference } from '../fountain'
import './InsightsPanel.css'

interface InsightsPanelProps {
  source: string
  /** Fill the available height (true when it's the only panel showing). */
  grow?: boolean
  /** Jump the editor to a source line when a reference is clicked. */
  onJump?: (line: number) => void
}

/**
 * Characters & Locations panel: a collapsible tracker that lists every speaking
 * character and every location in the script. Each entry expands to show its
 * references — the scenes, source lines, and snippets where it occurs.
 */
export function InsightsPanel({
  source,
  grow = false,
  onJump,
}: InsightsPanelProps) {
  const { characters, locations } = useMemo(
    () => analyzeScript(source),
    [source],
  )
  const [collapsed, setCollapsed] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div
      className={`insights${collapsed ? ' insights--collapsed' : ''}${
        grow ? ' insights--grow' : ''
      }`}
    >
      <button
        type="button"
        className="insights__bar"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="insights__chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="insights__title">Characters &amp; Locations</span>
        <span className="insights__summary">
          {characters.length} chars · {locations.length} locs
        </span>
      </button>

      {!collapsed && (
        <div className="insights__body">
          <Group title="Characters" count={characters.length}>
            {characters.map((c) => {
              const key = `char:${c.name}`
              return (
                <Entity
                  key={key}
                  name={c.name}
                  open={expanded.has(key)}
                  onToggle={() => toggle(key)}
                  references={c.references}
                  onJump={onJump}
                  badges={
                    <>
                      <span className="insights__badge" title="dialogue cues">
                        {c.cues}×
                      </span>
                      <span className="insights__badge" title="scenes">
                        {c.scenes} sc
                      </span>
                    </>
                  }
                />
              )
            })}
          </Group>

          <Group title="Locations" count={locations.length}>
            {locations.map((l) => {
              const key = `loc:${l.name}`
              return (
                <Entity
                  key={key}
                  name={l.name}
                  open={expanded.has(key)}
                  onToggle={() => toggle(key)}
                  references={l.references}
                  onJump={onJump}
                  badges={
                    <span className="insights__badge" title="scenes">
                      {l.scenes} sc
                    </span>
                  }
                />
              )
            })}
          </Group>
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <div className="insights__group">
      <div className="insights__group-head">
        <span className="insights__group-title">{title}</span>
        <span className="insights__group-count">{count}</span>
      </div>
      {count === 0 ? (
        <p className="insights__empty">None found.</p>
      ) : (
        <div className="insights__list">{children}</div>
      )}
    </div>
  )
}

function Entity({
  name,
  badges,
  references,
  open,
  onToggle,
  onJump,
}: {
  name: string
  badges: ReactNode
  references: Reference[]
  open: boolean
  onToggle: () => void
  onJump?: (line: number) => void
}) {
  return (
    <div className={`insights__entity${open ? ' insights__entity--open' : ''}`}>
      <button
        type="button"
        className="insights__entity-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="insights__entity-chevron">{open ? '▾' : '▸'}</span>
        <span className="insights__entity-name">{name}</span>
        <span className="insights__badges">{badges}</span>
      </button>
      {open && (
        <ul className="insights__refs">
          {references.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="insights__ref"
                title="Jump to this line in the editor"
                onClick={() => onJump?.(r.line)}
              >
                <span className="insights__ref-meta">
                  <span className="insights__ref-scene">
                    {r.scene > 0 ? `Scene ${r.scene}` : 'Front matter'}
                  </span>
                  <span className="insights__ref-line">L{r.line + 1}</span>
                </span>
                <span className="insights__ref-snippet">
                  {r.snippet || r.heading}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
