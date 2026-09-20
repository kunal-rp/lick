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

/** How long the theme cross-fade in index.css runs. */
const FADE_MS = 300

let fadeTimer = 0

/**
 * Turn the cross-fade on for the length of one theme change.
 *
 * The transition used to live on `*` permanently, which meant every hover,
 * tab selection and segmented-control press also took 300ms to settle —
 * controls felt like they hadn't registered the click. Gating it on an
 * attribute keeps the fade where it was wanted and nowhere else.
 */
export function beginThemeFade(): void {
  const root = document.documentElement
  root.setAttribute('data-theming', '')
  if (fadeTimer !== 0) clearTimeout(fadeTimer)
  fadeTimer = window.setTimeout(() => {
    fadeTimer = 0
    root.removeAttribute('data-theming')
  }, FADE_MS)
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Best-effort only.
  }
}
