import { useMemo, useState } from 'react'
import type { DriveFile } from '../drive/files'
import type { Version } from '../drive/versions'
import type { HistorySnapshot } from '../history'
import { collapseUnchanged, diffLines, diffSummary } from '../diff'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FilePdfIcon,
  PlusIcon,
  TrashIcon,
} from './icons'
import './DraftsPanel.css'

interface DraftsPanelProps {
  /** The project's drafts, most recent first. */
  drafts: Version[]
  /** PDF exports sitting beside them. */
  pdfs: { file: DriveFile; label: string }[]
  selectedVersionId: string | null
  /** Snapshots for the open draft, chronological (oldest first). */
  snapshots: HistorySnapshot[]
  /** The editor's current text, to diff snapshots against. */
  currentText: string
  busy: boolean
  onSelectDraft: (versionId: string) => void
  onNewDraft: () => void
  onDeleteDraft: (versionId: string) => void
  onRestore: (snap: HistorySnapshot) => void
}

const KIND_LABEL: Record<HistorySnapshot['kind'], string> = {
  auto: 'Edit',
  manual: 'Saved',
  restore: 'Restored',
}

/** Relative time like "just now", "5m ago", "2h ago", or a date. */
function relativeTime(then: number, now: number): string {
  const secs = Math.max(0, Math.round((now - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * Every version of the open script, in one place.
 *
 * The app used to keep three separate ideas for one thing. "Versions" were
 * Drive files picked from a dropdown in the top bar. "History" was a set of
 * automatic snapshots living in a modal you reached from the command palette.
 * "Drafts" was what the writing actually is. Nothing told you how the three
 * related, and you couldn't see a draft's history without first making it the
 * open one and then opening a dialog over the top of your script.
 *
 * They're one timeline: drafts you made deliberately, and — under the one
 * you're in — the automatic snapshots taken between them. Restoring a snapshot
 * is the same kind of move as switching draft, so it belongs on the same
 * surface, in the sidebar, beside the files and the outline.
 *
 * Snapshots are only shown under the open draft, because the diff is against
 * the editor's current text; showing them under a draft you aren't in would be
 * comparing two unrelated things and calling the result a change.
 */
export function DraftsPanel({
  drafts,
  pdfs,
  selectedVersionId,
  snapshots,
  currentText,
  busy,
  onSelectDraft,
  onNewDraft,
  onDeleteDraft,
  onRestore,
}: DraftsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // A stable "now" for this render, so all the relative times agree.
  const now = useMemo(() => Date.now(), [snapshots, currentText])
  // Newest first, matching the drafts above them.
  const ordered = useMemo(() => [...snapshots].reverse(), [snapshots])

  const latestId = drafts[0]?.file.id ?? null

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
            return (
              <li key={d.file.id} className="drafts__item">
                <div className={`drafts__row${open ? ' is-open' : ''}`}>
                  <button
                    type="button"
                    className="drafts__label"
                    onClick={() => onSelectDraft(d.file.id)}
                    title={d.file.name}
                  >
                    <span className="drafts__name">{d.label}</span>
                    {d.file.id === latestId && (
                      <span className="drafts__tag">latest</span>
                    )}
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

                {/* The open draft's automatic history, inline underneath it. */}
                {open && (
                  <div className="drafts__history">
                    {ordered.length === 0 ? (
                      <p className="drafts__nohistory">
                        No edits recorded yet. As you write, snapshots are kept
                        here so you can look back.
                      </p>
                    ) : (
                      ordered.map((snap) => {
                        const isCurrent = snap.text === currentText
                        const { added, removed } = diffSummary(
                          snap.text,
                          currentText,
                        )
                        const isExpanded = expandedId === snap.id
                        return (
                          <div key={snap.id} className="snap">
                            <button
                              type="button"
                              className="snap__row"
                              aria-expanded={isExpanded}
                              onClick={() =>
                                setExpandedId((id) =>
                                  id === snap.id ? null : snap.id,
                                )
                              }
                            >
                              <span className="snap__chevron">
                                {isExpanded ? (
                                  <ChevronDownIcon />
                                ) : (
                                  <ChevronRightIcon />
                                )}
                              </span>
                              <span className={`snap__badge snap__badge--${snap.kind}`}>
                                {KIND_LABEL[snap.kind]}
                              </span>
                              <span className="snap__when">
                                {relativeTime(snap.createdAt, now)}
                              </span>
                              <span className="snap__delta">
                                {isCurrent ? (
                                  <span className="snap__current">current</span>
                                ) : (
                                  <>
                                    {added > 0 && (
                                      <span className="snap__add">+{added}</span>
                                    )}
                                    {removed > 0 && (
                                      <span className="snap__del">−{removed}</span>
                                    )}
                                  </>
                                )}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="snap__detail">
                                {isCurrent ? (
                                  <p className="snap__nochange">
                                    This is the current text.
                                  </p>
                                ) : (
                                  <pre className="snap__diff">
                                    {collapseUnchanged(
                                      diffLines(snap.text, currentText),
                                    ).map((l, i) =>
                                      l.op === 'gap' ? (
                                        <div key={i} className="snap__diff-gap">
                                          ⋯ {l.count} unchanged line
                                          {l.count === 1 ? '' : 's'}
                                        </div>
                                      ) : (
                                        <div
                                          key={i}
                                          className={`snap__diff-line snap__diff-line--${l.op}`}
                                        >
                                          <span className="snap__diff-gutter">
                                            {l.op === 'add'
                                              ? '+'
                                              : l.op === 'del'
                                                ? '−'
                                                : ' '}
                                          </span>
                                          {l.text || ' '}
                                        </div>
                                      ),
                                    )}
                                  </pre>
                                )}
                                <button
                                  type="button"
                                  className="snap__restore"
                                  disabled={isCurrent || busy}
                                  onClick={() => onRestore(snap)}
                                  title={
                                    isCurrent
                                      ? 'Already the current text'
                                      : 'Load this text back into the editor'
                                  }
                                >
                                  Restore this text
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
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
