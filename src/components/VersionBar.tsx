import type { Version } from '../drive/versions'
import './VersionBar.css'

interface VersionBarProps {
  scriptName: string
  versions: Version[]
  selectedVersionId: string | null
  busy: boolean
  dirty: boolean
  saving: boolean
  onSelectVersion: (fileId: string) => void
  onSave: () => void
  onNewVersion: () => void
}

/** Top bar over the editor: current script, version selector, save/new version. */
export function VersionBar({
  scriptName,
  versions,
  selectedVersionId,
  busy,
  dirty,
  saving,
  onSelectVersion,
  onSave,
  onNewVersion,
}: VersionBarProps) {
  const saveLabel = saving ? 'Saving…' : dirty ? 'Save' : 'Saved'
  // versions[] is most-recent-first, so index 0 is the latest.
  const latestId = versions.length > 0 ? versions[0].file.id : null

  return (
    <div className="verbar">
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

      <button
        type="button"
        className="verbar__btn"
        onClick={onSave}
        disabled={saving || !dirty}
        title="Auto-saves in the background; click to save now"
      >
        {saveLabel}
      </button>
      <button
        type="button"
        className="verbar__btn verbar__btn--primary"
        onClick={onNewVersion}
        disabled={busy || saving}
        title="Snapshot the current text as a new version"
      >
        New version
      </button>
    </div>
  )
}
