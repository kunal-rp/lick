import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { MARKERS, toggleEmphasis, type EmphasisKind } from './emphasis'

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
            <kbd className="toolbar__kbd">{shortcut}</kbd>
          </button>
        )
      })}
    </div>
  )
}
