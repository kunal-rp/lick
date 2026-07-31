import { parse } from './parse'
import type { ScreenplayElement } from './types'

// Script analysis for the Characters & Locations panel. Walks the parsed
// elements and rolls up every character cue and scene heading into a list of
// entities, each carrying the individual references (scene, source line, and a
// short snippet) so the panel can show where in the script they occur.

export interface Reference {
  /** 1-based scene number this reference falls in (0 = before the first scene). */
  scene: number
  /** Full scene heading providing context, or a placeholder before scene 1. */
  heading: string
  /** 0-based source line of the referenced element. */
  line: number
  /** Contextual snippet: a character's line, or the location's full heading. */
  snippet: string
}

export interface CharacterInfo {
  name: string
  /** Number of dialogue cues spoken. */
  cues: number
  /** Number of distinct scenes the character appears in. */
  scenes: number
  references: Reference[]
}

export interface LocationInfo {
  name: string
  /** Number of scenes set at this location. */
  scenes: number
  references: Reference[]
}

export interface ScriptInsights {
  characters: CharacterInfo[]
  locations: LocationInfo[]
}

const BEFORE_FIRST_SCENE = '(front matter)'

// Leading INT/EXT/EST setup and the trailing time-of-day, so scene headings
// that share a place ("INT. LOFT - DAY" / "EXT. LOFT - NIGHT") group together.
const SCENE_PREFIX = /^(INT\.?\/EXT\.?|INT\/EXT|I\/E|INT\.?|EXT\.?|EST\.?)\s*/i
const TIME_SUFFIX = /\s+[-–—]\s+[^-–—]*$/

/** A cue's character name, without any `(V.O.)`-style extension. */
function characterName(text: string): string {
  return text.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/** A scene heading reduced to its place name (no INT/EXT, no time of day). */
function locationName(heading: string): string {
  const place = heading.replace(SCENE_PREFIX, '').replace(TIME_SUFFIX, '').trim()
  return place || heading
}

/** The first dialogue line spoken after the cue at `index`, as a snippet. */
function dialogueAfter(elements: ScreenplayElement[], index: number): string {
  for (let j = index + 1; j < elements.length; j++) {
    const el = elements[j]
    if (el.type === 'dialogue') return el.text.replace(/\s+/g, ' ').trim()
    if (el.type === 'character' || el.type === 'scene_heading') break
  }
  return ''
}

export function buildInsights(elements: ScreenplayElement[]): ScriptInsights {
  const characters = new Map<string, CharacterInfo>()
  const locations = new Map<string, LocationInfo>()
  const characterScenes = new Map<string, Set<number>>()

  let sceneNumber = 0
  let heading = BEFORE_FIRST_SCENE

  elements.forEach((el, i) => {
    if (el.type === 'scene_heading') {
      sceneNumber++
      heading = el.text
      const name = locationName(el.text)
      let info = locations.get(name)
      if (info === undefined) {
        info = { name, scenes: 0, references: [] }
        locations.set(name, info)
      }
      info.scenes++
      info.references.push({
        scene: sceneNumber,
        heading: el.text,
        line: el.line,
        snippet: el.text,
      })
    } else if (el.type === 'character') {
      const name = characterName(el.text)
      if (name === '') return
      let info = characters.get(name)
      if (info === undefined) {
        info = { name, cues: 0, scenes: 0, references: [] }
        characters.set(name, info)
      }
      info.cues++
      info.references.push({
        scene: sceneNumber,
        heading,
        line: el.line,
        snippet: dialogueAfter(elements, i),
      })
      let seen = characterScenes.get(name)
      if (seen === undefined) {
        seen = new Set()
        characterScenes.set(name, seen)
      }
      seen.add(sceneNumber)
    }
  })

  for (const [name, info] of characters) {
    info.scenes = characterScenes.get(name)?.size ?? 0
  }

  const byActivity = (a: CharacterInfo, b: CharacterInfo) =>
    b.cues - a.cues || a.name.localeCompare(b.name)
  const byScenes = (a: LocationInfo, b: LocationInfo) =>
    b.scenes - a.scenes || a.name.localeCompare(b.name)

  return {
    characters: [...characters.values()].sort(byActivity),
    locations: [...locations.values()].sort(byScenes),
  }
}

/** Parse Fountain source and roll it up into character/location insights. */
export function analyzeScript(source: string): ScriptInsights {
  return buildInsights(parse(source).elements)
}
