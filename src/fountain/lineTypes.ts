import type { ElementType } from './types'
import { SECTION_MARKER } from './sections'

// Per-source-line element classification, for formatting the editor in place.
//
// parse() emits *elements*, which deliberately don't map 1:1 to lines: an
// action block joins its lines into one element, consecutive dialogue lines
// merge, and non-printing lines (sections, synopses, range markers) vanish
// entirely. The editor needs the opposite — a type for every line, including
// the ones that never print — so this walks the same block structure and
// reports what each line *is*.
//
// Kept beside parse.ts and following the same precedence deliberately: if the
// two disagreed, the editor would style a line as one thing and the preview
// would render it as another, which is worse than no styling at all.

/** What a single source line is, for display purposes. */
export type LineType =
  | ElementType
  | 'blank'
  /** A `#` section heading or `=` synopsis — structure that never prints. */
  | 'note'
  /** A `{{section:…}}` / `{{/section}}` range marker. */
  | 'marker'
  /** A title-page field on the leading title page. */
  | 'title_page'

const SCENE_HEADING = /^(INT|EXT|EST|INT\.?\/EXT|INT\/EXT|I\/E)[.\s]/i
const PAGE_BREAK = /^={3,}$/
const TITLE_KEY =
  /^(title|credit|author|authors|source|draft date|contact|copyright|notes?|revision|date|format)\s*:/i

/** Mirrors parse.ts's `looksLikeCharacter`. */
function looksLikeCharacter(line: string): boolean {
  const core = line
    .trim()
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s*\^$/, '')
    .trim()
  return core.length > 0 && /[A-Za-z]/.test(core) && core === core.toUpperCase()
}

/** Classify one block's lines, writing into `out` at the block's offsets. */
function classifyBlock(block: string[], startLine: number, out: LineType[]): void {
  const first = block[0].trim()
  const set = (type: LineType) => {
    for (let k = 0; k < block.length; k++) out[startLine + k] = type
  }

  if (block.length === 1 && PAGE_BREAK.test(first)) return set('page_break')
  if (first.startsWith('#')) return set('note')
  if (first.startsWith('=') && !PAGE_BREAK.test(first)) return set('note')
  if (first.startsWith('~')) return set('lyrics')
  if (first.startsWith('>') && first.endsWith('<')) return set('centered')
  if (first.startsWith('>')) return set('transition')
  if (first.startsWith('.') && !first.startsWith('..')) return set('scene_heading')
  if (first.startsWith('!')) return set('action')

  const forcedCue = first.startsWith('@') && block.length >= 2
  if (forcedCue || (block.length >= 2 && looksLikeCharacter(block[0]))) {
    out[startLine] = 'character'
    for (let k = 1; k < block.length; k++) {
      const line = block[k].trim()
      out[startLine + k] =
        line.startsWith('(') && line.endsWith(')') ? 'parenthetical' : 'dialogue'
    }
    return
  }

  if (block.length === 1 && SCENE_HEADING.test(first)) return set('scene_heading')
  if (block.length === 1 && looksLikeCharacter(first) && /TO:$/.test(first)) {
    return set('transition')
  }
  return set('action')
}

/**
 * Classify every line of `source`. The returned array is exactly as long as
 * `source.split('\n')`, so the editor can index it by line number directly.
 */
export function lineTypes(source: string): LineType[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: LineType[] = new Array(lines.length).fill('blank')

  // Range markers are blanked before parsing (they separate blocks and never
  // print), but the editor still draws them, so record them first and keep
  // them out of the block scan.
  const scan = lines.slice()
  for (let i = 0; i < scan.length; i++) {
    if (SECTION_MARKER.test(scan[i])) {
      out[i] = 'marker'
      scan[i] = ''
    }
  }

  // Leading title page: `Key: value` runs until the first blank line.
  let i = 0
  while (i < scan.length && scan[i].trim() === '') i++
  if (i < scan.length && TITLE_KEY.test(scan[i].trim())) {
    for (; i < scan.length && scan[i].trim() !== ''; i++) {
      if (out[i] === 'blank') out[i] = 'title_page'
    }
  } else {
    i = 0
  }

  while (i < scan.length) {
    if (scan[i].trim() === '') {
      i++
      continue
    }
    const startLine = i
    const block: string[] = []
    while (i < scan.length && scan[i].trim() !== '') {
      block.push(scan[i])
      i++
    }
    classifyBlock(block, startLine, out)
  }

  return out
}
