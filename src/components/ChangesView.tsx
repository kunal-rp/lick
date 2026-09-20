import { useMemo } from 'react'
import { diffSummary, sideBySide } from '../diff'
import { CloseIcon } from './icons'
import './ChangesView.css'

interface ChangesViewProps {
  /** Label of the draft being compared against (the "before"). */
  baseLabel: string
  /** Label of the draft whose changes these are (the "after"). */
  headLabel: string
  /** Text of each side, or null while still loading. */
  base: string | null
  head: string | null
  /** Set when the comparison couldn't be loaded. */
  error?: string | null
  onClose: () => void
}

/**
 * What one draft changed, with the two texts abreast.
 *
 * History used to be a list of automatic snapshots, each of which you expanded
 * to see a single-column patch and could restore individually. That put the
 * unit of review at the wrong level: snapshots are an artefact of when you
 * happened to pause typing, not of anything you decided. Drafts are the
 * decisions, so a draft is what you compare.
 *
 * Side by side rather than stacked because that's the question being asked —
 * not "what lines are in this patch" but "what does this say now, and what did
 * it say before". A changed line sits opposite the line it replaced.
 *
 * Only changed runs are shown, with a few lines of context and a hunk header:
 * a feature draft of a screenplay moves a few scenes, and the ninety pages that
 * didn't move aren't the thing being reviewed.
 */
export function ChangesView({
  baseLabel,
  headLabel,
  base,
  head,
  error = null,
  onClose,
}: ChangesViewProps) {
  const rows = useMemo(
    () => (base === null || head === null ? [] : sideBySide(base, head)),
    [base, head],
  )
  const summary = useMemo(
    () =>
      base === null || head === null
        ? { added: 0, removed: 0 }
        : diffSummary(base, head),
    [base, head],
  )

  const loading = error === null && (base === null || head === null)
  const unchanged = !loading && error === null && rows.length === 0

  return (
    <div className="changes">
      <div className="changes__head">
        <span className="changes__title">
          <span className="changes__draft">{baseLabel}</span>
          <span className="changes__arrow" aria-hidden="true">
            →
          </span>
          <span className="changes__draft">{headLabel}</span>
        </span>
        {!loading && error === null && (
          <span className="changes__summary">
            {summary.added > 0 && (
              <span className="changes__add">+{summary.added}</span>
            )}
            {summary.removed > 0 && (
              <span className="changes__del">−{summary.removed}</span>
            )}
            {summary.added === 0 && summary.removed === 0 && (
              <span className="changes__none">no changes</span>
            )}
          </span>
        )}
        <span className="changes__spacer" />
        <button
          type="button"
          className="changes__close"
          onClick={onClose}
          aria-label="Close changes"
          title="Back to the editor"
        >
          <CloseIcon />
        </button>
      </div>

      {error !== null ? (
        <p className="changes__message changes__message--error">{error}</p>
      ) : loading ? (
        <p className="changes__message">Loading both drafts…</p>
      ) : unchanged ? (
        <p className="changes__message">
          These drafts are identical.
        </p>
      ) : (
        <div className="changes__body">
          {/*
            A grid, not two scrolling columns: the halves must stay in step
            row for row, and letting each side scroll on its own is how a
            side-by-side view stops being one.
          */}
          <div className="changes__grid" role="table" aria-label="Changes">
            {rows.map((row, i) =>
              row.kind === 'hunk' ? (
                <div key={i} className="changes__hunk" role="row">
                  {row.header}
                </div>
              ) : (
                <div key={i} className={`changes__row changes__row--${row.kind}`} role="row">
                  <span className="changes__num">{row.left.num ?? ''}</span>
                  <span className="changes__cell changes__cell--left">
                    {row.left.text}
                  </span>
                  <span className="changes__num">{row.right.num ?? ''}</span>
                  <span className="changes__cell changes__cell--right">
                    {row.right.text}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )
}
