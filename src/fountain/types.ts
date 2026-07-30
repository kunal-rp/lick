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
}

export interface Screenplay {
  elements: ScreenplayElement[]
}
