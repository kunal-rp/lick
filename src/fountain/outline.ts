import { parse } from './parse'
import { parseSections, type Section } from './sections'

// The script's navigable structure, in document order: the section ranges a
// writer declares while drafting, with the scene headings that fall inside
// them. This is what the Outline tab in the sidebar walks.
//
// Deliberately a flat list rather than a tree. Sections nest, but a navigator
// is read top-to-bottom and clicked once — a flat list carrying `depth` renders
// with indentation just as well, stays trivial to keyboard-walk, and doesn't
// need a recursive component to display.

export interface OutlineEntry {
  /** Stable key derived from the source line. */
  id: string
  kind: 'section' | 'scene'
  label: string
  /** 0-based source line to jump to. */
  line: number
  /** Indentation level: section nesting depth (scenes inherit the enclosing). */
  depth: number
  /** Section colour, so the outline reads against the editor's tinted bands. */
  color?: string
  /** Section's optional longer note. */
  description?: string
  /** 1-based scene number, counted across the whole script. */
  sceneNumber?: number
}

/**
 * How many section ranges are open at `line`. A scene sits one level inside
 * whatever encloses it, so its indent is the count of ranges covering it.
 */
function openDepthAt(sections: Section[], line: number): number {
  let depth = 0
  for (const s of sections) {
    if (s.startLine < line && line <= s.endLine) depth++
  }
  return depth
}

/** Build the outline — sections and scene headings merged in source order. */
export function buildOutline(source: string): OutlineEntry[] {
  const sections = parseSections(source)
  const entries: OutlineEntry[] = []

  for (const s of sections) {
    entries.push({
      id: `sec:${s.id}`,
      kind: 'section',
      label: s.label,
      line: s.startLine,
      depth: s.depth,
      color: s.color,
      description: s.description === '' ? undefined : s.description,
    })
  }

  let sceneNumber = 0
  for (const el of parse(source).elements) {
    if (el.type !== 'scene_heading') continue
    sceneNumber++
    entries.push({
      id: `scene:${el.line}`,
      kind: 'scene',
      label: el.text,
      line: el.line,
      depth: openDepthAt(sections, el.line),
      sceneNumber,
    })
  }

  // Source order is the only order that makes sense for a navigator. Where a
  // section marker and a scene share a line the section wins, since the range
  // opens before the content it contains.
  return entries.sort(
    (a, b) => a.line - b.line || (a.kind === 'section' ? -1 : 1),
  )
}
