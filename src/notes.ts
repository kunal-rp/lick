// Project notes. Like comments and history, the notes for a project live in a
// single JSON file (NOTES_FILENAME) in the project's Drive folder. That file is
// data, never a screenplay version: it is excluded from the version list and is
// never opened in the screenplay editor (see drive/versions.ts).
//
// Notes model the basics of Apple Notes: a scrollable list sorted by most-
// recently-edited, and an individual note you open to read/write. A note has a
// title and a body made of ordered blocks — plain-text paragraphs interleaved
// with inline images and videos — so the writer can keep research, reference
// frames, and reminders alongside the script.
//
// Media (images/videos) are NOT inlined into this JSON — that would bloat it,
// especially for video. Each media file is uploaded as its own file in the
// project folder (named with the NOTE_ASSET_PREFIX so it's excluded from the
// version list) and a block here just references it by Drive file id.

export const NOTES_FILENAME = 'notes.json'

// Prefix for media files backing note image/video blocks. Files with this
// prefix are project data, not screenplay versions (see drive/versions.ts).
export const NOTE_ASSET_PREFIX = 'note-asset-'

/** A plain-text paragraph within a note. No inline formatting (by design). */
export interface TextBlock {
  id: string
  type: 'text'
  text: string
}

/** An inline image or video, stored as a separate file in the project folder. */
export interface MediaBlock {
  id: string
  type: 'image' | 'video'
  /** Drive file id of the uploaded media. */
  fileId: string
  /** MIME type, used to render the right element. */
  mime: string
  /** Original file name, for display/download. */
  name: string
}

export type NoteBlock = TextBlock | MediaBlock

export interface Note {
  /** Unique id for this note. */
  id: string
  /** Short title; may be empty (the list falls back to a body snippet). */
  title: string
  /** Ordered body blocks (text paragraphs + inline media). */
  blocks: NoteBlock[]
  /** Creation time (epoch ms). */
  createdAt: number
  /** Last-modified time (epoch ms); equals createdAt until first edit. */
  modifiedAt: number
}

let idCounter = 0
/** A short unique id (time + counter + randomness), stable within a session. */
export function makeId(now: number): string {
  idCounter = (idCounter + 1) % 1_000_000
  return `${now.toString(36)}${idCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`
}

export function makeTextBlock(now: number, text = ''): TextBlock {
  return { id: makeId(now), type: 'text', text }
}

export function makeMediaBlock(
  now: number,
  type: 'image' | 'video',
  fileId: string,
  mime: string,
  name: string,
): MediaBlock {
  return { id: makeId(now), type, fileId, mime, name }
}

/** Build a new, empty note (one blank text block so it's ready to type into). */
export function makeNote(now: number): Note {
  return {
    id: makeId(now),
    title: '',
    blocks: [makeTextBlock(now)],
    createdAt: now,
    modifiedAt: now,
  }
}

/**
 * Ensure the block list has the canonical shape the note view needs: at least
 * one block, and a text block at the end so there's always somewhere to type
 * below trailing media. Text blocks are NOT merged — each holds a Lexical
 * editor state (JSON) that can't be concatenated as strings.
 */
export function normalizeBlocks(blocks: NoteBlock[], now: number): NoteBlock[] {
  const out = [...blocks]
  if (out.length === 0) out.push(makeTextBlock(now))
  if (out[out.length - 1].type !== 'text') out.push(makeTextBlock(now))
  return out
}

/** The media blocks in a note (e.g. to clean up their files on delete). */
export function mediaBlocks(note: Note): MediaBlock[] {
  return note.blocks.filter((b): b is MediaBlock => b.type !== 'text')
}

/**
 * A text block's body is stored as a Lexical serialized editor state (JSON) so
 * blank lines, bullets, and checklists round-trip losslessly. Older notes may
 * still hold plain text or Markdown; this detects the JSON form.
 */
export function isSerializedState(text: string): boolean {
  if (text === '' || text[0] !== '{') return false
  try {
    const o = JSON.parse(text) as { root?: unknown }
    return o !== null && typeof o === 'object' && 'root' in o
  } catch {
    return false
  }
}

// Strip a leading list/checklist marker ("- ", "* ", "- [ ] ", "- [x] ") from a
// legacy (Markdown/plain) line so the preview reads as text, not source.
function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]\s+)?(?:\[[ xX]?\]\s+)?/, '')
}

// Recursively collect the visible text of a serialized-state node.
function nodeText(node: unknown): string {
  const n = node as { type?: string; text?: unknown; children?: unknown[] }
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) return n.children.map(nodeText).join('')
  return ''
}

/** The plain text of a text block's body (handles JSON and legacy strings). */
export function textFromBlock(text: string): string {
  if (!isSerializedState(text)) {
    // Legacy Markdown/plain: strip list markers line by line.
    return text
      .split('\n')
      .map(stripListMarker)
      .join('\n')
  }
  try {
    const root = (JSON.parse(text) as { root?: { children?: unknown[] } }).root
    const lines: string[] = []
    const push = (node: unknown) => lines.push(nodeText(node))
    for (const child of root?.children ?? []) {
      const c = child as { type?: string; children?: unknown[] }
      if (c.type === 'list' && Array.isArray(c.children)) c.children.forEach(push)
      else push(child)
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

/** A short preview of a note's body for the list: first text, else media hint. */
export function noteSnippet(note: Note): string {
  for (const block of note.blocks) {
    if (block.type === 'text') {
      for (const line of textFromBlock(block.text).split('\n')) {
        const trimmed = line.trim()
        if (trimmed.length > 0) return trimmed
      }
    }
  }
  const media = mediaBlocks(note)[0]
  if (media !== undefined) return media.type === 'video' ? 'Video' : 'Photo'
  return ''
}

/** Notes ordered for display: most recently modified first. */
export function sortedNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.modifiedAt - a.modifiedAt)
}

interface NotesFile {
  version: 1
  notes: Note[]
}

// Parse a single stored block, tolerating unknown/corrupt shapes (returns null
// to skip). Text blocks pass through; media blocks require a fileId.
function parseBlock(raw: unknown, now: number): NoteBlock | null {
  if (raw === null || typeof raw !== 'object') return null
  const b = raw as {
    id?: unknown
    type?: unknown
    text?: unknown
    fileId?: unknown
    mime?: unknown
    name?: unknown
  }
  const id = typeof b.id === 'string' ? b.id : makeId(now)
  if (b.type === 'image' || b.type === 'video') {
    if (typeof b.fileId !== 'string') return null
    return {
      id,
      type: b.type,
      fileId: b.fileId,
      mime: typeof b.mime === 'string' ? b.mime : '',
      name: typeof b.name === 'string' ? b.name : '',
    }
  }
  return { id, type: 'text', text: typeof b.text === 'string' ? b.text : '' }
}

/** Parse the notes file content; tolerant of missing/corrupt data. */
export function parseNotes(json: string): Note[] {
  try {
    const data = JSON.parse(json) as Partial<NotesFile>
    if (!Array.isArray(data.notes)) return []
    const now = Date.now()
    const out: Note[] = []
    for (const raw of data.notes as unknown[]) {
      if (raw === null || typeof raw !== 'object') continue
      const n = raw as Partial<Note> & { body?: unknown }
      if (typeof n.id !== 'string') continue
      const createdAt = typeof n.createdAt === 'number' ? n.createdAt : 0
      // Blocks (current shape), else migrate a legacy `body` string to one
      // text block, else start empty.
      let blocks: NoteBlock[]
      if (Array.isArray(n.blocks)) {
        blocks = (n.blocks as unknown[])
          .map((b) => parseBlock(b, createdAt || now))
          .filter((b): b is NoteBlock => b !== null)
      } else if (typeof n.body === 'string') {
        blocks = [makeTextBlock(createdAt || now, n.body)]
      } else {
        blocks = []
      }
      blocks = normalizeBlocks(blocks, createdAt || now)
      out.push({
        id: n.id,
        title: typeof n.title === 'string' ? n.title : '',
        blocks,
        createdAt,
        modifiedAt: typeof n.modifiedAt === 'number' ? n.modifiedAt : createdAt,
      })
    }
    return out
  } catch {
    return []
  }
}

/** Serialize notes to the file's JSON form. */
export function serializeNotes(notes: Note[]): string {
  const file: NotesFile = { version: 1, notes }
  return JSON.stringify(file, null, 2)
}
