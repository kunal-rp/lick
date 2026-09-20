// Throwaway visual harness for the workspace chrome (the real app is behind
// Google sign-in). Not part of the build; deleted after verification.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { VersionBar } from './components/VersionBar'
import { Sidebar } from './components/Sidebar'
import { OutlinePanel } from './components/OutlinePanel'
import { InsightsPanel } from './components/InsightsPanel'
import { FileNav } from './components/FileNav'
import { CommandPalette, type Command } from './components/CommandPalette'
import { Editor } from './components/Editor'
import { parseSections } from './fountain'
import type { SidebarTab } from './layout'
import './index.css'
import './App.css'

const SOURCE = `{{section: Act One | Setup | blue}}

INT. LAUNDROMAT - NIGHT

Rain hammers the window. MARGOT, 30s, watches a dryer turn.

MARGOT
It's been forty minutes.

DESMOND
The machine doesn't care.

EXT. PARKING LOT - CONTINUOUS

Margot steps out into the downpour.

{{/section}}

{{section: Act Two | Confrontation | amber}}

INT. DESMOND'S CAR - NIGHT

DESMOND
Get in.

MARGOT
No.

EXT. HIGHWAY - LATER

Headlights streak past.

{{/section}}
`

const projects = [{ id: 'p1', name: 'The Rain in Portugal', mimeType: 'folder' }] as never
const byProject = {
  p1: [
    { id: 'v3', name: 'The Rain in Portugal_v3.fountain', mimeType: 't' },
    { id: 'v2', name: 'The Rain in Portugal_v2.fountain', mimeType: 't' },
    { id: 'v1', name: 'The Rain in Portugal_v1.fountain', mimeType: 't' },
  ],
} as never

const versions = [
  { file: { id: 'v3', name: 'The Rain in Portugal_v3.fountain', mimeType: 't' }, label: 'v3', number: 3 },
  { file: { id: 'v2', name: 'The Rain in Portugal_v2.fountain', mimeType: 't' }, label: 'v2', number: 2 },
  { file: { id: 'v1', name: 'The Rain in Portugal_v1.fountain', mimeType: 't' }, label: 'v1', number: 1 },
] as never

const commands: Command[] = [
  { id: 'save', label: 'Save now', group: 'Script', hint: '⌘S', run: () => {} },
  { id: 'nv', label: 'New draft from current text', group: 'Script', run: () => {} },
  { id: 'pdf', label: 'Export PDF', group: 'Script', run: () => {} },
  { id: 'so', label: 'Show outline', group: 'Sidebar', run: () => {} },
]

function Harness() {
  const [tab, setTab] = useState<SidebarTab>('outline')
  const [collapsed, setCollapsed] = useState(false)
  const [prev, setPrev] = useState(true)
  const [zoom, setZoom] = useState(false)
  const [view, setView] = useState<'editor' | 'preview'>('editor')
  const [pal, setPal] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [line, setLine] = useState(8)
  const [src, setSrc] = useState(SOURCE)
  const [jump, setJump] = useState<{ line: number; nonce: number } | null>(null)
  const jumpTo = (l: number) => {
    setLine(l)
    setJump((j) => ({ line: l, nonce: (j?.nonce ?? 0) + 1 }))
  }

  document.documentElement.setAttribute('data-theme', theme)

  return (
    <div className="workspace">
      <Sidebar
        tab={tab}
        onSelectTab={setTab}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      >
        {tab === 'files' ? (
          <FileNav
            folderName="Screenplays"
            projects={projects}
            versionsByProject={byProject}
            expandedProjects={new Set(['p1'])}
            selectedProjectId="p1"
            selectedVersionId="v3"
            loading={false}
            busy={false}
            onToggleExpand={() => {}}
            onSelectProject={() => {}}
            onSelectVersion={() => {}}
            onDeleteVersion={() => {}}
            onNewProject={() => {}}
            onChangeFolder={() => {}}
          />
        ) : tab === 'outline' ? (
          <OutlinePanel source={src} currentLine={line} onJump={jumpTo} />
        ) : tab === 'notes' ? (
          <div style={{ padding: 16, fontSize: 13 }}>(notes panel)</div>
        ) : (
          <InsightsPanel source={src} onJump={jumpTo} />
        )}
      </Sidebar>
      <div className="workspace__main">
        <VersionBar
          projectName="The Rain in Portugal"
          versions={versions}
          selectedVersionId="v3"
          dirty
          saving={false}
          savedAt={Date.now()}
          onSelectVersion={() => {}}
          onSave={() => {}}
          onToggleNav={() => setCollapsed(false)}
          showPreview={prev}
          onTogglePreview={() => setPrev((v) => !v)}
          zoomed={zoom}
          onToggleZoom={() => setZoom((z) => !z)}
          mobileView={view}
          onSetView={setView}
          onOpenCommands={() => setPal(true)}
        />
        <div style={{ flex: '1 1 auto', minHeight: 0 }}>
          <Editor
            initialValue={SOURCE}
            onChange={setSrc}
            pageBreakLines={[]}
            sections={parseSections(src)}
            jumpTo={jump}
          />
        </div>
        <div style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: 11, borderTop: '1px solid var(--border)' }}>
          lines={src.split('\n').length} chars={src.length} caretLine={line}
        </div>
      </div>
      {pal && <CommandPalette commands={commands} onClose={() => setPal(false)} />}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
