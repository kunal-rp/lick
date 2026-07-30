import type { ScreenplayElement, Screenplay } from './types'

// Fountain 1.1 parser (https://fountain.io/syntax).
//
// Covers the body elements a screenplay renders: scene headings, action,
// character cues, dialogue, parentheticals, transitions, centered text, lyrics,
// and forced page breaks. Structural, non-printing markers (sections `#`,
// synopses `=`) are recognised and dropped; a leading title page is skipped.
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

/** Index of the first body line after an optional leading title page. */
function skipTitlePage(lines: string[]): number {
  let j = 0
  while (j < lines.length && lines[j].trim() === '') j++
  if (j >= lines.length || !TITLE_KEY.test(lines[j].trim())) return 0
  while (j < lines.length && lines[j].trim() !== '') j++
  return j
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

  const elements: ScreenplayElement[] = []
  let prev: { start: number; end: number; dialogue: boolean } | null = null
  let i = skipTitlePage(lines)
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

  return { elements }
}
