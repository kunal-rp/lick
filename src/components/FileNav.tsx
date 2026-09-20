import type { DriveFile } from '../drive/files'
import { listPdfs, parseVersions } from '../drive/versions'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FilePdfIcon,
  FileTextIcon,
  FolderIcon,
  TrashIcon,
} from './icons'
import './FileNav.css'

interface FileNavProps {
  folderName: string
  projects: DriveFile[]
  versionsByProject: Record<string, DriveFile[]>
  expandedProjects: Set<string>
  selectedProjectId: string | null
  selectedVersionId: string | null
  loading: boolean
  busy: boolean
  onToggleExpand: (projectId: string) => void
  onSelectProject: (project: DriveFile) => void
  onSelectVersion: (projectId: string, versionId: string) => void
  onDeleteVersion: (projectId: string, versionId: string) => void
  onNewProject: () => void
  onChangeFolder: () => void
}

/**
 * The sidebar's Files tab: the whole working folder as a tree — project folders
 * with their drafts nested underneath.
 *
 * The panel chrome it used to carry (brand header, collapse button, theme
 * toggle, backdrop) now belongs to the Sidebar shell, which wraps all four
 * tabs; this is just the body.
 */
export function FileNav({
  folderName,
  projects,
  versionsByProject,
  expandedProjects,
  selectedProjectId,
  selectedVersionId,
  loading,
  busy,
  onToggleExpand,
  onSelectProject,
  onSelectVersion,
  onDeleteVersion,
  onNewProject,
  onChangeFolder,
}: FileNavProps) {
  return (
    <div className="filenav">
      <div className="filenav__actions">
        <button
          type="button"
          className="filenav__action"
          onClick={onNewProject}
          disabled={busy}
        >
          + New project
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
        <div className="tree__root" title={folderName}>
          <FolderIcon /> {folderName}
        </div>
        {loading ? (
          <p className="filenav__msg">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="filenav__msg">No projects yet. Create one above.</p>
        ) : (
          <div className="tree__children">
          {projects.map((project) => {
            const expanded = expandedProjects.has(project.id)
            const files = versionsByProject[project.id] ?? []
            const versions = parseVersions(files)
            const pdfs = listPdfs(files)
            const latestId = versions[0]?.file.id ?? null
            return (
              <div key={project.id} className="tree__project">
                <div
                  className={`tree__row${
                    project.id === selectedProjectId ? ' is-active' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="tree__twisty"
                    title={expanded ? 'Collapse' : 'Expand'}
                    onClick={() => onToggleExpand(project.id)}
                  >
                    {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                  </button>
                  <button
                    type="button"
                    className="tree__label"
                    title={project.name}
                    onClick={() => onSelectProject(project)}
                  >
                    <FolderIcon /> {project.name}
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
                            onClick={() => onSelectVersion(project.id, v.file.id)}
                          >
                            <FileTextIcon /> {v.label}
                            {v.file.id === latestId ? ' (latest)' : ''}
                          </button>
                          <button
                            type="button"
                            className="tree__delete"
                            title="Delete version"
                            disabled={busy}
                            onClick={() => onDeleteVersion(project.id, v.file.id)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      ))
                    )}

                    {/* PDF exports: listed for reference, not selectable. */}
                    {pdfs.map((p) => (
                      <div
                        key={p.file.id}
                        className="tree__pdf-row"
                        title={p.file.name}
                        aria-disabled="true"
                      >
                        <span className="tree__pdf">
                          <FilePdfIcon /> {p.label}
                        </span>
                        <span className="tree__pdf-tag">PDF</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          </div>
        )}
      </div>
    </div>
  )
}
