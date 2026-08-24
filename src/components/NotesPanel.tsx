import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type MediaBlock,
  type Note,
  noteSnippet,
  normalizeBlocks,
  sortedNotes,
} from '../notes'
import './NotesPanel.css'

interface NotesPanelProps {
  /** All notes for the open project. */
  notes: Note[]
  /** Create a blank note and return it (so it can be opened immediately). */
  onCreate: () => Note
  /** Persist an edit to a note's title/blocks. */
  onChangeNote: (id: string, patch: Partial<Pick<Note, 'title' | 'blocks'>>) => void
  onDeleteNote: (id: string) => void
  /** Upload image/video files and append them as inline blocks to a note. */
  onAddMedia: (noteId: string, files: File[]) => Promise<void>
  /** Remove one inline media block from a note (and trash its file). */
  onDeleteMedia: (noteId: string, blockId: string) => void
  /** Fetch a media file's bytes as an object URL for display. */
  loadMedia: (fileId: string) => Promise<string>
  onClose: () => void
  busy: boolean
}

// --- Small line icons (our own, currentColor) approximating Apple Notes. ---
function ComposeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 9.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h9.5" />
      <path d="M17.4 3.6a1.9 1.9 0 0 1 2.7 2.7L12 14.5l-3.4.7.7-3.4z" />
    </svg>
  )
}
function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.7-2.5h6.6L17 7h3a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5L16 16" />
    </svg>
  )
}
function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  )
}

/** All the note's plain text, for search matching. */
function noteText(note: Note): string {
  return note.blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n')
}

/** Apple-Notes list date: time today, "Yesterday", weekday this week, else date. */
function listDate(then: number, now: number): string {
  const d = new Date(then)
  const startOfDay = (t: number) => {
    const x = new Date(t)
    x.setHours(0, 0, 0, 0)
    return x.getTime()
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000)
  if (dayDiff <= 0) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' })
}

/** Apple-Notes note-header date, e.g. "Today at 1:37 PM" / "May 3, 2024 at …". */
function docDate(then: number, now: number): string {
  const d = new Date(then)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const sameDay = d.toDateString() === new Date(now).toDateString()
  const yst = new Date(now)
  yst.setDate(yst.getDate() - 1)
  const isYst = d.toDateString() === yst.toDateString()
  if (sameDay) return `Today at ${time}`
  if (isYst) return `Yesterday at ${time}`
  const date = d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
  return `${date} at ${time}`
}

/**
 * A right-side drawer holding the open project's notes, with the visual
 * structure of Apple Notes (skinned in the app's own theme): a list view — big
 * "Notes" title, search field, date/preview rows, and a bottom bar with the
 * note count and a compose button — and an individual note view with a date
 * header, title, body, and a bottom attachment bar.
 */
export function NotesPanel({
  notes,
  onCreate,
  onChangeNote,
  onDeleteNote,
  onAddMedia,
  onDeleteMedia,
  loadMedia,
  onClose,
  busy,
}: NotesPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (openId !== null && !notes.some((n) => n.id === openId)) setOpenId(null)
  }, [notes, openId])

  const openNote = notes.find((n) => n.id === openId) ?? null

  function createNote() {
    const note = onCreate()
    setOpenId(note.id)
  }

  if (openNote !== null) {
    return (
      <NoteView
        note={openNote}
        onBack={() => setOpenId(null)}
        onChangeNote={onChangeNote}
        onDelete={() => {
          onDeleteNote(openNote.id)
          setOpenId(null)
        }}
        onAddMedia={onAddMedia}
        onDeleteMedia={onDeleteMedia}
        loadMedia={loadMedia}
        busy={busy}
      />
    )
  }

  return (
    <NotesListView
      notes={notes}
      onOpen={setOpenId}
      onCreate={createNote}
      onClose={onClose}
      busy={busy}
    />
  )
}

function NotesListView({
  notes,
  onOpen,
  onCreate,
  onClose,
  busy,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  onCreate: () => void
  onClose: () => void
  busy: boolean
}) {
  const [query, setQuery] = useState('')
  const now = useMemo(() => Date.now(), [notes])

  const ordered = useMemo(() => {
    const list = sortedNotes(notes)
    const q = query.trim().toLowerCase()
    if (q === '') return list
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || noteText(n).toLowerCase().includes(q),
    )
  }, [notes, query])

  return (
    <aside className="notes" role="dialog" aria-label="Project notes">
      <div className="notes__nav">
        <span className="notes__nav-spacer" />
        <button
          type="button"
          className="notes__nav-btn"
          onClick={onClose}
          aria-label="Close notes"
          title="Close"
        >
          ×
        </button>
      </div>

      <div className="notes__scroll">
        <h1 className="notes__bigtitle">Notes</h1>

        <div className="notes__search">
          <span className="notes__search-icon">
            <SearchIcon />
          </span>
          <input
            className="notes__search-input"
            type="text"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query !== '' && (
            <button
              type="button"
              className="notes__search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {ordered.length === 0 ? (
          <p className="notes__empty">
            {query.trim() !== ''
              ? 'No matching notes.'
              : 'No notes yet. Jot down research, reference images, or reminders for this project — they stay with it across every version.'}
          </p>
        ) : (
          <ul className="notes__list">
            {ordered.map((note) => {
              const heading = note.title.trim() || noteSnippet(note) || 'New Note'
              const preview = noteSnippet(note) || 'No additional text'
              return (
                <li key={note.id} className="notes__item">
                  <button
                    type="button"
                    className="notes__row"
                    onClick={() => onOpen(note.id)}
                  >
                    <span className="notes__row-title">{heading}</span>
                    <span className="notes__row-sub">
                      <span className="notes__row-date">
                        {listDate(note.modifiedAt, now)}
                      </span>
                      <span className="notes__row-preview">{preview}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="notes__bottombar">
        <span className="notes__bottombar-side" />
        <span className="notes__count">
          {notes.length === 0
            ? ''
            : `${notes.length} ${notes.length === 1 ? 'Note' : 'Notes'}`}
        </span>
        <button
          type="button"
          className="notes__compose"
          onClick={onCreate}
          disabled={busy}
          aria-label="New note"
          title="New note"
        >
          <ComposeIcon />
        </button>
      </div>
    </aside>
  )
}

function NoteView({
  note,
  onBack,
  onChangeNote,
  onDelete,
  onAddMedia,
  onDeleteMedia,
  loadMedia,
  busy,
}: {
  note: Note
  onBack: () => void
  onChangeNote: (id: string, patch: Partial<Pick<Note, 'title' | 'blocks'>>) => void
  onDelete: () => void
  onAddMedia: (noteId: string, files: File[]) => Promise<void>
  onDeleteMedia: (noteId: string, blockId: string) => void
  loadMedia: (fileId: string) => Promise<string>
  busy: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const now = useMemo(() => Date.now(), [note.modifiedAt])

  // On open, collapse any stray/legacy block shape (e.g. an old note whose text
  // was split across separate blocks) to the canonical one — before the user
  // types, so it never disrupts the caret mid-edit.
  useEffect(() => {
    const normalized = normalizeBlocks(note.blocks, Date.now())
    if (normalized.length !== note.blocks.length) {
      onChangeNote(note.id, { blocks: normalized })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  // Focus the title of a freshly-created (still empty) note, like Apple Notes.
  useEffect(() => {
    const empty =
      note.title === '' &&
      note.blocks.every((b) => b.type === 'text' && b.text === '')
    if (empty) titleRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  function setBlockText(blockId: string, text: string) {
    const blocks = note.blocks.map((b) =>
      b.id === blockId && b.type === 'text' ? { ...b, text } : b,
    )
    onChangeNote(note.id, { blocks })
  }

  async function onFilesPicked(fileList: FileList | null) {
    if (fileList === null || fileList.length === 0) return
    setUploading(true)
    try {
      await onAddMedia(note.id, Array.from(fileList))
    } finally {
      setUploading(false)
      if (fileInputRef.current !== null) fileInputRef.current.value = ''
    }
  }

  return (
    <aside className="notes" role="dialog" aria-label="Note">
      <div className="notes__nav">
        <button
          type="button"
          className="notes__back"
          onClick={onBack}
          title="All notes"
          aria-label="All notes"
        >
          <ChevronLeft />
          <span>Notes</span>
        </button>
        <span className="notes__nav-spacer" />
        <button
          type="button"
          className="notes__nav-btn notes__nav-btn--danger"
          onClick={onDelete}
          disabled={busy}
          title="Delete note"
          aria-label="Delete note"
        >
          <TrashIcon />
        </button>
      </div>

      <div className="notes__scroll notes__doc">
        <div className="notes__doc-date">{docDate(note.modifiedAt, now)}</div>
        <input
          ref={titleRef}
          className="notes__doc-title"
          type="text"
          placeholder="Title"
          value={note.title}
          onChange={(e) => onChangeNote(note.id, { title: e.target.value })}
        />
        {note.blocks.map((block) =>
          block.type === 'text' ? (
            <TextBlockView
              key={block.id}
              value={block.text}
              onChange={(text) => setBlockText(block.id, text)}
            />
          ) : (
            <MediaBlockView
              key={block.id}
              block={block}
              loadMedia={loadMedia}
              onDelete={() => onDeleteMedia(note.id, block.id)}
              busy={busy}
            />
          ),
        )}
      </div>

      <div className="notes__bottombar">
        <button
          type="button"
          className="notes__attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || uploading}
          aria-label="Add photo or video"
          title="Add photo or video"
        >
          {uploading ? <span className="notes__spinner" /> : <CameraIcon />}
        </button>
        <span className="notes__bottombar-side" />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="notes__file-input"
        onChange={(e) => void onFilesPicked(e.target.files)}
      />
    </aside>
  )
}

/** A plain-text paragraph as an auto-growing textarea (no formatting). */
function TextBlockView({
  value,
  onChange,
}: {
  value: string
  onChange: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const grow = () => {
    const el = ref.current
    if (el === null) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useLayoutEffect(grow, [value])

  return (
    <textarea
      ref={ref}
      className="notes__text"
      rows={1}
      value={value}
      placeholder="Start writing…"
      onChange={(e) => onChange(e.target.value)}
      onInput={grow}
    />
  )
}

/** An inline image/video, fetched from Drive and shown with a delete control. */
function MediaBlockView({
  block,
  loadMedia,
  onDelete,
  busy,
}: {
  block: MediaBlock
  loadMedia: (fileId: string) => Promise<string>
  onDelete: () => void
  busy: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setUrl(null)
    setFailed(false)
    loadMedia(block.fileId)
      .then((u) => {
        if (!active) {
          URL.revokeObjectURL(u)
          return
        }
        objectUrl = u
        setUrl(u)
      })
      .catch((err) => {
        console.error('[notes] media load failed:', err)
        if (active) setFailed(true)
      })
    return () => {
      active = false
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [block.fileId, loadMedia])

  return (
    <figure className="notes__media">
      {failed ? (
        <div className="notes__media-error">Couldn’t load {block.name || 'media'}</div>
      ) : url === null ? (
        <div className="notes__media-loading">Loading…</div>
      ) : block.type === 'video' ? (
        <video className="notes__media-el" src={url} controls />
      ) : (
        <img className="notes__media-el" src={url} alt={block.name} />
      )}
      <button
        type="button"
        className="notes__media-del"
        onClick={onDelete}
        disabled={busy}
        title="Remove"
        aria-label="Remove media"
      >
        ×
      </button>
    </figure>
  )
}
