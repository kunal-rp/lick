// Remembers which project/version the user last had open (and where they were
// scrolled to) so the app can reopen to that spot on reload. Persisted in
// localStorage; all access is defensive so a corrupt or unavailable store is
// simply treated as "nothing remembered".

const KEY = 'fountain-editor:last-opened'

export interface LastOpened {
  folderId: string
  projectId: string
  versionId: string
  /** Editor scroll offset (px) remembered per version id. */
  scrollByVersion: Record<string, number>
}

// Pre-rename records stored the project id under `scriptId`; read either so a
// returning user keeps their last-opened project across the terminology change.
interface StoredLastOpened extends Partial<LastOpened> {
  scriptId?: string
}

export function loadLastOpened(): LastOpened | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const v = JSON.parse(raw) as StoredLastOpened
    const projectId =
      typeof v.projectId === 'string'
        ? v.projectId
        : typeof v.scriptId === 'string'
          ? v.scriptId
          : undefined
    if (
      typeof v.folderId === 'string' &&
      typeof projectId === 'string' &&
      typeof v.versionId === 'string'
    ) {
      return {
        folderId: v.folderId,
        projectId,
        versionId: v.versionId,
        scrollByVersion:
          v.scrollByVersion !== null && typeof v.scrollByVersion === 'object'
            ? v.scrollByVersion
            : {},
      }
    }
  } catch {
    // Ignore malformed/unavailable storage.
  }
  return null
}

export function saveLastOpened(value: LastOpened): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    // Ignore quota/availability errors — persistence is best-effort.
  }
}
