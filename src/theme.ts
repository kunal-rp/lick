// Light/dark theme preference, persisted in localStorage and applied as a
// `data-theme` attribute on <html> (see index.css for the token definitions).

export type Theme = 'light' | 'dark'

const KEY = 'fountain-editor:theme'

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Ignore unavailable storage.
  }
  // No saved preference: follow the OS setting, defaulting to dark.
  try {
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      return 'light'
    }
  } catch {
    // matchMedia unavailable — fall through.
  }
  return 'dark'
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Best-effort only.
  }
}
