import { useEffect, useRef, useState } from 'react'
import type { Comment, CommentAnchor } from '../comments'
import './CommentsRail.css'

// Comment UI pieces. Comments render in the preview's right gutter, each card
// anchored beside the text it refers to (see Preview.tsx for the positioning).
// This module exports the compose box and the card; the layout that places them
// lives with the preview, which owns the page measurements.

export function CommentCompose({
  anchor,
  onCreate,
  onCancel,
}: {
  anchor: CommentAnchor
  onCreate: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const submit = () => {
    const trimmed = text.trim()
    if (trimmed !== '') onCreate(trimmed)
  }

  return (
    <div className="comments__card comments__card--compose">
      <p className="comments__quote">“{anchor.quote}”</p>
      <textarea
        ref={ref}
        className="comments__input"
        placeholder="Add a comment…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
        }}
      />
      <div className="comments__actions">
        <button type="button" className="comments__btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="comments__btn comments__btn--primary"
          onClick={submit}
          disabled={text.trim() === ''}
        >
          Comment
        </button>
      </div>
    </div>
  )
}

export function CommentCard({
  comment,
  broken,
  authorName,
  flash,
  onEdit,
  onDelete,
  onFocus,
  onLayoutChange,
}: {
  comment: Comment
  broken: boolean
  authorName: string
  /** Briefly highlight the card (e.g. when its text is selected in the page). */
  flash: boolean
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  onFocus: (comment: Comment) => void
  /** Fired when the card's height may have changed, so the gutter can re-flow. */
  onLayoutChange: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.text)

  const author = comment.author ?? authorName

  // Height changes when the card collapses or enters/leaves edit mode; let the
  // gutter re-flow so cards below don't overlap.
  useEffect(() => {
    onLayoutChange()
  }, [collapsed, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveEdit = () => {
    const trimmed = draft.trim()
    if (trimmed !== '' && trimmed !== comment.text) onEdit(comment.id, trimmed)
    setEditing(false)
  }

  return (
    <div
      className={`comments__card${broken ? ' comments__card--broken' : ''}${
        flash ? ' comments__card--flash' : ''
      }`}
      data-comment-id={comment.id}
    >
      <div className="comments__card-head">
        <button
          type="button"
          className="comments__chevron"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="comments__author">{author}</span>
        {broken && (
          <span
            className="comments__broken-tag"
            title="The text this comment referred to has changed or no longer exists in this version."
          >
            ⚠ Broken
          </span>
        )}
        {!editing && (
          <span className="comments__card-actions">
            <button
              type="button"
              className="comments__link"
              onClick={() => {
                setDraft(comment.text)
                setEditing(true)
                setCollapsed(false)
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="comments__link comments__link--danger"
              onClick={() => onDelete(comment.id)}
            >
              Delete
            </button>
          </span>
        )}
      </div>

      {!collapsed && (
        <>
          <button
            type="button"
            className="comments__quote comments__quote--link"
            onClick={() => onFocus(comment)}
            title="Show in preview"
          >
            “{comment.quote}”
          </button>
          {editing ? (
            <>
              <textarea
                className="comments__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditing(false)
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit()
                }}
              />
              <div className="comments__actions">
                <button
                  type="button"
                  className="comments__btn"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="comments__btn comments__btn--primary"
                  onClick={saveEdit}
                >
                  Save
                </button>
              </div>
            </>
          ) : (
            <p className="comments__text">{comment.text}</p>
          )}
        </>
      )}
    </div>
  )
}
