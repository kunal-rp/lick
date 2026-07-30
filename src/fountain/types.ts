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
}

export interface Screenplay {
  elements: ScreenplayElement[]
}
