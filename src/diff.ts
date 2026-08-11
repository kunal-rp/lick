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
