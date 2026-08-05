import { useMemo, useState, type ReactNode } from 'react'
import { analyzeScript, type Reference, type Section } from '../fountain'
import type { InsightsGroups } from '../layout'
import './InsightsPanel.css'

interface InsightsPanelProps {
  source: string
  /** Fill the available height (true when it's the only panel showing). */
  grow?: boolean
  /** Jump the editor to a source line when a reference is clicked. */
  onJump?: (line: number) => void
  /** Initial collapsed state (restored from saved layout). */
  initialCollapsed?: boolean
  /** Reports the collapsed state when the user toggles it. */
  onCollapsedChange?: (collapsed: boolean) => void
  /** Which groups are shown, restored from saved layout. */
  initialGroups?: InsightsGroups
  /** Reports group visibility when the user toggles a chip. */
  onGroupsChange?: (groups: InsightsGroups) => void
}

const ALL_GROUPS: InsightsGroups = {
  sections: true,
  characters: true,
  locations: true,
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
  initialCollapsed = false,
  onCollapsedChange,
  initialGroups = ALL_GROUPS,
  onGroupsChange,
}: InsightsPanelProps) {
  const { characters, locations, sections } = useMemo(
    () => analyzeScript(source),
    [source],
  )
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [groups, setGroups] = useState<InsightsGroups>(initialGroups)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleGroup = (key: keyof InsightsGroups) =>
    setGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      onGroupsChange?.(next)
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
        onClick={() => {
          setCollapsed((c) => !c)
          onCollapsedChange?.(!collapsed)
        }}
        aria-expanded={!collapsed}
      >
        <span className="insights__chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="insights__title">Characters &amp; Locations</span>
        {collapsed && (
          <span className="insights__summary">
            {characters.length} chars · {locations.length} locs
            {sections.length > 0 && ` · ${sections.length} sec`}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="insights__toggles" role="group" aria-label="Show groups">
          <GroupToggle
            label="Sections"
            count={sections.length}
            active={groups.sections}
            onToggle={() => toggleGroup('sections')}
          />
          <GroupToggle
            label="Characters"
            count={characters.length}
            active={groups.characters}
            onToggle={() => toggleGroup('characters')}
          />
          <GroupToggle
            label="Locations"
            count={locations.length}
            active={groups.locations}
            onToggle={() => toggleGroup('locations')}
          />
        </div>
      )}

      {!collapsed && (
        <div className="insights__body">
          {groups.sections && sections.length > 0 && (
            <Group title="Sections" count={sections.length}>
              {sections.map((s) => {
                const key = `sec:${s.id}`
                return (
                  <SectionRow
                    key={key}
                    section={s}
                    open={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    onJump={onJump}
                  />
                )
              })}
            </Group>
          )}

          {groups.characters && (
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
          )}

          {groups.locations && (
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
          )}

          {!groups.sections && !groups.characters && !groups.locations && (
            <p className="insights__all-hidden">
              All groups hidden. Use the toggles above to show them.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function GroupToggle({
  label,
  count,
  active,
  onToggle,
}: {
  label: string
  count: number
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`insights__toggle${active ? ' insights__toggle--on' : ''}`}
      onClick={onToggle}
      aria-pressed={active}
      title={`${active ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
    >
      <span className="insights__toggle-label">{label}</span>
      <span className="insights__toggle-count">{count}</span>
    </button>
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

function SectionRow({
  section,
  open,
  onToggle,
  onJump,
}: {
  section: Section
  open: boolean
  onToggle: () => void
  onJump?: (line: number) => void
}) {
  const span =
    section.startLine === section.endLine
      ? `L${section.startLine + 1}`
      : `L${section.startLine + 1}–L${section.endLine + 1}`
  // Indent nested ranges so the hierarchy reads at a glance.
  const indent = { marginLeft: section.depth * 12 }
  return (
    <div
      className={`insights__entity insights__entity--section${
        open ? ' insights__entity--open' : ''
      }`}
      style={indent}
    >
      <button
        type="button"
        className="insights__entity-head"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="insights__entity-chevron">{open ? '▾' : '▸'}</span>
        <span
          className="insights__section-swatch"
          style={{ background: section.color }}
          aria-hidden="true"
        />
        <span className="insights__entity-name">{section.label}</span>
        <span className="insights__badges">
          <span className="insights__badge" title="source line span">
            {span}
          </span>
        </span>
      </button>
      {open && (
        <div className="insights__section-body">
          {section.description !== '' && (
            <p className="insights__section-desc">{section.description}</p>
          )}
          <ul className="insights__refs">
            <li>
              <button
                type="button"
                className="insights__ref"
                title="Jump to the start of this section"
                onClick={() => onJump?.(section.startLine)}
              >
                <span className="insights__ref-meta">
                  <span className="insights__ref-scene">Start</span>
                  <span className="insights__ref-line">L{section.startLine + 1}</span>
                </span>
                <span className="insights__ref-snippet">{section.label}</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className="insights__ref"
                title="Jump to the end of this section"
                onClick={() => onJump?.(section.endLine)}
              >
                <span className="insights__ref-meta">
                  <span className="insights__ref-scene">End</span>
                  <span className="insights__ref-line">L{section.endLine + 1}</span>
                </span>
                <span className="insights__ref-snippet">{section.label}</span>
              </button>
            </li>
          </ul>
        </div>
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
