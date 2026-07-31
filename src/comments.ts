// Script comments. All comments for a script — across every version — live in
// a single JSON file (COMMENTS_FILENAME) in the script's Drive folder. That
// file is data, never a screenplay version: it is excluded from the version
// list and is never opened in the editor (see drive/versions.ts).
//
// A comment is anchored to a specific version and a location within that
// version's rendered preview text (the element's source line plus a character
// range inside it). The locationHash is a compact identifier derived from the
// version id and that range.

export const COMMENTS_FILENAME = 'comments.json'

/**
 * Where a comment is anchored: a version and a text range that may span
 * multiple preview elements — from (startLine, startOffset) to
 * (endLine, endOffset), where each line is an element's source line and each
 * offset is a character offset within that element's rendered text.
 */
export interface CommentAnchor {
  /** Drive file id of the version the comment belongs to. */
  versionId: string
  startLine: number
  startOffset: number
  endLine: number
  endOffset: number
  /** The highlighted text, kept for display and re-anchoring. */
  quote: string
}

export interface Comment extends CommentAnchor {
  /** Unique id for this comment thread. */
  id: string
  /** Version + location identifier. */
  locationHash: string
  /** Comment author; null means the current user ("You"). */
  author: string | null
  /** Comment body. No length limit. */
  text: string
  /** Creation time (epoch ms). */
  createdAt: number
}

/** Compact hash of a version id + location range (djb2, base36). */
export function locationHash(
  versionId: string,
  startLine: number,
  startOffset: number,
  endLine: number,
  endOffset: number,
): string {
  const key = `${versionId}|${startLine}:${startOffset}|${endLine}:${endOffset}`
  let h = 5381
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/** Build a comment from an anchor plus author/text (stamps id + time). */
export function makeComment(
  anchor: CommentAnchor,
  author: string | null,
  text: string,
  now: number,
): Comment {
  const hash = locationHash(
    anchor.versionId,
    anchor.startLine,
    anchor.startOffset,
    anchor.endLine,
    anchor.endOffset,
  )
  return {
    ...anchor,
    id: `${hash}-${now.toString(36)}`,
    locationHash: hash,
    author,
    text,
    createdAt: now,
  }
}

interface CommentFile {
  version: 1
  comments: Comment[]
}

// Legacy single-element anchor shape ({ line, start, end }), migrated on read.
interface LegacyComment {
  line?: number
  start?: number
  end?: number
}

/** Parse the comments file content; tolerant of missing/corrupt data. */
export function parseComments(json: string): Comment[] {
  try {
    const data = JSON.parse(json) as Partial<CommentFile>
    if (!Array.isArray(data.comments)) return []
    const out: Comment[] = []
    for (const raw of data.comments as unknown[]) {
      if (raw === null || typeof raw !== 'object') continue
      const c = raw as Comment & LegacyComment
      if (
        typeof c.id !== 'string' ||
        typeof c.versionId !== 'string' ||
        typeof c.text !== 'string'
      ) {
        continue
      }
      // New (multi-line) shape, falling back to the legacy single-line fields.
      const startLine =
        typeof c.startLine === 'number' ? c.startLine : c.line
      const startOffset =
        typeof c.startOffset === 'number' ? c.startOffset : c.start
      const endLine = typeof c.endLine === 'number' ? c.endLine : c.line
      const endOffset =
        typeof c.endOffset === 'number' ? c.endOffset : c.end
      if (
        typeof startLine !== 'number' ||
        typeof startOffset !== 'number' ||
        typeof endLine !== 'number' ||
        typeof endOffset !== 'number'
      ) {
        continue
      }
      out.push({
        id: c.id,
        versionId: c.versionId,
        startLine,
        startOffset,
        endLine,
        endOffset,
        quote: typeof c.quote === 'string' ? c.quote : '',
        locationHash:
          typeof c.locationHash === 'string'
            ? c.locationHash
            : locationHash(c.versionId, startLine, startOffset, endLine, endOffset),
        author: typeof c.author === 'string' ? c.author : null,
        text: c.text,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : 0,
      })
    }
    return out
  } catch {
    return []
  }
}

/** Serialize comments to the file's JSON form. */
export function serializeComments(comments: Comment[]): string {
  const file: CommentFile = { version: 1, comments }
  return JSON.stringify(file, null, 2)
}
