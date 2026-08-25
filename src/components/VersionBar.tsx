import { useEffect, useRef, useState } from 'react'
import type { Version } from '../drive/versions'
import './VersionBar.css'

export type MobileView = 'editor' | 'preview' | 'notes'

interface VersionBarProps {
  projectName: string
  versions: Version[]
  selectedVersionId: string | null
  busy: boolean
  dirty: boolean
  saving: boolean
  /** Timestamp (ms) of the last successful save this session, or null. */
  savedAt: number | null
  onSelectVersion: (fileId: string) => void
  onSave: () => void
  onNewVersion: () => void
  onExportPdf: () => void
  /** Open the project drawer (mobile only; the button is hidden on desktop). */
  onToggleNav: () => void
  /** Current mobile view; drives the cycle control (mobile only). */
  mobileView: MobileView
  /** Advance Editor → Preview → Notes → Editor (mobile only). */
  onCycleView: () => void
  /** Jump straight to a view (mobile long-press menu). */
  onSetView: (view: MobileView) => void
  /** Re-fit the preview page to the pane (mobile options menu). */
  onFit: () => void
  /** Whether the script defines any sections (shows the Sections toggle). */
  sectionsAvailable: boolean
  showSections: boolean
  onToggleSections: () => void
}

const VIEWS: { key: MobileView; glyph: string; label: string }[] = [
  { key: 'editor', glyph: '✏️', label: 'Editor' },
  { key: 'preview', glyph: '📄', label: 'Preview' },
  { key: 'notes', glyph: '🗒️', label: 'Notes' },
]

/** Top bar over the editor: current project, version selector, save/new version. */
export function VersionBar({
  projectName,
  versions,
  selectedVersionId,
  busy,
  dirty,
  saving,
  savedAt,
  onSelectVersion,
  onSave,
  onNewVersion,
  onExportPdf,
  onToggleNav,
  mobileView,
  onCycleView,
  onSetView,
  onFit,
  sectionsAvailable,
  showSections,
  onToggleSections,
}: VersionBarProps) {
  // Mobile only: an options menu collapsing the less-frequent actions behind a
  // single button, and a view menu opened by long-pressing the cycle control.
  const [menuOpen, setMenuOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  // Long-press detection for the cycle control: a held press opens the view
  // menu; a quick tap cycles to the next view.
  const pressTimer = useRef(0)
  const longPressed = useRef(false)

  useEffect(() => {
    if (!menuOpen && !viewMenuOpen) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current !== null && !menuRef.current.contains(t)) setMenuOpen(false)
      if (viewMenuRef.current !== null && !viewMenuRef.current.contains(t)) {
        setViewMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setViewMenuOpen(false)
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, viewMenuOpen])

  const startPress = () => {
    longPressed.current = false
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true
      setViewMenuOpen(true)
    }, 400)
  }
  const endPress = () => {
    if (pressTimer.current !== 0) {
      clearTimeout(pressTimer.current)
      pressTimer.current = 0
    }
    if (!longPressed.current) onCycleView()
  }
  const cancelPress = () => {
    if (pressTimer.current !== 0) {
      clearTimeout(pressTimer.current)
      pressTimer.current = 0
    }
  }

  const saveLabel = saving ? 'Saving…' : dirty ? 'Save' : 'Saved'
  const savedTime =
    savedAt !== null
      ? new Date(savedAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null
  // versions[] is most-recent-first, so index 0 is the latest.
  const latestId = versions.length > 0 ? versions[0].file.id : null

  const current = VIEWS.find((v) => v.key === mobileView) ?? VIEWS[0]
  // The options menu is for the script views; in the notes view it's hidden.
  const optionsVisible = mobileView !== 'notes'

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
        ☰
      </button>

      <span className="verbar__project" title={projectName}>
        {projectName}
      </span>

      <label className="verbar__version">
        <span className="verbar__label">Version</span>
        <select
          className="verbar__select"
          value={selectedVersionId ?? ''}
          onChange={(e) => onSelectVersion(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v.file.id} value={v.file.id}>
              {v.label}
              {v.file.id === latestId ? ' (latest)' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="verbar__spacer" />

      {savedTime !== null && !saving && (
        <span className="verbar__saved-at" title={`Last saved at ${savedTime}`}>
          Last saved {savedTime}
        </span>
      )}

      <button
        type="button"
        className="verbar__btn"
        onClick={onSave}
        disabled={saving || !dirty}
        title="Auto-saves in the background; ⌘/Ctrl+S or click to save now"
      >
        {saveLabel}
      </button>
      <button
        type="button"
        className="verbar__btn verbar__btn--inline-action"
        onClick={onExportPdf}
        disabled={busy || saving}
        title="Render the current preview to a PDF, stored beside the versions"
      >
        Export PDF
      </button>
      <button
        type="button"
        className="verbar__btn verbar__btn--primary verbar__btn--inline-action"
        onClick={onNewVersion}
        disabled={busy || saving}
        title="Snapshot the current text as a new version"
      >
        New version
      </button>

      {/* Mobile only: Export PDF / New version (+ Fit / Sections in preview)
          collapse into this menu. Hidden in the notes view. */}
      {optionsVisible && (
        <div className="verbar__menu" ref={menuRef}>
          <button
            type="button"
            className="verbar__btn verbar__options"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={busy || saving}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More options"
            title="More options"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="verbar__popup" role="menu">
              <button
                type="button"
                className="verbar__popup-item"
                role="menuitem"
                disabled={busy || saving}
                onClick={() => {
                  setMenuOpen(false)
                  onExportPdf()
                }}
              >
                Export PDF
              </button>
              <button
                type="button"
                className="verbar__popup-item"
                role="menuitem"
                disabled={busy || saving}
                onClick={() => {
                  setMenuOpen(false)
                  onNewVersion()
                }}
              >
                New version
              </button>
              {mobileView === 'preview' && (
                <>
                  <div className="verbar__popup-divider" aria-hidden="true" />
                  <button
                    type="button"
                    className="verbar__popup-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      onFit()
                    }}
                  >
                    Fit to screen
                  </button>
                  {sectionsAvailable && (
                    <button
                      type="button"
                      className="verbar__popup-item"
                      role="menuitemcheckbox"
                      aria-checked={showSections}
                      onClick={() => {
                        setMenuOpen(false)
                        onToggleSections()
                      }}
                    >
                      {showSections ? '✓ ' : ''}Sections
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mobile only, rightmost: one control cycles Editor → Preview → Notes
          (tap); a long-press opens a menu to jump straight to any view. */}
      <div className="verbar__viewcycle" ref={viewMenuRef}>
        <button
          type="button"
          className="verbar__btn verbar__view"
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
          aria-haspopup="menu"
          aria-label={`View: ${current.label}. Tap to switch, hold to choose.`}
          title={`${current.label} — tap to switch, hold to choose`}
        >
          <span aria-hidden="true">{current.glyph}</span>
          <span className="verbar__view-label">{current.label}</span>
        </button>
        {viewMenuOpen && (
          <div className="verbar__popup" role="menu">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                className={`verbar__popup-item${
                  v.key === mobileView ? ' verbar__popup-item--active' : ''
                }`}
                role="menuitemradio"
                aria-checked={v.key === mobileView}
                onClick={() => {
                  setViewMenuOpen(false)
                  onSetView(v.key)
                }}
              >
                <span aria-hidden="true">{v.glyph}</span> {v.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
