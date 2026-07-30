import type { DriveFile } from '../drive/files'
import './FileNav.css'

interface FileNavProps {
  folderName: string
  files: DriveFile[]
  selectedId: string | null
  loading: boolean
  collapsed: boolean
  onToggle: () => void
  onSelect: (file: DriveFile) => void
  onChangeFolder: () => void
}

/** Collapsible left panel: the working folder and its selectable files. */
export function FileNav({
  folderName,
  files,
  selectedId,
  loading,
  collapsed,
  onToggle,
  onSelect,
  onChangeFolder,
}: FileNavProps) {
  if (collapsed) {
    return (
      <aside className="filenav filenav--collapsed">
        <button
          type="button"
          className="filenav__icon-btn"
          title="Show files"
          onClick={onToggle}
        >
          ☰
        </button>
      </aside>
    )
  }

  return (
    <aside className="filenav">
      <div className="filenav__header">
        <span className="filenav__folder" title={folderName}>
          <span aria-hidden="true">📁</span> {folderName}
        </span>
        <button
          type="button"
          className="filenav__icon-btn"
          title="Hide panel"
          onClick={onToggle}
        >
          ‹
        </button>
      </div>

      <button type="button" className="filenav__change" onClick={onChangeFolder}>
        Change folder
      </button>

      <div className="filenav__list">
        {loading ? (
          <p className="filenav__msg">Loading…</p>
        ) : files.length === 0 ? (
          <p className="filenav__msg">This folder has no files yet.</p>
        ) : (
          files.map((file) => (
            <button
              key={file.id}
              type="button"
              className={`filenav__file${
                file.id === selectedId ? ' is-selected' : ''
              }`}
              title={file.name}
              onClick={() => onSelect(file)}
            >
              {file.name}
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
