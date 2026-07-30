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

// Match a version number as `_v<N>` (new scheme) or a leading `v<N>` (legacy).
const VERSION_RE = /(?:^|_)v(\d+)/i

/** Parse and order version files, most recent first. */
export function parseVersions(files: DriveFile[]): Version[] {
  const versions = files.map((file) => {
    const match = file.name.match(VERSION_RE)
    const number = match ? parseInt(match[1], 10) : 0
    return { file, number, label: match ? `v${match[1]}` : file.name }
  })
  versions.sort(
    (a, b) => b.number - a.number || a.file.name.localeCompare(b.file.name),
  )
  return versions
}

/** The next version number to use when creating a new version. */
export function nextVersionNumber(files: DriveFile[]): number {
  let max = 0
  for (const file of files) {
    const match = file.name.match(VERSION_RE)
    if (match) max = Math.max(max, parseInt(match[1], 10))
  }
  return max + 1
}

export function versionFileName(scriptName: string, n: number): string {
  return `${scriptName}_v${n}.fountain`
}
