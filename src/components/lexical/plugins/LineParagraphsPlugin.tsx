import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { registerLineParagraphs } from '../document'

/**
 * Holds the editor to one paragraph per source line.
 *
 * PlainTextPlugin's Enter inserts a line break, and a multi-line paste inserts
 * several; both would put the old single-paragraph shape back and silently
 * break the per-line formatting. See document.ts for why this is a node
 * transform rather than a set of command overrides.
 */
export function LineParagraphsPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => registerLineParagraphs(editor), [editor])
  return null
}
