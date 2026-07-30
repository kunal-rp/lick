import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_NORMAL, KEY_DOWN_COMMAND } from 'lexical'
import { MARKERS, toggleEmphasis } from '../emphasis'

// Standard ⌘/Ctrl+B / I / U shortcuts, routed to Fountain marker-wrapping
// instead of Lexical's rich-text formats (which the plain-text editor doesn't
// register).
export function EmphasisShortcutsPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand<KeyboardEvent>(
      KEY_DOWN_COMMAND,
      (event) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey) return false

        let marker: string | null = null
        switch (event.key.toLowerCase()) {
          case 'b':
            marker = MARKERS.bold
            break
          case 'i':
            marker = MARKERS.italic
            break
          case 'u':
            marker = MARKERS.underline
            break
        }
        if (marker === null) return false

        event.preventDefault()
        toggleEmphasis(editor, marker)
        return true
      },
      COMMAND_PRIORITY_NORMAL,
    )
  }, [editor])

  return null
}
