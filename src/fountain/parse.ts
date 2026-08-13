import type { ScreenplayElement, Screenplay, TitlePageField } from './types'
import { SECTION_MARKER } from './sections'

// Fountain 1.1 parser (https://fountain.io/syntax).
//
// Covers the body elements a screenplay renders: scene headings, action,
// character cues, dialogue, parentheticals, transitions, centered text, lyrics,
// and forced page breaks. Structural, non-printing markers (sections `#`,
// synopses `=`, and this editor's `{{section:…}}`/`{{/section}}` range markers)
// are recognised and dropped; a leading title page is skipped.
//
// Every emitted element records `line`, the 0-based index of the source line
// where it begins, in the ORIGINAL source coordinates (nothing that would shift
// line numbers is stripped up front). The preview uses these to report page
// break locations back to the editor. Inline notes `[[ ]]` and single-line
// boneyard `/* */` are removed from element text only; multi-line boneyard is
// not yet handled.

const SCENE_HEADING = /^(INT|EXT|EST|INT\.?\/EXT|INT\/EXT|I\/E)[.\s]/i
const SCENE_NUMBER = /\s*#[^#]+#\s*$/
const PAGE_BREAK = /^={3,}$/
const TITLE_KEY =
  /^(title|credit|author|authors|source|draft date|contact|copyright|notes?|revision|date|format)\s*:/i

function cleanInline(text: string): string {
  return text.replace(/\[\[.*?\]\]/g, '').replace(/\/\*.*?\*\//g, '')
}

function stripSceneNumber(text: string): string {
  return text.replace(SCENE_NUMBER, '')
}

/**
 * Parse an optional leading title page into ordered key/value fields.
 *
 * A field is `Key: value` (value optional inline); subsequent lines indented by
 * 3+ spaces or a tab are additional values for the current key. The title page
 * ends at the first blank line. Only recognised if the first line's key is a
 * known title-page key, so a body opener like "FADE IN:" isn't misread.
 */
function parseTitlePage(lines: string[]): {
  fields: TitlePageField[] | null
  bodyStart: number
} {
  let start = 0
  while (start < lines.length && lines[start].trim() === '') start++
  if (start >= lines.length || !TITLE_KEY.test(lines[start].trim())) {
    return { fields: null, bodyStart: 0 }
  }

  const fields: TitlePageField[] = []
  let current: TitlePageField | null = null
  let j = start
  for (; j < lines.length && lines[j].trim() !== ''; j++) {
    const line = lines[j]
    if (/^(\s{3,}|\t)/.test(line)) {
      if (current !== null) current.values.push(line.trim())
      continue
    }
    const match = line.match(/^([^:]+):\s*(.*)$/)
    if (match) {
      current = { key: match[1].trim(), values: [] }
      if (match[2].trim() !== '') current.values.push(match[2].trim())
      fields.push(current)
    } else if (current !== null) {
      current.values.push(line.trim())
    }
  }

  return { fields: fields.length > 0 ? fields : null, bodyStart: j }
}

/**
 * A Character cue is an uppercase line (ignoring a trailing `(extension)` and
 * an optional dual-dialogue `^`) containing at least one letter.
 */
function looksLikeCharacter(line: string): boolean {
  const core = line
    .trim()
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s*\^$/, '')
    .trim()
  return core.length > 0 && /[A-Za-z]/.test(core) && core === core.toUpperCase()
}

/** The suffix appended to a continuing character cue (screenwriting standard). */
export const CONTD_SUFFIX = " (CONT'D)"

/** A character cue reduced to its name, dropping any `(V.O.)`-style extension. */
function cueName(text: string): string {
  return text.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/**
 * Mark character cues that continue the same speaker within a scene. A cue is a
 * continuation when the previous character to speak was this same character,
 * with only action (or their own parentheticals) in between — no other speaker
 * and no scene break. Renderers turn the flag into a trailing `(CONT'D)`.
 *
 * The running speaker resets at anything that ends the flow: a scene heading,
 * transition, centered text, lyrics, or a forced page break.
 */
function markContinuations(elements: ScreenplayElement[]): void {
  let lastSpeaker: string | null = null
  for (const el of elements) {
    switch (el.type) {
      case 'character': {
        const name = cueName(el.text)
        if (name !== '' && name === lastSpeaker) el.cont = true
        lastSpeaker = name
        break
      }
      case 'dialogue':
      case 'parenthetical':
      case 'action':
        // Belong to / interrupt the current speech without changing the speaker.
        break
      default:
        // scene_heading, transition, centered, lyrics, page_break: reset.
        lastSpeaker = null
    }
  }
}

function pushDialogueBlock(
  block: string[],
  startLine: number,
  forced: boolean,
  out: ScreenplayElement[],
): void {
  let cue = block[0].trim()
  if (forced) cue = cue.replace(/^@/, '')
  cue = cue.replace(/\s*\^$/, '')
  out.push({ type: 'character', text: cleanInline(cue), line: startLine })

  // Merge consecutive dialogue lines into one element; parentheticals break it.
  let buffer: string[] = []
  let bufferLine = -1
  const flush = () => {
    if (buffer.length > 0) {
      out.push({ type: 'dialogue', text: cleanInline(buffer.join('\n')), line: bufferLine })
      buffer = []
      bufferLine = -1
    }
  }

  for (let k = 1; k < block.length; k++) {
    const line = block[k].trim()
    if (line.startsWith('(') && line.endsWith(')')) {
      flush()
      out.push({ type: 'parenthetical', text: cleanInline(line), line: startLine + k })
    } else {
      if (bufferLine === -1) bufferLine = startLine + k
      buffer.push(line)
    }
  }
  flush()
}

function classifyBlock(
  block: string[],
  startLine: number,
  out: ScreenplayElement[],
): void {
  const first = block[0].trim()

  // Forced page break.
  if (block.length === 1 && PAGE_BREAK.test(first)) {
    out.push({ type: 'page_break', text: '', line: startLine })
    return
  }
  // Non-printing structure: sections (#) and synopses (= but not ===).
  if (first.startsWith('#')) return
  if (first.startsWith('=') && !PAGE_BREAK.test(first)) return

  // Lyrics: each line is forced with a leading tilde.
  if (first.startsWith('~')) {
    for (let k = 0; k < block.length; k++) {
      out.push({
        type: 'lyrics',
        text: cleanInline(block[k].trim().replace(/^~/, '')),
        line: startLine + k,
      })
    }
    return
  }
  // Centered text: > ... < (checked before the forced-transition case).
  if (first.startsWith('>') && first.endsWith('<')) {
    out.push({ type: 'centered', text: cleanInline(first.slice(1, -1).trim()), line: startLine })
    return
  }
  // Forced transition: leading >.
  if (first.startsWith('>')) {
    out.push({ type: 'transition', text: cleanInline(first.slice(1).trim()).toUpperCase(), line: startLine })
    return
  }
  // Forced scene heading: leading dot (but not "..").
  if (first.startsWith('.') && !first.startsWith('..')) {
    out.push({
      type: 'scene_heading',
      text: stripSceneNumber(first.slice(1)).trim().toUpperCase(),
      line: startLine,
    })
    return
  }
  // Forced action: leading exclamation mark (preserves whitespace and case).
  if (first.startsWith('!')) {
    const body = [block[0].replace(/^!/, ''), ...block.slice(1)]
    out.push({ type: 'action', text: cleanInline(body.join('\n')), line: startLine })
    return
  }
  // Forced character: leading @.
  if (first.startsWith('@') && block.length >= 2) {
    pushDialogueBlock(block, startLine, true, out)
    return
  }

  // Automatic scene heading.
  if (block.length === 1 && SCENE_HEADING.test(first)) {
    out.push({ type: 'scene_heading', text: stripSceneNumber(first).trim().toUpperCase(), line: startLine })
    return
  }
  // Automatic transition: a single uppercase line ending in "TO:".
  if (block.length === 1 && looksLikeCharacter(first) && /TO:$/.test(first)) {
    out.push({ type: 'transition', text: first, line: startLine })
    return
  }
  // Dialogue block: an uppercase cue followed by at least one more line.
  if (block.length >= 2 && looksLikeCharacter(block[0])) {
    pushDialogueBlock(block, startLine, false, out)
    return
  }

  // Everything else is action (line breaks within the block are preserved).
  out.push({ type: 'action', text: cleanInline(block.join('\n')), line: startLine })
}

/** Parse raw Fountain text into a structured {@link Screenplay}. */
export function parse(source: string): Screenplay {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')

  // Blank out section-range markers ({{section:…}} / {{/section}}) so they
  // never render as action. Blanking in place (rather than removing) keeps
  // every element's `line` in original source coordinates, and an empty line
  // also separates blocks, so a marker never merges into an adjacent block.
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_MARKER.test(lines[i])) lines[i] = ''
  }

  const { fields: titlePage, bodyStart } = parseTitlePage(lines)

  const elements: ScreenplayElement[] = []
  let prev: { start: number; end: number; dialogue: boolean } | null = null
  let i = bodyStart
  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++
      continue
    }
    const startLine = i
    const block: string[] = []
    while (i < lines.length && lines[i].trim() !== '') {
      block.push(lines[i])
      i++
    }

    const start = elements.length
    classifyBlock(block, startLine, elements)
    const end = elements.length

    const isDialogueBlock = elements[start]?.type === 'character'
    const isDual = isDialogueBlock && /\^\s*$/.test(block[0].trim())
    if (isDual) {
      for (let k = start; k < end; k++) elements[k].dual = 'right'
      if (prev !== null && prev.dialogue) {
        for (let k = prev.start; k < prev.end; k++) elements[k].dual = 'left'
      }
    }
    prev = { start, end, dialogue: isDialogueBlock }
  }

  markContinuations(elements)

  return { titlePage, elements }
}
