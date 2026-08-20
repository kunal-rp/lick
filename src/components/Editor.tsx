import { useLayoutEffect, useRef } from 'react'
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
import { Toolbar, type ViewToggle } from './lexical/Toolbar'
import { OnChangeFountainPlugin } from './lexical/plugins/OnChangeFountainPlugin'
import { EmphasisShortcutsPlugin } from './lexical/plugins/EmphasisShortcutsPlugin'
import { PageBreakGuidesPlugin } from './lexical/plugins/PageBreakGuidesPlugin'
import { SectionBackgroundsPlugin } from './lexical/plugins/SectionBackgroundsPlugin'
import { CapitalizationPlugin } from './lexical/plugins/CapitalizationPlugin'
import { JumpToLinePlugin } from './lexical/plugins/JumpToLinePlugin'
import { RevealPreviewPlugin } from './lexical/plugins/RevealPreviewPlugin'
import { CaretVisibilityPlugin } from './lexical/plugins/CaretVisibilityPlugin'
import type { Section } from '../fountain'
import './Editor.css'

interface EditorProps {
  /** Seed content, as Fountain plain text. Read once on mount. */
  initialValue: string
  /** Fires with the Fountain source (markers included) on load and every edit. */
  onChange: (value: string) => void
  /** Source line indices where the preview breaks a page (drawn as guides). */
  pageBreakLines: number[]
  /** Section ranges to paint as tinted background bands behind the text. */
  sections?: Section[]
  /** View panels the toolbar can show/hide (e.g. Preview). */
  viewToggles?: ViewToggle[]
  /** Request to move the caret to a source line and scroll it into view. */
  jumpTo?: { line: number; nonce: number } | null
  /** Scroll offset (px) to restore on mount (remembered per version). */
  initialScrollTop?: number
  /** Reports the editor scroll offset as the user scrolls (rAF-throttled). */
  onScrollChange?: (top: number) => void
  /** Double-clicking a line reports it so the preview can scroll to it. */
  onRevealInPreview?: (line: number) => void
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
export function Editor({
  initialValue,
  onChange,
  pageBreakLines,
  sections = [],
  viewToggles,
  jumpTo,
  initialScrollTop,
  onScrollChange,
  onRevealInPreview,
}: EditorProps) {
  const initialConfig = {
    namespace: 'fountain-editor',
    theme: { paragraph: 'fe-paragraph' },
    editorState: seed(initialValue),
    onError: (error: Error) => {
      console.error('[lexical]', error)
    },
  }

  const surfaceRef = useRef<HTMLDivElement>(null)
  const scrollRaf = useRef(0)

  // Restore the remembered scroll position once the content is laid out.
  useLayoutEffect(() => {
    if (surfaceRef.current !== null && initialScrollTop) {
      surfaceRef.current.scrollTop = initialScrollTop
    }
    // Only on mount — the version key remounts the editor per version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleScroll = () => {
    if (onScrollChange === undefined || surfaceRef.current === null) return
    const top = surfaceRef.current.scrollTop
    if (scrollRaf.current !== 0) return
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = 0
      onScrollChange(top)
    })
  }

  return (
    <div className="editor">
      <LexicalComposer initialConfig={initialConfig}>
        <Toolbar viewToggles={viewToggles} />
        <div className="editor__surface" ref={surfaceRef} onScroll={handleScroll}>
          <SectionBackgroundsPlugin sections={sections} />
          <PageBreakGuidesPlugin breakLines={pageBreakLines} />
          <CapitalizationPlugin />
          <PlainTextPlugin
            contentEditable={
              <ContentEditable className="editor__content" spellCheck={true} />
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
        <JumpToLinePlugin target={jumpTo ?? null} />
        <RevealPreviewPlugin onReveal={onRevealInPreview} />
        <CaretVisibilityPlugin scrollRef={surfaceRef} />
        <OnChangeFountainPlugin onChange={onChange} />
      </LexicalComposer>
    </div>
  )
}
