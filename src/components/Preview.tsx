import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parse, renderEmphasis } from '../fountain'
import { LINES_PER_PAGE } from '../pagination'
import './Preview.css'

interface PreviewProps {
  source: string
  /** Reports the source line index where each page break falls (in order). */
  onPageBreaks?: (lines: number[]) => void
}

// A renderable unit. Single elements and forced breaks map 1:1 to elements;
// a dual pair coalesces a left and right dialogue block into one two-column row
// so it measures and paginates as a single unit.
type Row =
  | { kind: 'single'; index: number; line: number }
  | { kind: 'dual'; left: number[]; right: number[]; line: number }
  | { kind: 'break'; line: number }

function buildRows(elements: ReturnType<typeof parse>['elements']): Row[] {
  const rows: Row[] = []
  let i = 0
  while (i < elements.length) {
    const el = elements[i]
    if (el.type === 'page_break') {
      rows.push({ kind: 'break', line: el.line })
      i++
    } else if (el.dual === 'left') {
      const left: number[] = []
      while (i < elements.length && elements[i].dual === 'left') left.push(i++)
      const right: number[] = []
      while (i < elements.length && elements[i].dual === 'right') right.push(i++)
      rows.push({ kind: 'dual', left, right, line: elements[left[0]].line })
    } else {
      rows.push({ kind: 'single', index: i, line: el.line })
      i++
    }
  }
  return rows
}

/**
 * Live-rendered, paginated screenplay preview.
 *
 * Elements are laid out at a fixed page width (so pagination is deterministic
 * regardless of pane size), measured off-screen, then distributed across page
 * sheets. Two rules drive page boundaries, matching both standards:
 *   - screenplay: a page holds at most LINES_PER_PAGE lines (auto break);
 *   - Fountain:   a `===` element forces an immediate break.
 * The source line of each break is reported so the editor can mark it.
 */
export function Preview({ source, onPageBreaks }: PreviewProps) {
  const screenplay = useMemo(() => parse(source), [source])
  const rows = useMemo(() => buildRows(screenplay.elements), [screenplay])
  const measureRef = useRef<HTMLDivElement>(null)
  const reportedBreaks = useRef<string>('')
  // Each entry is a page: the indices (into `rows`) that land on it.
  const [pages, setPages] = useState<number[][]>([])

  useLayoutEffect(() => {
    const container = measureRef.current
    if (container === null) return

    const style = getComputedStyle(container)
    const lineHeight =
      parseFloat(style.lineHeight) || parseFloat(style.fontSize) || 16
    const pageMax = LINES_PER_PAGE * lineHeight

    const kids = Array.from(container.children) as HTMLElement[]
    const groups: number[][] = []
    const breakLines: number[] = []
    let current: number[] = []
    let pageTop = 0
    let startNewPage = false

    rows.forEach((row, i) => {
      if (row.kind === 'break') {
        if (current.length > 0) groups.push(current)
        current = []
        startNewPage = true // next row opens a fresh page
        breakLines.push(row.line) // forced break — at the `===` line
        return
      }

      const kid = kids[i]
      if (kid === undefined) return

      if (startNewPage) {
        pageTop = kid.offsetTop
        startNewPage = false
      }

      const bottom = kid.offsetTop + kid.offsetHeight
      if (current.length > 0 && bottom - pageTop > pageMax) {
        groups.push(current)
        current = []
        pageTop = kid.offsetTop
        breakLines.push(row.line) // auto break — before this row
      }
      current.push(i)
    })
    if (current.length > 0) groups.push(current)

    setPages(groups)

    // A title page is its own sheet, so there's an implicit page break before
    // the first body row — mark it for the editor guide too.
    if (screenplay.titlePage !== null && rows.length > 0) {
      breakLines.unshift(rows[0].line)
    }

    const key = breakLines.join(',')
    if (onPageBreaks && key !== reportedBreaks.current) {
      reportedBreaks.current = key
      onPageBreaks(breakLines)
    }
  }, [rows, onPageBreaks])

  const isEmpty = screenplay.elements.length === 0

  const renderElement = (index: number) => {
    const el = screenplay.elements[index]
    // `pages`/`rows` are computed in a layout effect, so on the render right
    // after an edit that removed elements they can hold now-out-of-range
    // indices. Skip them; the effect re-paginates before paint.
    if (el === undefined) return null
    return (
      <p key={index} data-type={el.type} className={`el el--${el.type}`}>
        {renderEmphasis(el.text)}
      </p>
    )
  }

  const renderRow = (rowIndex: number) => {
    const row = rows[rowIndex]
    if (row === undefined || row.kind === 'break') return null
    if (row.kind === 'dual') {
      return (
        <div key={`r${rowIndex}`} className="el el--dual">
          <div className="el--dual-col">{row.left.map(renderElement)}</div>
          <div className="el--dual-col">{row.right.map(renderElement)}</div>
        </div>
      )
    }
    return renderElement(row.index)
  }

  // Measurer renders one child per row, in order, so kids[i] === rows[i].
  const measureRow = (row: Row, i: number) => {
    if (row.kind === 'break') {
      return <div key={i} data-type="page_break" className="el--page_break" />
    }
    if (row.kind === 'dual') {
      return (
        <div key={i} className="el el--dual">
          <div className="el--dual-col">{row.left.map(renderElement)}</div>
          <div className="el--dual-col">{row.right.map(renderElement)}</div>
        </div>
      )
    }
    return renderElement(row.index)
  }

  // Title, Credit, Author(s) and Source are centered; everything else
  // (Contact, Draft date, …) goes lower-left. (https://fountain.io/syntax)
  const CENTERED_KEYS = ['title', 'credit', 'author', 'authors', 'source']
  const renderTitlePage = () => {
    const tp = screenplay.titlePage
    if (tp === null) return null
    const renderField = (f: (typeof tp)[number], i: number) => (
      <div className="title__field" key={i}>
        {f.values.map((v, vi) => (
          <div key={vi}>{renderEmphasis(v)}</div>
        ))}
      </div>
    )
    const centered = tp.filter((f) => CENTERED_KEYS.includes(f.key.toLowerCase()))
    const lower = tp.filter((f) => !CENTERED_KEYS.includes(f.key.toLowerCase()))
    return (
      <div className="preview__page preview__title">
        <div className="title__center">{centered.map(renderField)}</div>
        <div className="title__lower">{lower.map(renderField)}</div>
      </div>
    )
  }

  return (
    <div className="preview">
      <div className="preview__scroll">
        {/* Off-screen single-column layout, used only to measure heights. */}
        <div className="preview__measure" ref={measureRef} aria-hidden="true">
          {rows.map(measureRow)}
        </div>

        {renderTitlePage()}

        {isEmpty
          ? screenplay.titlePage === null && (
              <div className="preview__page">
                <p className="preview__empty">Nothing to preview yet.</p>
              </div>
            )
          : pages.map((group, p) => (
              <div className="preview__page" key={p}>
                {p > 0 && <span className="preview__page-number">{p + 1}.</span>}
                {group.map(renderRow)}
              </div>
            ))}
      </div>
    </div>
  )
}
