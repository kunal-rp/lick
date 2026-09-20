import type { DriveFile } from '../drive/files'
import { FolderIcon } from './icons'
import './FileNav.css'

interface FileNavProps {
  folderName: string
  projects: DriveFile[]
  selectedProjectId: string | null
  loading: boolean
  busy: boolean
  onSelectProject: (project: DriveFile) => void
  onNewProject: () => void
  onChangeFolder: () => void
}

/**
 * The sidebar's Files tab: the working folder's projects.
 *
 * Just the scripts now. Drafts used to hang off each project here *and* be
 * chosen from a dropdown in the top bar *and* have their history in a separate
 * dialog; they're all one surface in the Drafts tab. This tab answers the only
 * question left: which script am I working on?
 */
export function FileNav({
  folderName,
  projects,
  selectedProjectId,
  loading,
  busy,
  onSelectProject,
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
          {projects.map((project) => (
            <div
              key={project.id}
              className={`tree__row${
                project.id === selectedProjectId ? ' is-active' : ''
              }`}
            >
              <button
                type="button"
                className="tree__label"
                title={project.name}
                onClick={() => onSelectProject(project)}
              >
                <FolderIcon /> {project.name}
              </button>
            </div>
          ))}
          </div>
        )}
      </div>
    </div>
  )
}
