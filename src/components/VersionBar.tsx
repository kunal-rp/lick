import { useEffect, useRef, useState } from 'react'
import type { Version } from '../drive/versions'
import './VersionBar.css'

interface VersionBarProps {
  scriptName: string
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
}

/** Top bar over the editor: current script, version selector, save/new version. */
export function VersionBar({
  scriptName,
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
}: VersionBarProps) {
  // Mobile only: an options menu collapsing the less-frequent actions
  // (Export PDF, New version) behind a single button in the top bar.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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

      <span className="verbar__script" title={scriptName}>
        {scriptName}
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

      {/* Mobile only: Export PDF and New version collapse into this menu. */}
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
          </div>
        )}
      </div>
    </div>
  )
}
