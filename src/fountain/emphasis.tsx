import type { ReactNode } from 'react'

// Renders Fountain inline emphasis into React nodes.
//
// Per the Fountain 1.1 spec, Fountain follows Markdown's emphasis rules,
// reserving underscores for underline (https://fountain.io/syntax):
//   *italics*      **bold**      ***bold italics***      _underline_
// These mix and nest ("_Steel's face FILLS the *Leupold Mark 4* scope_").
// Emphasis characters can be used verbatim by escaping with a backslash
// (`\*`, `\_`). Spaces adjacent to a marker make it inert, so `*69 and *23`
// is not italic.

// Escaped markers are swapped for sentinels before matching, then restored as
// literals in the text leaves so they are never treated as delimiters.
const SENTINEL_BACKSLASH = String.fromCharCode(0)
const SENTINEL_STAR = String.fromCharCode(1)
const SENTINEL_UNDERSCORE = String.fromCharCode(2)

function protect(text: string): string {
  return text
    .replace(/\\\\/g, SENTINEL_BACKSLASH)
    .replace(/\\\*/g, SENTINEL_STAR)
    .replace(/\\_/g, SENTINEL_UNDERSCORE)
}

function restore(text: string): string {
  return text
    .split(SENTINEL_STAR)
    .join('*')
    .split(SENTINEL_UNDERSCORE)
    .join('_')
    .split(SENTINEL_BACKSLASH)
    .join('\\')
}

interface Rule {
  re: RegExp
  wrap: (children: ReactNode[], key: string) => ReactNode
}

// The capture `\S(?:[\s\S]*?\S)?` requires the emphasised run to start and end
// with a non-space character, enforcing Fountain's spacing rule. Longest
// markers are listed first so `***` wins over `**` and `*` at the same index.
const RULES: Rule[] = [
  {
    re: /\*\*\*(\S(?:[\s\S]*?\S)?)\*\*\*/,
    wrap: (c, k) => (
      <strong key={k}>
        <em>{c}</em>
      </strong>
    ),
  },
  {
    re: /\*\*(\S(?:[\s\S]*?\S)?)\*\*/,
    wrap: (c, k) => <strong key={k}>{c}</strong>,
  },
  {
    re: /\*(\S(?:[\s\S]*?\S)?)\*/,
    wrap: (c, k) => <em key={k}>{c}</em>,
  },
  {
    re: /_(\S(?:[\s\S]*?\S)?)_/,
    wrap: (c, k) => <u key={k}>{c}</u>,
  },
]

/**
 * Convert a single line of Fountain text (already free of block syntax) into
 * React nodes with bold / italic / underline applied.
 */
export function renderEmphasis(text: string): ReactNode[] {
  let counter = 0

  function render(input: string): ReactNode[] {
    let best: { index: number; rule: Rule; match: RegExpExecArray } | null = null
    for (const rule of RULES) {
      const m = rule.re.exec(input)
      if (m && (best === null || m.index < best.index)) {
        best = { index: m.index, rule, match: m }
      }
    }

    if (best === null) return [restore(input)]

    const { index, rule, match } = best
    const before = input.slice(0, index)
    const after = input.slice(index + match[0].length)

    const nodes: ReactNode[] = []
    if (before) nodes.push(restore(before))
    nodes.push(rule.wrap(render(match[1]), `em${counter++}`))
    if (after) nodes.push(...render(after))
    return nodes
  }

  return render(protect(text))
}
