// Remembers which script/version the user last had open (and where they were
// scrolled to) so the app can reopen to that spot on reload. Persisted in
// localStorage; all access is defensive so a corrupt or unavailable store is
// simply treated as "nothing remembered".

const KEY = 'fountain-editor:last-opened'

export interface LastOpened {
  folderId: string
  scriptId: string
  versionId: string
  /** Editor scroll offset (px) remembered per version id. */
  scrollByVersion: Record<string, number>
}

export function loadLastOpened(): LastOpened | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const v = JSON.parse(raw) as Partial<LastOpened>
    if (
      typeof v.folderId === 'string' &&
      typeof v.scriptId === 'string' &&
      typeof v.versionId === 'string'
    ) {
      return {
        folderId: v.folderId,
        scriptId: v.scriptId,
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
