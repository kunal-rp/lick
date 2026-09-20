import type { Version } from '../drive/versions'
import { ViewSwitch, type ViewOption } from './ViewSwitch'
import { CommandIcon, MenuIcon, PagesIcon, PenIcon } from './icons'
import './VersionBar.css'

/**
 * What the workspace is showing. Notes is absent on purpose: it moved into the
 * sidebar with the files, outline and cast, leaving this control to answer the
 * one question it should — am I writing, or reading pages?
 */
export type View = 'editor' | 'preview'

interface VersionBarProps {
  projectName: string
  versions: Version[]
  selectedVersionId: string | null
  dirty: boolean
  saving: boolean
  /** Timestamp (ms) of the last successful save this session, or null. */
  savedAt: number | null
  onSelectVersion: (fileId: string) => void
  onSave: () => void
  /** Open the project drawer (mobile only; the button is hidden on desktop). */
  onToggleNav: () => void
  /** What the workspace is showing. */
  view: View
  onSetView: (view: View) => void
  /** Open the command palette — everything not in this bar lives there. */
  onOpenCommands: () => void
}

// In reading order. Order matters: it's the order the segments appear in, and
// the order the arrow keys walk.
const VIEWS: ViewOption<View>[] = [
  { key: 'editor', icon: <PenIcon />, label: 'Editor' },
  { key: 'preview', icon: <PagesIcon />, label: 'Preview' },
]

/**
 * The workspace's top bar.
 *
 * Deliberately short. It used to carry four unrelated classes of control in one
 * flat row — what you're editing, whether it's saved, what the panes are doing,
 * and half a dozen document operations — with "New version" in the accent
 * colour, making the app's rarest action its loudest. Everything in that last
 * class now lives in the command palette (⌘K), leaving three things here:
 *
 *   identity  — which script and draft you're in
 *   status    — whether your words are safe
 *   view      — the script, or the pages
 *
 * plus the door to everything else. The save control stays because it answers a
 * question a writer asks constantly and can't afford to go looking for.
 */
export function VersionBar({
  projectName,
  versions,
  selectedVersionId,
  dirty,
  saving,
  savedAt,
  onSelectVersion,
  onSave,
  onToggleNav,
  view,
  onSetView,
  onOpenCommands,
}: VersionBarProps) {
  const savedTime =
    savedAt !== null
      ? new Date(savedAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null

  // versions[] is most-recent-first, so index 0 is the latest.
  const latestId = versions.length > 0 ? versions[0].file.id : null

  // One slot rather than a button plus a timestamp beside it: the three states
  // are mutually exclusive, so they belong in one place.
  const status = saving ? 'Saving…' : dirty ? 'Unsaved' : 'Saved'

  return (
    <div className="verbar">
      {/* Mobile only: opens the project drawer, inline at the bar's left. */}
      <button
        type="button"
        className="verbar__nav"
        onClick={onToggleNav}
        aria-label="Show project"
        title="Show project"
      >
        <MenuIcon />
      </button>

      <div className="verbar__identity">
        <span className="verbar__project" title={projectName}>
          {projectName}
        </span>
        <span className="verbar__sep" aria-hidden="true">
          /
        </span>
        <select
          className="verbar__select"
          value={selectedVersionId ?? ''}
          aria-label="Draft"
          onChange={(e) => onSelectVersion(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v.file.id} value={v.file.id}>
              {v.label}
              {v.file.id === latestId ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Clickable only when there's something to save; otherwise it's a
          status read-out, not a control that does nothing when pressed. */}
      <button
        type="button"
        className={`verbar__status verbar__status--${
          saving ? 'saving' : dirty ? 'dirty' : 'clean'
        }`}
        onClick={onSave}
        disabled={saving || !dirty}
        title={
          savedTime !== null
            ? `Last saved ${savedTime} — auto-saves in the background; ⌘/Ctrl+S to save now`
            : 'Auto-saves in the background; ⌘/Ctrl+S to save now'
        }
      >
        <span className="verbar__status-dot" aria-hidden="true" />
        <span className="verbar__status-text">{status}</span>
      </button>

      <div className="verbar__spacer" />

      {/*
        One control at every width. The editor formats in place now, so there
        is no split to size and nothing to expand over anything else — the pair
        of pane toggles plus a zoom button that this bar used to carry were
        three controls describing four states, and they collapse to this.
      */}
      <ViewSwitch
        value={view}
        options={VIEWS}
        onChange={onSetView}
        label="View"
      />

      <button
        type="button"
        className="verbar__commands"
        onClick={onOpenCommands}
        aria-haspopup="dialog"
        aria-label="Commands"
        title="Commands (⌘/Ctrl+K)"
      >
        <CommandIcon />
        <span className="verbar__commands-key" aria-hidden="true">
          K
        </span>
      </button>
    </div>
  )
}
