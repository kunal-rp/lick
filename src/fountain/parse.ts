import type { Screenplay, ScreenplayElement } from './types'

// STUB PARSER
// -----------
// This is a placeholder implementation. It does *not* yet implement the real
// Fountain spec (https://fountain.io/syntax). For now it performs only a very
// rough, line-based classification so the preview pane has something sensible
// to render. It will be replaced by a proper parser later.

const SCENE_HEADING_PREFIXES = ['INT.', 'EXT.', 'INT/EXT', 'EST.', 'I/E']

function classifyLine(line: string): ScreenplayElement {
  const trimmed = line.trim()
  const upper = trimmed.toUpperCase()

  if (SCENE_HEADING_PREFIXES.some((p) => upper.startsWith(p))) {
    return { type: 'scene_heading', text: trimmed }
  }

  // A transition is an all-caps line ending in "TO:".
  if (trimmed === upper && upper.endsWith('TO:')) {
    return { type: 'transition', text: trimmed }
  }

  // A lone all-caps line is treated as a character cue.
  if (trimmed.length > 0 && trimmed === upper && !upper.endsWith('.')) {
    return { type: 'character', text: trimmed }
  }

  // Wrapped in parentheses -> parenthetical.
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return { type: 'parenthetical', text: trimmed }
  }

  return { type: 'action', text: trimmed }
}

/**
 * Parse raw Fountain text into a structured {@link Screenplay}.
 *
 * NOTE: stub implementation — see the note at the top of this file.
 */
export function parse(source: string): Screenplay {
  const elements: ScreenplayElement[] = []

  const lines = source.replace(/\r\n?/g, '\n').split('\n')

  let prevWasCharacterOrParenthetical = false
  for (const line of lines) {
    if (line.trim() === '') {
      prevWasCharacterOrParenthetical = false
      continue
    }

    const element = classifyLine(line)

    // A non-cue line immediately following a character cue is dialogue.
    if (
      prevWasCharacterOrParenthetical &&
      (element.type === 'action' || element.type === 'character')
    ) {
      element.type = 'dialogue'
    }

    prevWasCharacterOrParenthetical =
      element.type === 'character' || element.type === 'parenthetical'

    elements.push(element)
  }

  return { elements }
}
