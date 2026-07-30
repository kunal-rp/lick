import { useEffect, useState } from 'react'
import { Editor } from './components/Editor'
import { Preview } from './components/Preview'
import { SplitPane } from './components/SplitPane'
import { FileNav } from './components/FileNav'
import { listFiles, readFile, type DriveFile } from './drive/files'
import { useDriveAuth } from './drive/useDriveAuth'
import { useWorkingFolder } from './drive/useWorkingFolder'
import './App.css'

export default function App() {
  const auth = useDriveAuth()
  const { folder, picking, choose } = useWorkingFolder()

  const [files, setFiles] = useState<DriveFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Content of the selected file; null while loading.
  const [content, setContent] = useState<string | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(false)

  // `source` is the live editor text (drives the preview); it starts from the
  // loaded file content and follows edits.
  const [source, setSource] = useState('')
  // Source line indices where the preview breaks a page; the editor draws a
  // dashed guide at each so the writer sees page boundaries in context.
  const [pageBreakLines, setPageBreakLines] = useState<number[]>([])

  const folderId = folder?.id ?? null

  // List the folder's files whenever the working folder changes; auto-select
  // the first file so the editor isn't blank when the folder has content.
  useEffect(() => {
    if (folderId === null) return
    let active = true
    setFilesLoading(true)
    listFiles(folderId)
      .then((list) => {
        if (!active) return
        setFiles(list)
        setSelectedId(list.length > 0 ? list[0].id : null)
      })
      .catch((error) => {
        if (!active) return
        console.error('[drive] list files failed:', error)
        setFiles([])
        setSelectedId(null)
      })
      .finally(() => {
        if (active) setFilesLoading(false)
      })
    return () => {
      active = false
    }
  }, [folderId])

  // Load the selected file's content.
  useEffect(() => {
    if (selectedId === null) {
      setContent(null)
      setSource('')
      return
    }
    const file = files.find((f) => f.id === selectedId)
    if (file === undefined) return
    let active = true
    setContent(null)
    readFile(file)
      .then((text) => {
        if (!active) return
        setContent(text)
        setSource(text)
      })
      .catch((error) => {
        if (!active) return
        console.error('[drive] read file failed:', error)
        setContent('')
        setSource('')
      })
    return () => {
      active = false
    }
  }, [selectedId, files])

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
        files={files}
        selectedId={selectedId}
        loading={filesLoading}
        collapsed={navCollapsed}
        onToggle={() => setNavCollapsed((c) => !c)}
        onSelect={(file) => setSelectedId(file.id)}
        onChangeFolder={() => choose()}
      />
      <div className="workspace__main">
        {selectedId === null ? (
          // No file to edit: preview stays collapsed, nav shows the empty state.
          <div className="workspace__empty">
            {filesLoading ? 'Loading…' : 'This folder has no files yet.'}
          </div>
        ) : content === null ? (
          <div className="workspace__empty">Loading file…</div>
        ) : (
          <SplitPane
            left={
              <Editor
                key={selectedId}
                initialValue={content}
                onChange={setSource}
                pageBreakLines={pageBreakLines}
              />
            }
            right={<Preview source={source} onPageBreaks={setPageBreakLines} />}
          />
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
