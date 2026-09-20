import type { Version } from '../drive/versions'
import { ViewSwitch, type ViewOption } from './ViewSwitch'
import {
  CollapseIcon,
  CommandIcon,
  ExpandIcon,
  MenuIcon,
  PagesIcon,
  PenIcon,
} from './icons'
import './VersionBar.css'

/**
 * Mobile destinations. Notes is absent on purpose: it moved into the sidebar
 * drawer with the files, outline and cast, leaving this control to answer the
 * one question it should — am I writing, or reading pages?
 */
export type MobileView = 'editor' | 'preview'

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
  /** Whether the preview pane sits beside the editor. */
  showPreview: boolean
  onTogglePreview: () => void
  /** Whether the preview is expanded over the editor. */
  zoomed: boolean
  onToggleZoom: () => void
  /** Current mobile view; drives the segmented control (mobile only). */
  mobileView: MobileView
  /** Switch to a view (mobile only). */
  onSetView: (view: MobileView) => void
  /** Open the command palette — everything not in this bar lives there. */
  onOpenCommands: () => void
}

// Mobile destinations, in reading order. Order matters: it's the order the
// segments appear in, and the order the arrow keys walk.
const VIEWS: ViewOption<MobileView>[] = [
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
  showPreview,
  onTogglePreview,
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
          rather than inside the editor's text toolbar: whether the pages are
          showing is workspace state, not something you do to the document.
          Hidden on mobile, where the segmented control does it. */}
      <div className="verbar__views" role="group" aria-label="Preview">
        <button
          type="button"
          className={`verbar__view-btn${
            showPreview ? ' verbar__view-btn--active' : ''
          }`}
          onClick={onTogglePreview}
          aria-pressed={showPreview}
          title={
            showPreview
              ? 'Hide the pages and let the editor fill the window'
              : 'Show the pages beside the editor'
          }
        >
          <PagesIcon />
          <span className="verbar__view-btn-label">Preview</span>
        </button>
        <button
          type="button"
          className={`verbar__view-btn verbar__view-btn--zoom${
            zoomed ? ' verbar__view-btn--active' : ''
          }`}
          onClick={onToggleZoom}
          disabled={!showPreview}
          aria-pressed={zoomed}
          aria-label={zoomed ? 'Restore the split' : 'Expand the preview'}
          title={
            !showPreview
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
