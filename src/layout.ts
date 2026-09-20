// Remembers the workspace panel layout — what occupies the right pane and how
// the split is sized — so it's restored on reload and in new tabs. Purely a
// local UI preference (like the last-opened file), kept in localStorage;
// nothing here touches Drive.

const KEY = 'fountain-editor:layout'

/**
 * Which panel the left sidebar shows. Files, Outline, Notes and Cast are tabs
 * of one rail — everything you consult rather than type into.
 *
 * Notes used to share the *right* pane with the preview, which meant opening
 * your notes destroyed your pages. Cast (Characters & Locations) was a
 * collapsed strip underneath the preview, so the app's only jump-to-line
 * surface existed only while the preview did. Both now sit beside the files,
 * which is where every comparable app puts them.
 */
export type SidebarTab = 'files' | 'outline' | 'notes' | 'cast'

export interface LayoutPrefs {
  /** Whether the left sidebar is collapsed to its icon rail. */
  navCollapsed: boolean
  /** Which sidebar panel is showing. */
  sidebarTab: SidebarTab
  /** Whether the preview is showing instead of the editor. */
  showPreview: boolean
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
  // The editor formats in place now, so the pages are something you go and
  // check rather than something you keep open beside the text.
  showPreview: false,
  insightsGroups: { ...DEFAULT_GROUPS },
  showSections: false,
}

/**
 * Older shapes of this record, read once so an existing install lands somewhere
 * sensible instead of snapping back to the defaults:
 *
 *   v1  `showPreview` / `showNotes` booleans — Notes was an overlay drawer that
 *       drew *over* the preview.
 *   v2  `rightTab: 'preview' | 'notes' | null` — the two became peers sharing
 *       the right pane.
 *
 * Notes has since moved to the sidebar, so a stored "notes" is now two
 * settings: open the sidebar on its tab, and leave the preview alone.
 */
interface LegacyPrefs {
  showPreview?: unknown
  showNotes?: unknown
  rightTab?: unknown
}

function migrateSidebarTab(legacy: LegacyPrefs): SidebarTab {
  if (legacy.rightTab === 'notes' || legacy.showNotes === true) return 'notes'
  return DEFAULTS.sidebarTab
}

/**
 * The preview is a mode now, not a pane, so a stored "the preview pane was
 * open" doesn't translate — it described a split that no longer exists, and
 * restoring it would drop the writer into the pages instead of their script.
 * Everyone starts in the editor.
 */
function migratePreview(): boolean {
  return DEFAULTS.showPreview
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
          parsed.sidebarTab === 'notes' ||
          parsed.sidebarTab === 'cast'
            ? parsed.sidebarTab
            : migrateSidebarTab(parsed),
        showPreview:
          typeof parsed.showPreview === 'boolean' && parsed.rightTab === undefined
            ? parsed.showPreview
            : migratePreview(),
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
