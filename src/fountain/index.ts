// The Fountain syntax specification this module targets.
// Fountain 1.1 — released 2014-03-14. Source: https://fountain.io/syntax
export const FOUNTAIN_SPEC_VERSION = '1.1'

export { parse } from './parse'
export { renderEmphasis } from './emphasis'
export { analyzeScript, buildInsights } from './insights'
export type {
  Screenplay,
  ScreenplayElement,
  ElementType,
  TitlePageField,
} from './types'
export type {
  ScriptInsights,
  CharacterInfo,
  LocationInfo,
  Reference,
} from './insights'
