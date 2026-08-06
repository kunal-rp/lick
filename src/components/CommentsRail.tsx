import { useEffect, useRef, useState } from 'react'
import type { Comment, CommentAnchor } from '../comments'
import './CommentsRail.css'

// Comment UI pieces. Comments render in the preview's right margin as small
// markers (see Preview.tsx for the positioning) that expand into these cards.
// This module exports the compose box, the card, and the author avatar shared
// by both the collapsed marker and the expanded card head.

// Muted palette for author avatars — enough hues to tell commenters apart while
// staying legible on the dark card. Keyed by a stable hash of the author name.
const AVATAR_COLORS = [
  '#d9a066',
  '#8fb0c9',
  '#c98a8a',
  '#a8c98a',
  '#b79ad9',
  '#d9c07a',
  '#8ac9c0',
]

function authorColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** A round, color-coded initial for a comment's author. Shared by the collapsed
 *  margin marker and the expanded card head so the two read as one object. */
export function CommentAvatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span
      className="comments__avatar"
      style={{ background: authorColor(name) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  )
}

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
}: {
  comment: Comment
  broken: boolean
  authorName: string
  /** Briefly highlight the card (e.g. when its text is selected in the page). */
  flash: boolean
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  onFocus: (comment: Comment) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.text)

  const author = comment.author ?? authorName

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
        <CommentAvatar name={author} />
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
    </div>
  )
}
