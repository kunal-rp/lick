import type { DriveFile } from '../drive/files'
import { parseVersions } from '../drive/versions'
import './FileNav.css'

interface FileNavProps {
  folderName: string
  scripts: DriveFile[]
  versionsByScript: Record<string, DriveFile[]>
  expandedScripts: Set<string>
  selectedScriptId: string | null
  selectedVersionId: string | null
  loading: boolean
  busy: boolean
  collapsed: boolean
  onToggle: () => void
  onToggleExpand: (scriptId: string) => void
  onSelectScript: (script: DriveFile) => void
  onSelectVersion: (scriptId: string, versionId: string) => void
  onDeleteVersion: (scriptId: string, versionId: string) => void
  onNewScript: () => void
  onChangeFolder: () => void
}

/**
 * Collapsible left panel showing the full project directory as a tree:
 * script folders with their version files nested underneath.
 */
export function FileNav({
  folderName,
  scripts,
  versionsByScript,
  expandedScripts,
  selectedScriptId,
  selectedVersionId,
  loading,
  busy,
  collapsed,
  onToggle,
  onToggleExpand,
  onSelectScript,
  onSelectVersion,
  onDeleteVersion,
  onNewScript,
  onChangeFolder,
}: FileNavProps) {
  if (collapsed) {
    return (
      <aside className="filenav filenav--collapsed">
        <button
          type="button"
          className="filenav__icon-btn"
          title="Show project"
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

      <div className="filenav__actions">
        <button
          type="button"
          className="filenav__action"
          onClick={onNewScript}
          disabled={busy}
        >
          + New script
        </button>
        <button
          type="button"
          className="filenav__action filenav__action--muted"
          onClick={onChangeFolder}
        >
          Change folder
        </button>
      </div>

      <div className="filenav__tree">
        {loading ? (
          <p className="filenav__msg">Loading…</p>
        ) : scripts.length === 0 ? (
          <p className="filenav__msg">No scripts yet. Create one above.</p>
        ) : (
          scripts.map((script) => {
            const expanded = expandedScripts.has(script.id)
            const versions = parseVersions(versionsByScript[script.id] ?? [])
            const latestId = versions[0]?.file.id ?? null
            return (
              <div key={script.id} className="tree__script">
                <div
                  className={`tree__row${
                    script.id === selectedScriptId ? ' is-active' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="tree__twisty"
                    title={expanded ? 'Collapse' : 'Expand'}
                    onClick={() => onToggleExpand(script.id)}
                  >
                    {expanded ? '▾' : '▸'}
                  </button>
                  <button
                    type="button"
                    className="tree__label"
                    title={script.name}
                    onClick={() => onSelectScript(script)}
                  >
                    <span aria-hidden="true">📁</span> {script.name}
                  </button>
                </div>

                {expanded && (
                  <div className="tree__versions">
                    {versions.length === 0 ? (
                      <p className="tree__empty">no versions</p>
                    ) : (
                      versions.map((v) => (
                        <div
                          key={v.file.id}
                          className={`tree__version-row${
                            v.file.id === selectedVersionId ? ' is-selected' : ''
                          }`}
                        >
                          <button
                            type="button"
                            className="tree__version"
                            title={v.file.name}
                            onClick={() => onSelectVersion(script.id, v.file.id)}
                          >
                            <span aria-hidden="true">📄</span> {v.label}
                            {v.file.id === latestId ? ' (latest)' : ''}
                          </button>
                          <button
                            type="button"
                            className="tree__delete"
                            title="Delete version"
                            disabled={busy}
                            onClick={() => onDeleteVersion(script.id, v.file.id)}
                          >
                            🗑
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
