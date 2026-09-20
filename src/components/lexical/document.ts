import type { LexicalEditor } from 'lexical'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  ParagraphNode,
  TextNode,
  type ParagraphNode as ParagraphNodeType,
} from 'lexical'

/**
 * The editor's document shape: one paragraph per source line.
 *
 * It used to be a single paragraph whose lines were separated by line-break
 * nodes. That serialises to Fountain for free — each `<br>` is one "\n" — but
 * it makes every line part of one inline flow, and inline content can't be
 * indented, centred or given its own box. Screenplay formatting is entirely
 * block-level (a character cue is centred, dialogue is inset, a transition is
 * flush right), so formatting the editor in place is impossible in that shape.
 *
 * One paragraph per line costs two things, both handled here:
 *
 *   - `getTextContent()` joins block children with "\n\n", not "\n", so the
 *     source has to be assembled rather than read off the root. See
 *     {@link $sourceText}.
 *   - Anything that inserts a line break — the Enter key under PlainTextPlugin,
 *     a multi-line paste — would put the old shape back. Rather than override
 *     each of those commands, {@link registerLineParagraphs} normalises the
 *     tree afterwards, so every path that can produce a break is covered by
 *     one rule instead of N intercepts.
 */

/** The Fountain source, with lines joined by single newlines. */
export function $sourceText(): string {
  return $getRoot()
    .getChildren()
    .map((child) => child.getTextContent())
    .join('\n')
}

/** Read the source out of an editor state without an enclosing read(). */
export function readSource(editor: LexicalEditor): string {
  return editor.getEditorState().read($sourceText)
}

/** Replace the whole document with `text`, one paragraph per line. */
export function $setSourceText(text: string): void {
  const root = $getRoot()
  root.clear()
  for (const line of text.split('\n')) {
    const paragraph = $createParagraphNode()
    if (line.length > 0) paragraph.append($createTextNode(line))
    root.append(paragraph)
  }
}

/** Build the initial editor state from `text` (used as Lexical's seed). */
export function seedFrom(text: string) {
  return () => {
    if ($getRoot().getFirstChild() !== null) return
    $setSourceText(text ?? '')
  }
}

/**
 * Keep the one-paragraph-per-line invariant: split any paragraph whose text
 * spans more than one line into one paragraph per line.
 *
 * Registered as a node transform, so it runs inside the same update as whatever
 * introduced the newline and the user never sees the intermediate shape. Two
 * distinct things produce one:
 *
 *   - a LineBreakNode, from PlainTextPlugin's Enter or a pasted block, and
 *   - a raw "\n" inside a TextNode, from `insertText` with a multi-line string.
 *
 * `getTextContent()` renders a LineBreakNode as "\n", so testing the
 * paragraph's text catches both without having to enumerate node types — which
 * matters, because missing the second kind doesn't corrupt the document so much
 * as silently desynchronise it: the source would gain a line that the DOM has
 * no paragraph for, and every line label below it would shift by one.
 *
 * The paragraph is rebuilt from its text rather than by moving nodes around.
 * This is a plain-text editor — every child is an unformatted TextNode or a
 * break — so there is no inline state to preserve, and rebuilding is both
 * shorter and immune to the node-shuffling edge cases.
 */
function paragraphColumn(paragraph: ParagraphNodeType): number | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null

  const point = selection.focus
  const node = point.getNode()
  const owner = $isElementNode(node) ? node : node.getParent()
  if (owner === null || owner.getKey() !== paragraph.getKey()) return null

  let column = 0
  for (const child of paragraph.getChildren()) {
    if (point.type === 'text' && child.getKey() === point.key) {
      return column + point.offset
    }
    column += child.getTextContentSize()
  }
  // An element point addresses a child index; everything before it is text.
  if (point.type === 'element') {
    let acc = 0
    const children = paragraph.getChildren()
    for (let i = 0; i < point.offset && i < children.length; i++) {
      acc += children[i].getTextContentSize()
    }
    return acc
  }
  return column
}

function splitIntoLines(paragraph: ParagraphNodeType): void {
  const text = paragraph.getTextContent()
  if (!text.includes('\n')) return

  const column = paragraphColumn(paragraph)
  const lines = text.split('\n')

  // Rebuild this paragraph as the first line, then append the rest after it.
  paragraph.clear()
  if (lines[0].length > 0) paragraph.append($createTextNode(lines[0]))

  let previous: ParagraphNodeType = paragraph
  const created: ParagraphNodeType[] = [paragraph]
  for (let i = 1; i < lines.length; i++) {
    const next = $createParagraphNode()
    if (lines[i].length > 0) next.append($createTextNode(lines[i]))
    previous.insertAfter(next)
    created.push(next)
    previous = next
  }

  if (column === null) return

  // Put the caret back where it was, in whichever line now holds that column.
  let remaining = column
  for (let i = 0; i < lines.length; i++) {
    if (remaining <= lines[i].length) {
      const target = created[i]
      const child = target.getFirstChild()
      if ($isTextNode(child)) child.select(remaining, remaining)
      else target.selectStart()
      return
    }
    remaining -= lines[i].length + 1
  }
  created[created.length - 1].selectEnd()
}

/**
 * Install the invariant. Returns an unregister function.
 *
 * Two registrations, because Lexical runs element transforms only for elements
 * that were *intentionally* marked dirty. Inserting a LineBreakNode changes the
 * paragraph's children and qualifies; typing a "\n" into an existing TextNode
 * marks only the text node, leaving the paragraph dirty-by-descendant, which
 * the element transform never sees. The TextNode transform closes that gap.
 */
export function registerLineParagraphs(editor: LexicalEditor): () => void {
  const unregisterParagraph = editor.registerNodeTransform(
    ParagraphNode,
    (node) => {
      if ($isParagraphNode(node)) splitIntoLines(node)
    },
  )
  const unregisterText = editor.registerNodeTransform(TextNode, (node) => {
    if (!node.getTextContent().includes('\n')) return
    const parent = node.getParent()
    if ($isParagraphNode(parent)) splitIntoLines(parent)
  })
  return () => {
    unregisterParagraph()
    unregisterText()
  }
}
