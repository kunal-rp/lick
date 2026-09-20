import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { MARKERS, toggleEmphasis, type EmphasisKind } from './emphasis'
import { SearchBar } from './SearchBar'

// Show ⌘ on Apple platforms, Ctrl elsewhere — matching the actual shortcut
// handled by EmphasisShortcutsPlugin.
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent)
const MOD = IS_MAC ? '⌘' : 'Ctrl+'

// The complete set of inline modifications Fountain 1.1 defines, each with the
// keyboard shortcut bound to it.
const FORMATS: {
  key: EmphasisKind
  label: string
  accel: string
  sample: string
}[] = [
  { key: 'bold', label: 'B', accel: 'B', sample: '**text**' },
  { key: 'italic', label: 'I', accel: 'I', sample: '*text*' },
  { key: 'underline', label: 'U', accel: 'U', sample: '_text_' },
]

/**
 * The editor's own toolbar: things you do to the text, and nothing else.
 *
 * It used to also carry the Preview / History / Notes toggles, which put
 * workspace-level state under a document-level control — and left the view
 * switches stranded in the left pane whenever you were reading the right one.
 * Those now live in the VersionBar, which spans both panes.
 */
export function Toolbar() {
  const [editor] = useLexicalComposerContext()

  return (
    <div className="toolbar">
      {FORMATS.map((f) => {
        const shortcut = `${MOD}${f.accel}`
        return (
          <button
            key={f.key}
            type="button"
            title={`${shortcut}  →  ${f.sample}`}
            className={`toolbar__btn toolbar__btn--${f.key}`}
            // Don't let the button steal the editor selection on press.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleEmphasis(editor, MARKERS[f.key])}
          >
            <span className="toolbar__glyph">{f.label}</span>
          </button>
        )
      })}

      <SearchBar />
    </div>
  )
}
