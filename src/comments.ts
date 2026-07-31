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

/** Where a comment is anchored: a version and a range within one element. */
export interface CommentAnchor {
  /** Drive file id of the version the comment belongs to. */
  versionId: string
  /** Source line of the anchored preview element. */
  line: number
  /** Character range within that element's rendered text. */
  start: number
  end: number
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
  line: number,
  start: number,
  end: number,
): string {
  const key = `${versionId}|${line}|${start}|${end}`
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
  const hash = locationHash(anchor.versionId, anchor.line, anchor.start, anchor.end)
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

/** Parse the comments file content; tolerant of missing/corrupt data. */
export function parseComments(json: string): Comment[] {
  try {
    const data = JSON.parse(json) as Partial<CommentFile>
    if (!Array.isArray(data.comments)) return []
    return data.comments.filter(
      (c): c is Comment =>
        c !== null &&
        typeof c === 'object' &&
        typeof (c as Comment).id === 'string' &&
        typeof (c as Comment).versionId === 'string' &&
        typeof (c as Comment).line === 'number' &&
        typeof (c as Comment).start === 'number' &&
        typeof (c as Comment).end === 'number' &&
        typeof (c as Comment).text === 'string',
    )
  } catch {
    return []
  }
}

/** Serialize comments to the file's JSON form. */
export function serializeComments(comments: Comment[]): string {
  const file: CommentFile = { version: 1, comments }
  return JSON.stringify(file, null, 2)
}
