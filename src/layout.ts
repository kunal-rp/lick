// Remembers the workspace layout — which sidebar panel is open, what sits
// beside the editor, and how the split is sized — so it's restored on reload
// and in new tabs. Purely a local UI preference (like the last-opened file),
// kept in localStorage; nothing here touches Drive.

const KEY = 'fountain-editor:layout'

/**
 * Which panel the left sidebar shows: the things you *navigate* by. Cast
 * (Characters & Locations) used to be a collapsed strip underneath the
 * preview, so the app's only jump-to-line surface existed only while the
 * preview did; it belongs here with the files and the outline.
 *
 * Notes is deliberately not here. It's a place you read from and write to
 * while drafting, which makes it a companion to the script rather than a way
 * of getting around it — see {@link Companion}.
 */
export type SidebarTab = 'files' | 'outline' | 'cast'

/**
 * What sits beside the editor, or 'none' for a full-width editor.
 *
 * One value rather than a boolean per panel: the slot holds one thing, so the
 * state can't express a combination the layout can't render. The control for
 * it is a segmented switch listing all three — including the full-width
 * option, which is the part the earlier pane toggles got wrong. There,
 * collapsing the pane meant clicking whichever tab was already active: a
 * hidden behaviour of the selected item rather than a choice you could see.
 */
export type Companion = 'none' | 'preview' | 'notes'

export interface LayoutPrefs {
  /** Whether the left sidebar is collapsed to its icon rail. */
  navCollapsed: boolean
  /** Which sidebar panel is showing. */
  sidebarTab: SidebarTab
  /** What sits beside the editor. */
  companion: Companion
  /** Editor pane width as a percentage of the split (0–100). */
  splitLeftPercent: number
  /** Which groups the Characters & Locations panel displays. */
  insightsGroups: InsightsGroups
  /** Whether section ranges are rendered over the preview pages. */
  showSections: boolean
}

/**
 * Per-group visibility for the Cast panel. Sections used to be a third group
 * here; they're the Outline tab's job now, so the record has two members.
 */
export interface InsightsGroups {
  characters: boolean
  locations: boolean
}

const DEFAULT_GROUPS: InsightsGroups = {
  characters: true,
  locations: true,
}

const DEFAULTS: LayoutPrefs = {
  navCollapsed: false,
  sidebarTab: 'files',
  // The pages open beside the editor by default: seeing how an edit lands in
  // the final render, as you make it, is the reason to have them at all.
  companion: 'preview',
  splitLeftPercent: 50,
  insightsGroups: { ...DEFAULT_GROUPS },
  showSections: false,
}

/**
 * Older shapes of this record, read once so an existing install lands
 * somewhere sensible instead of snapping back to the defaults:
 *
 *   v1  `showPreview` / `showNotes` booleans — Notes was an overlay drawer
 *       that drew *over* the preview.
 *   v2  `rightTab: 'preview' | 'notes' | null` — the two became peers sharing
 *       the right pane.
 *   v3  `showPreview` again, when the preview was briefly a full-window mode
 *       and Notes lived in the sidebar.
 *
 * v2 maps across almost exactly, since `companion` is the same idea with the
 * collapsed state named rather than implied.
 */
interface LegacyPrefs {
  showPreview?: unknown
  showNotes?: unknown
  rightTab?: unknown
  sidebarTab?: unknown
}

function migrateCompanion(legacy: LegacyPrefs): Companion {
  if (legacy.rightTab === 'notes') return 'notes'
  if (legacy.rightTab === 'preview') return 'preview'
  if (legacy.rightTab === null) return 'none'
  // v3 stored the sidebar on Notes; that's now a companion, not a tab.
  if (legacy.sidebarTab === 'notes') return 'notes'
  if (legacy.showNotes === true) return 'notes'
  if (typeof legacy.showPreview === 'boolean') {
    return legacy.showPreview ? 'preview' : 'none'
  }
  return DEFAULTS.companion
}

export function loadLayout(): LayoutPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<LayoutPrefs> & LegacyPrefs
      return {
        navCollapsed:
          typeof parsed.navCollapsed === 'boolean'
            ? parsed.navCollapsed
            : DEFAULTS.navCollapsed,
        sidebarTab:
          parsed.sidebarTab === 'files' ||
          parsed.sidebarTab === 'outline' ||
          parsed.sidebarTab === 'cast'
            ? parsed.sidebarTab
            : DEFAULTS.sidebarTab,
        companion:
          parsed.companion === 'none' ||
          parsed.companion === 'preview' ||
          parsed.companion === 'notes'
            ? parsed.companion
            : migrateCompanion(parsed),
        splitLeftPercent:
          typeof parsed.splitLeftPercent === 'number'
            ? Math.min(80, Math.max(20, parsed.splitLeftPercent))
            : DEFAULTS.splitLeftPercent,
        insightsGroups: {
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
