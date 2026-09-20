import type { DriveFile } from './files'
import { NOTES_FILENAME, NOTE_ASSET_PREFIX } from '../notes'

// Versions are files named `<project name>_v<N>.fountain` inside a project
// folder. The number orders them; the highest is the most recent. Files that
// don't match the scheme are still listed (labeled by name) and sorted after
// numbered ones.

export interface Version {
  file: DriveFile
  /** Parsed version number, or 0 if the file isn't `_v<N>`-named. */
  number: number
  /** Display label, e.g. "v3". */
  label: string
}

/** A PDF export of a version (rendered from the preview, non-editable). */
export interface PdfEntry {
  file: DriveFile
  /** Display label, e.g. "v3". */
  label: string
}

// Match a version number as `_v<N>` (new scheme) or a leading `v<N>` (legacy).
const VERSION_RE = /(?:^|_)v(\d+)/i

/** Whether a file is a PDF export rather than an editable version. */
export function isPdf(file: DriveFile): boolean {
  return file.mimeType === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/**
 * A project's legacy comments store. Commenting was removed in favour of
 * referencing script lines from a note, but the file is left alone on Drive
 * rather than deleted — it's the user's data, and if they open the folder they
 * should find it where they left it. It just has to keep being excluded from
 * the draft list so it never shows up as something to open.
 */
const LEGACY_COMMENTS_FILENAME = 'comments.json'

function isLegacyCommentsFile(file: DriveFile): boolean {
  return file.name === LEGACY_COMMENTS_FILENAME
}

/**
 * A project's legacy edit-history store. Automatic snapshots were replaced by
 * per-draft comparison; like the old comments file this is left alone on Drive
 * rather than deleted, and just kept out of the draft list.
 */
const LEGACY_HISTORY_FILENAME = 'history.json'

function isLegacyHistoryFile(file: DriveFile): boolean {
  return file.name === LEGACY_HISTORY_FILENAME
}

/** Whether a file is the project's notes store (data, not a version). */
export function isNotesFile(file: DriveFile): boolean {
  return file.name === NOTES_FILENAME
}

/** Whether a file backs a note's inline image/video (data, not a version). */
export function isNoteAssetFile(file: DriveFile): boolean {
  return file.name.startsWith(NOTE_ASSET_PREFIX)
}

/** Files that are neither PDF exports nor a data sidecar. */
function isVersionFile(file: DriveFile): boolean {
  return (
    !isPdf(file) &&
    !isLegacyCommentsFile(file) &&
    !isLegacyHistoryFile(file) &&
    !isNotesFile(file) &&
    !isNoteAssetFile(file)
  )
}

/** Parse and order the editable version files, most recent first. */
export function parseVersions(files: DriveFile[]): Version[] {
  const versions = files
    .filter(isVersionFile)
    .map((file) => {
      const match = file.name.match(VERSION_RE)
      const number = match ? parseInt(match[1], 10) : 0
      return { file, number, label: match ? `v${match[1]}` : file.name }
    })
  versions.sort(
    (a, b) => b.number - a.number || a.file.name.localeCompare(b.file.name),
  )
  return versions
}

/** The PDF exports in a folder, ordered by name (non-selectable in the UI). */
export function listPdfs(files: DriveFile[]): PdfEntry[] {
  return files
    .filter(isPdf)
    .map((file) => {
      const match = file.name.match(VERSION_RE)
      return { file, label: match ? `v${match[1]}` : file.name }
    })
    .sort((a, b) => a.file.name.localeCompare(b.file.name))
}

/** The next version number to use when creating a new version. */
export function nextVersionNumber(files: DriveFile[]): number {
  let max = 0
  for (const file of files) {
    if (isPdf(file)) continue
    const match = file.name.match(VERSION_RE)
    if (match) max = Math.max(max, parseInt(match[1], 10))
  }
  return max + 1
}

// Normalize a project name for use in a filename: drop punctuation and turn
// runs of whitespace into single underscores.
function slugifyProjectName(projectName: string): string {
  const slug = projectName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '')
  return slug || 'project'
}

export function versionFileName(projectName: string, n: number): string {
  return `${slugifyProjectName(projectName)}_v${n}.fountain`
}
