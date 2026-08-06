import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { InsightsPanel } from './components/InsightsPanel'
import { SplitPane } from './components/SplitPane'
import { FileNav } from './components/FileNav'
import { VersionBar } from './components/VersionBar'
import {
  createBinaryFile,
  createFile,
  createFolder,
  listFiles,
  listFolders,
  readFile,
  trashFile,
  updateBinaryFileContent,
  updateFileContent,
  type DriveFile,
} from './drive/files'
import {
  isCommentsFile,
  isPdf,
  nextVersionNumber,
  parseVersions,
  versionFileName,
} from './drive/versions'
import { parseSections } from './fountain'
import { buildScreenplayPdf } from './pdf'
import {
  COMMENTS_FILENAME,
  makeComment,
  parseComments,
  serializeComments,
  type Comment,
  type CommentAnchor,
} from './comments'
import { useDriveAuth } from './drive/useDriveAuth'
import { useWorkingFolder } from './drive/useWorkingFolder'
import { loadLastOpened, saveLastOpened } from './lastOpened'
import { loadLayout, saveLayout } from './layout'
import { loadTheme, saveTheme, type Theme } from './theme'
import { useIsMobile } from './useIsMobile'
import './App.css'

// Background auto-save: persist after the user pauses, or after enough edits,
// or if too long has passed since the last save while typing continuously.
const AUTOSAVE_IDLE_MS = 1500
const AUTOSAVE_MAX_MS = 8000
const AUTOSAVE_CHANGE_THRESHOLD = 40

// Load the whole directory: every script folder plus its version files, so the
// left-nav tree can show the full project at once.
async function loadTree(folderId: string): Promise<{
  scripts: DriveFile[]
  versionsByScript: Record<string, DriveFile[]>
}> {
  const scripts = await listFolders(folderId)
  const entries = await Promise.all(
    scripts.map(async (s) => [s.id, await listFiles(s.id)] as const),
  )
  return { scripts, versionsByScript: Object.fromEntries(entries) }
}

export default function App() {
  const auth = useDriveAuth()
  const { folder, picking, choose } = useWorkingFolder()
  // Phone-width layout: the file nav becomes a floating drawer, the editor
  // fills the screen, and the preview stacks inline below it (no side split,
  // no Characters & Locations panel).
  const isMobile = useIsMobile()

  // The full directory: script folders and each script's version files,
  // eagerly loaded so the left-nav tree shows everything.
  const [scripts, setScripts] = useState<DriveFile[]>([])
  const [versionsByScript, setVersionsByScript] = useState<
    Record<string, DriveFile[]>
  >({})
  const [treeLoading, setTreeLoading] = useState(false)
  const [expandedScripts, setExpandedScripts] = useState<Set<string>>(new Set())

  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)
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
  // Whether the preview is shown (toggled from the editor toolbar). The
  // Characters & Locations panel accompanies it (collapsible).
  const [showPreview, setShowPreview] = useState(layoutRef.current.showPreview)
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

  // Comments for the selected script (all versions), from its comments.json.
  const [comments, setComments] = useState<Comment[]>([])
  const commentsFileIdRef = useRef<string | null>(null)
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
  const selectedScript = scripts.find((s) => s.id === selectedScriptId) ?? null
  const versions = useMemo(
    () => parseVersions(versionsByScript[selectedScriptId ?? ''] ?? []),
    [versionsByScript, selectedScriptId],
  )
  const dirty = content !== null && source !== content
  // Section ranges parsed from the live source, shared by the editor (tinted
  // bands), the preview (optional rendering), and the insights panel.
  const sections = useMemo(() => parseSections(source), [source])

  // Load the whole tree once signed in and a folder is chosen; auto-select the
  // first script and its most recent version. Gated on auth so a restored
  // folder can't trigger Drive calls before the token is ready (e.g. in a new
  // tab), which would fail with an auth error.
  useEffect(() => {
    if (folderId === null || auth.status !== 'signed-in') return
    let active = true
    setTreeLoading(true)
    loadTree(folderId)
      .then(({ scripts: list, versionsByScript: byScript }) => {
        if (!active) return
        setScripts(list)
        setVersionsByScript(byScript)
        setExpandedScripts(new Set(list.map((s) => s.id)))

        // Prefer the last-opened script/version if it still exists; otherwise
        // fall back to the first script's most recent version.
        const first = list[0] ?? null
        let scriptId = first?.id ?? null
        let versionId = first
          ? (parseVersions(byScript[first.id] ?? [])[0]?.file.id ?? null)
          : null

        const saved = loadLastOpened()
        if (saved !== null && saved.folderId === folderId) {
          const scriptExists = list.some((s) => s.id === saved.scriptId)
          if (scriptExists) {
            scriptId = saved.scriptId
            const versions = byScript[saved.scriptId] ?? []
            versionId = versions.some((f) => f.id === saved.versionId)
              ? saved.versionId
              : (parseVersions(versions)[0]?.file.id ?? null)
          }
        }

        setSelectedScriptId(scriptId)
        setSelectedVersionId(versionId)
      })
      .catch((err) => {
        if (!active) return
        console.error('[drive] load tree failed:', err)
        setError(String(err instanceof Error ? err.message : err))
        setScripts([])
        setVersionsByScript({})
        setSelectedScriptId(null)
        setSelectedVersionId(null)
      })
      .finally(() => {
        if (active) setTreeLoading(false)
      })
    return () => {
      active = false
    }
  }, [folderId, auth.status])

  // Apply and persist the theme.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    saveTheme(theme)
  }, [theme])

  // Name the browser tab after the script being edited, so multiple open tabs
  // are tellable apart; fall back to the app name when nothing is open.
  const scriptName = selectedScript?.name ?? null
  useEffect(() => {
    document.title = scriptName ? `${scriptName} — kunal's scripts` : "kunal's scripts"
  }, [scriptName])

  // Persist which panels are open as they change.
  useEffect(() => {
    layoutRef.current.showPreview = showPreview
    layoutRef.current.navCollapsed = navCollapsed
    layoutRef.current.showSections = showSections
    saveLayout(layoutRef.current)
  }, [showPreview, navCollapsed, showSections])

  // Entering mobile width, collapse the nav to its floating button so the
  // editor fills the screen; the drawer is a tap away.
  useEffect(() => {
    if (isMobile) setNavCollapsed(true)
  }, [isMobile])

  // Track the selected version for the async-save guard.
  useEffect(() => {
    currentVersionIdRef.current = selectedVersionId
  }, [selectedVersionId])

  // Remember the currently-open script/version so a reload reopens to it.
  const rememberOpen = () => {
    if (folderId !== null && selectedScriptId !== null && selectedVersionId !== null) {
      saveLastOpened({
        folderId,
        scriptId: selectedScriptId,
        versionId: selectedVersionId,
        scrollByVersion: scrollByVersionRef.current,
      })
    }
  }
  useEffect(rememberOpen, [folderId, selectedScriptId, selectedVersionId])

  // ⌘/Ctrl+S saves the editor's current text to the open version.
  useEffect(() => {
    persistRef.current = () => void persist()
  })
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        persistRef.current()
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
    // re-runs when `versionsByScript` changes (e.g. after saving a comment or
    // creating a version) — reloading here would overwrite the editor with the
    // last-saved text and silently discard any unsaved edits, so bail out.
    if (selectedVersionId === sourceVersionIdRef.current) return
    const file = Object.values(versionsByScript)
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
  }, [selectedVersionId, versionsByScript])

  // Load the selected script's comments (a single comments.json for all its
  // versions), and remember the file id for later writes.
  useEffect(() => {
    if (selectedScriptId === null) {
      setComments([])
      commentsFileIdRef.current = null
      return
    }
    const file = (versionsByScript[selectedScriptId] ?? []).find(isCommentsFile)
    commentsFileIdRef.current = file?.id ?? null
    if (file === undefined) {
      setComments([])
      return
    }
    let active = true
    readFile(file)
      .then((text) => {
        if (active) setComments(parseComments(text))
      })
      .catch((err) => {
        console.error('[comments] read failed:', err)
        if (active) setComments([])
      })
    return () => {
      active = false
    }
  }, [selectedScriptId, versionsByScript])

  // Write the comments array to the script's comments.json (creating it the
  // first time), then apply it to state.
  async function persistComments(scriptId: string, next: Comment[]) {
    setComments(next)
    const json = serializeComments(next)
    const fileId = commentsFileIdRef.current
    if (fileId !== null) {
      await updateFileContent(fileId, json)
    } else {
      const created = await createFile(scriptId, COMMENTS_FILENAME, json)
      commentsFileIdRef.current = created.id
      const refreshed = await listFiles(scriptId)
      setVersionsByScript((prev) => ({ ...prev, [scriptId]: refreshed }))
    }
  }

  function addComment(anchor: CommentAnchor, text: string) {
    if (selectedScriptId === null) return
    const scriptId = selectedScriptId
    const next = [...comments, makeComment(anchor, null, text, Date.now())]
    void run('Save comment', () => persistComments(scriptId, next))
  }

  function editComment(id: string, text: string) {
    if (selectedScriptId === null) return
    const scriptId = selectedScriptId
    const next = comments.map((c) => (c.id === id ? { ...c, text } : c))
    void run('Edit comment', () => persistComments(scriptId, next))
  }

  function deleteComment(id: string) {
    if (selectedScriptId === null) return
    const scriptId = selectedScriptId
    const next = comments.filter((c) => c.id !== id)
    void run('Delete comment', () => persistComments(scriptId, next))
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
  function openVersion(scriptId: string, versionId: string | null) {
    if (versionId !== selectedVersionId) {
      void persist() // flush any unsaved edits to the outgoing version first
      setContent(null)
      contentRef.current = null
    }
    setSelectedScriptId(scriptId)
    setSelectedVersionId(versionId)
    if (isMobile) setNavCollapsed(true) // close the drawer, reveal the editor
  }

  function selectScript(script: DriveFile) {
    setExpandedScripts((prev) => new Set(prev).add(script.id))
    const latest = parseVersions(versionsByScript[script.id] ?? [])[0]
    openVersion(script.id, latest?.file.id ?? null)
  }

  function selectVersion(scriptId: string, versionId: string) {
    openVersion(scriptId, versionId)
  }

  function toggleExpand(scriptId: string) {
    setExpandedScripts((prev) => {
      const next = new Set(prev)
      if (next.has(scriptId)) next.delete(scriptId)
      else next.add(scriptId)
      return next
    })
  }

  function newScript() {
    if (folderId === null) return
    const name = window.prompt('New script name:')?.trim()
    if (!name) return
    void run('Create script', async () => {
      const created = await createFolder(folderId, name)
      await createFile(created.id, versionFileName(name, 1), '')
      const { scripts: list, versionsByScript: byScript } = await loadTree(folderId)
      setScripts(list)
      setVersionsByScript(byScript)
      setExpandedScripts((prev) => new Set(prev).add(created.id))
      setSelectedScriptId(created.id)
      setSelectedVersionId(
        parseVersions(byScript[created.id] ?? [])[0]?.file.id ?? null,
      )
    })
  }

  function deleteVersion(scriptId: string, versionId: string) {
    const file = (versionsByScript[scriptId] ?? []).find(
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
      const refreshed = await listFiles(scriptId)
      setVersionsByScript((prev) => ({ ...prev, [scriptId]: refreshed }))
      if (selectedVersionId === versionId) {
        setSelectedVersionId(parseVersions(refreshed)[0]?.file.id ?? null)
      }
    })
  }

  // Snapshot the current text as a new version, preserving existing ones.
  function newVersion() {
    if (selectedScriptId === null) return
    const scriptId = selectedScriptId
    const scriptName =
      scripts.find((s) => s.id === scriptId)?.name ?? 'script'
    void run('New version', async () => {
      const files = versionsByScript[scriptId] ?? []
      const created = await createFile(
        scriptId,
        versionFileName(scriptName, nextVersionNumber(files)),
        source,
      )
      const refreshed = await listFiles(scriptId)
      setVersionsByScript((prev) => ({ ...prev, [scriptId]: refreshed }))
      setSelectedVersionId(created.id)
    })
  }

  // Render the current preview to a PDF and store it beside the versions,
  // named to match the current version file (e.g. Script_v3.fountain →
  // Script_v3.pdf). Overwrites an existing PDF for that version.
  function exportPdf() {
    if (selectedScriptId === null || selectedVersionId === null) return
    const scriptId = selectedScriptId
    const files = versionsByScript[scriptId] ?? []
    const versionFile = files.find((f) => f.id === selectedVersionId)
    if (versionFile === undefined) return
    const pdfName = versionFile.name.replace(/\.fountain$/i, '') + '.pdf'
    void run('Export PDF', async () => {
      const bytes = await buildScreenplayPdf(source)
      const existing = files.find((f) => isPdf(f) && f.name === pdfName)
      if (existing !== undefined) {
        await updateBinaryFileContent(existing.id, bytes, 'application/pdf')
      } else {
        await createBinaryFile(scriptId, pdfName, bytes, 'application/pdf')
      }
      const refreshed = await listFiles(scriptId)
      setVersionsByScript((prev) => ({ ...prev, [scriptId]: refreshed }))
    })
  }

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
        ☰
      </button>
    </div>
  )

  return (
    <div className="workspace">
      <FileNav
        folderName={folder.name}
        scripts={scripts}
        versionsByScript={versionsByScript}
        expandedScripts={expandedScripts}
        selectedScriptId={selectedScriptId}
        selectedVersionId={selectedVersionId}
        loading={treeLoading}
        busy={busy}
        collapsed={navCollapsed}
        theme={theme}
        onToggle={() => setNavCollapsed((c) => !c)}
        onToggleTheme={() =>
          setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
        }
        onToggleExpand={toggleExpand}
        onSelectScript={selectScript}
        onSelectVersion={selectVersion}
        onDeleteVersion={deleteVersion}
        onNewScript={newScript}
        onChangeFolder={() => choose()}
      />
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
        {selectedScriptId === null ? (
          <>
            {mobileBar}
            <div className="workspace__empty">
              {treeLoading ? 'Loading…' : 'No scripts yet. Create one.'}
            </div>
          </>
        ) : selectedVersionId === null ? (
          <>
            {mobileBar}
            <div className="workspace__empty">
              <p>This script has no versions.</p>
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
              scriptName={selectedScript?.name ?? ''}
              versions={versions}
              selectedVersionId={selectedVersionId}
              busy={busy}
              dirty={dirty}
              saving={saveState === 'saving'}
              savedAt={savedAt}
              onSelectVersion={(id) =>
                selectedScriptId !== null && selectVersion(selectedScriptId, id)
              }
              onSave={() => void persist()}
              onNewVersion={newVersion}
              onExportPdf={exportPdf}
              onToggleNav={() => setNavCollapsed(false)}
            />
            <div className="workspace__editor">
              {(() => {
                const editorNode = (
                  <Editor
                    key={selectedVersionId}
                    initialValue={content}
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
                    viewToggles={[
                      {
                        key: 'preview',
                        glyph: '📄',
                        label: 'Preview',
                        title: 'Show or hide the preview',
                        active: showPreview,
                        onToggle: () => setShowPreview((v) => !v),
                      },
                    ]}
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
                    versionId={selectedVersionId}
                    comments={comments.filter(
                      (c) => c.versionId === selectedVersionId,
                    )}
                    onAddComment={addComment}
                    onEditComment={editComment}
                    onDeleteComment={deleteComment}
                  />
                )
                // The Characters & Locations panel only accompanies the
                // preview, so with the preview hidden the editor fills the pane.
                if (!showPreview) return editorNode
                // Mobile: the editor is the core surface, so the preview stacks
                // inline below it — no side-by-side split, no insights panel.
                if (isMobile) {
                  return (
                    <div className="mobilestack">
                      <div className="mobilestack__pane">{editorNode}</div>
                      <div className="mobilestack__pane mobilestack__pane--preview">
                        {previewNode}
                      </div>
                    </div>
                  )
                }
                return (
                  <SplitPane
                    left={editorNode}
                    initialLeftPercent={layoutRef.current.splitLeftPercent}
                    onResize={(pct) => {
                      layoutRef.current.splitLeftPercent = pct
                      saveLayout(layoutRef.current)
                    }}
                    right={
                      <div className="rightstack">
                        <div className="rightstack__preview">{previewNode}</div>
                        <InsightsPanel
                          source={source}
                          onJump={jumpToLine}
                          initialCollapsed={layoutRef.current.insightsCollapsed}
                          onCollapsedChange={(collapsed) => {
                            layoutRef.current.insightsCollapsed = collapsed
                            saveLayout(layoutRef.current)
                          }}
                          initialGroups={layoutRef.current.insightsGroups}
                          onGroupsChange={(groups) => {
                            layoutRef.current.insightsGroups = groups
                            saveLayout(layoutRef.current)
                          }}
                        />
                      </div>
                    }
                  />
                )
              })()}
            </div>
          </>
        )}
      </div>
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
