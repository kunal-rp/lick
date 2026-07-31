import type { DriveFile } from './files'

// Versions are files named `<script name>_v<N>.fountain` inside a script
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

/** Parse and order the editable version files, most recent first. */
export function parseVersions(files: DriveFile[]): Version[] {
  const versions = files
    .filter((file) => !isPdf(file))
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

// Normalize a script name for use in a filename: drop punctuation and turn
// runs of whitespace into single underscores.
function slugifyScriptName(scriptName: string): string {
  const slug = scriptName
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '')
  return slug || 'script'
}

export function versionFileName(scriptName: string, n: number): string {
  return `${slugifyScriptName(scriptName)}_v${n}.fountain`
}
