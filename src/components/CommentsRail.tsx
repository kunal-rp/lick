import { useEffect, useRef, useState } from 'react'
import type { Comment, CommentAnchor } from '../comments'
import './CommentsRail.css'

interface CommentsRailProps {
  comments: Comment[]
  /** Ids of comments whose anchor no longer resolves in the current text. */
  brokenIds: Set<string>
  /** A comment to scroll to and flash (e.g. selecting its text in preview). */
  focus: { id: string; nonce: number } | null
  /** Anchor currently being commented on (shows the compose box), or null. */
  composeAnchor: CommentAnchor | null
  /** Display name for comments with no explicit author. */
  authorName: string
  onCreate: (text: string) => void
  onCancelCompose: () => void
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  /** Bring a comment's highlighted text into view. */
  onFocusComment: (comment: Comment) => void
}

export function CommentsRail({
  comments,
  brokenIds,
  focus,
  composeAnchor,
  authorName,
  onCreate,
  onCancelCompose,
  onEdit,
  onDelete,
  onFocusComment,
}: CommentsRailProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll a focused comment into view and briefly flash it.
  useEffect(() => {
    if (focus === null || listRef.current === null) return
    const card = listRef.current.querySelector<HTMLElement>(
      `[data-comment-id="${focus.id}"]`,
    )
    if (card === null) return
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    card.classList.add('comments__card--flash')
    const timer = window.setTimeout(
      () => card.classList.remove('comments__card--flash'),
      1200,
    )
    return () => window.clearTimeout(timer)
  }, [focus])

  return (
    <aside className="comments" aria-label="Comments">
      <div className="comments__header">Comments</div>
      <div className="comments__list" ref={listRef}>
        {composeAnchor !== null && (
          <Compose
            anchor={composeAnchor}
            onCreate={onCreate}
            onCancel={onCancelCompose}
          />
        )}
        {comments.length === 0 && composeAnchor === null ? (
          <p className="comments__empty">
            Select text in the preview to add a comment.
          </p>
        ) : (
          comments.map((c) => (
            <Card
              key={c.id}
              comment={c}
              broken={brokenIds.has(c.id)}
              authorName={authorName}
              onEdit={onEdit}
              onDelete={onDelete}
              onFocus={onFocusComment}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function Compose({
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

function Card({
  comment,
  broken,
  authorName,
  onEdit,
  onDelete,
  onFocus,
}: {
  comment: Comment
  broken: boolean
  authorName: string
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  onFocus: (comment: Comment) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
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
      className={`comments__card${broken ? ' comments__card--broken' : ''}`}
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
