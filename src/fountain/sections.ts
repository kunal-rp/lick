// Section ranges — an authoring overlay, distinct from Fountain's native `#`
// sections. A range spans from a start marker to a matching end marker and
// carries a label, an optional description, and a color. Writers use them to
// structure a script while writing (acts, sequences, beats); they never print.
//
// Syntax (each marker on its own line):
//   {{section: Label | optional description | optional color}}
//   ...script content...
//   {{/section}}
//
// The color is an explicit `#rgb`/`#rrggbb` or a named palette key; when omitted
// it is derived deterministically from the label (a stable pseudo-random pick,
// so the color doesn't flicker as the source is re-parsed on every keystroke).
// Ranges nest: a start pushes onto a stack and the next end pops it, so the
// nearest end pairs with the nearest open start. `depth` records the nesting
// level at which a range opens (0 = outermost).

export interface Section {
  /** Stable identifier (derived from the start line) for keys and jumps. */
  id: string
  /** Display label (the text before the first `|`). Always present. */
  label: string
  /** Optional longer note (the text between the first and second `|`). */
  description: string
  /** Resolved color as a hex string, e.g. `#e07a5f`. */
  color: string
  /** 0-based source line of the `{{section:…}}` start marker. */
  startLine: number
  /**
   * 0-based source line of the matching `{{/section}}` end marker, or the last
   * source line if the range is never closed.
   */
  endLine: number
  /** Nesting depth at which the range opens (0 = outermost). */
  depth: number
}

// A start marker `{{section: …}}` and an end marker `{{/section}}`, each alone
// on its line (surrounding whitespace allowed). SECTION_MARKER matches either,
// and is what the screenplay parser uses to drop these lines from the output.
const SECTION_START = /^\s*\{\{\s*section\s*:\s*(.+?)\s*\}\}\s*$/i
const SECTION_END = /^\s*\{\{\s*\/\s*section\s*\}\}\s*$/i
export const SECTION_MARKER = /^\s*\{\{\s*(?:section\s*:.*|\/\s*section\s*)\}\}\s*$/i

// A small palette of hues chosen to read against both the light and dark
// editor backgrounds when applied at low opacity. Named keys let a marker pick
// a color by name (`… | blue`); the values also back the label-hash fallback.
const PALETTE: Record<string, string> = {
  red: '#e07a5f',
  orange: '#e8934a',
  amber: '#e5b83b',
  green: '#5fa971',
  teal: '#3aa8a0',
  blue: '#5a8fd6',
  indigo: '#7c7cd6',
  purple: '#9b7cc8',
  pink: '#d67ab0',
}
const PALETTE_VALUES = Object.values(PALETTE)

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** djb2 hash (matches the scheme used for comment location hashes). */
function hash(text: string): number {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return h >>> 0
}

/**
 * Resolve a section's color: an explicit hex or palette name if given and
 * valid, otherwise a stable pick from the palette keyed on the label so the
 * same label always gets the same color across re-parses.
 */
function resolveColor(raw: string, label: string): string {
  const spec = raw.trim().toLowerCase()
  if (HEX.test(spec)) return spec
  if (spec in PALETTE) return PALETTE[spec]
  return PALETTE_VALUES[hash(label) % PALETTE_VALUES.length]
}

/** Split a start marker's inner text into `[label, description, color]`. */
function parseSpec(spec: string): { label: string; description: string; color: string } {
  const [label = '', description = '', color = ''] = spec.split('|').map((s) => s.trim())
  return { label, description, color }
}

/**
 * Scan raw Fountain source for section-range markers and pair them into
 * {@link Section}s. Nesting is handled with a stack (nearest end closes the
 * nearest open start); unclosed ranges extend to the last line, and unmatched
 * end markers are ignored.
 */
export function parseSections(source: string): Section[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const lastLine = Math.max(0, lines.length - 1)
  const out: Section[] = []
  const open: Section[] = []

  lines.forEach((line, i) => {
    const start = line.match(SECTION_START)
    if (start !== null) {
      const { label, description, color } = parseSpec(start[1])
      const section: Section = {
        id: `sec-${i}`,
        label: label || 'Section',
        description,
        color: resolveColor(color, label),
        startLine: i,
        endLine: lastLine,
        depth: open.length,
      }
      open.push(section)
      out.push(section)
      return
    }
    if (SECTION_END.test(line)) {
      const section = open.pop()
      if (section !== undefined) section.endLine = i
    }
  })

  return out
}
