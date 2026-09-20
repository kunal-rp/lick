import { ViewSwitch, type ViewOption } from './ViewSwitch'
import type { Companion } from '../layout'
import { CommandIcon, MenuIcon, NoteIcon, PagesIcon, PenIcon } from './icons'
import './VersionBar.css'



interface VersionBarProps {
  projectName: string
  /** Label of the open draft, e.g. "v3". */
  draftLabel: string
  /** Open the Drafts panel — switching draft is that surface's job now. */
  onOpenDrafts: () => void
  dirty: boolean
  saving: boolean
  /** Timestamp (ms) of the last successful save this session, or null. */
  savedAt: number | null
  onSave: () => void
  /** Open the project drawer (mobile only; the button is hidden on desktop). */
  onToggleNav: () => void
  /**
   * What sits beside the editor. On a phone there's no room for two panes, so
   * the same value picks which single pane fills the screen — one control and
   * one value describing both densities, which is what keeps them from
   * drifting apart.
   */
  companion: Companion
  onSetCompanion: (companion: Companion) => void
  /** Open the command palette — everything not in this bar lives there. */
  onOpenCommands: () => void
}

// In reading order. Order matters: it's the order the segments appear in, and
// the order the arrow keys walk.
//
// "Editor" is the full-width option — it reads as a destination on a phone and
// as "nothing beside the script" on a desktop, and it's listed as its own
// segment on purpose. The pane toggles this replaced hid that state behind
// clicking whichever tab was already active.
const COMPANIONS: ViewOption<Companion>[] = [
  { key: 'none', icon: <PenIcon />, label: 'Editor' },
  { key: 'preview', icon: <PagesIcon />, label: 'Preview' },
  { key: 'notes', icon: <NoteIcon />, label: 'Notes' },
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
 *   companion — what sits beside the script, if anything
 *
 * plus the door to everything else. The save control stays because it answers a
 * question a writer asks constantly and can't afford to go looking for.
 */
export function VersionBar({
  projectName,
  draftLabel,
  onOpenDrafts,
  dirty,
  saving,
  savedAt,
  onSave,
  onToggleNav,
  companion,
  onSetCompanion,
  onOpenCommands,
}: VersionBarProps) {
  const savedTime =
    savedAt !== null
      ? new Date(savedAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null

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
        {/*
          A breadcrumb, not a picker. Switching draft used to be a <select>
          here, which made "which draft" a top-bar form field while its
          history lived in a dialog somewhere else entirely. Both are the
          Drafts panel's now, so this just says where you are and opens it.
        */}
        <button
          type="button"
          className="verbar__draft"
          onClick={onOpenDrafts}
          title="Drafts & history"
        >
          {draftLabel}
        </button>
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
        One control at every width, over one value. This bar used to carry two
        pane toggles plus a zoom button — three controls describing four
        states, where collapsing the pane meant clicking the tab that was
        already selected.
      */}
      <ViewSwitch
        value={companion}
        options={COMPANIONS}
        onChange={onSetCompanion}
        label="Beside the editor"
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
