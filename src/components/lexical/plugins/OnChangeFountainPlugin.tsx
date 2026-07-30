import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getRoot } from 'lexical'

interface Props {
  onChange: (source: string) => void
}

/**
 * Emit the editor's plain text (the Fountain source, markers and all) on load
 * and after every edit. The editor content *is* the script, so this is a
 * straight text read — no format serialization needed.
 */
export function OnChangeFountainPlugin({ onChange }: Props) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.getEditorState().read(() => onChange($getRoot().getTextContent()))
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => onChange($getRoot().getTextContent()))
    })
  }, [editor, onChange])

  return null
}
