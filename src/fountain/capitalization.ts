import { parse } from './parse'
import type { ScreenplayElement } from './types'

// Screenwriting capitalization checker.
//
// Standard screenplay format capitalizes certain elements and leaves others in
// sentence case (see
// https://www.arcstudiopro.com/blog/how-to-correctly-format-your-screenplay-using-capitals-italics-underlines).
// This module scans Fountain source and reports the specific edits that would
// bring it into line, each anchored to an absolute character range so the same
// suggestion drives both the in-editor highlight and the review dialog.
//
// Rules implemented (all conservative — a suggestion is only emitted when the
// element's role is unambiguous from the parse):
//   • Scene headings     → ALL CAPS               (INT. house → INT. HOUSE)
//   • Transitions        → ALL CAPS               (cut to: → CUT TO:)
//   • Character cues      → ALL CAPS incl. the      (bob (v.o.) → BOB (V.O.))
//     name and any (v.o.)/(cont'd) extension
//   • First appearance of  → the name in CAPS        (…meets sarah. → …meets SARAH.)
//     a character in action
//   • Accidental all-caps  → sentence case           (the one un-capitalization
//     action prose                                     the checker suggests)

export type CapKind =
  | 'scene_heading'
  | 'transition'
  | 'character'
  | 'character_intro'
  | 'action_caps'

export interface CapSuggestion {
  /** Stable identity within a single detection pass (`kind:start:end`). */
  id: string
  kind: CapKind
  /** Whether the fix adds capitals ('up') or removes them ('down'). */
  direction: 'up' | 'down'
  /** Absolute character offset of the change start within the source. */
  start: number
  /** Absolute character offset of the change end (exclusive). */
  end: number
  /** The current source text of `[start, end)`. */
  from: string
  /** The proposed replacement text. */
  to: string
  /** 0-based source line where the change begins (for display). */
  line: number
  /** Short human label for the rule (e.g. "Scene heading"). */
  label: string
}

const LABELS: Record<CapKind, string> = {
  scene_heading: 'Scene heading',
  transition: 'Transition',
  character: 'Character cue',
  character_intro: 'Character introduction',
  action_caps: 'Action in all caps',
}

// Transition idioms. When lower-cased, the parser (which keys automatic
// transitions off a trailing uppercase "TO:") reads these as action, so they're
// matched here directly. Only accepted as a standalone paragraph — never mid-
// action — which, together with the fixed idiom list, keeps false positives out.
const NAMED_TRANSITIONS =
  /^(cut to:|dissolve to:|smash cut to:|match cut to:|jump cut to:|time cut to:|cut to black\.|dissolve:|fade in:|fade out\.|fade to black\.|smash cut\.|iris in:|iris out\.|wipe to:|end credits|main title|the end)$/i

// Character extensions that mark a cue regardless of the name's case (so
// `bob (v.o.)` is recognisable as a cue even though the parser can't classify a
// lower-case name). Anchored to the end of the (trimmed, caret-stripped) line.
const CUE_EXTENSION =
  /\(\s*(v\.?\s*o\.?|o\.?\s*s\.?|o\.?\s*c\.?|cont'?d|subtitles?|filtered|pre-?lap|on (?:the )?phone)\s*\)$/i

// Character names that are also common English words; skipped by the
// introduction detector so a name like "WILL" never mis-capitalises the verb
// "will" in action. The explicit element detectors are unaffected.
const AMBIGUOUS_NAMES = new Set([
  'WILL',
  'MAY',
  'MARK',
  'ART',
  'GUY',
  'RAY',
  'HOPE',
  'GRACE',
  'DAWN',
  'BILL',
  'ROSE',
  'DICK',
])

/** A character cue reduced to its name, dropping any `(V.O.)`-style extension. */
function cueName(text: string): string {
  return text.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/** Start offset of each 0-based line within `source`. */
function lineStarts(lines: string[]): number[] {
  const starts: number[] = []
  let acc = 0
  for (const line of lines) {
    starts.push(acc)
    acc += line.length + 1
  }
  return starts
}

/**
 * Lower-case `text`, then re-capitalise the first letter of each sentence and
 * the standalone pronoun "I". Used to undo accidental all-caps action; proper
 * nouns aren't recovered, which is why the change is always shown for review.
 */
function toSentenceCase(text: string): string {
  const lower = text.toLowerCase()
  let out = ''
  let capNext = true
  for (const ch of lower) {
    if (capNext && /[a-z]/.test(ch)) {
      out += ch.toUpperCase()
      capNext = false
    } else {
      out += ch
      if (/[.!?]/.test(ch)) capNext = true
    }
  }
  return out.replace(/\bi\b/g, 'I').replace(/\bi'/g, "I'")
}

/** Build an uppercase-the-whole-line suggestion, or null if already uppercase. */
function upperLine(
  kind: CapKind,
  raw: string,
  lineIndex: number,
  offset: number,
): CapSuggestion | null {
  const to = raw.toUpperCase()
  if (to === raw) return null
  const start = offset + (raw.length - raw.trimStart().length)
  const end = offset + raw.trimEnd().length
  const from = raw.slice(start - offset, end - offset)
  const toTrimmed = from.toUpperCase()
  if (toTrimmed === from) return null
  return {
    id: `${kind}:${start}:${end}`,
    kind,
    direction: 'up',
    start,
    end,
    from,
    to: toTrimmed,
    line: lineIndex,
    label: LABELS[kind],
  }
}

/** True when the words with letters in `text` are all upper-case. */
function isAllCaps(text: string): boolean {
  return /[A-Z]/.test(text) && !/[a-z]/.test(text)
}

function wordCount(text: string): number {
  return (text.match(/[A-Za-z]+/g) ?? []).length
}

/**
 * Detect the source lines an action element spans. The parser groups a block by
 * blank-line boundaries and emits action as a single element, so an action
 * element's block runs from its start line up to (but not including) the next
 * element's start line. Trailing blank lines in that range are harmless.
 */
function actionBlockEnd(
  elements: ScreenplayElement[],
  index: number,
  lineCount: number,
): number {
  const next = elements[index + 1]
  return next !== undefined ? next.line : lineCount
}

/**
 * Scan Fountain `source` for capitalization fixes. Returns suggestions ordered
 * by their position in the source, each with an absolute `[start, end)` range.
 */
export function detectCapitalization(source: string): CapSuggestion[] {
  const lines = source.split('\n')
  const starts = lineStarts(lines)
  const { elements } = parse(source)
  const out: CapSuggestion[] = []

  // Whole-line element detectors: scene headings, transitions, character cues.
  for (const el of elements) {
    const raw = lines[el.line]
    if (raw === undefined) continue
    if (el.type === 'scene_heading') {
      const s = upperLine('scene_heading', raw, el.line, starts[el.line])
      if (s !== null) out.push(s)
    } else if (el.type === 'transition') {
      const s = upperLine('transition', raw, el.line, starts[el.line])
      if (s !== null) out.push(s)
    } else if (el.type === 'character') {
      const s = upperLine('character', raw, el.line, starts[el.line])
      if (s !== null) out.push(s)
    }
  }

  // Names already used as a proper (upper-case) cue somewhere — a strong signal
  // that a lower-case line of the same name is really a mis-capitalized cue.
  const names = new Set<string>()
  for (const el of elements) {
    if (el.type !== 'character') continue
    const name = cueName(el.text).toUpperCase()
    if (name.length >= 2 && /[A-Z]/.test(name)) names.add(name)
  }

  const flagged = new Set(out.map((s) => s.line))

  // Standalone transition idioms the parser read as action when lower-cased.
  const isBlank = (i: number) => i < 0 || i >= lines.length || lines[i].trim() === ''
  lines.forEach((raw, i) => {
    if (flagged.has(i)) return
    const trimmed = raw.trim()
    if (
      NAMED_TRANSITIONS.test(trimmed) &&
      trimmed !== trimmed.toUpperCase() &&
      isBlank(i - 1) &&
      isBlank(i + 1)
    ) {
      const s = upperLine('transition', raw, i, starts[i])
      if (s !== null) {
        out.push(s)
        flagged.add(i)
      }
    }
  })

  // Lower-case character cues the parser couldn't classify: the first line of an
  // action block that either ends with a cue extension (`(v.o.)`) or matches a
  // name already used as a proper cue, and is followed by dialogue. Uppercase
  // just the cue line. Names handled here won't be re-flagged as introductions.
  const cueNames = new Set<string>()
  elements.forEach((el) => {
    if (el.type !== 'action' || flagged.has(el.line)) return
    const raw = lines[el.line]
    if (raw === undefined) return
    const following = lines[el.line + 1]
    if (following === undefined || following.trim() === '') return // no dialogue under it
    const trimmed = raw.trim().replace(/\s*\^$/, '')
    if (trimmed === trimmed.toUpperCase()) return // already all-caps
    const nameCore = cueName(trimmed).toUpperCase()
    const looksLikeCue =
      CUE_EXTENSION.test(trimmed) ||
      (names.has(nameCore) && !AMBIGUOUS_NAMES.has(nameCore))
    if (!looksLikeCue) return
    const s = upperLine('character', raw, el.line, starts[el.line])
    if (s !== null) {
      out.push(s)
      flagged.add(el.line)
      if (nameCore.length > 0) cueNames.add(nameCore)
    }
  })

  // Character introductions: the first appearance of each character's name in
  // action, capitalised. Skip a name whose earliest action mention is already
  // all-caps (already introduced), names handled above as a cue, and names that
  // collide with common words.
  for (const n of AMBIGUOUS_NAMES) names.delete(n)
  const introduced = new Set<string>(cueNames)
  elements.forEach((el, index) => {
    if (el.type !== 'action') return
    const blockEnd = actionBlockEnd(elements, index, lines.length)
    const blockStart = starts[el.line]
    const blockText = source.slice(blockStart, starts[blockEnd] ?? source.length)
    for (const name of names) {
      if (introduced.has(name)) continue
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      const m = re.exec(blockText)
      if (m === null) continue
      introduced.add(name) // first block that mentions the name settles it
      if (m[0] === name) continue // already all-caps here — nothing to do
      const start = blockStart + m.index
      const end = start + m[0].length
      out.push({
        id: `character_intro:${start}:${end}`,
        kind: 'character_intro',
        direction: 'up',
        start,
        end,
        from: m[0],
        to: name,
        line: el.line,
        label: LABELS.character_intro,
      })
    }
  })

  // Accidental all-caps action: a multi-sentence action block typed entirely in
  // upper case (a stuck caps-lock, not deliberate emphasis). Emphasis in caps is
  // short — a word, a sound — so a long, sentence-punctuated block is the signal.
  elements.forEach((el, index) => {
    if (el.type !== 'action') return
    const blockEnd = actionBlockEnd(elements, index, lines.length)
    // The block's own (non-blank) source, trimmed of the trailing blank lines
    // the range picks up before the next element.
    const rawBlock = source
      .slice(starts[el.line], starts[blockEnd] ?? source.length)
      .replace(/\n+$/, '')
    const forced = rawBlock.startsWith('!')
    const body = forced ? rawBlock.slice(1) : rawBlock
    if (!isAllCaps(body) || wordCount(body) < 6) return
    if (!/[.!?]["')\]]?\s*$/.test(body)) return
    const to = (forced ? '!' : '') + toSentenceCase(body)
    if (to === rawBlock) return
    const start = starts[el.line]
    const end = start + rawBlock.length
    out.push({
      id: `action_caps:${start}:${end}`,
      kind: 'action_caps',
      direction: 'down',
      start,
      end,
      from: rawBlock,
      to,
      line: el.line,
      label: LABELS.action_caps,
    })
  })

  // Order by position and drop any suggestion that overlaps one already kept, so
  // the detectors can never produce two conflicting edits for the same text.
  out.sort((a, b) => a.start - b.start || a.end - b.end)
  const deduped: CapSuggestion[] = []
  let reach = -1
  for (const s of out) {
    if (s.start < reach) continue
    deduped.push(s)
    reach = s.end
  }
  return deduped
}

/**
 * Apply a set of suggestions to `source`, splicing each `to` in for its range.
 * Suggestions are applied right-to-left so earlier offsets stay valid; any that
 * overlap an already-applied range are skipped defensively.
 */
export function applyCapSuggestions(
  source: string,
  suggestions: CapSuggestion[],
): string {
  const ordered = [...suggestions].sort((a, b) => b.start - a.start)
  let result = source
  let lastStart = Infinity
  for (const s of ordered) {
    if (s.end > lastStart) continue // overlaps a later (already applied) edit
    result = result.slice(0, s.start) + s.to + result.slice(s.end)
    lastStart = s.start
  }
  return result
}
