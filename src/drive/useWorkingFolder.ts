import { useCallback, useState } from 'react'
import { pickFolder, type DriveFolder } from './picker'

// The chosen folder is just an { id, name } reference — not sensitive like the
// access token — so it's fine to persist in localStorage across reloads.
const STORAGE_KEY = 'lick.working-folder'

function loadFolder(): DriveFolder | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as DriveFolder).id === 'string' &&
      typeof (parsed as DriveFolder).name === 'string'
    ) {
      return parsed as DriveFolder
    }
  } catch {
    // Corrupt or unavailable storage — treat as no folder.
  }
  return null
}

function saveFolder(folder: DriveFolder): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(folder))
}

export interface WorkingFolder {
  folder: DriveFolder | null
  /** True while the picker is open. */
  picking: boolean
  /** Open the picker; on selection, persist and update the folder. */
  choose: () => Promise<void>
}

export function useWorkingFolder(): WorkingFolder {
  const [folder, setFolder] = useState<DriveFolder | null>(loadFolder)
  const [picking, setPicking] = useState(false)

  const choose = useCallback(async () => {
    setPicking(true)
    try {
      const picked = await pickFolder()
      if (picked !== null) {
        saveFolder(picked)
        setFolder(picked)
      }
    } finally {
      setPicking(false)
    }
  }, [])

  return { folder, picking, choose }
}
