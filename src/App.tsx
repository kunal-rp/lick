import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SplitPane } from './components/SplitPane'
import { InsightsPanel } from './components/InsightsPanel'
import { FileNav } from './components/FileNav'
import { Sidebar } from './components/Sidebar'
import { OutlinePanel } from './components/OutlinePanel'
import { VersionBar } from './components/VersionBar'
import { HistoryPanel } from './components/HistoryPanel'
import { NotesPanel } from './components/NotesPanel'
import { CommandPalette, type Command } from './components/CommandPalette'
import {
  createBinaryFile,
  createFile,
  createFolder,
  listFiles,
  listFolders,
  readFile,
  readFileBlob,
  trashFile,
  updateBinaryFileContent,
  updateFileContent,
  type DriveFile,
} from './drive/files'
import {
  isHistoryFile,
  isNotesFile,
  isPdf,
  nextVersionNumber,
  parseVersions,
  versionFileName,
} from './drive/versions'
import {
  HISTORY_FILENAME,
  appendSnapshot,
  makeSnapshot,
  parseHistory,
  serializeHistory,
  snapshotsForVersion,
  type HistorySnapshot,
  type SnapshotKind,
} from './history'
import { parseSections } from './fountain'
import { buildScreenplayPdf } from './pdf'
import {
  NOTES_FILENAME,
  NOTE_ASSET_PREFIX,
  makeId,
  makeMediaBlock,
  makeNote,
  makeScriptRefBlock,
  mediaBlocks,
  normalizeBlocks,
  parseNotes,
  serializeNotes,
  type MediaBlock,
  type Note,
  type ScriptRefBlock,
} from './notes'
import { useDriveAuth } from './drive/useDriveAuth'
import { useWorkingFolder } from './drive/useWorkingFolder'
import { loadLastOpened, saveLastOpened } from './lastOpened'
import { loadLayout, saveLayout, type Companion, type SidebarTab } from './layout'
import { beginThemeFade, loadTheme, saveTheme, type Theme } from './theme'
import { MenuIcon } from './components/icons'
import { useIsMobile } from './useIsMobile'
import { useAppViewportHeight } from './useAppViewportHeight'
import './App.css'

// Shown in command hints. Matches the actual handler, which accepts either.
const MOD_KEY =
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent)
    ? '\u2318'
    : 'Ctrl+'

const SHIFT_MOD = MOD_KEY === '\u2318' ? '\u21e7\u2318' : 'Ctrl+Shift+'

// Background auto-save: persist after the user pauses, or after enough edits,
// or if too long has passed since the last save while typing continuously.
const AUTOSAVE_IDLE_MS = 1500
const AUTOSAVE_MAX_MS = 8000
const AUTOSAVE_CHANGE_THRESHOLD = 40

// Edit-history snapshots pile up in memory as the user edits; the JSON file is
// written to Drive this long after the last change, so history writes lag —
// never race — the version saves.
const HISTORY_WRITE_DEBOUNCE_MS = 5000

// Notes are edited live in memory; the JSON file is written this long after the
// last change so typing in a note never blocks on a Drive round-trip.
const NOTES_WRITE_DEBOUNCE_MS = 1500

// Load the whole directory: every project folder plus its version files, so the
// left-nav tree can show the full project at once.
async function loadTree(folderId: string): Promise<{
  projects: DriveFile[]
  versionsByProject: Record<string, DriveFile[]>
}> {
  const projects = await listFolders(folderId)
  const entries = await Promise.all(
    projects.map(async (s) => [s.id, await listFiles(s.id)] as const),
  )
  return { projects, versionsByProject: Object.fromEntries(entries) }
}

export default function App() {
  const auth = useDriveAuth()
  const { folder, picking, choose } = useWorkingFolder()
  // Phone-width layout: the file nav becomes a floating drawer, and the editor
  // and preview become mutually exclusive full-screen views toggled by the
  // Preview button (no side split, no Characters & Locations panel).
  const isMobile = useIsMobile()

  // On mobile, size the workspace to the visual viewport so the editor sits
  // above the on-screen keyboard rather than behind it (see App.css `--app-h`).
  useAppViewportHeight(isMobile)

  // The full directory: project folders and each project's version files,
  // eagerly loaded so the left-nav tree shows everything.
  const [projects, setProjects] = useState<DriveFile[]>([])
  const [versionsByProject, setVersionsByProject] = useState<
    Record<string, DriveFile[]>
  >({})
  const [treeLoading, setTreeLoading] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)

  // Last-loaded/saved content of the selected version; null while loading.
  const [content, setContent] = useState<string | null>(null)
  // `source` is the live editor text (drives the preview) and follows edits.
  const [source, setSource] = useState('')
  // Source line indices where the preview breaks a page; the editor draws a
  // dashed guide at each so the writer sees page boundaries in context.
  const [pageBreakLines, setPageBreakLines] = useState<number[]>([])

  // Saved panel layout (which panels are open + sizes), restored on load.
  const layoutRef = useRef(loadLayout())
  const [navCollapsed, setNavCollapsed] = useState(layoutRef.current.navCollapsed)
  // Light/dark theme, applied to <html> as data-theme and persisted.
  const [theme, setTheme] = useState<Theme>(loadTheme)

  // The workspace is a sidebar, the editor, and whatever sits beside it.
  // `sidebarTab` says which navigation panel the sidebar shows; `companion`
  // says what shares the main area with the editor — the pages, the notes, or
  // nothing. Two values, the same at every width: on a phone the companion
  // simply fills the screen instead of splitting it.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(
    layoutRef.current.sidebarTab,
  )
  const [companion, setCompanion] = useState<Companion>(
    layoutRef.current.companion,
  )

  // Whether section ranges are rendered over the preview pages (toolbar toggle).
  const [showSections, setShowSections] = useState(layoutRef.current.showSections)
  // Jump-to-line request forwarded to the editor; the nonce lets the same
  // line re-fire on repeated clicks.
  const [jump, setJump] = useState<{ line: number; nonce: number } | null>(null)
  const jumpToLine = (line: number) =>
    setJump((j) => ({ line, nonce: (j?.nonce ?? 0) + 1 }))

  // Reveal request forwarded to the preview (editor double-click → scroll).
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(
    null,
  )
  const revealInPreview = (line: number) =>
    setReveal((r) => ({ line, nonce: (r?.nonce ?? 0) + 1 }))

  // The caret's source line, reported by the editor — what the Outline marks
  // as "you are here".
  const [caretLine, setCaretLine] = useState(0)

  // The script lines currently selected, from whichever pane the writer
  // selected in. This is what a note quotes when you press its quote button.
  const [scriptSelection, setScriptSelection] = useState<{
    startLine: number
    endLine: number
  } | null>(null)

  /**
   * Go to a source line from outside both panes — the Outline and Cast tabs.
   *
   * Moves the editor *and* the preview. Those are two views of one script, and
   * jumping one while the other stayed put meant clicking a scene in the
   * outline left the pages showing a different part of the film than the text
   * beside them.
   *
   * The two cross-pane handlers stay one-way on purpose: clicking in the
   * preview jumps the editor, and double-clicking in the editor reveals in the
   * preview. Each is already a deliberate move *from* the pane you're looking
   * at, so scrolling that pane too would be answering a question nobody asked
   * — and making either symmetric would have them chase each other.
   */
  const goToLine = (line: number) => {
    jumpToLine(line)
    revealInPreview(line)
  }

  // Bumped to force the (otherwise uncontrolled) editor to remount and re-seed
  // its text — used when restoring a history snapshot into the open version.
  const [editorReloadNonce, setEditorReloadNonce] = useState(0)

  // Recent edit-history snapshots for the selected project (all versions), from
  // its history.json. Captured as the user edits; browsable in the History
  // dialog, where any snapshot can be restored.
  const [history, setHistory] = useState<HistorySnapshot[]>([])
  const [showHistory, setShowHistory] = useState(false)
  // Command palette visibility. Deliberately not persisted — it is a momentary
  // door, not a layout.
  const [showCommands, setShowCommands] = useState(false)
  // Live mirror of `history` for the async snapshot recorder/writer, plus the
  // project it belongs to and the Drive file id (created lazily on first write).
  const historyRef = useRef<HistorySnapshot[]>([])
  const historyProjectIdRef = useRef<string | null>(null)
  const historyFileIdRef = useRef<string | null>(null)
  // Which project's history is loaded, so a versionsByProject refresh (e.g. after
  // creating history.json) doesn't clobber freshly recorded in-memory snapshots.
  const loadedHistoryProjectRef = useRef<string | null>(null)
  const historyDirtyRef = useRef(false)
  const historyWriteTimer = useRef<number>(0)

  // Notes for the selected project (all versions), from its notes.json. Edited
  // live in the Notes pane; writes to Drive are debounced. Mirrored to refs
  // for the async writer, guarded like history so a project switch mid-flush
  // can't cross projects.
  const [notes, setNotes] = useState<Note[]>([])
  const notesRef = useRef<Note[]>([])
  const notesProjectIdRef = useRef<string | null>(null)
  const notesFileIdRef = useRef<string | null>(null)
  const loadedNotesProjectRef = useRef<string | null>(null)
  const notesDirtyRef = useRef(false)
  const notesWriteTimer = useRef<number>(0)

  // True while a create/rename/new-version Drive write is in flight.
  const [busy, setBusy] = useState(false)
  // Last Drive-operation error message, shown to the user.
  const [error, setError] = useState<string | null>(null)
  // Background auto-save status for the version bar indicator.
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )
  // Timestamp (ms) of the last successful save this session, for the save UI.
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Scroll offset remembered per version, seeded from the last session.
  const scrollByVersionRef = useRef<Record<string, number>>(
    loadLastOpened()?.scrollByVersion ?? {},
  )
  // Latest persist() so the ⌘/Ctrl+S handler always calls the current closure.
  const persistRef = useRef<() => void>(() => {})
  // Same, for the ⇧⌘P preview toggle.
  const previewRef = useRef<() => void>(() => {})

  const savingRef = useRef(false)
  const changeCountRef = useRef(0)
  const lastSavedAtRef = useRef(Date.now())
  // Tracks the current version so an in-flight save doesn't clobber content
  // after the user switches versions mid-save.
  const currentVersionIdRef = useRef<string | null>(null)
  // The editor's live text and the version it was loaded from, updated together
  // so a save always writes to the file the text actually came from. Selection
  // (`selectedVersionId`) flips the instant the user clicks another version, but
  // the text only catches up once that version's file finishes loading; without
  // this pairing a save landing in that gap would write the outgoing version's
  // text into the incoming version's file. See persist().
  const sourceRef = useRef('')
  const sourceVersionIdRef = useRef<string | null>(null)
  // Live mirror of `content` (the last-saved baseline) for the async save
  // guard, so a stale closure can't misjudge whether there's anything to save.
  const contentRef = useRef<string | null>(null)

  // Editor edits: keep the live text ref in step with `source`. The owning
  // version is deliberately left alone here — typing never changes which file
  // the text belongs to; only loading a version does (see the load effect).
  const handleSourceChange = useCallback((text: string) => {
    sourceRef.current = text
    setSource(text)
  }, [])

  const folderId = folder?.id ?? null
  const selectedProject = projects.find((s) => s.id === selectedProjectId) ?? null
  const versions = useMemo(
    () => parseVersions(versionsByProject[selectedProjectId ?? ''] ?? []),
    [versionsByProject, selectedProjectId],
  )
  const dirty = content !== null && source !== content
  // Section ranges parsed from the live source, shared by the editor (tinted
  // bands), the preview (optional rendering), and the insights panel.
  const sections = useMemo(() => parseSections(source), [source])

  // Load the whole tree once signed in and a folder is chosen; auto-select the
  // first project and its most recent version. Gated on auth so a restored
  // folder can't trigger Drive calls before the token is ready (e.g. in a new
  // tab), which would fail with an auth error.
  useEffect(() => {
    if (folderId === null || auth.status !== 'signed-in') return
    let active = true
    setTreeLoading(true)
    loadTree(folderId)
      .then(({ projects: list, versionsByProject: byProject }) => {
        if (!active) return
        setProjects(list)
        setVersionsByProject(byProject)
        setExpandedProjects(new Set(list.map((s) => s.id)))

        // Prefer the last-opened project/version if it still exists; otherwise
        // fall back to the first project's most recent version.
        const first = list[0] ?? null
        let projectId = first?.id ?? null
        let versionId = first
          ? (parseVersions(byProject[first.id] ?? [])[0]?.file.id ?? null)
          : null

        const saved = loadLastOpened()
        if (saved !== null && saved.folderId === folderId) {
          const projectExists = list.some((s) => s.id === saved.projectId)
          if (projectExists) {
            projectId = saved.projectId
            const versions = byProject[saved.projectId] ?? []
            versionId = versions.some((f) => f.id === saved.versionId)
              ? saved.versionId
              : (parseVersions(versions)[0]?.file.id ?? null)
          }
        }

        setSelectedProjectId(projectId)
        setSelectedVersionId(versionId)
      })
      .catch((err) => {
        if (!active) return
        console.error('[drive] load tree failed:', err)
        setError(String(err instanceof Error ? err.message : err))
        setProjects([])
        setVersionsByProject({})
        setSelectedProjectId(null)
        setSelectedVersionId(null)
      })
      .finally(() => {
        if (active) setTreeLoading(false)
      })
    return () => {
      active = false
    }
  }, [folderId, auth.status])

  // Apply and persist the theme. The cross-fade is switched on just for the
  // duration of the change (see beginThemeFade) so it doesn't slow every other
  // hover and selection in the app.
  const firstTheme = useRef(true)
  useEffect(() => {
    // Not on mount: there's nothing to fade from, and fading the first paint
    // just makes the app look like it's still loading.
    if (firstTheme.current) firstTheme.current = false
    else beginThemeFade()
    document.documentElement.setAttribute('data-theme', theme)
    saveTheme(theme)
  }, [theme])

  // Name the browser tab after the project being edited, so multiple open tabs
  // are tellable apart; fall back to the app name when nothing is open.
  const projectName = selectedProject?.name ?? null
  useEffect(() => {
    document.title = projectName ? `${projectName} — kunal's scripts` : "kunal's scripts"
  }, [projectName])

  // Persist the layout as it changes.
  useEffect(() => {
    layoutRef.current.navCollapsed = navCollapsed
    layoutRef.current.sidebarTab = sidebarTab
    layoutRef.current.companion = companion
    layoutRef.current.showSections = showSections
    saveLayout(layoutRef.current)
  }, [navCollapsed, sidebarTab, companion, showSections])

  // Entering mobile width, collapse the sidebar to its rail so the editor fills
  // the screen; the drawer is a tap away. Nothing to undo going the other way —
  // both densities now describe their layout with the same two values.
  useEffect(() => {
    if (isMobile) setNavCollapsed(true)
  }, [isMobile])

  // Track the selected version for the async-save guard.
  useEffect(() => {
    currentVersionIdRef.current = selectedVersionId
  }, [selectedVersionId])

  // Remember the currently-open project/version so a reload reopens to it.
  const rememberOpen = () => {
    if (folderId !== null && selectedProjectId !== null && selectedVersionId !== null) {
      saveLastOpened({
        folderId,
        projectId: selectedProjectId,
        versionId: selectedVersionId,
        scrollByVersion: scrollByVersionRef.current,
      })
    }
  }
  useEffect(rememberOpen, [folderId, selectedProjectId, selectedVersionId])

  // ⌘/Ctrl+S saves the editor's current text to the open version.
  useEffect(() => {
    persistRef.current = () => void persist()
    previewRef.current = togglePreview
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        persistRef.current()
      } else if (key === 'k') {
        // Toggle: the same keystroke that opened it closes it, so ⌘K is never
        // a trap you have to find Escape to get out of.
        e.preventDefault()
        setShowCommands((open) => !open)
      } else if (e.shiftKey && key === 'p') {
        // ⇧⌘P steps into the pages and back out — Slugline's shortcut for the
        // same move, and the reason the preview no longer needs to live on
        // screen permanently.
        e.preventDefault()
        previewRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Load the selected version's content.
  useEffect(() => {
    if (selectedVersionId === null) {
      setContent(null)
      contentRef.current = null
      setSource('')
      sourceRef.current = ''
      sourceVersionIdRef.current = null
      return
    }
    // This version's content is already loaded in the editor. The effect also
    // re-runs when `versionsByProject` changes (e.g. after creating a version
    // or writing notes) — reloading here would overwrite the editor with the
    // last-saved text and silently discard any unsaved edits, so bail out.
    if (selectedVersionId === sourceVersionIdRef.current) return
    const file = Object.values(versionsByProject)
      .flat()
      .find((f) => f.id === selectedVersionId)
    if (file === undefined) return
    let active = true
    setContent(null)
    contentRef.current = null
    readFile(file)
      .then((text) => {
        if (!active) return
        setContent(text)
        contentRef.current = text
        setSource(text)
        // Bind the loaded text to the version it came from (must be set
        // together with the text so a save can never cross versions).
        sourceRef.current = text
        sourceVersionIdRef.current = file.id
        // Fresh version: reset auto-save bookkeeping.
        changeCountRef.current = 0
        lastSavedAtRef.current = Date.now()
        setSavedAt(null)
        setSaveState('saved')
      })
      .catch((err) => {
        if (!active) return
        console.error('[drive] read version failed:', err)
        setError(String(err instanceof Error ? err.message : err))
        setContent('')
        contentRef.current = ''
        setSource('')
        sourceRef.current = ''
        // No trustworthy text loaded — disown so a save can't fire for it.
        sourceVersionIdRef.current = null
      })
    return () => {
      active = false
    }
  }, [selectedVersionId, versionsByProject])

  // Load the selected project's edit history (a single history.json for all its
  // versions). Only re-reads when the project actually changes — a
  // versionsByProject refresh (e.g. right after we create history.json) must not
  // overwrite snapshots recorded in memory since the load.
  useEffect(() => {
    if (selectedProjectId === null) {
      setHistory([])
      historyRef.current = []
      historyProjectIdRef.current = null
      historyFileIdRef.current = null
      loadedHistoryProjectRef.current = null
      return
    }
    if (loadedHistoryProjectRef.current === selectedProjectId) return
    const file = (versionsByProject[selectedProjectId] ?? []).find(isHistoryFile)
    historyProjectIdRef.current = selectedProjectId
    historyFileIdRef.current = file?.id ?? null
    if (file === undefined) {
      setHistory([])
      historyRef.current = []
      loadedHistoryProjectRef.current = selectedProjectId
      return
    }
    let active = true
    readFile(file)
      .then((text) => {
        if (!active) return
        const snaps = parseHistory(text)
        setHistory(snaps)
        historyRef.current = snaps
        loadedHistoryProjectRef.current = selectedProjectId
      })
      .catch((err) => {
        console.error('[history] read failed:', err)
        if (!active) return
        setHistory([])
        historyRef.current = []
        loadedHistoryProjectRef.current = selectedProjectId
      })
    return () => {
      active = false
    }
  }, [selectedProjectId, versionsByProject])

  // Load the selected project's notes (a single notes.json for all versions).
  // Like history, only re-reads when the project actually changes, so a
  // versionsByProject refresh (e.g. right after we create notes.json) doesn't
  // clobber edits made in memory since the load.
  useEffect(() => {
    if (selectedProjectId === null) {
      setNotes([])
      notesRef.current = []
      notesProjectIdRef.current = null
      notesFileIdRef.current = null
      loadedNotesProjectRef.current = null
      return
    }
    if (loadedNotesProjectRef.current === selectedProjectId) return
    const file = (versionsByProject[selectedProjectId] ?? []).find(isNotesFile)
    notesProjectIdRef.current = selectedProjectId
    notesFileIdRef.current = file?.id ?? null
    if (file === undefined) {
      setNotes([])
      notesRef.current = []
      loadedNotesProjectRef.current = selectedProjectId
      return
    }
    let active = true
    readFile(file)
      .then((text) => {
        if (!active) return
        const parsed = parseNotes(text)
        setNotes(parsed)
        notesRef.current = parsed
        loadedNotesProjectRef.current = selectedProjectId
      })
      .catch((err) => {
        console.error('[notes] read failed:', err)
        if (!active) return
        setNotes([])
        notesRef.current = []
        loadedNotesProjectRef.current = selectedProjectId
      })
    return () => {
      active = false
    }
  }, [selectedProjectId, versionsByProject])

  // Write the current notes to the project's notes.json (creating it the first
  // time). Debounced and guarded so it only writes the project it was scheduled
  // for, and never blocks editing.
  async function flushNotes(projectId: string) {
    notesWriteTimer.current = 0
    if (!notesDirtyRef.current) return
    if (notesProjectIdRef.current !== projectId) return
    notesDirtyRef.current = false
    const json = serializeNotes(notesRef.current)
    try {
      const fileId = notesFileIdRef.current
      if (fileId !== null) {
        await updateFileContent(fileId, json)
      } else {
        const created = await createFile(projectId, NOTES_FILENAME, json)
        notesFileIdRef.current = created.id
        const refreshed = await listFiles(projectId)
        setVersionsByProject((prev) => ({ ...prev, [projectId]: refreshed }))
      }
    } catch (err) {
      console.error('[notes] write failed:', err)
      setError(`Save note failed: ${err instanceof Error ? err.message : err}`)
      notesDirtyRef.current = true // retry on the next scheduled flush
    }
  }

  // Apply a notes mutation: update state + ref immediately (so the UI is live)
  // and schedule a debounced write to Drive.
  function mutateNotes(next: Note[]) {
    const projectId = notesProjectIdRef.current
    if (projectId === null) return
    notesRef.current = next
    setNotes(next)
    notesDirtyRef.current = true
    if (notesWriteTimer.current !== 0) clearTimeout(notesWriteTimer.current)
    notesWriteTimer.current = window.setTimeout(
      () => void flushNotes(projectId),
      NOTES_WRITE_DEBOUNCE_MS,
    )
  }

  // Create a blank note and return it (the panel opens it immediately).
  function addNote(): Note {
    const note = makeNote(Date.now())
    mutateNotes([...notesRef.current, note])
    return note
  }

  // Edit a note's title and/or blocks, stamping the modified time.
  function updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'blocks'>>) {
    const next = notesRef.current.map((n) =>
      n.id === id ? { ...n, ...patch, modifiedAt: Date.now() } : n,
    )
    mutateNotes(next)
  }

  // Delete a note and trash the Drive files backing any inline media it held.
  function deleteNote(id: string) {
    const note = notesRef.current.find((n) => n.id === id)
    mutateNotes(notesRef.current.filter((n) => n.id !== id))
    const media = note ? mediaBlocks(note) : []
    if (media.length > 0) {
      void run('Delete note media', async () => {
        await Promise.all(media.map((m) => trashFile(m.fileId)))
      })
    }
  }

  // Upload image/video files to the project folder and return media blocks for
  // them. Each file becomes its own Drive file (prefixed so it's excluded from
  // the version list); the block just references it by id. The caller decides
  // where to splice the blocks into the note (so media lands at the caret).
  async function uploadNoteMedia(files: File[]): Promise<MediaBlock[]> {
    const projectId = notesProjectIdRef.current
    if (projectId === null || files.length === 0) return []
    const now = Date.now()
    const blocks: MediaBlock[] = []
    try {
      for (const file of files) {
        const type = file.type.startsWith('video/') ? 'video' : 'image'
        const ext = file.name.includes('.')
          ? file.name.slice(file.name.lastIndexOf('.'))
          : ''
        const assetName = `${NOTE_ASSET_PREFIX}${makeId(now)}${ext}`
        const bytes = new Uint8Array(await file.arrayBuffer())
        const created = await createBinaryFile(
          projectId,
          assetName,
          bytes,
          file.type || 'application/octet-stream',
        )
        blocks.push(makeMediaBlock(now, type, created.id, file.type, file.name))
      }
    } catch (err) {
      console.error('[notes] media upload failed:', err)
      setError(`Add media failed: ${err instanceof Error ? err.message : err}`)
    }
    return blocks
  }

  // Remove one inline media block from a note and trash its Drive file.
  function deleteNoteMedia(noteId: string, blockId: string) {
    const note = notesRef.current.find((n) => n.id === noteId)
    const block = note?.blocks.find((b) => b.id === blockId)
    // Only media blocks have a file behind them; a reference is pure data and
    // is removed by the note view itself.
    if (note === undefined || block === undefined) return
    if (block.type !== 'image' && block.type !== 'video') return
    const fileId = block.fileId
    const next = notesRef.current.map((n) =>
      n.id === noteId
        ? {
            ...n,
            // Normalize so text on either side of the removed media re-merges.
            blocks: normalizeBlocks(
              n.blocks.filter((b) => b.id !== blockId),
              Date.now(),
            ),
            modifiedAt: Date.now(),
          }
        : n,
    )
    mutateNotes(next)
    void run('Delete media', () => trashFile(fileId))
  }

  // Load a note media file's bytes as an object URL for inline display.
  const loadNoteMedia = useCallback(async (fileId: string): Promise<string> => {
    const blob = await readFileBlob(fileId)
    return URL.createObjectURL(blob)
  }, [])

  /**
   * Quote the selected script lines for a note.
   *
   * The lines are read out of the live source rather than from whatever the
   * selection's `toString()` gave, so the quote is the script's own text —
   * markers, indentation and all — instead of the preview's rendering of it.
   */
  function createScriptRef(): ScriptRefBlock | null {
    if (scriptSelection === null || selectedVersionId === null) return null
    const label =
      versions.find((v) => v.file.id === selectedVersionId)?.label ?? 'draft'
    const lines = source.split('\n')
    const start = Math.max(0, scriptSelection.startLine)
    const end = Math.min(lines.length - 1, scriptSelection.endLine)
    if (start > end) return null
    return makeScriptRefBlock(Date.now(), {
      versionId: selectedVersionId,
      versionLabel: label,
      startLine: start,
      endLine: end,
      text: lines.slice(start, end + 1).join('\n'),
    })
  }

  /**
   * Follow a reference back to the script: switch to the draft it was taken
   * from if that isn't the one open, then jump to its lines.
   *
   * The draft may have been deleted since, in which case there's nothing to
   * switch to and the jump happens in whatever is open — the quote itself is
   * still readable in the note, which is the point of keeping a snapshot.
   */
  function openScriptRef(block: ScriptRefBlock) {
    const exists =
      selectedProjectId !== null &&
      (versionsByProject[selectedProjectId] ?? []).some(
        (f) => f.id === block.versionId,
      )
    if (exists && block.versionId !== selectedVersionId && selectedProjectId !== null) {
      selectVersion(selectedProjectId, block.versionId)
    }
    goToLine(block.startLine)
  }

  // Choose what sits beside the editor. The switch in the top bar and the
  // palette's View commands both come through here.
  const chooseCompanion = (next: Companion) => {
    setShowHistory(false)
    setCompanion(next)
  }
  // ⇧⌘P swaps the pages in and out without disturbing a notes session: from
  // notes it brings the preview up, from the preview it goes full width.
  const togglePreview = () =>
    chooseCompanion(companion === 'preview' ? 'none' : 'preview')

  // Open the sidebar on a given tab — what the palette's "Show outline"
  // command does, and what the collapsed rail's buttons do.
  const openSidebar = (tab: SidebarTab) => {
    setSidebarTab(tab)
    setNavCollapsed(false)
  }

  // Bumped to ask the preview to (re)fit the page to the pane — driven from the
  // top-bar options menu on mobile (where the preview has no Fit button).
  const [fitNonce, setFitNonce] = useState(0)

  // Write the accumulated snapshots to the project's history.json (creating it
  // the first time). Debounced and guarded so it only writes the project it was
  // scheduled for, and never blocks editing.
  async function flushHistory(projectId: string) {
    historyWriteTimer.current = 0
    if (!historyDirtyRef.current) return
    if (historyProjectIdRef.current !== projectId) return
    historyDirtyRef.current = false
    const json = serializeHistory(historyRef.current)
    try {
      const fileId = historyFileIdRef.current
      if (fileId !== null) {
        await updateFileContent(fileId, json)
      } else {
        const created = await createFile(projectId, HISTORY_FILENAME, json)
        historyFileIdRef.current = created.id
        const refreshed = await listFiles(projectId)
        setVersionsByProject((prev) => ({ ...prev, [projectId]: refreshed }))
      }
    } catch (err) {
      console.error('[history] write failed:', err)
      historyDirtyRef.current = true // retry on the next scheduled flush
    }
  }

  // Record a snapshot of a version's text into the in-memory history and
  // schedule a debounced write. No-ops (dedup/coalesce) don't schedule a write.
  function recordSnapshot(versionId: string, text: string, kind: SnapshotKind) {
    const projectId = historyProjectIdRef.current
    if (projectId === null) return
    const next = appendSnapshot(
      historyRef.current,
      makeSnapshot(versionId, text, kind, Date.now()),
    )
    if (next === historyRef.current) return // nothing changed
    historyRef.current = next
    setHistory(next)
    historyDirtyRef.current = true
    if (historyWriteTimer.current !== 0) {
      clearTimeout(historyWriteTimer.current)
    }
    historyWriteTimer.current = window.setTimeout(
      () => void flushHistory(projectId),
      HISTORY_WRITE_DEBOUNCE_MS,
    )
  }

  // Restore a snapshot's text into the open version. Non-destructive: the text
  // that was current is snapshotted first (so it stays reachable — "forward"),
  // then the chosen text is loaded, the editor remounted to show it, and it's
  // written to the version file on Drive.
  function restoreSnapshot(snap: HistorySnapshot) {
    if (selectedVersionId === null || snap.versionId !== selectedVersionId) return
    const versionId = selectedVersionId
    if (snap.text === sourceRef.current) return // already showing this text
    recordSnapshot(versionId, sourceRef.current, 'auto') // preserve current
    setContent(snap.text)
    contentRef.current = snap.text
    setSource(snap.text)
    sourceRef.current = snap.text
    setEditorReloadNonce((n) => n + 1)
    recordSnapshot(versionId, snap.text, 'restore')
    void run('Restore', async () => {
      await updateFileContent(versionId, snap.text)
      changeCountRef.current = 0
      lastSavedAtRef.current = Date.now()
      setSavedAt(Date.now())
      setSaveState('saved')
    })
  }

  // Background auto-save: on each edit, save immediately once enough changes
  // have piled up or too long has passed since the last save; otherwise save
  // shortly after the user pauses.
  useEffect(() => {
    if (selectedVersionId === null || content === null) return
    if (source === content) return // clean
    changeCountRef.current += 1
    const overdue = Date.now() - lastSavedAtRef.current >= AUTOSAVE_MAX_MS
    if (changeCountRef.current >= AUTOSAVE_CHANGE_THRESHOLD || overdue) {
      void persist()
      return
    }
    const timer = setTimeout(() => void persist(), AUTOSAVE_IDLE_MS)
    return () => clearTimeout(timer)
    // persist reads current state via closure and is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, content, selectedVersionId])

  // Save the current text to the current version. Safe to call in the
  // background: it no-ops when clean or already saving, and won't clobber
  // content if the user switched versions during the save.
  async function persist() {
    if (savingRef.current) return
    // Write the editor text to the version it was actually loaded from, read
    // together from refs so they can't be a mismatched (version, text) pair.
    const versionId = sourceVersionIdRef.current
    if (versionId === null) return
    // Refuse to save while a version switch is mid-flight: if the loaded text no
    // longer belongs to the selected version, saving it would write one
    // version's contents into another version's file.
    if (versionId !== currentVersionIdRef.current) return
    const text = sourceRef.current
    if (text === contentRef.current) return
    savingRef.current = true
    setSaveState('saving')
    try {
      await updateFileContent(versionId, text)
      // Update the baseline only if the text still belongs to this version and
      // it's still selected — otherwise the switched-to version owns the state.
      if (
        currentVersionIdRef.current === versionId &&
        sourceVersionIdRef.current === versionId
      ) {
        setContent(text)
        contentRef.current = text
        changeCountRef.current = 0
        lastSavedAtRef.current = Date.now()
        setSavedAt(Date.now())
        setSaveState('saved')
        // Capture this saved text in the edit history (coalesced + capped).
        recordSnapshot(versionId, text, 'auto')
      }
    } catch (err) {
      console.error('[drive] auto-save failed:', err)
      setError(`Save failed: ${err instanceof Error ? err.message : err}`)
      setSaveState('error')
    } finally {
      savingRef.current = false
    }
  }

  // Wrap a Drive write: manage the busy flag and surface any failure.
  async function run(label: string, op: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await op()
    } catch (err) {
      console.error(`[drive] ${label} failed:`, err)
      setError(`${label} failed: ${err instanceof Error ? err.message : err}`)
    } finally {
      setBusy(false)
    }
  }

  // Open a version: flush the outgoing one, then clear the editor so it shows a
  // loader instead of briefly remounting with the previous version's text while
  // the new one loads. Only clears on an actual change of version — re-selecting
  // the same version must not strand the editor (the load effect would skip the
  // already-loaded version and never restore content).
  function openVersion(projectId: string, versionId: string | null) {
    if (versionId !== selectedVersionId) {
      void persist() // flush any unsaved edits to the outgoing version first
      setContent(null)
      contentRef.current = null
    }
    // Leaving a project: write out any pending history and notes for it now,
    // before the load effects repoint that state at the incoming project.
    if (projectId !== selectedProjectId) {
      if (historyProjectIdRef.current !== null) {
        if (historyWriteTimer.current !== 0) {
          clearTimeout(historyWriteTimer.current)
          historyWriteTimer.current = 0
        }
        void flushHistory(historyProjectIdRef.current)
      }
      if (notesProjectIdRef.current !== null) {
        if (notesWriteTimer.current !== 0) {
          clearTimeout(notesWriteTimer.current)
          notesWriteTimer.current = 0
        }
        void flushNotes(notesProjectIdRef.current)
      }
    }
    setSelectedProjectId(projectId)
    setSelectedVersionId(versionId)
    if (isMobile) setNavCollapsed(true) // close the drawer, reveal the editor
  }

  function selectProject(project: DriveFile) {
    setExpandedProjects((prev) => new Set(prev).add(project.id))
    const latest = parseVersions(versionsByProject[project.id] ?? [])[0]
    openVersion(project.id, latest?.file.id ?? null)
  }

  function selectVersion(projectId: string, versionId: string) {
    openVersion(projectId, versionId)
  }

  function toggleExpand(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function newProject() {
    if (folderId === null) return
    const name = window.prompt('New project name:')?.trim()
    if (!name) return
    void run('Create project', async () => {
      const created = await createFolder(folderId, name)
      await createFile(created.id, versionFileName(name, 1), '')
      const { projects: list, versionsByProject: byProject } = await loadTree(folderId)
      setProjects(list)
      setVersionsByProject(byProject)
      setExpandedProjects((prev) => new Set(prev).add(created.id))
      setSelectedProjectId(created.id)
      setSelectedVersionId(
        parseVersions(byProject[created.id] ?? [])[0]?.file.id ?? null,
      )
    })
  }

  function deleteVersion(projectId: string, versionId: string) {
    const file = (versionsByProject[projectId] ?? []).find(
      (f) => f.id === versionId,
    )
    const label = file?.name ?? 'this version'
    if (
      !window.confirm(
        `Delete "${label}"?\n\nIt will be moved to your Google Drive trash.`,
      )
    ) {
      return
    }
    void run('Delete version', async () => {
      await trashFile(versionId)
      const refreshed = await listFiles(projectId)
      setVersionsByProject((prev) => ({ ...prev, [projectId]: refreshed }))
      if (selectedVersionId === versionId) {
        setSelectedVersionId(parseVersions(refreshed)[0]?.file.id ?? null)
      }
    })
  }

  // Snapshot the current text as a new version, preserving existing ones.
  function newVersion() {
    if (selectedProjectId === null) return
    const projectId = selectedProjectId
    const projectName =
      projects.find((s) => s.id === projectId)?.name ?? 'project'
    void run('New version', async () => {
      const files = versionsByProject[projectId] ?? []
      const created = await createFile(
        projectId,
        versionFileName(projectName, nextVersionNumber(files)),
        source,
      )
      const refreshed = await listFiles(projectId)
      setVersionsByProject((prev) => ({ ...prev, [projectId]: refreshed }))
      setSelectedVersionId(created.id)
    })
  }

  // Render the current preview to a PDF and store it beside the versions,
  // named to match the current version file (e.g. Project_v3.fountain →
  // Project_v3.pdf). Overwrites an existing PDF for that version.
  function exportPdf() {
    if (selectedProjectId === null || selectedVersionId === null) return
    const projectId = selectedProjectId
    const files = versionsByProject[projectId] ?? []
    const versionFile = files.find((f) => f.id === selectedVersionId)
    if (versionFile === undefined) return
    const pdfName = versionFile.name.replace(/\.fountain$/i, '') + '.pdf'
    void run('Export PDF', async () => {
      const bytes = await buildScreenplayPdf(source)
      const existing = files.find((f) => isPdf(f) && f.name === pdfName)
      if (existing !== undefined) {
        await updateBinaryFileContent(existing.id, bytes, 'application/pdf')
      } else {
        await createBinaryFile(projectId, pdfName, bytes, 'application/pdf')
      }
      const refreshed = await listFiles(projectId)
      setVersionsByProject((prev) => ({ ...prev, [projectId]: refreshed }))
    })
  }

  // Every command the app can perform, as one list. The top bar shows three
  // things; this is where the rest lives, reachable by name rather than by
  // remembering which bar or menu once held the button.
  //
  // Order is authored, not alphabetical — the palette's sort is stable, so an
  // empty query shows these groups in this sequence.
  const commands: Command[] = [
    {
      id: 'save',
      label: 'Save now',
      group: 'Script',
      hint: MOD_KEY + 'S',
      disabled: !dirty,
      run: () => void persist(),
    },
    {
      id: 'new-version',
      label: 'New draft from current text',
      group: 'Script',
      keywords: 'version snapshot copy',
      disabled: selectedProjectId === null || busy,
      run: newVersion,
    },
    {
      id: 'export-pdf',
      label: 'Export PDF',
      group: 'Script',
      keywords: 'print pdf render',
      disabled: selectedVersionId === null || busy,
      run: exportPdf,
    },
    {
      id: 'history',
      label: 'Edit history…',
      group: 'Script',
      keywords: 'revisions undo restore snapshots',
      disabled: selectedVersionId === null,
      run: () => setShowHistory(true),
    },
    {
      id: 'new-project',
      label: 'New project',
      group: 'Library',
      keywords: 'create screenplay folder',
      disabled: folderId === null || busy,
      run: newProject,
    },
    {
      id: 'change-folder',
      label: 'Change working folder',
      group: 'Library',
      keywords: 'drive google directory',
      run: () => void choose(),
    },
    {
      id: 'view-editor',
      label: 'Editor only',
      group: 'View',
      keywords: 'write full screen distraction free wide hide close',
      run: () => chooseCompanion('none'),
    },
    {
      id: 'view-preview',
      label: 'Preview beside the editor',
      group: 'View',
      keywords: 'pages render script pagination print split',
      hint: SHIFT_MOD + 'P',
      run: () => chooseCompanion('preview'),
    },
    {
      id: 'view-notes',
      label: 'Notes beside the editor',
      group: 'View',
      keywords: 'notebook scratch research split reference',
      run: () => chooseCompanion('notes'),
    },
    {
      id: 'fit-preview',
      label: 'Fit preview page to the pane',
      group: 'View',
      keywords: 'zoom scale width',
      disabled: companion !== 'preview',
      run: () => setFitNonce((n) => n + 1),
    },
    {
      id: 'side-files',
      label: 'Show files',
      group: 'Sidebar',
      keywords: 'projects drafts tree library',
      run: () => openSidebar('files'),
    },
    {
      id: 'side-outline',
      label: 'Show outline',
      group: 'Sidebar',
      keywords: 'scenes sections structure navigator acts',
      run: () => openSidebar('outline'),
    },
    {
      id: 'side-cast',
      label: 'Show cast & locations',
      group: 'Sidebar',
      keywords: 'characters places who where',
      run: () => openSidebar('cast'),
    },
    {
      id: 'toggle-sections',
      label: (showSections ? 'Hide' : 'Show') + ' section ranges',
      group: 'View',
      hint: showSections ? 'On' : 'Off',
      keywords: 'acts structure bands colours',
      disabled: sections.length === 0,
      run: () => setShowSections((v) => !v),
    },
    {
      id: 'toggle-nav',
      label: (navCollapsed ? 'Show' : 'Hide') + ' sidebar',
      group: 'Sidebar',
      keywords: 'panel drawer rail collapse',
      run: () => setNavCollapsed((c) => !c),
    },
    {
      id: 'toggle-theme',
      label: 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme',
      group: 'View',
      keywords: 'dark light appearance',
      run: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    },
  ]

  if (auth.status === 'restoring') {
    return (
      <div className="signin">
        <div className="signin__card">
          <p className="signin__blurb">Restoring your session…</p>
        </div>
      </div>
    )
  }

  if (auth.status === 'signed-out') {
    return <SignIn onSignIn={auth.signIn} />
  }

  if (folder === null) {
    return <FolderGate onChoose={choose} picking={picking} />
  }

  // Mobile-only top bar for states without a VersionBar (empty/loading), so the
  // project drawer stays reachable. Hidden on desktop via CSS.
  const mobileBar = (
    <div className="mobilebar">
      <button
        type="button"
        className="verbar__nav"
        onClick={() => setNavCollapsed(false)}
        aria-label="Show project"
        title="Show project"
      >
        <MenuIcon />
      </button>
    </div>
  )

  return (
    <div className="workspace">
      <Sidebar
        tab={sidebarTab}
        onSelectTab={setSidebarTab}
        collapsed={navCollapsed}
        onToggle={() => setNavCollapsed((c) => !c)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      >
        {sidebarTab === 'files' ? (
          <FileNav
            folderName={folder.name}
            projects={projects}
            versionsByProject={versionsByProject}
            expandedProjects={expandedProjects}
            selectedProjectId={selectedProjectId}
            selectedVersionId={selectedVersionId}
            loading={treeLoading}
            busy={busy}
            onToggleExpand={toggleExpand}
            onSelectProject={selectProject}
            onSelectVersion={selectVersion}
            onDeleteVersion={deleteVersion}
            onNewProject={newProject}
            onChangeFolder={() => choose()}
          />
        ) : sidebarTab === 'outline' ? (
          <OutlinePanel
            source={source}
            currentLine={caretLine}
            onJump={(line) => {
              goToLine(line)
              // On a phone the drawer covers the editor it just moved, so get
              // out of the way — the jump is the whole point of the tap.
              if (isMobile) setNavCollapsed(true)
            }}
          />
        ) : (
          <InsightsPanel
            source={source}
            onJump={(line) => {
              goToLine(line)
              if (isMobile) setNavCollapsed(true)
            }}
            initialGroups={layoutRef.current.insightsGroups}
            onGroupsChange={(groups) => {
              layoutRef.current.insightsGroups = groups
              saveLayout(layoutRef.current)
            }}
          />
        )}
      </Sidebar>
      <div className="workspace__main">
        {error !== null && (
          <div className="workspace__error" role="alert">
            {error}
            <button
              type="button"
              className="workspace__error-dismiss"
              onClick={() => setError(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {selectedProjectId === null ? (
          <>
            {mobileBar}
            <div className="workspace__empty">
              {treeLoading ? 'Loading…' : 'No projects yet. Create one.'}
            </div>
          </>
        ) : selectedVersionId === null ? (
          <>
            {mobileBar}
            <div className="workspace__empty">
              <p>This project has no versions.</p>
              <button
                type="button"
                className="workspace__empty-action"
                onClick={newVersion}
                disabled={busy}
              >
                New version
              </button>
            </div>
          </>
        ) : content === null ? (
          <>
            {mobileBar}
            <div className="workspace__empty">Loading…</div>
          </>
        ) : (
          <>
            <VersionBar
              projectName={selectedProject?.name ?? ''}
              versions={versions}
              selectedVersionId={selectedVersionId}
              dirty={dirty}
              saving={saveState === 'saving'}
              savedAt={savedAt}
              onSelectVersion={(id) =>
                selectedProjectId !== null && selectVersion(selectedProjectId, id)
              }
              onSave={() => void persist()}
              onToggleNav={() => setNavCollapsed(false)}
              companion={companion}
              onSetCompanion={chooseCompanion}
              onOpenCommands={() => setShowCommands(true)}
            />
            <div className="workspace__editor">
              {(() => {
                const editorNode = (
                  <Editor
                    key={`${selectedVersionId}:${editorReloadNonce}`}
                    // Seeded from the live text, not the last-saved baseline.
                    // Collapsing or expanding a pane moves the editor between
                    // the split and the bare workspace, which remounts it — and
                    // re-seeding from `content` there would silently throw away
                    // anything typed since the last auto-save (up to
                    // AUTOSAVE_IDLE_MS of work). On a version switch the two are
                    // equal anyway, since the load sets them together.
                    initialValue={source}
                    onChange={handleSourceChange}
                    pageBreakLines={pageBreakLines}
                    sections={sections}
                    jumpTo={jump}
                    initialScrollTop={
                      selectedVersionId !== null
                        ? scrollByVersionRef.current[selectedVersionId]
                        : undefined
                    }
                    onScrollChange={(top) => {
                      if (selectedVersionId !== null) {
                        scrollByVersionRef.current[selectedVersionId] = top
                        rememberOpen()
                      }
                    }}
                    onRevealInPreview={revealInPreview}
                    onCaretLine={setCaretLine}
                    onSelectedLines={setScriptSelection}
                  />
                )
                const notesNode = (
                  <NotesPanel
                    notes={notes}
                    onCreate={addNote}
                    onChangeNote={updateNote}
                    onDeleteNote={deleteNote}
                    onUploadMedia={uploadNoteMedia}
                    onDeleteMedia={deleteNoteMedia}
                    loadMedia={loadNoteMedia}
                    onCreateScriptRef={createScriptRef}
                    canAddScriptRef={scriptSelection !== null}
                    onOpenScriptRef={openScriptRef}
                    onClose={() => chooseCompanion('none')}
                    busy={busy}
                  />
                )
                const previewNode = (
                  <Preview
                    source={source}
                    onPageBreaks={setPageBreakLines}
                    onJump={jumpToLine}
                    reveal={reveal}
                    sections={sections}
                    showSections={showSections}
                    onToggleSections={() => setShowSections((v) => !v)}
                    fitNonce={fitNonce}
                    // Off-stage it keeps paginating but must not size itself
                    // to that box; showing it again re-fits the page.
                    active={companion === 'preview'}
                    onSelectRange={({ startLine, endLine }) =>
                      setScriptSelection({ startLine, endLine })
                    }
                  />
                )
                // The editor, and whatever shares the main area with it.
                //
                // Seeing an edit land in the rendered page as you make it is
                // the reason the preview exists, so it sits beside the script
                // rather than replacing it. Notes goes in the same slot: it's
                // something you read from and write to *while* drafting, which
                // makes it a companion to the scene you're on, not a place you
                // navigate to.
                //
                // The preview stays mounted whichever companion is showing.
                // That isn't an optimisation — it's what paginates the script,
                // and the page-break guides drawn in the *editor* freeze at
                // the last render the moment it stops. When it isn't the
                // visible companion it goes off-stage: still laid out at a
                // real size, just positioned out of view. `display: none`
                // would report zero for every rect and break the guides.
                const paneFor = (which: Companion, node: ReactNode) => (
                  <div
                    className={`companion${
                      companion === which ? '' : ' companion--offstage'
                    }`}
                    aria-hidden={companion === which ? undefined : true}
                  >
                    {node}
                  </div>
                )

                // Notes is mounted only when chosen. Unlike the preview it
                // computes nothing the rest of the app depends on, and it
                // holds Lexical editors and decoded media of its own that
                // aren't worth keeping warm off-stage.
                const companionNode = (
                  <>
                    {paneFor('preview', previewNode)}
                    {companion === 'notes' && paneFor('notes', notesNode)}
                  </>
                )

                // Phones have no room for two panes, so the companion takes
                // the screen instead of half of it. Same value either way —
                // it's what keeps the two densities from disagreeing.
                if (isMobile) {
                  return (
                    <>
                      <div
                        className={`companion${
                          companion === 'none' ? '' : ' companion--offstage'
                        }`}
                      >
                        {editorNode}
                      </div>
                      {companionNode}
                    </>
                  )
                }

                return (
                  <SplitPane
                    left={editorNode}
                    right={companionNode}
                    collapsed={companion === 'none'}
                    initialLeftPercent={layoutRef.current.splitLeftPercent}
                    onResize={(pct) => {
                      layoutRef.current.splitLeftPercent = pct
                      saveLayout(layoutRef.current)
                    }}
                  />
                )
              })()}
              {showHistory && (
                <HistoryPanel
                  snapshots={snapshotsForVersion(history, selectedVersionId)}
                  currentText={source}
                  onRestore={restoreSnapshot}
                  onClose={() => setShowHistory(false)}
                  busy={busy}
                />
              )}
            </div>
          </>
        )}
      </div>
      {showCommands && (
        <CommandPalette
          commands={commands}
          onClose={() => setShowCommands(false)}
        />
      )}
    </div>
  )
}

function SignIn({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="signin">
      <div className="signin__card">
        <h1 className="signin__title">kunal's scripts</h1>
        <p className="signin__blurb">
          This editor stores your screenplays in Google Drive. Sign in to grant
          Drive access.
        </p>
        <button
          type="button"
          className="signin__button"
          onClick={() => onSignIn()}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  )
}

function FolderGate({
  onChoose,
  picking,
}: {
  onChoose: () => void
  picking: boolean
}) {
  return (
    <div className="signin">
      <div className="signin__card">
        <h1 className="signin__title">Choose a working folder</h1>
        <p className="signin__blurb">
          Pick the Google Drive folder where your screenplays live. The app reads
          and writes files there.
        </p>
        <button
          type="button"
          className="signin__button"
          onClick={() => onChoose()}
          disabled={picking}
        >
          {picking ? 'Opening picker…' : 'Select a working folder'}
        </button>
      </div>
    </div>
  )
}
