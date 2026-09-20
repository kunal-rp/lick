import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical'
import { caretOffset, lineStartAt, selectRange } from '../offsets'

/**
 * A row of Fountain element keys pinned above the on-screen keyboard.
 *
 * Writing a screenplay on a phone is bottlenecked on punctuation, not letters:
 * every element marker Fountain defines — `.` `@` `>` `!` `~` `(` — lives behind
 * the keyboard's `123` layer, so forcing a scene heading costs a layer switch, a
 * tap, and a switch back. This row puts them one tap away.
 *
 * It inserts *forced* element markers rather than trying to guess intent from
 * context. Forced markers are unambiguous to the parser (see fountain/parse.ts),
 * which means a key does exactly the same thing wherever the caret is — no
 * hidden state, nothing to learn. The alternative (an "INT." button that only
 * works on an empty line) fails silently mid-scene, which is worse than nothing.
 */

interface Key {
  label: string
  title: string
  /** Line-leading marker this key forces, or null for a caret-local insert. */
  prefix: string | null
  /** Literal inserted at the caret, with `|` marking where the caret lands. */
  insert?: string
}

const KEYS: Key[] = [
  { label: 'INT./EXT.', title: 'Force a scene heading', prefix: '.' },
  { label: 'Character', title: 'Force a character cue', prefix: '@' },
  { label: '( )', title: 'Parenthetical', prefix: null, insert: '(|)' },
  { label: 'Transition', title: 'Force a transition', prefix: '>' },
  { label: 'Action', title: 'Force an action line', prefix: '!' },
  { label: 'Lyric', title: 'Force a lyric line', prefix: '~' },
  { label: '—', title: 'Em dash', prefix: null, insert: '—|' },
  { label: '…', title: 'Ellipsis', prefix: null, insert: '…|' },
]

/**
 * Apply a line-leading marker to the caret's line.
 *
 * Toggles: pressing the same key again strips the marker, so a mis-tap is
 * undone by repeating it rather than by hunting for the character. Switching
 * markers replaces whichever one is there, since a line can only be forced to
 * one element.
 */
function toggleLinePrefix(text: string, caret: number, prefix: string) {
  const start = lineStartAt(text, caret)
  const rest = text.slice(start)
  const eol = rest.indexOf('\n')
  const line = eol === -1 ? rest : rest.slice(0, eol)

  // Every forced marker is a single character, so an existing one is line[0].
  const existing: string | undefined = KEYS.map((k) => k.prefix).find(
    (p): p is string => p !== null && line.startsWith(p),
  )

  if (existing === prefix) {
    return { start, end: start + prefix.length, text: '', caretDelta: -prefix.length }
  }
  if (existing !== undefined) {
    return { start, end: start + existing.length, text: prefix, caretDelta: 0 }
  }
  return { start, end: start, text: prefix, caretDelta: prefix.length }
}

export function ScriptKeysPlugin() {
  const [editor] = useLexicalComposerContext()

  const press = (key: Key) => {
    editor.update(() => {
      const caret = caretOffset()
      if (caret === null) return

      if (key.prefix !== null) {
        const text = $getRoot().getTextContent()
        const edit = toggleLinePrefix(text, caret, key.prefix)
        if (!selectRange(edit.start, edit.end)) return
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        selection.insertText(edit.text)
        // Keep the caret where the writer left it, shifted by what we inserted
        // or removed ahead of it — retyping their position is not their job.
        const next = Math.max(edit.start, caret + edit.caretDelta)
        selectRange(next, next)
        return
      }

      const literal = key.insert ?? ''
      const caretAt = literal.indexOf('|')
      const body = literal.replace('|', '')
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      selection.insertText(body)
      if (caretAt !== -1) {
        const landing = caret + caretAt
        selectRange(landing, landing)
      }
    })
    // The buttons suppress mousedown, so focus never left — but iOS collapses
    // the keyboard on any touch outside the field unless focus is re-asserted.
    editor.focus()
  }

  return (
    <div className="scriptkeys" role="toolbar" aria-label="Screenplay elements">
      {KEYS.map((k) => (
        <button
          key={k.label}
          type="button"
          className="scriptkeys__key"
          title={k.title}
          aria-label={k.title}
          // Don't let the press steal the selection we're about to act on.
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => press(k)}
        >
          {k.label}
        </button>
      ))}
    </div>
  )
}
