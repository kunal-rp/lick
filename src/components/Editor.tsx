import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from 'lexical'
import { Toolbar } from './lexical/Toolbar'
import { OnChangeFountainPlugin } from './lexical/plugins/OnChangeFountainPlugin'
import { EmphasisShortcutsPlugin } from './lexical/plugins/EmphasisShortcutsPlugin'
import { PageBreakGuidesPlugin } from './lexical/plugins/PageBreakGuidesPlugin'
import './Editor.css'

interface EditorProps {
  /** Seed content, as Fountain plain text. Read once on mount. */
  initialValue: string
  /** Fires with the Fountain source (markers included) on load and every edit. */
  onChange: (value: string) => void
  /** Source line indices where the preview breaks a page (drawn as guides). */
  pageBreakLines: number[]
}

// Build the initial state as a single paragraph whose lines are separated by
// line-break nodes. Plain-text editing keeps everything in one paragraph, so
// the serialized text uses single "\n" separators — matching Fountain source.
function seed(text: string) {
  return () => {
    const root = $getRoot()
    if (root.getFirstChild() !== null) return
    const paragraph = $createParagraphNode()
    const lines = (text ?? '').split('\n')
    lines.forEach((line, i) => {
      if (i > 0) paragraph.append($createLineBreakNode())
      if (line.length > 0) paragraph.append($createTextNode(line))
    })
    root.append(paragraph)
  }
}

/**
 * Lexical plain-text editor for Fountain source. The document is the raw
 * screenplay text — the toolbar (and ⌘B/I/U) insert Fountain emphasis markers
 * directly into it, which are the only inline modifications the format defines.
 */
export function Editor({ initialValue, onChange, pageBreakLines }: EditorProps) {
  const initialConfig = {
    namespace: 'fountain-editor',
    theme: { paragraph: 'fe-paragraph' },
    editorState: seed(initialValue),
    onError: (error: Error) => {
      console.error('[lexical]', error)
    },
  }

  return (
    <div className="editor">
      <LexicalComposer initialConfig={initialConfig}>
        <Toolbar />
        <div className="editor__surface">
          <PageBreakGuidesPlugin breakLines={pageBreakLines} />
          <PlainTextPlugin
            contentEditable={
              <ContentEditable className="editor__content" spellCheck={false} />
            }
            placeholder={
              <div className="editor__placeholder">
                Write your screenplay in Fountain syntax…
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        <HistoryPlugin />
        <EmphasisShortcutsPlugin />
        <OnChangeFountainPlugin onChange={onChange} />
      </LexicalComposer>
    </div>
  )
}
