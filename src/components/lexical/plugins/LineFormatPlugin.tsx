import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { lineTypes } from '../../../fountain'
import { $sourceText } from '../document'

/**
 * Formats the editor in place: tags each line's paragraph with what it *is*,
 * so CSS can lay it out as the screenplay element it will print as.
 *
 * This is the half of the split-pane the preview was really for. Showing raw
 * Fountain beside a rendered copy spends half the window saying the same words
 * twice and makes the writer's eye jump between them; Highland 2, Slugline and
 * Beat all instead format the text where it's typed. Editor.css turns the
 * `data-el` attribute set here into the indents, casing and alignment.
 *
 * Attributes rather than Lexical node properties on purpose: the classification
 * is derived from the whole document (a cue is only a cue because a line
 * follows it), so it can't live on a node without being recomputed on every
 * neighbouring edit anyway. Writing to the DOM after reconciliation keeps the
 * editor state as pure Fountain text, which is what everything else here —
 * serialisation, offsets, undo — depends on.
 */
export function LineFormatPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const apply = () => {
      const root = editor.getRootElement()
      if (root === null) return

      const types = editor.getEditorState().read(() => lineTypes($sourceText()))

      // The labels are positional, so they're only meaningful when there is
      // exactly one paragraph per source line. That should always hold
      // (LineParagraphsPlugin enforces it), but if it ever doesn't, leaving the
      // previous labels alone is far better than shifting every line below the
      // discrepancy onto the wrong element.
      if (types.length !== root.children.length) return

      const lines = root.children
      for (let i = 0; i < lines.length; i++) {
        const el = lines[i] as HTMLElement
        const type = types[i] ?? 'blank'
        // Only touch the DOM when the label actually changes — this runs on
        // every keystroke, and a no-op write still invalidates style.
        if (el.dataset.el !== type) el.dataset.el = type
      }
    }

    apply()
    return editor.registerUpdateListener(apply)
  }, [editor])

  return null
}
