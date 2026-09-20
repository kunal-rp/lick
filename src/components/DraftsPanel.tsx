import type { DriveFile } from '../drive/files'
import type { Version } from '../drive/versions'
import { FilePdfIcon, LayersIcon, PlusIcon, TrashIcon } from './icons'
import './DraftsPanel.css'

interface DraftsPanelProps {
  /** The project's drafts, most recent first. */
  drafts: Version[]
  /** PDF exports sitting beside them. */
  pdfs: { file: DriveFile; label: string }[]
  selectedVersionId: string | null
  /** The draft whose changes are currently being shown, if any. */
  comparingId: string | null
  busy: boolean
  onSelectDraft: (versionId: string) => void
  onNewDraft: () => void
  onDeleteDraft: (versionId: string) => void
  /** Show what this draft changed, against the draft before it. */
  onShowChanges: (versionId: string) => void
}

/**
 * Every draft of the open script.
 *
 * This used to also be a snapshot timeline: each draft expanded into the
 * automatic saves taken while writing it, and each of those into a patch with
 * its own Restore button. That put review at the wrong level. Snapshots record
 * when you happened to stop typing; drafts record what you decided. Three
 * layers of nesting to reach a diff of something you never chose to create is
 * a lot of interface for very little.
 *
 * So history is per draft: open one, or see what it changed. There's no
 * restore, because a draft is a file — opening it *is* restoring it, and "New
 * draft" carries it forward if you want to keep going from there.
 */
export function DraftsPanel({
  drafts,
  pdfs,
  selectedVersionId,
  comparingId,
  busy,
  onSelectDraft,
  onNewDraft,
  onDeleteDraft,
  onShowChanges,
}: DraftsPanelProps) {
  const latestId = drafts[0]?.file.id ?? null
  // The oldest draft has nothing before it to compare against.
  const oldestId = drafts[drafts.length - 1]?.file.id ?? null

  return (
    <div className="drafts">
      <div className="drafts__actions">
        <button
          type="button"
          className="drafts__new"
          onClick={onNewDraft}
          disabled={busy}
          title="Snapshot the current text as a new draft"
        >
          <PlusIcon />
          New draft
        </button>
      </div>

      {drafts.length === 0 ? (
        <p className="drafts__empty">No drafts yet.</p>
      ) : (
        <ul className="drafts__list">
          {drafts.map((d) => {
            const open = d.file.id === selectedVersionId
            const comparing = d.file.id === comparingId
            const first = d.file.id === oldestId
            return (
              <li key={d.file.id} className="drafts__item">
                <div
                  className={`drafts__row${open ? ' is-open' : ''}${
                    comparing ? ' is-comparing' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="drafts__label"
                    onClick={() => onSelectDraft(d.file.id)}
                    title={`Open ${d.file.name}`}
                  >
                    <span className="drafts__name">{d.label}</span>
                    {d.file.id === latestId && (
                      <span className="drafts__tag">latest</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="drafts__changes"
                    onClick={() => onShowChanges(d.file.id)}
                    disabled={first}
                    aria-label={`Changes in ${d.label}`}
                    title={
                      first
                        ? 'The first draft — nothing before it to compare'
                        : 'See what this draft changed'
                    }
                  >
                    <LayersIcon />
                  </button>
                  <button
                    type="button"
                    className="drafts__delete"
                    onClick={() => onDeleteDraft(d.file.id)}
                    disabled={busy}
                    aria-label={`Delete ${d.label}`}
                    title="Delete draft"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Exports live with the drafts they were made from, not in the file
          tree — they're an output of a draft, not another thing to open. */}
      {pdfs.length > 0 && (
        <div className="drafts__exports">
          <div className="drafts__exports-head">Exports</div>
          {pdfs.map((p) => (
            <div key={p.file.id} className="drafts__pdf" title={p.file.name}>
              <FilePdfIcon />
              <span className="drafts__pdf-label">{p.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
