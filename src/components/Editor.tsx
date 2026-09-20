import { useLayoutEffect, useRef } from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { Toolbar } from './lexical/Toolbar'
import { OnChangeFountainPlugin } from './lexical/plugins/OnChangeFountainPlugin'
import { EmphasisShortcutsPlugin } from './lexical/plugins/EmphasisShortcutsPlugin'
import { PageBreakGuidesPlugin } from './lexical/plugins/PageBreakGuidesPlugin'
import { SectionBackgroundsPlugin } from './lexical/plugins/SectionBackgroundsPlugin'
import { CapitalizationPlugin } from './lexical/plugins/CapitalizationPlugin'
import { JumpToLinePlugin } from './lexical/plugins/JumpToLinePlugin'
import { RevealPreviewPlugin } from './lexical/plugins/RevealPreviewPlugin'
import { CaretVisibilityPlugin } from './lexical/plugins/CaretVisibilityPlugin'
import { ScriptKeysPlugin } from './lexical/plugins/ScriptKeysPlugin'
import { CaretLinePlugin } from './lexical/plugins/CaretLinePlugin'
import { LineFormatPlugin } from './lexical/plugins/LineFormatPlugin'
import { LineParagraphsPlugin } from './lexical/plugins/LineParagraphsPlugin'
import { seedFrom } from './lexical/document'
import type { Section } from '../fountain'
import './screenplay.css'
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
  /** Request to move the caret to a source line and scroll it into view. */
  jumpTo?: { line: number; nonce: number } | null
  /** Scroll offset (px) to restore on mount (remembered per version). */
  initialScrollTop?: number
  /** Reports the editor scroll offset as the user scrolls (rAF-throttled). */
  onScrollChange?: (top: number) => void
  /** Double-clicking a line reports it so the preview can scroll to it. */
  onRevealInPreview?: (line: number) => void
  /** Reports the caret's source line, so the outline can mark where you are. */
  onCaretLine?: (line: number) => void
  /** Reports the selected line range, so a note can quote it. */
  onSelectedLines?: (
    range: { startLine: number; endLine: number } | null,
  ) => void
}

/**
 * Lexical plain-text editor for Fountain source. The document is the raw
 * screenplay text — the toolbar (and ⌘B/I/U) insert Fountain emphasis markers
 * directly into it, which are the only inline modifications the format defines.
 *
 * Each source line is its own paragraph (see lexical/document.ts), which is
 * what lets LineFormatPlugin lay each one out as the screenplay element it
 * will print as, instead of showing raw markup beside a rendered copy.
 */
export function Editor({
  initialValue,
  onChange,
  pageBreakLines,
  sections = [],
  jumpTo,
  initialScrollTop,
  onScrollChange,
  onRevealInPreview,
  onCaretLine,
  onSelectedLines,
}: EditorProps) {
  const initialConfig = {
    namespace: 'fountain-editor',
    theme: { paragraph: 'fe-paragraph' },
    editorState: seedFrom(initialValue),
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
        <Toolbar />
        {/* Must run before anything reads the tree: it is what keeps one
            paragraph per line true after an Enter or a multi-line paste. */}
        <LineParagraphsPlugin />
        <div className="editor__surface" ref={surfaceRef} onScroll={handleScroll}>
          <SectionBackgroundsPlugin sections={sections} />
          <PageBreakGuidesPlugin breakLines={pageBreakLines} />
          <CapitalizationPlugin />
          <LineFormatPlugin />
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                className="editor__content screenplay"
                spellCheck={true}
              />
            }
            placeholder={
              <div className="editor__placeholder">
                Write your screenplay in Fountain syntax…
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        {/* Fountain element keys, pinned under the surface so they sit
            directly above the on-screen keyboard (the workspace is already
            clamped to the visual viewport — see App.css). Phone-only: a
            hardware keyboard reaches every one of these characters directly. */}
        <ScriptKeysPlugin />
        <HistoryPlugin />
        <EmphasisShortcutsPlugin />
        <JumpToLinePlugin target={jumpTo ?? null} />
        <RevealPreviewPlugin onReveal={onRevealInPreview} />
        <CaretLinePlugin
          onCaretLine={onCaretLine}
          onSelectedLines={onSelectedLines}
        />
        <CaretVisibilityPlugin scrollRef={surfaceRef} />
        <OnChangeFountainPlugin onChange={onChange} />
      </LexicalComposer>
    </div>
  )
}
