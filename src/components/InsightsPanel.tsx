import { useMemo, useState, type ReactNode } from 'react'
import { analyzeScript, type Reference } from '../fountain'
import type { InsightsGroups } from '../layout'
import { ChevronDownIcon, ChevronRightIcon } from './icons'
import './InsightsPanel.css'

interface InsightsPanelProps {
  source: string
  /** Jump the editor to a source line when a reference is clicked. */
  onJump?: (line: number) => void
  /** Which groups are shown, restored from saved layout. */
  initialGroups?: InsightsGroups
  /** Reports group visibility when the user toggles a chip. */
  onGroupsChange?: (groups: InsightsGroups) => void
}

const ALL_GROUPS: InsightsGroups = {
  characters: true,
  locations: true,
}

/**
 * The sidebar's Cast tab: every speaking character and every location in the
 * script. Each entry expands to show its references — the scenes, source
 * lines, and snippets where it occurs — and clicking one jumps the editor
 * there.
 *
 * It used to be a collapsible strip wedged under the preview, which meant the
 * app's only jump-to-line surface existed only while the preview did, and
 * arrived collapsed. As a sidebar tab it's always available and always open;
 * the collapse machinery went with the strip.
 *
 * Sections are deliberately not listed here — that's the Outline tab's job,
 * and two places showing the same structure only invites them to disagree
 * about which is the place to look.
 */
export function InsightsPanel({
  source,
  onJump,
  initialGroups = ALL_GROUPS,
  onGroupsChange,
}: InsightsPanelProps) {
  const { characters, locations } = useMemo(
    () => analyzeScript(source),
    [source],
  )
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
    <div className="insights insights--embedded">
      <div className="insights__toggles" role="group" aria-label="Show groups">
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

      <div className="insights__body">
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

          {!groups.characters && !groups.locations && (
            <p className="insights__all-hidden">
              Both groups hidden. Use the toggles above to show them.
            </p>
          )}
      </div>
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
        <span className="insights__entity-chevron">
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </span>
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
