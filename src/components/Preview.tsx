import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { parse, renderEmphasis } from '../fountain'
import { LINES_PER_PAGE } from '../pagination'
import { CommentsRail } from './CommentsRail'
import type { Comment, CommentAnchor } from '../comments'
import './Preview.css'

interface PreviewProps {
  source: string
  /** Reports the source line index where each page break falls (in order). */
  onPageBreaks?: (lines: number[]) => void
  /** Jump the editor to a source line when preview text is selected. */
  onJump?: (line: number) => void
  /** Comments anchored to the version currently shown. */
  comments?: Comment[]
  /** The version id to anchor new comments to (null hides commenting). */
  versionId?: string | null
  /** Display name for comments with no explicit author. */
  authorName?: string
  onAddComment?: (anchor: CommentAnchor, text: string) => void
  onEditComment?: (id: string, text: string) => void
  onDeleteComment?: (id: string) => void
}

// Character offset of (node, nodeOffset) within root's flattened text, or the
// total length if the node isn't inside root.
function offsetWithin(root: HTMLElement, node: Node, nodeOffset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let acc = 0
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    if (n === node) return acc + nodeOffset
    acc += n.nodeValue?.length ?? 0
  }
  return acc
}

// {text node, local offset} for an absolute offset within root's text.
function pointAt(
  root: HTMLElement,
  target: number,
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let acc = 0
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    const len = n.nodeValue?.length ?? 0
    if (target <= acc + len) return { node: n, offset: target - acc }
    acc += len
  }
  return null
}

// A DOM Range spanning [start, end] within an element's text, or null.
function rangeWithinElement(
  el: HTMLElement,
  start: number,
  end: number,
): Range | null {
  const a = pointAt(el, start)
  const b = pointAt(el, end)
  if (a === null || b === null) return null
  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  return range
}

// Preview magnification bounds, as percentages.
const ZOOM_MIN = 10
const ZOOM_MAX = 200

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
export function Preview({
  source,
  onPageBreaks,
  onJump,
  comments = [],
  versionId = null,
  authorName = 'You',
  onAddComment,
  onEditComment,
  onDeleteComment,
}: PreviewProps) {
  const screenplay = useMemo(() => parse(source), [source])
  const rows = useMemo(() => buildRows(screenplay.elements), [screenplay])
  const measureRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const reportedBreaks = useRef<string>('')
  // Each entry is a page: the indices (into `rows`) that land on it.
  const [pages, setPages] = useState<number[][]>([])

  // A selection awaiting a comment: its anchor + vertical position for the
  // floating "+ Comment" button. Cleared once composing or dismissed.
  const [pending, setPending] = useState<{
    anchor: CommentAnchor
    top: number
  } | null>(null)
  // The anchor currently being composed (compose box open in the rail).
  const [composeAnchor, setComposeAnchor] = useState<CommentAnchor | null>(null)

  const commentingEnabled = versionId !== null && onAddComment !== undefined

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

  // Preview magnification, as a percentage (100 = actual size).
  const [zoom, setZoom] = useState(100)

  // Trackpad pinch and ctrl+wheel arrive as wheel events with `ctrlKey` set;
  // consume them to drive zoom (and stop the browser's own page zoom). The
  // listener is attached natively so it can be non-passive and preventDefault.
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom((z) =>
        Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * Math.exp(-e.deltaY * 0.005))),
      )
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Highlight commented text (a light accent, distinct from the selection
  // highlight) by registering each comment's range as a CSS custom highlight.
  useEffect(() => {
    const HighlightCtor = (window as unknown as { Highlight?: typeof Highlight })
      .Highlight
    const registry = (
      CSS as unknown as { highlights?: Map<string, Highlight> }
    ).highlights
    if (HighlightCtor === undefined || registry === undefined) return
    const container = pagesRef.current
    const ranges: Range[] = []
    if (container !== null) {
      for (const c of comments) {
        const el = container.querySelector(`.el[data-line="${c.line}"]`)
        if (!(el instanceof HTMLElement)) continue
        const range = rangeWithinElement(el, c.start, c.end)
        if (range !== null) ranges.push(range)
      }
    }
    if (ranges.length > 0) registry.set('comments', new HighlightCtor(...ranges))
    else registry.delete('comments')
  }, [comments, pages, source])

  // The standard "insert comment" hotkey (⌘/Ctrl+Alt+M) opens the compose box
  // for the pending selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.altKey &&
        e.key.toLowerCase() === 'm' &&
        pending !== null
      ) {
        e.preventDefault()
        setComposeAnchor(pending.anchor)
        setPending(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  // Switching versions clears any in-progress comment affordances.
  useEffect(() => {
    setPending(null)
    setComposeAnchor(null)
  }, [versionId])

  // Scroll a comment's anchored text into view.
  const focusComment = (c: Comment) => {
    const el = pagesRef.current?.querySelector(`.el[data-line="${c.line}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }

  const isEmpty = screenplay.elements.length === 0

  const renderElement = (index: number) => {
    const el = screenplay.elements[index]
    // `pages`/`rows` are computed in a layout effect, so on the render right
    // after an edit that removed elements they can hold now-out-of-range
    // indices. Skip them; the effect re-paginates before paint.
    if (el === undefined) return null
    return (
      <p
        key={index}
        data-type={el.type}
        data-line={el.line}
        className={`el el--${el.type}`}
      >
        {renderEmphasis(el.text)}
      </p>
    )
  }

  // Selecting (highlighting) text in the preview does two things: it jumps the
  // editor to that line, and it primes a comment anchored to the selection
  // (surfacing the floating "+ Comment" button). Because the editor takes focus
  // and the native selection as it jumps, the preview selection is re-registered
  // as a CSS custom highlight so it stays visibly highlighted.
  const handleSelectionJump = () => {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) {
      return
    }
    const node = selection.anchorNode
    const startEl = (
      node instanceof Element ? node : (node?.parentElement ?? null)
    )?.closest('.el[data-line]')
    if (!(startEl instanceof HTMLElement)) return

    const range = selection.getRangeAt(0)
    const line = Number(startEl.getAttribute('data-line'))
    const text = startEl.textContent ?? ''
    const start = offsetWithin(startEl, range.startContainer, range.startOffset)
    // Anchor within the starting element; clamp the end to its text.
    const end = Math.min(
      Math.max(offsetWithin(startEl, range.endContainer, range.endOffset), start),
      text.length,
    )
    const quote = text.slice(start, end)

    // Persist the preview highlight independently of the native selection.
    const HighlightCtor = (window as unknown as { Highlight?: typeof Highlight })
      .Highlight
    const registry = (
      CSS as unknown as { highlights?: Map<string, Highlight> }
    ).highlights
    if (HighlightCtor !== undefined && registry !== undefined) {
      registry.set(
        'preview-selection',
        new HighlightCtor(range.cloneRange()),
      )
    }

    onJump?.(line)

    if (commentingEnabled && versionId !== null && quote.trim() !== '') {
      const scroll = scrollRef.current
      const top =
        scroll !== null
          ? range.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top +
            scroll.scrollTop
          : 0
      setComposeAnchor(null)
      setPending({ anchor: { versionId, line, start, end, quote }, top })
    }
  }

  const renderRow = (rowIndex: number) => {
    const row = rows[rowIndex]
    if (row === undefined || row.kind === 'break') return null
    if (row.kind === 'dual') {
      return (
        <div key={`row-${rowIndex}`} className="el el--dual">
          <div className="el--dual-col">{row.left.map(renderElement)}</div>
          <div className="el--dual-col">{row.right.map(renderElement)}</div>
        </div>
      )
    }
    return renderElement(row.index)
  }

  // Measurer renders one child per row, in order, so kids[i] === rows[i].
  // Row-level keys are prefixed so they can't collide with the element-index
  // keys that renderElement uses for single rows.
  const measureRow = (row: Row, i: number) => {
    if (row.kind === 'break') {
      return (
        <div key={`row-${i}`} data-type="page_break" className="el--page_break" />
      )
    }
    if (row.kind === 'dual') {
      return (
        <div key={`row-${i}`} className="el el--dual">
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
      <div className="preview__toolbar">
        <label className="preview__zoom">
          <span className="preview__zoom-label">Zoom</span>
          <input
            className="preview__zoom-slider"
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Preview magnification"
          />
          <span className="preview__zoom-value">{Math.round(zoom)}%</span>
        </label>
      </div>
      <div className="preview__body">
        <div className="preview__scroll" ref={scrollRef}>
          {/* Off-screen single-column layout, used only to measure heights.
              Kept outside the zoom wrapper so pagination stays deterministic. */}
          <div className="preview__measure" ref={measureRef} aria-hidden="true">
            {rows.map(measureRow)}
          </div>

          {/* `zoom` scales the rendered sheets only; it doesn't affect the
              measurer's layout metrics, so page breaks are unchanged. */}
          <div
            className="preview__pages"
            ref={pagesRef}
            style={{ '--preview-zoom': zoom / 100 } as CSSProperties}
            onMouseUp={handleSelectionJump}
          >
            {renderTitlePage()}

            {isEmpty
              ? screenplay.titlePage === null && (
                  <div className="preview__page">
                    <p className="preview__empty">Nothing to preview yet.</p>
                  </div>
                )
              : pages.map((group, p) => (
                  <div className="preview__page" key={p}>
                    {p > 0 && (
                      <span className="preview__page-number">{p + 1}.</span>
                    )}
                    {group.map(renderRow)}
                  </div>
                ))}
          </div>

          {/* Floating "add comment" button anchored to the current selection. */}
          {commentingEnabled && pending !== null && composeAnchor === null && (
            <button
              type="button"
              className="preview__comment-add"
              style={{ top: pending.top }}
              title="Add a comment (⌘/Ctrl+Alt+M)"
              onClick={() => {
                setComposeAnchor(pending.anchor)
                setPending(null)
              }}
            >
              ＋ Comment
            </button>
          )}
        </div>

        {commentingEnabled && (comments.length > 0 || composeAnchor !== null) && (
          <CommentsRail
            comments={comments}
            composeAnchor={composeAnchor}
            authorName={authorName}
            onCreate={(text) => {
              if (composeAnchor !== null) onAddComment?.(composeAnchor, text)
              setComposeAnchor(null)
            }}
            onCancelCompose={() => setComposeAnchor(null)}
            onEdit={(id, text) => onEditComment?.(id, text)}
            onDelete={(id) => onDeleteComment?.(id)}
            onFocusComment={focusComment}
          />
        )}
      </div>
    </div>
  )
}
