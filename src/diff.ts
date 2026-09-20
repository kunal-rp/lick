// A minimal line-level diff, used to show what a history snapshot changed
// relative to the current text. Classic LCS over lines — screenplay files are
// small enough that the O(n·m) table is fine.

export type DiffOp = 'ctx' | 'add' | 'del'

export interface DiffLine {
  op: DiffOp
  text: string
}

export interface DiffSummary {
  added: number
  removed: number
}

/**
 * Diff `from` → `to` at line granularity. Returns a flat list of lines tagged
 * as context, addition (in `to`, not `from`), or deletion (in `from`, not `to`).
 */
export function diffLines(from: string, to: string): DiffLine[] {
  const a = from.split('\n')
  const b = to.split('\n')
  const n = a.length
  const m = b.length

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  )
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'ctx', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: 'del', text: a[i] })
      i++
    } else {
      out.push({ op: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ op: 'del', text: a[i++] })
  while (j < m) out.push({ op: 'add', text: b[j++] })
  return out
}

/** Count of added/removed lines between `from` and `to`. */
export function diffSummary(from: string, to: string): DiffSummary {
  if (from === to) return { added: 0, removed: 0 }
  let added = 0
  let removed = 0
  for (const line of diffLines(from, to)) {
    if (line.op === 'add') added++
    else if (line.op === 'del') removed++
  }
  return { added, removed }
}

// --- Side-by-side ---------------------------------------------------------
//
// The flat list above reads as a patch: one column, deletions and additions
// stacked. Reviewing what a draft changed is easier with the two texts abreast
// — old on the left, new on the right, a changed line sitting opposite the line
// it replaced — which is what every review tool shows and what this builds.

/** One side of a row: a line number and text, or blank where the row has none. */
export interface SideCell {
  num: number | null
  text: string | null
}

export type SideRowKind = 'ctx' | 'add' | 'del' | 'mod' | 'hunk'

export interface SideRow {
  kind: SideRowKind
  left: SideCell
  right: SideCell
  /** For `hunk`: the `@@ -a,b +c,d @@` header introducing the next run. */
  header?: string
}

const BLANK: SideCell = { num: null, text: null }

/**
 * Pair a flat diff into rows, numbering each side as it goes.
 *
 * Within a run of changes the k-th deletion is put opposite the k-th addition,
 * so a line that was edited reads as one row with before and after rather than
 * as two rows several apart. Runs of unequal length leave the shorter side
 * blank for the remainder.
 */
function pairRows(flat: DiffLine[]): SideRow[] {
  const rows: SideRow[] = []
  let leftNo = 0
  let rightNo = 0
  let i = 0

  while (i < flat.length) {
    if (flat[i].op === 'ctx') {
      leftNo++
      rightNo++
      const text = flat[i].text
      rows.push({
        kind: 'ctx',
        left: { num: leftNo, text },
        right: { num: rightNo, text },
      })
      i++
      continue
    }

    // The whole changed run, however its deletions and additions interleave.
    const dels: string[] = []
    const adds: string[] = []
    while (i < flat.length && flat[i].op !== 'ctx') {
      if (flat[i].op === 'del') dels.push(flat[i].text)
      else adds.push(flat[i].text)
      i++
    }

    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      const del = k < dels.length ? dels[k] : null
      const add = k < adds.length ? adds[k] : null
      if (del !== null) leftNo++
      if (add !== null) rightNo++
      rows.push({
        kind: del !== null && add !== null ? 'mod' : del !== null ? 'del' : 'add',
        left: del !== null ? { num: leftNo, text: del } : BLANK,
        right: add !== null ? { num: rightNo, text: add } : BLANK,
      })
    }
  }

  return rows
}

/** `@@ -a,b +c,d @@` for one run of rows, in the usual unified-diff form. */
function hunkHeader(rows: SideRow[]): string {
  const lefts = rows.map((r) => r.left.num).filter((n): n is number => n !== null)
  const rights = rows.map((r) => r.right.num).filter((n): n is number => n !== null)
  const part = (nums: number[], sign: string) =>
    `${sign}${nums[0] ?? 0},${nums.length}`
  return `@@ ${part(lefts, '-')} ${part(rights, '+')} @@`
}

/**
 * Build a side-by-side diff of `from` → `to`, showing each run of changes with
 * `context` unchanged lines around it and a hunk header above it. Stretches of
 * untouched text between runs are dropped entirely — a draft's changes are the
 * point, not the 90 pages that didn't move.
 */
export function sideBySide(from: string, to: string, context = 3): SideRow[] {
  const rows = pairRows(diffLines(from, to))

  const keep = new Array<boolean>(rows.length).fill(false)
  rows.forEach((row, i) => {
    if (row.kind === 'ctx') return
    const lo = Math.max(0, i - context)
    const hi = Math.min(rows.length - 1, i + context)
    for (let j = lo; j <= hi; j++) keep[j] = true
  })

  const out: SideRow[] = []
  let i = 0
  while (i < rows.length) {
    if (!keep[i]) {
      i++
      continue
    }
    let j = i
    while (j < rows.length && keep[j]) j++
    const run = rows.slice(i, j)
    out.push({ kind: 'hunk', left: BLANK, right: BLANK, header: hunkHeader(run) })
    out.push(...run)
    i = j
  }
  return out
}
