import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parse, renderEmphasis } from '../fountain'
import { LINES_PER_PAGE } from '../pagination'
import './Preview.css'

interface PreviewProps {
  source: string
  /** Reports the source line index where each page break falls (in order). */
  onPageBreaks?: (lines: number[]) => void
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
  const measureRef = useRef<HTMLDivElement>(null)
  const reportedBreaks = useRef<string>('')
  // Each entry is a page: the indices of the elements that land on it.
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

    kids.forEach((kid, i) => {
      const element = screenplay.elements[i]

      if (element.type === 'page_break') {
        if (current.length > 0) groups.push(current)
        current = []
        startNewPage = true // next element opens a fresh page
        breakLines.push(element.line) // forced break — at the `===` line
        return
      }

      if (startNewPage) {
        pageTop = kid.offsetTop
        startNewPage = false
      }

      const bottom = kid.offsetTop + kid.offsetHeight
      if (current.length > 0 && bottom - pageTop > pageMax) {
        groups.push(current)
        current = []
        pageTop = kid.offsetTop
        breakLines.push(element.line) // auto break — before this element
      }
      current.push(i)
    })
    if (current.length > 0) groups.push(current)

    setPages(groups)

    const key = breakLines.join(',')
    if (onPageBreaks && key !== reportedBreaks.current) {
      reportedBreaks.current = key
      onPageBreaks(breakLines)
    }
  }, [screenplay, onPageBreaks])

  const isEmpty = screenplay.elements.length === 0

  const renderElement = (index: number) => {
    const el = screenplay.elements[index]
    return (
      <p key={index} data-type={el.type} className={`el el--${el.type}`}>
        {renderEmphasis(el.text)}
      </p>
    )
  }

  return (
    <div className="preview">
      <div className="preview__scroll">
        {/* Off-screen single-column layout, used only to measure heights. */}
        <div className="preview__measure" ref={measureRef} aria-hidden="true">
          {screenplay.elements.map((el, i) =>
            el.type === 'page_break' ? (
              <div key={i} data-type="page_break" className="el--page_break" />
            ) : (
              renderElement(i)
            ),
          )}
        </div>

        {isEmpty ? (
          <div className="preview__page">
            <p className="preview__empty">Nothing to preview yet.</p>
          </div>
        ) : (
          pages.map((group, p) => (
            <div className="preview__page" key={p}>
              {p > 0 && <span className="preview__page-number">{p + 1}.</span>}
              {group.map(renderElement)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
