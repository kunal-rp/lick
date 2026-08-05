// Remembers the workspace panel layout — which panels are open and how the
// editor/preview split is sized — so it's restored on reload and in new tabs.
// Purely a local UI preference (like the last-opened file), kept in
// localStorage; nothing here touches Drive.

const KEY = 'fountain-editor:layout'

export interface LayoutPrefs {
  /** Whether the preview (and the Characters & Locations panel) is shown. */
  showPreview: boolean
  /** Whether the left file-nav is collapsed. */
  navCollapsed: boolean
  /** Editor pane width as a percentage of the split (0–100). */
  splitLeftPercent: number
  /** Whether the Characters & Locations panel is collapsed. */
  insightsCollapsed: boolean
  /** Which groups the Characters & Locations panel displays. */
  insightsGroups: InsightsGroups
  /** Whether section ranges are rendered over the preview pages. */
  showSections: boolean
}

/** Per-group visibility for the Characters & Locations panel. */
export interface InsightsGroups {
  sections: boolean
  characters: boolean
  locations: boolean
}

const DEFAULT_GROUPS: InsightsGroups = {
  sections: true,
  characters: true,
  locations: true,
}

const DEFAULTS: LayoutPrefs = {
  showPreview: true,
  navCollapsed: false,
  splitLeftPercent: 50,
  insightsCollapsed: false,
  insightsGroups: { ...DEFAULT_GROUPS },
  showSections: false,
}

export function loadLayout(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<LayoutPrefs>
      return {
        showPreview:
          typeof parsed.showPreview === 'boolean'
            ? parsed.showPreview
            : DEFAULTS.showPreview,
        navCollapsed:
          typeof parsed.navCollapsed === 'boolean'
            ? parsed.navCollapsed
            : DEFAULTS.navCollapsed,
        splitLeftPercent:
          typeof parsed.splitLeftPercent === 'number'
            ? Math.min(80, Math.max(20, parsed.splitLeftPercent))
            : DEFAULTS.splitLeftPercent,
        insightsCollapsed:
          typeof parsed.insightsCollapsed === 'boolean'
            ? parsed.insightsCollapsed
            : DEFAULTS.insightsCollapsed,
        insightsGroups: {
          sections:
            typeof parsed.insightsGroups?.sections === 'boolean'
              ? parsed.insightsGroups.sections
              : DEFAULT_GROUPS.sections,
          characters:
            typeof parsed.insightsGroups?.characters === 'boolean'
              ? parsed.insightsGroups.characters
              : DEFAULT_GROUPS.characters,
          locations:
            typeof parsed.insightsGroups?.locations === 'boolean'
              ? parsed.insightsGroups.locations
              : DEFAULT_GROUPS.locations,
        },
        showSections:
          typeof parsed.showSections === 'boolean'
            ? parsed.showSections
            : DEFAULTS.showSections,
      }
    }
  } catch {
    // Corrupt/unavailable storage — fall back to defaults.
  }
  return { ...DEFAULTS }
}

export function saveLayout(prefs: LayoutPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Best-effort only.
  }
}
