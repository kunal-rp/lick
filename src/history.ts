// Edit history. Like comments, all edit-history snapshots for a script — across
// every version — live in a single JSON file (HISTORY_FILENAME) in the script's
// Drive folder. That file is data, never a screenplay version: it is excluded
// from the version list and is never opened in the editor (see drive/versions.ts).
//
// A snapshot captures the full text of a version at a moment in time. They are
// recorded automatically as the user edits (coalesced so near-simultaneous saves
// collapse to one) and are capped to the most recent few per version — this is a
// "recent editing history", not a permanent archive. The user can browse the
// timeline and restore any snapshot; restoring is itself recorded, so the text
// that was current before a restore stays reachable ("forward").

export const HISTORY_FILENAME = 'history.json'

// Coalesce automatic snapshots taken closer together than this: the later one
// replaces the earlier so the timeline stays roughly one entry per interval.
export const MIN_SNAPSHOT_INTERVAL_MS = 30_000
// Keep at most this many snapshots per version; the oldest are pruned.
export const MAX_SNAPSHOTS_PER_VERSION = 50

/** How a snapshot came to be, shown as a badge in the timeline. */
export type SnapshotKind = 'auto' | 'manual' | 'restore'

export interface HistorySnapshot {
  /** Unique id for this snapshot. */
  id: string
  /** Drive file id of the version this snapshot belongs to. */
  versionId: string
  /** Full Fountain source at this point in time. */
  text: string
  /** Capture time (epoch ms). */
  createdAt: number
  /** Why the snapshot was taken. */
  kind: SnapshotKind
}

/** Build a snapshot, stamping a unique id. */
export function makeSnapshot(
  versionId: string,
  text: string,
  kind: SnapshotKind,
  now: number,
): HistorySnapshot {
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return { id, versionId, text, createdAt: now, kind }
}

/** The snapshots for one version, oldest first (list order is chronological). */
export function snapshotsForVersion(
  list: HistorySnapshot[],
  versionId: string,
): HistorySnapshot[] {
  return list.filter((s) => s.versionId === versionId)
}

/**
 * Append a snapshot, applying dedup, coalescing, and per-version capping.
 * Returns the same array reference (unchanged) when the snapshot is a no-op
 * (identical text to the version's latest), so callers can skip a write.
 */
export function appendSnapshot(
  list: HistorySnapshot[],
  snap: HistorySnapshot,
): HistorySnapshot[] {
  const sameVersion = snapshotsForVersion(list, snap.versionId)
  const last = sameVersion[sameVersion.length - 1]

  // Nothing changed since the last snapshot for this version — don't record.
  if (last !== undefined && last.text === snap.text) return list

  // Two automatic saves close together collapse into one: drop the earlier.
  let base = list
  if (
    last !== undefined &&
    last.kind === 'auto' &&
    snap.kind === 'auto' &&
    snap.createdAt - last.createdAt < MIN_SNAPSHOT_INTERVAL_MS
  ) {
    base = list.filter((s) => s !== last)
  }

  let next = [...base, snap]

  // Prune the oldest snapshots for this version beyond the cap.
  const idxs: number[] = []
  next.forEach((s, i) => {
    if (s.versionId === snap.versionId) idxs.push(i)
  })
  if (idxs.length > MAX_SNAPSHOTS_PER_VERSION) {
    const remove = new Set(idxs.slice(0, idxs.length - MAX_SNAPSHOTS_PER_VERSION))
    next = next.filter((_, i) => !remove.has(i))
  }

  return next
}

interface HistoryFile {
  version: 1
  snapshots: HistorySnapshot[]
}

/** Parse the history file content; tolerant of missing/corrupt data. */
export function parseHistory(json: string): HistorySnapshot[] {
  try {
    const data = JSON.parse(json) as Partial<HistoryFile>
    if (!Array.isArray(data.snapshots)) return []
    const out: HistorySnapshot[] = []
    for (const raw of data.snapshots as unknown[]) {
      if (raw === null || typeof raw !== 'object') continue
      const s = raw as Partial<HistorySnapshot>
      if (
        typeof s.id !== 'string' ||
        typeof s.versionId !== 'string' ||
        typeof s.text !== 'string'
      ) {
        continue
      }
      out.push({
        id: s.id,
        versionId: s.versionId,
        text: s.text,
        createdAt: typeof s.createdAt === 'number' ? s.createdAt : 0,
        kind:
          s.kind === 'manual' || s.kind === 'restore' ? s.kind : 'auto',
      })
    }
    return out
  } catch {
    return []
  }
}

/** Serialize snapshots to the file's JSON form. */
export function serializeHistory(snapshots: HistorySnapshot[]): string {
  const file: HistoryFile = { version: 1, snapshots }
  return JSON.stringify(file)
}
