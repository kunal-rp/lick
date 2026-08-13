import { useMemo, useState } from 'react'
import type { HistorySnapshot } from '../history'
import { collapseUnchanged, diffLines, diffSummary } from '../diff'
import './HistoryPanel.css'

interface HistoryPanelProps {
  /** Snapshots for the open version, chronological (oldest first). */
  snapshots: HistorySnapshot[]
  /** The editor's current text, to diff snapshots against. */
  currentText: string
  /** Restore a snapshot's text into the editor (non-destructive). */
  onRestore: (snap: HistorySnapshot) => void
  onClose: () => void
  busy: boolean
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
 * A right-side drawer listing the recent edit snapshots of the open version.
 * Each entry shows when it was taken and how it differs from the current text;
 * expanding one reveals the line diff, and Restore loads it back into the editor.
 */
export function HistoryPanel({
  snapshots,
  currentText,
  onRestore,
  onClose,
  busy,
}: HistoryPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // A stable "now" for this render, so all relative times agree.
  const now = useMemo(() => Date.now(), [snapshots, currentText])

  // Newest first for display.
  const ordered = useMemo(() => [...snapshots].reverse(), [snapshots])

  return (
    <aside className="history" role="dialog" aria-label="Edit history">
      <div className="history__head">
        <span className="history__title">Edit history</span>
        <button
          type="button"
          className="history__close"
          onClick={onClose}
          aria-label="Close history"
          title="Close"
        >
          ×
        </button>
      </div>

      {ordered.length === 0 ? (
        <p className="history__empty">
          No history yet. As you edit, snapshots are captured here so you can
          look back and restore any point.
        </p>
      ) : (
        <ul className="history__list">
          {ordered.map((snap) => {
            const isCurrent = snap.text === currentText
            const { added, removed } = diffSummary(snap.text, currentText)
            const expanded = expandedId === snap.id
            return (
              <li key={snap.id} className="history__item">
                <button
                  type="button"
                  className="history__row"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedId((id) => (id === snap.id ? null : snap.id))
                  }
                >
                  <span className="history__chevron">{expanded ? '▾' : '▸'}</span>
                  <span className={`history__badge history__badge--${snap.kind}`}>
                    {KIND_LABEL[snap.kind]}
                  </span>
                  <span className="history__when">
                    {relativeTime(snap.createdAt, now)}
                  </span>
                  <span className="history__delta">
                    {isCurrent ? (
                      <span className="history__current">current</span>
                    ) : (
                      <>
                        {added > 0 && (
                          <span className="history__add">+{added}</span>
                        )}
                        {removed > 0 && (
                          <span className="history__del">−{removed}</span>
                        )}
                      </>
                    )}
                  </span>
                </button>

                {expanded && (
                  <div className="history__detail">
                    {isCurrent ? (
                      <p className="history__nochange">
                        This is the current text.
                      </p>
                    ) : (
                      <pre className="history__diff">
                        {collapseUnchanged(
                          diffLines(snap.text, currentText),
                        ).map((l, i) =>
                          l.op === 'gap' ? (
                            <div key={i} className="history__diff-gap">
                              ⋯ {l.count} unchanged line{l.count === 1 ? '' : 's'}
                            </div>
                          ) : (
                            <div
                              key={i}
                              className={`history__diff-line history__diff-line--${l.op}`}
                            >
                              <span className="history__diff-gutter">
                                {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
                              </span>
                              {l.text || ' '}
                            </div>
                          ),
                        )}
                      </pre>
                    )}
                    <div className="history__actions">
                      <button
                        type="button"
                        className="history__btn history__btn--primary"
                        disabled={isCurrent || busy}
                        onClick={() => onRestore(snap)}
                        title={
                          isCurrent
                            ? 'Already the current text'
                            : 'Load this text back into the editor'
                        }
                      >
                        Restore this version
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
