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
  | 'page_break'

export interface ScreenplayElement {
  type: ElementType
  text: string
}

export interface Screenplay {
  elements: ScreenplayElement[]
}
