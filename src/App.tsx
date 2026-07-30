import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SplitPane } from './components/SplitPane'
import { FileNav } from './components/FileNav'
import { VersionBar } from './components/VersionBar'
import {
  createFile,
  createFolder,
  listFiles,
  listFolders,
  readFile,
  updateFileContent,
  type DriveFile,
} from './drive/files'
import {
  nextVersionNumber,
  parseVersions,
  versionFileName,
} from './drive/versions'
import { useDriveAuth } from './drive/useDriveAuth'
import { useWorkingFolder } from './drive/useWorkingFolder'
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

  const [navCollapsed, setNavCollapsed] = useState(false)
  // True while a create/rename/new-version Drive write is in flight.
  const [busy, setBusy] = useState(false)
  // Last Drive-operation error message, shown to the user.
  const [error, setError] = useState<string | null>(null)
  // Background auto-save status for the version bar indicator.
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  )

  const savingRef = useRef(false)
  const changeCountRef = useRef(0)
  const lastSavedAtRef = useRef(Date.now())
  // Tracks the current version so an in-flight save doesn't clobber content
  // after the user switches versions mid-save.
  const currentVersionIdRef = useRef<string | null>(null)

  const folderId = folder?.id ?? null
  const selectedScript = scripts.find((s) => s.id === selectedScriptId) ?? null
  const versions = useMemo(
    () => parseVersions(versionsByScript[selectedScriptId ?? ''] ?? []),
    [versionsByScript, selectedScriptId],
  )
  const dirty = content !== null && source !== content

  // Load the whole tree whenever the working folder changes; auto-select the
  // first script and its most recent version.
  useEffect(() => {
    if (folderId === null) return
    let active = true
    setTreeLoading(true)
    loadTree(folderId)
      .then(({ scripts: list, versionsByScript: byScript }) => {
        if (!active) return
        setScripts(list)
        setVersionsByScript(byScript)
        setExpandedScripts(new Set(list.map((s) => s.id)))
        const first = list[0] ?? null
        setSelectedScriptId(first?.id ?? null)
        const latest = first
          ? parseVersions(byScript[first.id] ?? [])[0]
          : undefined
        setSelectedVersionId(latest?.file.id ?? null)
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
  }, [folderId])

  // Track the selected version for the async-save guard.
  useEffect(() => {
    currentVersionIdRef.current = selectedVersionId
  }, [selectedVersionId])

  // Load the selected version's content.
  useEffect(() => {
    if (selectedVersionId === null) {
      setContent(null)
      setSource('')
      return
    }
    const file = Object.values(versionsByScript)
      .flat()
      .find((f) => f.id === selectedVersionId)
    if (file === undefined) return
    let active = true
    setContent(null)
    readFile(file)
      .then((text) => {
        if (!active) return
        setContent(text)
        setSource(text)
        // Fresh version: reset auto-save bookkeeping.
        changeCountRef.current = 0
        lastSavedAtRef.current = Date.now()
        setSaveState('saved')
      })
      .catch((err) => {
        if (!active) return
        console.error('[drive] read version failed:', err)
        setError(String(err instanceof Error ? err.message : err))
        setContent('')
        setSource('')
      })
    return () => {
      active = false
    }
  }, [selectedVersionId, versionsByScript])

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
    const versionId = selectedVersionId
    if (versionId === null) return
    const text = source
    if (text === content) return
    savingRef.current = true
    setSaveState('saving')
    try {
      await updateFileContent(versionId, text)
      if (currentVersionIdRef.current === versionId) {
        setContent(text)
        changeCountRef.current = 0
        lastSavedAtRef.current = Date.now()
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

  function selectScript(script: DriveFile) {
    void persist() // flush any unsaved edits to the outgoing version first
    setSelectedScriptId(script.id)
    setExpandedScripts((prev) => new Set(prev).add(script.id))
    const latest = parseVersions(versionsByScript[script.id] ?? [])[0]
    setSelectedVersionId(latest?.file.id ?? null)
  }

  function selectVersion(scriptId: string, versionId: string) {
    void persist() // flush any unsaved edits to the outgoing version first
    setSelectedScriptId(scriptId)
    setSelectedVersionId(versionId)
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
        onToggle={() => setNavCollapsed((c) => !c)}
        onToggleExpand={toggleExpand}
        onSelectScript={selectScript}
        onSelectVersion={selectVersion}
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
          <div className="workspace__empty">
            {treeLoading ? 'Loading…' : 'No scripts yet. Create one.'}
          </div>
        ) : selectedVersionId === null ? (
          <div className="workspace__empty">This script has no versions.</div>
        ) : content === null ? (
          <div className="workspace__empty">Loading…</div>
        ) : (
          <>
            <VersionBar
              scriptName={selectedScript?.name ?? ''}
              versions={versions}
              selectedVersionId={selectedVersionId}
              busy={busy}
              dirty={dirty}
              saving={saveState === 'saving'}
              onSelectVersion={(id) =>
                selectedScriptId !== null && selectVersion(selectedScriptId, id)
              }
              onSave={() => void persist()}
              onNewVersion={newVersion}
            />
            <div className="workspace__editor">
              <SplitPane
                left={
                  <Editor
                    key={selectedVersionId}
                    initialValue={content}
                    onChange={setSource}
                    pageBreakLines={pageBreakLines}
                  />
                }
                right={
                  <Preview source={source} onPageBreaks={setPageBreakLines} />
                }
              />
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
        <h1 className="signin__title">Fountain Editor</h1>
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
