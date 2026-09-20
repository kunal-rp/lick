import type { Version } from '../drive/versions'
import type { RightTab } from '../layout'
import { ViewSwitch, type ViewOption } from './ViewSwitch'
import {
  CollapseIcon,
  CommandIcon,
  ExpandIcon,
  MenuIcon,
  NoteIcon,
  PagesIcon,
  PenIcon,
} from './icons'
import './VersionBar.css'

export type MobileView = 'editor' | 'preview' | 'notes'

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
  /** What the right pane shows, or null when the editor fills the workspace. */
  rightTab: RightTab | null
  /** Pick the right pane's content; picking the active one collapses the pane. */
  onSelectRightTab: (tab: RightTab) => void
  /** Whether the right pane is expanded over the editor. */
  zoomed: boolean
  onToggleZoom: () => void
  /** Current mobile view; drives the segmented control (mobile only). */
  mobileView: MobileView
  /** Switch to a view (mobile only). */
  onSetView: (view: MobileView) => void
  /** Open the command palette — everything not in this bar lives there. */
  onOpenCommands: () => void
}

// Desktop view switcher: the right pane's two occupants, as peers.
const RIGHT_TABS: { key: RightTab; icon: JSX.Element; label: string }[] = [
  { key: 'preview', icon: <PagesIcon />, label: 'Preview' },
  { key: 'notes', icon: <NoteIcon />, label: 'Notes' },
]

// Mobile destinations, in reading order. Order matters: it's the order the
// segments appear in, and the order the arrow keys walk.
const VIEWS: ViewOption<MobileView>[] = [
  { key: 'editor', icon: <PenIcon />, label: 'Editor' },
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
 *   view      — what the workspace is showing
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
  rightTab,
  onSelectRightTab,
  zoomed,
  onToggleZoom,
  mobileView,
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

      {/* Desktop view controls. These live here, in the app's own chrome,
          rather than inside the editor's text toolbar: what occupies the right
          pane is workspace state, not something you do to the document. Hidden
          on mobile, where the segmented control at the far right does it. */}
      <div className="verbar__views" role="group" aria-label="Right pane">
        {RIGHT_TABS.map((t) => {
          const active = rightTab === t.key
          return (
            <button
              key={t.key}
              type="button"
              className={`verbar__view-btn${
                active ? ' verbar__view-btn--active' : ''
              }`}
              onClick={() => onSelectRightTab(t.key)}
              aria-pressed={active}
              title={
                active
                  ? `Hide ${t.label.toLowerCase()} and let the editor fill the window`
                  : `Show ${t.label.toLowerCase()} beside the editor`
              }
            >
              {t.icon}
              <span className="verbar__view-btn-label">{t.label}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={`verbar__view-btn verbar__view-btn--zoom${
            zoomed ? ' verbar__view-btn--active' : ''
          }`}
          onClick={onToggleZoom}
          disabled={rightTab === null}
          aria-pressed={zoomed}
          aria-label={zoomed ? 'Restore the split' : 'Expand the right pane'}
          title={
            rightTab === null
              ? 'Nothing to expand — the editor already fills the window'
              : zoomed
                ? 'Back to the split view'
                : 'Expand over the editor for a full-window view'
          }
        >
          {zoomed ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      </div>

      {/* Mobile only, rightmost: every destination visible, one tap each. */}
      <div className="verbar__viewswitch">
        <ViewSwitch
          value={mobileView}
          options={VIEWS}
          onChange={onSetView}
          label="View"
        />
      </div>

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
