import { useEffect, useMemo, useRef, useState } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { CheckListPlugin } from '@lexical/react/LexicalCheckListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { EditorState, LexicalEditor, LexicalNode } from 'lexical'
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical'
import {
  ListNode,
  ListItemNode,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from '@lexical/list'
import { $convertFromMarkdownString, CHECK_LIST, UNORDERED_LIST } from '@lexical/markdown'
import {
  type MediaBlock,
  type Note,
  type NoteBlock,
  type ScriptRefBlock,
  isSerializedState,
  makeTextBlock,
  noteSnippet,
  normalizeBlocks,
  sortedNotes,
  textFromBlock,
} from '../notes'
// ScriptRefView lays its lines out with the editor's element geometry.
import './screenplay.css'
import './NotesPanel.css'

// The list vocabulary a note supports — checklists ("- [ ] ") and bullets
// ("- "), auto-detected as you type. CHECK_LIST is first so "- [ ] " matches it
// rather than the plain bullet transformer. (Used for typing shortcuts and for
// seeding older Markdown-stored notes; the body itself is stored as JSON.)
const NOTE_TRANSFORMERS = [CHECK_LIST, UNORDERED_LIST]

// Lexical theme → CSS class names for the note editor (see NotesPanel.css).
const NOTE_EDITOR_THEME = {
  paragraph: 'note-p',
  list: {
    ul: 'note-ul',
    listitem: 'note-li',
    listitemChecked: 'note-li--checked',
    listitemUnchecked: 'note-li--unchecked',
    nested: { listitem: 'note-li--nested' },
  },
}

interface NotesPanelProps {
  /** All notes for the open project. */
  notes: Note[]
  /** Create a blank note and return it (so it can be opened immediately). */
  onCreate: () => Note
  /** Persist an edit to a note's title, body, or flags. */
  onChangeNote: (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'blocks' | 'starred' | 'inactive'>>,
  ) => void
  onDeleteNote: (id: string) => void
  /** Upload image/video files to Drive and return blocks to splice into a note. */
  onUploadMedia: (files: File[]) => Promise<MediaBlock[]>
  /** Remove one inline media block from a note (and trash its file). */
  onDeleteMedia: (noteId: string, blockId: string) => void
  /** Fetch a media file's bytes as an object URL for display. */
  loadMedia: (fileId: string) => Promise<string>
  /**
   * Build a reference block from whatever is selected in the script right now,
   * or null if nothing is. The note decides *where* it lands; the workspace
   * knows *what* is selected, so the two meet here.
   */
  onCreateScriptRef?: () => ScriptRefBlock | null
  /** Whether there's a script selection to quote (drives the button's state). */
  canAddScriptRef?: boolean
  /** Open a reference's draft and jump to its lines. */
  onOpenScriptRef?: (block: ScriptRefBlock) => void
  /**
   * Put back the last block added or removed, or null when there's nothing to
   * put back. Structural only: typing is each run's own Lexical undo.
   */
  onUndo?: () => void
  undoLabel?: string | null
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
function ChecklistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="7" height="7" rx="1.6" />
      <path d="M4.8 7.4l1.4 1.4 2.2-2.6" />
      <path d="M13 6.5h8M13 17.5h8" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
    </svg>
  )
}
function BulletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="4.5" cy="7" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1.4" fill="currentColor" stroke="none" />
      <path d="M9 7h12M9 17h12" />
    </svg>
  )
}

/** All the note's plain text, for search matching. */
function noteText(note: Note): string {
  return note.blocks
    .filter((b) => b.type === 'text')
    .map((b) => textFromBlock((b as { text: string }).text))
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
  onUploadMedia,
  onDeleteMedia,
  loadMedia,
  onCreateScriptRef,
  canAddScriptRef = false,
  onOpenScriptRef,
  onUndo,
  undoLabel = null,
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
        onUploadMedia={onUploadMedia}
        onDeleteMedia={onDeleteMedia}
        loadMedia={loadMedia}
        onCreateScriptRef={onCreateScriptRef}
        canAddScriptRef={canAddScriptRef}
        onOpenScriptRef={onOpenScriptRef}
        onUndo={onUndo}
        undoLabel={undoLabel}
        busy={busy}
      />
    )
  }

  return (
    <NotesListView
      notes={notes}
      onOpen={setOpenId}
      onCreate={createNote}
      onChangeNote={onChangeNote}
      onClose={onClose}
      busy={busy}
    />
  )
}

function NotesListView({
  notes,
  onOpen,
  onCreate,
  onChangeNote,
  onClose,
  busy,
}: {
  notes: Note[]
  onOpen: (id: string) => void
  onCreate: () => void
  onChangeNote: NotesPanelProps['onChangeNote']
  onClose: () => void
  busy: boolean
}) {
  const [query, setQuery] = useState('')
  const now = useMemo(() => Date.now(), [notes])

  // Everything is listed; sortedNotes sinks the inactive ones to the bottom
  // and the row greys them. Nothing is hidden, so there's nothing to reveal.
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
    <aside className="notes" role="region" aria-label="Project notes">
      <div className="notes__nav notes__nav--list">
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
                    className={`notes__row${
                      note.inactive ? ' notes__row--inactive' : ''
                    }`}
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
                  {/* Starring from the list, so pinning something doesn't
                      mean opening it first. Always rendered rather than
                      shown on hover — there is no hover on a phone. */}
                  <button
                    type="button"
                    className={`notes__star${
                      note.starred ? ' notes__star--on' : ''
                    }`}
                    onClick={() =>
                      onChangeNote(note.id, { starred: !note.starred })
                    }
                    aria-pressed={note.starred}
                    aria-label={note.starred ? 'Unstar note' : 'Star note'}
                    title={note.starred ? 'Unstar' : 'Star'}
                  >
                    <StarIcon filled={note.starred} />
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
  onUploadMedia,
  onDeleteMedia,
  loadMedia,
  onCreateScriptRef,
  canAddScriptRef = false,
  onOpenScriptRef,
  onUndo,
  undoLabel = null,
  busy,
}: {
  note: Note
  onBack: () => void
  onChangeNote: NotesPanelProps['onChangeNote']
  onDelete: () => void
  onUploadMedia: (files: File[]) => Promise<MediaBlock[]>
  onDeleteMedia: (noteId: string, blockId: string) => void
  loadMedia: (fileId: string) => Promise<string>
  onCreateScriptRef?: () => ScriptRefBlock | null
  canAddScriptRef?: boolean
  onOpenScriptRef?: (block: ScriptRefBlock) => void
  onUndo?: () => void
  undoLabel?: string | null
  busy: boolean
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  // True while files are being dragged over the note, for the drop affordance.
  const [dragging, setDragging] = useState(false)
  const docRef = useRef<HTMLDivElement>(null)
  const now = useMemo(() => Date.now(), [note.modifiedAt])
  // The text run last focused (its block id) and its Lexical editor, so list
  // buttons target it and inserted media lands right after it.
  const focusedBlockRef = useRef<string | null>(null)
  const activeEditorRef = useRef<LexicalEditor | null>(null)
  // A block to focus on the next render (the text right after inserted media).
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null)

  const handleEditorFocus = (blockId: string, editor: LexicalEditor) => {
    focusedBlockRef.current = blockId
    activeEditorRef.current = editor
  }

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

  /**
   * Upload files and put them in the note — the one path behind the photo
   * button, a drop, and a paste.
   *
   * Non-media is dropped silently rather than refused loudly: a drag from a
   * folder or a paste from a rich document routinely carries a text flavour
   * alongside the image, and complaining about the parts we can't use would
   * turn every successful paste into an error message.
   */
  async function addMedia(files: File[], afterBlockId?: string) {
    const usable = files.filter(
      (f) => f.type.startsWith('image/') || f.type.startsWith('video/'),
    )
    if (usable.length === 0) return
    setUploading(true)
    try {
      const media = await onUploadMedia(usable)
      if (media.length > 0) insertBlocks(media, afterBlockId)
    } finally {
      setUploading(false)
      if (fileInputRef.current !== null) fileInputRef.current.value = ''
    }
  }

  const insertList = (command: typeof INSERT_UNORDERED_LIST_COMMAND | typeof INSERT_CHECK_LIST_COMMAND) => {
    activeEditorRef.current?.dispatchCommand(command, undefined)
  }

  /**
   * Put a block where the caret is.
   *
   * A block can't sit *inside* a paragraph, so "at the caret" means splitting
   * the focused text run: the paragraphs above the caret stay, the block goes
   * next, and the paragraphs below it become a new run. Appending after the
   * whole run — which is what media insertion does — drops the block past
   * text the writer meant it to precede.
   *
   * With nothing focused, or with the caret already in the run's last
   * paragraph, there's nothing to split and this is a plain insert after it.
   */
  function insertBlocks(newBlocks: NoteBlock[], afterBlockId?: string) {
    const nowTs = Date.now()

    // A drop names the block it landed on, and goes after it. Nothing to split
    // — the writer pointed at a position rather than leaving a caret in one.
    if (afterBlockId !== undefined) {
      const found = note.blocks.findIndex((b) => b.id === afterBlockId)
      const at = found >= 0 ? found + 1 : note.blocks.length
      // Somewhere to type underneath — unless there already is one. Dropping
      // three photos in a row shouldn't leave three empty runs behind them.
      const next = note.blocks[at]
      const below = next?.type === 'text' ? null : makeTextBlock(nowTs)
      const blocks = normalizeBlocks(
        [
          ...note.blocks.slice(0, at),
          ...newBlocks,
          ...(below === null ? [] : [below]),
          ...note.blocks.slice(at),
        ],
        nowTs,
      )
      setFocusBlockId((below ?? next)?.id ?? null)
      onChangeNote(note.id, { blocks })
      return
    }

    const fid = focusedBlockRef.current
    const idx = fid !== null ? note.blocks.findIndex((b) => b.id === fid) : -1

    if (idx >= 0) {
      const split = splitRunAtCaret(activeEditorRef.current)
      if (split !== null) {
        // Both halves get fresh ids. A text run's editor is uncontrolled —
        // seeded once from `value` and keyed by block id — so reusing the id
        // for the shortened half would leave that editor showing the original
        // text, and its next keystroke would write the whole thing back over
        // the split. A new id remounts it against the new content.
        const above = makeTextBlock(nowTs, split.before)
        const below = makeTextBlock(nowTs, split.after)
        const blocks = normalizeBlocks(
          [
            ...note.blocks.slice(0, idx),
            above,
            ...newBlocks,
            below,
            ...note.blocks.slice(idx + 1),
          ],
          nowTs,
        )
        setFocusBlockId(below.id)
        onChangeNote(note.id, { blocks })
        return
      }
    }

    const at = idx >= 0 ? idx + 1 : note.blocks.length
    const after = makeTextBlock(nowTs)
    const blocks = normalizeBlocks(
      [...note.blocks.slice(0, at), ...newBlocks, after, ...note.blocks.slice(at)],
      nowTs,
    )
    setFocusBlockId(after.id)
    onChangeNote(note.id, { blocks })
  }

  function removeBlock(blockId: string) {
    onChangeNote(note.id, {
      blocks: normalizeBlocks(
        note.blocks.filter((b) => b.id !== blockId),
        Date.now(),
      ),
    })
  }

  // Quote the current script selection into this note. Nothing selected means
  // nothing to quote, so the button is disabled rather than guessing a range.
  function addScriptRef() {
    const block = onCreateScriptRef?.()
    if (block != null) insertBlocks([block])
  }

  // The latest addMedia, so the listeners below can stay bound across renders
  // without capturing a stale `note`.
  const addMediaRef = useRef(addMedia)
  addMediaRef.current = addMedia

  /**
   * Drop files onto the note, or paste them into it.
   *
   * Bound natively and in the capture phase, because both events are headed
   * for a Lexical editor that has its own handling for them — and Lexical's
   * answer for an image is to insert nothing. Catching them on the way down
   * lets the note take the ones it can use and leaves everything else (pasted
   * text, dragged selections) to the editor untouched.
   */
  useEffect(() => {
    const el = docRef.current
    if (el === null) return

    const filesIn = (dt: DataTransfer | null): File[] =>
      dt === null ? [] : Array.from(dt.files)

    const carriesFiles = (dt: DataTransfer | null) =>
      dt !== null && Array.from(dt.types).includes('Files')

    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer)) return
      // Without this the browser takes the drop and navigates to the file,
      // discarding the note — and everything else on the page with it.
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'copy'
      setDragging(true)
    }

    const onDragLeave = (e: DragEvent) => {
      // Only when the pointer actually leaves the note, not on every crossing
      // between the blocks inside it.
      if (e.relatedTarget === null || !el.contains(e.relatedTarget as Node)) {
        setDragging(false)
      }
    }

    const onDrop = (e: DragEvent) => {
      setDragging(false)
      const files = filesIn(e.dataTransfer)
      if (files.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      // Put it where it landed: the block under the pointer, or the end.
      const onBlock = (e.target as Element | null)?.closest?.('[data-block-id]')
      const id = onBlock?.getAttribute('data-block-id') ?? undefined
      void addMediaRef.current(files, id)
    }

    const onPaste = (e: ClipboardEvent) => {
      const files = filesIn(e.clipboardData)
      if (files.length === 0) return // plain text paste — leave it to Lexical
      e.preventDefault()
      e.stopPropagation()
      // No position: a paste goes where the caret is, which insertBlocks
      // already works out by splitting the focused run.
      void addMediaRef.current(files)
    }

    el.addEventListener('dragover', onDragOver, true)
    el.addEventListener('dragleave', onDragLeave, true)
    el.addEventListener('drop', onDrop, true)
    el.addEventListener('paste', onPaste, true)
    return () => {
      el.removeEventListener('dragover', onDragOver, true)
      el.removeEventListener('dragleave', onDragLeave, true)
      el.removeEventListener('drop', onDrop, true)
      el.removeEventListener('paste', onPaste, true)
    }
  }, [])

  const firstTextId = note.blocks.find((b) => b.type === 'text')?.id ?? null

  return (
    <aside className="notes" role="region" aria-label="Note">
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
          className={`notes__nav-btn${
            note.starred ? ' notes__nav-btn--on' : ''
          }`}
          onClick={() => onChangeNote(note.id, { starred: !note.starred })}
          aria-pressed={note.starred}
          aria-label={note.starred ? 'Unstar note' : 'Star note'}
          title={note.starred ? 'Unstar' : 'Star — keep at the top of the list'}
        >
          <StarIcon filled={note.starred} />
        </button>
        <button
          type="button"
          className={`notes__nav-btn${
            note.inactive ? ' notes__nav-btn--on' : ''
          }`}
          onClick={() => onChangeNote(note.id, { inactive: !note.inactive })}
          aria-pressed={note.inactive}
          aria-label={note.inactive ? 'Mark note active' : 'Mark note inactive'}
          title={
            note.inactive
              ? 'Make active — show it in the list again'
              : 'Make inactive — keep it, but out of the list'
          }
        >
          <ArchiveIcon />
        </button>
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

      <div
        ref={docRef}
        className={`notes__scroll notes__doc${
          dragging ? ' notes__doc--dropping' : ''
        }`}
      >
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
            <NoteTextEditor
              key={block.id}
              blockId={block.id}
              value={block.text}
              // Only the first text block invites text; blocks after media stay
              // placeholder-free so they don't read as a separate empty note.
              placeholder={block.id === firstTextId ? 'Start writing…' : ''}
              autoFocus={block.id === focusBlockId}
              onFocused={() => setFocusBlockId(null)}
              onEditorFocus={handleEditorFocus}
              onChange={(text) => setBlockText(block.id, text)}
            />
          ) : block.type === 'script-ref' ? (
            <ScriptRefView
              key={block.id}
              block={block}
              onOpen={() => onOpenScriptRef?.(block)}
              onDelete={() => removeBlock(block.id)}
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
          className="notes__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertList(INSERT_CHECK_LIST_COMMAND)}
          aria-label="Checklist"
          title="Checklist"
        >
          <ChecklistIcon />
        </button>
        <button
          type="button"
          className="notes__tool"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insertList(INSERT_UNORDERED_LIST_COMMAND)}
          aria-label="Bulleted list"
          title="Bulleted list"
        >
          <BulletIcon />
        </button>
        <button
          type="button"
          className="notes__tool"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || uploading}
          aria-label="Add photo or video"
          title="Add photo or video"
        >
          {uploading ? <span className="notes__spinner" /> : <CameraIcon />}
        </button>
        <button
          type="button"
          className="notes__tool"
          // Don't take focus: the button reads the *script's* selection, and
          // on some browsers focusing here would clear it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={addScriptRef}
          disabled={!canAddScriptRef}
          aria-label="Quote the selected script lines"
          title={
            canAddScriptRef
              ? 'Quote the selected script lines'
              : 'Select lines in the script to quote them here'
          }
        >
          <QuoteIcon />
        </button>
        <span className="notes__bottombar-side" />
        {/*
          Undo for the note's *shape* — a reference or photo added or removed.
          It sits apart from the insert tools because it isn't one: those act
          on the note, this takes an action back. Typing has its own undo in
          each run (⌘Z), which this deliberately doesn't touch.
        */}
        <button
          type="button"
          className="notes__tool notes__undo"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onUndo?.()}
          disabled={undoLabel === null}
          aria-label={undoLabel ?? 'Nothing to undo'}
          title={
            undoLabel === null
              ? 'Nothing to undo — typing undoes with ⌘/Ctrl+Z'
              : undoLabel
          }
        >
          <UndoIcon />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="notes__file-input"
        onChange={(e) => void addMedia(Array.from(e.target.files ?? []))}
      />
    </aside>
  )
}

// Captures the Lexical editor instance for the containing text run and drives
// focus: reports focus to the parent (for list buttons / media insertion) and
// takes focus when asked (the run created right after inserted media).
function EditorControlPlugin({
  blockId,
  autoFocus,
  onFocused,
  onEditorFocus,
}: {
  blockId: string
  autoFocus: boolean
  onFocused: () => void
  onEditorFocus: (blockId: string, editor: LexicalEditor) => void
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!autoFocus) return
    editor.focus()
    onEditorFocus(blockId, editor)
    onFocused()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

  return null
}

/**
 * One contiguous run of note text as a Lexical rich-text editor. Supports
 * bullet lists and to-do checklists — auto-detected as you type "- " / "- [ ] "
 * (and via the bottom-bar buttons) — with interactive checkboxes. Uncontrolled
 * after mount; content is mirrored out as Markdown via onChange.
 */
function NoteTextEditor({
  blockId,
  value,
  placeholder,
  autoFocus,
  onFocused,
  onEditorFocus,
  onChange,
}: {
  blockId: string
  value: string
  placeholder: string
  autoFocus: boolean
  onFocused: () => void
  onEditorFocus: (blockId: string, editor: LexicalEditor) => void
  onChange: (text: string) => void
}) {
  const editorRef = useRef<LexicalEditor | null>(null)
  // OnChangePlugin fires once for the seed state; skip it so opening a note
  // isn't recorded as an edit.
  const seededRef = useRef(false)

  const initialConfig = {
    namespace: 'note-editor',
    theme: NOTE_EDITOR_THEME,
    nodes: [ListNode, ListItemNode],
    // Seed from the stored Lexical state (JSON) when present; older notes hold
    // Markdown/plain text, which we import once and re-save as JSON on edit.
    editorState: isSerializedState(value)
      ? value
      : () => $convertFromMarkdownString(value, NOTE_TRANSFORMERS),
    onError: (error: Error) => console.error('[note-editor]', error),
  }

  const handleChange = (state: EditorState) => {
    // Serialize to JSON so blank lines, bullets, and checklists persist exactly
    // (Markdown collapses empty paragraphs). Skip the initial seed callback so
    // opening a note isn't recorded as an edit.
    if (!seededRef.current) {
      seededRef.current = true
      return
    }
    onChange(JSON.stringify(state.toJSON()))
  }

  return (
    <div
      className="note-rte"
      data-block-id={blockId}
      onFocusCapture={() => {
        if (editorRef.current !== null) onEditorFocus(blockId, editorRef.current)
      }}
    >
      <LexicalComposer initialConfig={initialConfig}>
        <EditorCapturePlugin onReady={(ed) => (editorRef.current = ed)} />
        <EditorControlPlugin
          blockId={blockId}
          autoFocus={autoFocus}
          onFocused={onFocused}
          onEditorFocus={onEditorFocus}
        />
        <RichTextPlugin
          contentEditable={<ContentEditable className="note-ce" spellCheck />}
          placeholder={<div className="note-ph">{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <MarkdownShortcutPlugin transformers={NOTE_TRANSFORMERS} />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
      </LexicalComposer>
    </div>
  )
}

function EditorCapturePlugin({ onReady }: { onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    onReady(editor)
  }, [editor, onReady])
  return null
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
    <figure className="notes__media" data-block-id={block.id}>
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

/**
 * A quoted stretch of screenplay, rendered as a minimal code block.
 *
 * A header saying where it came from, then the lines themselves — laid out by
 * the same rules the editor uses (screenplay.css), so a cue sits where a cue
 * sits and dialogue is inset, with the source line numbers in a gutter. The
 * point is that it reads as *quoted screenplay* — visibly not the note's own
 * prose — and that the numbers let you find it again.
 *
 * The text is a snapshot and never re-resolved against the current draft. That
 * is the whole reason this replaced commenting: it can't go stale-but-silent,
 * because it isn't claiming to still be there. Opening it takes you to where
 * it was, and what you find is whatever the script says now.
 */
function ScriptRefView({
  block,
  onOpen,
  onDelete,
}: {
  block: ScriptRefBlock
  onOpen: () => void
  onDelete: () => void
}) {
  const lines = block.text.split('\n')
  const range =
    block.endLine > block.startLine
      ? `lines ${block.startLine + 1}–${block.endLine + 1}`
      : `line ${block.startLine + 1}`

  return (
    <figure className="scriptref" data-block-id={block.id}>
      <figcaption className="scriptref__head">
        <button
          type="button"
          className="scriptref__open"
          onClick={onOpen}
          title="Go to these lines in the script"
        >
          <span className="scriptref__draft">{block.versionLabel}</span>
          <span className="scriptref__range">{range}</span>
        </button>
        <button
          type="button"
          className="scriptref__remove"
          onClick={onDelete}
          aria-label="Remove reference"
          title="Remove reference"
        >
          <CloseIcon />
        </button>
      </figcaption>
      <div className="scriptref__body screenplay">
        {lines.map((line, i) => (
          <div key={i} className="scriptref__line">
            <span className="scriptref__num" aria-hidden="true">
              {block.startLine + i + 1}
            </span>
            {/* Same `data-el` contract the editor's lines use, so
                screenplay.css lays this out identically. */}
            <span
              className="scriptref__text"
              data-el={block.types?.[i] ?? 'action'}
            >
              {line === '' ? '\u00a0' : line}
            </span>
          </div>
        ))}
      </div>
    </figure>
  )
}

// Quote mark, for the "reference the script" tool.
function QuoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 7H5a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3v2a2 2 0 0 1-2 2H5" />
      <path d="M19 7h-4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3v2a2 2 0 0 1-2 2h-1" />
    </svg>
  )
}

// A small close glyph, matching the app's icon set weight.
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

/**
 * Split a text run's serialized state at the caret's paragraph.
 *
 * Returns the two halves, or null when there is nothing below the caret (the
 * caller can just insert after the run) or when the caret can't be located.
 *
 * The split is at paragraph granularity because that's the finest an inserted
 * *block* can be: it has to break the flow somewhere, and breaking it at the
 * caret's paragraph boundary is what "here" means for something that isn't
 * inline. Working on the serialized JSON rather than mutating the live editor
 * keeps this a pure read — the run is replaced wholesale by the caller, so
 * there's no half-applied state if anything goes wrong.
 */
function splitRunAtCaret(
  editor: LexicalEditor | null,
): { before: string; after: string } | null {
  if (editor === null) return null
  let out: { before: string; after: string } | null = null

  editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return
    const root = $getRoot()

    // Walk up from the caret to the top-level paragraph holding it.
    let top: LexicalNode | null = selection.focus.getNode()
    while (top !== null) {
      const parent: LexicalNode | null = top.getParent()
      if (parent === null) return
      if (parent.getKey() === root.getKey()) break
      top = parent
    }
    if (top === null) return

    const children = root.getChildren()
    const index = children.findIndex((c) => c.getKey() === top.getKey())
    if (index < 0 || index >= children.length - 1) return // nothing below

    const json = editor.getEditorState().toJSON() as {
      root: { children: unknown[] }
    }
    const kids = json.root.children
    const cut = index + 1
    if (cut >= kids.length) return

    const half = (slice: unknown[]) =>
      JSON.stringify({ ...json, root: { ...json.root, children: slice } })
    out = { before: half(kids.slice(0, cut)), after: half(kids.slice(cut)) }
  })

  return out
}

// Counter-clockwise arrow, for taking a block change back.
function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h11a5 5 0 0 1 0 10h-6" />
      <path d="M7 4 3 8l4 4" />
    </svg>
  )
}

// A star, hollow or filled depending on whether the note is pinned.
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />
    </svg>
  )
}

// A tray, for putting a note away without deleting it.
function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M2 4h20v4H2z" />
      <path d="M10 12h4" />
    </svg>
  )
}
