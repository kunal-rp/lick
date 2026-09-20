import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $sourceText } from '../document'

interface Props {
  onChange: (source: string) => void
}

/**
 * Emit the Fountain source (markers and all) on load and after every edit.
 *
 * The document is one paragraph per line, and `getTextContent()` joins block
 * children with "\n\n", so the source is assembled by $sourceText rather than
 * read off the root.
 */
export function OnChangeFountainPlugin({ onChange }: Props) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.getEditorState().read(() => onChange($sourceText()))
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => onChange($sourceText()))
    })
  }, [editor, onChange])

  return null
}
