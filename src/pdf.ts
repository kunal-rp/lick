import type { PDFFont, PDFPage } from 'pdf-lib'
import { parse } from './fountain'
import type { ScreenplayElement } from './fountain'
import { LINES_PER_PAGE } from './pagination'

// Renders a Fountain screenplay to a PDF that mirrors the on-screen preview:
// US Letter, 12pt Courier at 6 lines/inch, standard margins and element
// indents, with the same block-level pagination. pdf-lib is dynamically
// imported so it only loads when the user actually exports.

const IN = 72 // PDF points per inch
const PAGE_W = 8.5 * IN
const PAGE_H = 11 * IN
const LEFT = 1.5 * IN // content (text-area) left edge
const TOP = 1 * IN
const FONT_SIZE = 12
const LINE = 12 // 6 lines/inch
const CONTENT_W = 6 * IN // 60 characters
const CONTENT_RIGHT = LEFT + CONTENT_W
const CHAR_W = FONT_SIZE * 0.6 // Courier advance width (0.1in)

type Align = 'left' | 'right' | 'center'

interface Layout {
  align: Align
  indent: number // left offset from the content edge, in points
  width: number // wrap width, in characters
  italic?: boolean
}

const charsFor = (pt: number) => Math.max(1, Math.floor(pt / CHAR_W))

function layoutFor(type: ScreenplayElement['type']): Layout {
  switch (type) {
    case 'character':
      return { align: 'left', indent: 2.2 * IN, width: charsFor(CONTENT_W - 2.2 * IN) }
    case 'parenthetical':
      return { align: 'left', indent: 1.6 * IN, width: charsFor(CONTENT_W - 1.6 * IN) }
    case 'dialogue':
      return { align: 'left', indent: 1 * IN, width: charsFor(CONTENT_W - 2.5 * IN) }
    case 'lyrics':
      return { align: 'left', indent: 1 * IN, width: charsFor(CONTENT_W - 1 * IN), italic: true }
    case 'transition':
      return { align: 'right', indent: 0, width: 60 }
    case 'centered':
      return { align: 'center', indent: 0, width: 60 }
    case 'scene_heading':
    case 'action':
    default:
      return { align: 'left', indent: 0, width: 60 }
  }
}

// Elements that start a new block get one blank line of separation before them
// (matching the preview's top margin); dialogue/parentheticals do not.
const BLOCK_STARTERS = new Set<ScreenplayElement['type']>([
  'scene_heading',
  'action',
  'transition',
  'centered',
  'lyrics',
  'character',
])

// Drop Fountain emphasis markers (the PDF renders plain Courier).
function stripEmphasis(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
}

// The standard Courier font is WinAnsi-encoded; map common typographic
// characters and drop anything outside Latin-1 so drawText can't throw.
function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\t\n\r\x20-\xff]/g, '?')
}

function clean(text: string): string {
  return toWinAnsi(stripEmphasis(text))
}

// Word-wrap monospaced text to a character width, hard-breaking long words.
function wrap(text: string, maxChars: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let current = ''
    const pushLong = (word: string) => {
      let rest = word
      while (rest.length > maxChars) {
        out.push(rest.slice(0, maxChars))
        rest = rest.slice(maxChars)
      }
      current = rest
    }
    for (const word of words) {
      if (current === '') {
        if (word.length <= maxChars) current = word
        else pushLong(word)
      } else if ((current + ' ' + word).length <= maxChars) {
        current += ' ' + word
      } else {
        out.push(current)
        if (word.length <= maxChars) current = word
        else pushLong(word)
      }
    }
    if (current !== '') out.push(current)
  }
  return out
}

export async function buildScreenplayPdf(source: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const screenplay = parse(source)
  const doc = await PDFDocument.create()
  const courier = await doc.embedFont(StandardFonts.Courier)
  const courierOblique = await doc.embedFont(StandardFonts.CourierOblique)
  const black = rgb(0, 0, 0)

  let page: PDFPage | null = null
  let y = 0
  let linesUsed = 0
  let bodyPageIndex = -1
  let forceNewPage = false

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - TOP - FONT_SIZE
    linesUsed = 0
    bodyPageIndex += 1
    if (bodyPageIndex >= 1) {
      const label = `${bodyPageIndex + 1}.`
      page.drawText(label, {
        x: CONTENT_RIGHT - label.length * CHAR_W,
        y: PAGE_H - 0.5 * IN,
        size: FONT_SIZE,
        font: courier,
        color: black,
      })
    }
  }

  const drawText = (text: string, align: Align, indent: number, font: PDFFont) => {
    if (page === null || linesUsed >= LINES_PER_PAGE) newPage()
    const sheet = page as PDFPage
    const w = text.length * CHAR_W
    let x = LEFT + indent
    if (align === 'right') x = CONTENT_RIGHT - w
    else if (align === 'center') x = LEFT + (CONTENT_W - w) / 2
    if (text !== '') sheet.drawText(text, { x, y, size: FONT_SIZE, font, color: black })
    y -= LINE
    linesUsed += 1
  }

  const blankLine = () => {
    if (linesUsed > 0 && linesUsed < LINES_PER_PAGE) {
      y -= LINE
      linesUsed += 1
    }
  }

  const emit = (lines: string[], layout: Layout, marginBefore: boolean) => {
    const font = layout.italic === true ? courierOblique : courier
    if (forceNewPage) {
      newPage()
      forceNewPage = false
    } else if (page === null) {
      newPage()
    } else {
      const need = (marginBefore ? 1 : 0) + lines.length
      // Keep a block together: if it won't fit, move it to the next page.
      if (linesUsed > 0 && linesUsed + need > LINES_PER_PAGE) newPage()
      else if (marginBefore) blankLine()
    }
    for (const line of lines) drawText(line, layout.align, layout.indent, font)
  }

  // Title page: centered block (title/credit/author/source), other fields
  // lower-left. It's an unnumbered sheet of its own.
  const tp = screenplay.titlePage
  if (tp !== null) {
    page = doc.addPage([PAGE_W, PAGE_H])
    const centeredKeys = ['title', 'credit', 'author', 'authors', 'source']
    const centered = tp.filter((f) => centeredKeys.includes(f.key.toLowerCase()))
    const lower = tp.filter((f) => !centeredKeys.includes(f.key.toLowerCase()))

    const centeredLines = centered.flatMap((f) => f.values).map(clean)
    let cy = PAGE_H / 2 + (centeredLines.length / 2) * LINE
    for (const line of centeredLines) {
      const w = line.length * CHAR_W
      page.drawText(line, { x: (PAGE_W - w) / 2, y: cy, size: FONT_SIZE, font: courier, color: black })
      cy -= LINE
    }

    const lowerLines = lower.flatMap((f) => f.values).map(clean)
    let ly = TOP + lowerLines.length * LINE
    for (const line of lowerLines) {
      page.drawText(line, { x: LEFT, y: ly, size: FONT_SIZE, font: courier, color: black })
      ly -= LINE
    }

    // The body always starts on its own sheet after the title page.
    forceNewPage = true
  }

  for (const el of screenplay.elements) {
    if (el.type === 'page_break') {
      forceNewPage = true
      continue
    }
    const layout = layoutFor(el.type)
    const lines = wrap(clean(el.text), layout.width)
    emit(lines, layout, BLOCK_STARTERS.has(el.type))
  }

  // No content at all: still produce a valid one-page document.
  if (page === null) doc.addPage([PAGE_W, PAGE_H])

  return doc.save()
}
