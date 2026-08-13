// Structured representation of a parsed Fountain screenplay.
//
// This is intentionally minimal for now. As the parser grows it will emit a
// richer set of element types (dual dialogue, notes, sections, synopses,
// title-page metadata, etc.). Downstream consumers (the preview renderer)
// should switch on `ElementType` and treat unknown types gracefully.

export type ElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'centered'
  | 'lyrics'
  | 'page_break'

export interface ScreenplayElement {
  type: ElementType
  text: string
  /** 0-based index of the source line where this element begins. */
  line: number
  /**
   * Dual-dialogue side, if this element belongs to a dual-dialogue pair.
   * The block whose cue carries a trailing `^` is 'right'; the immediately
   * preceding dialogue block is 'left'. Rendered as two side-by-side columns.
   */
  dual?: 'left' | 'right'
  /**
   * True on a `character` cue that continues the same character's speech within
   * a scene — i.e. the previous speaker was this same character, interrupted
   * only by action. Renderers append a `(CONT'D)` mark; the cue `text` itself
   * stays clean so name-based analysis (insights) is unaffected.
   */
  cont?: boolean
}

/** One title-page entry, e.g. `Author: Stu Maschwitz` or a multi-value key. */
export interface TitlePageField {
  key: string
  values: string[]
}

export interface Screenplay {
  /** Parsed title page fields in document order, or null if none. */
  titlePage: TitlePageField[] | null
  elements: ScreenplayElement[]
}
