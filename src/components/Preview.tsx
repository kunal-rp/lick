import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { CSSProperties } from 'react'
import { parse, renderEmphasis, CONTD_SUFFIX, type Section } from '../fountain'
import { LINES_PER_PAGE } from '../pagination'
import { useIsMobile } from '../useIsMobile'
import './Preview.css'

interface PreviewProps {
  source: string
  /** Reports the source line index where each page break falls (in order). */
  onPageBreaks?: (lines: number[]) => void
  /** Jump the editor to a source line when preview text is selected. */
  onJump?: (line: number) => void
  /** Scroll the preview to a source line (editor double-click → reveal). */
  reveal?: { line: number; nonce: number } | null
  /** Section ranges parsed from the source (for optional in-preview rendering). */
  sections?: Section[]
  /** Whether section tints/labels are drawn over the pages. */
  showSections?: boolean
  /** Toggle the section rendering (wired to the toolbar button). */
  onToggleSections?: () => void
  /** Bumped to request a (re)fit of the page to the pane (mobile: from the
   *  top-bar options menu, which replaces the in-preview Fit button). */
  fitNonce?: number
  /**
   * Whether the preview is the pane on screen. It stays mounted when it isn't
   * — it's what paginates the script — but it must not size itself against the
   * off-stage box, and it re-fits each time it comes back into view.
   */
  active?: boolean
  /** Reports a selected span of the script, for referencing it from a note. */
  onSelectRange?: (range: {
    startLine: number
    endLine: number
    quote: string
  }) => void
}

// Preview magnification bounds, as percentages.
const ZOOM_MIN = 10
const ZOOM_MAX = 200
// Math.min/max propagate NaN rather than rejecting it, so an unmeasurable pane
// would otherwise put NaN straight into the zoom slider's `value`. Fall back to
// actual size, which is always a sane thing to be showing.
const clampZoom = (z: number) =>
  Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 100

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
  reveal = null,
  sections = [],
  showSections = false,
  onToggleSections,
  fitNonce = 0,
  active = true,
  onSelectRange,
}: PreviewProps) {
  const isMobile = useIsMobile()
  const screenplay = useMemo(() => parse(source), [source])
  const rows = useMemo(() => buildRows(screenplay.elements), [screenplay])
  const measureRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const pagesFrameRef = useRef<HTMLDivElement>(null)
  const reportedBreaks = useRef<string>('')
  // Each entry is a page: the indices (into `rows`) that land on it.
  const [pages, setPages] = useState<number[][]>([])

  // Section tint bands, measured from the laid-out pages: one entry per page,
  // each a list of colored rectangles drawn behind the text. A run of
  // consecutive same-section elements yields one band spanning their extent;
  // the run touching the top (or bottom) of a page extends to that edge, so the
  // color fills the sheet's margins and any trailing blank space. Populated by
  // the layout effect below; empty unless the toggle is on.
  const [sectionBands, setSectionBands] = useState<
    { id: string; top: number; height: number; color: string }[][]
  >([])
  // Sticky section labels, measured in scroll-content coordinates (outside the
  // pages' zoom transform, where `position: sticky` can't reach). One per
  // section, spanning the union of its per-page bands; `layerHeight` sizes the
  // overlay to the scroll content. Populated by the second effect below.
  const [stickyLabels, setStickyLabels] = useState<
    {
      id: string
      label: string
      description: string
      color: string
      top: number
      height: number
      left: number
      maxWidth: number
    }[]
  >([])
  const [stickyLayerHeight, setStickyLayerHeight] = useState(0)

  const sectionById = useMemo(() => {
    const map = new Map<string, Section>()
    for (const s of sections) map.set(s.id, s)
    return map
  }, [sections])

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

  // Measure section tint bands off the laid-out pages. For each page, walk its
  // elements in order, group consecutive ones sharing the same innermost
  // section, and record a band spanning each group's vertical extent. A group
  // that reaches the first (or last) element of the page is stretched to the
  // page's top (or bottom) edge, so the color fills the sheet margins and any
  // blank tail. Offsets are layout values (pre-transform), matching the page's
  // own coordinate space, so the zoom scale needs no correction. Re-runs after
  // pagination (which is deterministic at a fixed page width, so pane resizes
  // don't reflow it).
  useLayoutEffect(() => {
    const container = pagesRef.current
    if (container === null) return
    if (!showSections || sections.length === 0) {
      setSectionBands((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const sectionForLine = (line: number): Section | undefined => {
      let best: Section | undefined
      for (const s of sections) {
        if (
          line >= s.startLine &&
          line <= s.endLine &&
          (best === undefined || s.depth > best.depth)
        ) {
          best = s
        }
      }
      return best
    }

    // Only the content pages, in order — the title page is a separate
    // `.preview__page` and would otherwise offset every index from `pages`.
    const pageEls = Array.from(
      container.querySelectorAll('.preview__page:not(.preview__title)'),
    ) as HTMLElement[]
    const result: { id: string; top: number; height: number; color: string }[][] = []
    for (const pageEl of pageEls) {
      const els = Array.from(
        pageEl.querySelectorAll('.el[data-line]'),
      ) as HTMLElement[]
      const pageH = pageEl.offsetHeight
      const bands: { id: string; top: number; height: number; color: string }[] = []
      let i = 0
      while (i < els.length) {
        const section = sectionForLine(Number(els[i].getAttribute('data-line')))
        if (section === undefined) {
          i++
          continue
        }
        const startIdx = i
        let top = Infinity
        let bottom = -Infinity
        while (
          i < els.length &&
          sectionForLine(Number(els[i].getAttribute('data-line')))?.id ===
            section.id
        ) {
          const el = els[i]
          top = Math.min(top, el.offsetTop)
          bottom = Math.max(bottom, el.offsetTop + el.offsetHeight)
          i++
        }
        if (startIdx === 0) top = 0
        if (i === els.length) bottom = pageH
        bands.push({ id: section.id, top, height: bottom - top, color: section.color })
      }
      result.push(bands)
    }
    setSectionBands(result)
  }, [pages, sections, showSections])

  // Preview magnification, as a percentage (100 = actual size).
  const [zoom, setZoom] = useState(100)
  // Auto-fit (desktop): keep the page fitted to the pane and re-fit on every
  // pane resize. Any manual zoom turns it off.
  //
  // On by default. The preview's whole job is showing how an edit lands on the
  // page as you make it, and it opens beside the editor — so at 100% in half a
  // window it would open cropped, and every writer's first action would be to
  // click Fit. Starting fitted and letting a wheel or a pinch take over is the
  // right way round.
  const [autoFit, setAutoFit] = useState(true)
  // Mirror of `zoom` for use inside native event listeners without re-binding.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  // Position the sticky section labels. `position: sticky` can't reach the
  // scroll container from inside the zoom-transformed pages, so the labels live
  // in an overlay that is a direct child of the scroll element; here we measure
  // each section's on-screen band extent (union across its pages) and express it
  // in scroll-content coordinates for that overlay.
  const placeLabels = useCallback(() => {
    const scroll = scrollRef.current
    const container = pagesRef.current
    if (scroll === null || container === null) return
    if (!showSections) {
      setStickyLabels((prev) => (prev.length === 0 ? prev : []))
      setStickyLayerHeight(0)
      return
    }
    const scrollRect = scroll.getBoundingClientRect()
    const bandEls = Array.from(
      container.querySelectorAll('.preview__section-band[data-sid]'),
    ) as HTMLElement[]

    const byId = new Map<string, { top: number; bottom: number; left: number }>()
    for (const el of bandEls) {
      const sid = el.getAttribute('data-sid')
      if (sid === null) continue
      const r = el.getBoundingClientRect()
      const top = r.top - scrollRect.top + scroll.scrollTop
      const bottom = r.bottom - scrollRect.top + scroll.scrollTop
      const left = r.left - scrollRect.left + scroll.scrollLeft
      const cur = byId.get(sid)
      if (cur === undefined) byId.set(sid, { top, bottom, left })
      else {
        cur.top = Math.min(cur.top, top)
        cur.bottom = Math.max(cur.bottom, bottom)
        cur.left = Math.min(cur.left, left)
      }
    }

    // The page has a blank 1.5in left margin before the text column (scaled by
    // zoom, since bands are measured on-screen). Sit the pill in that margin and
    // cap its width to the margin so it never reaches — or covers — the script
    // text. Width depends only on zoom, so it can't feed back into scroll size.
    const marginPx = 1.5 * 96 * (zoom / 100)
    const labels = []
    for (const [sid, ext] of byId) {
      const s = sectionById.get(sid)
      if (s === undefined) continue
      labels.push({
        id: sid,
        label: s.label,
        description: s.description,
        color: s.color,
        top: ext.top,
        height: ext.bottom - ext.top,
        left: ext.left + 8,
        maxWidth: Math.max(64, marginPx - 16),
      })
    }
    setStickyLabels(labels)
    setStickyLayerHeight(scroll.scrollHeight)
  }, [zoom, sectionById, showSections])

  // Re-place labels after each band re-measure (pagination / zoom / edits).
  useLayoutEffect(() => {
    placeLabels()
  }, [placeLabels, sectionBands])

  // …and whenever the pane resizes. Labels are keyed to the page's on-screen
  // left edge, which shifts when the pane width changes (e.g. dragging the split
  // divider) with no change to zoom or pagination — so without this the labels
  // would drift off the page into the gutter.
  useEffect(() => {
    const scroll = scrollRef.current
    if (scroll === null || !showSections) return
    const ro = new ResizeObserver(() => placeLabels())
    ro.observe(scroll)
    return () => ro.disconnect()
  }, [placeLabels, showSections])

  // Set once the user zooms by hand (wheel or pinch); the mobile auto-fit then
  // stops overriding their choice on the next resize.
  const userZoomedRef = useRef(false)

  // Trackpad pinch and ctrl+wheel arrive as wheel events with `ctrlKey` set;
  // consume them to drive zoom (and stop the browser's own page zoom). The
  // listener is attached natively so it can be non-passive and preventDefault.
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      userZoomedRef.current = true
      setAutoFit(false)
      setZoom((z) => clampZoom(z * Math.exp(-e.deltaY * 0.005)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Touch pinch drives the same magnification. Two fingers on the preview scale
  // the zoom about the gesture's start; `touch-action: pan-x pan-y` on the
  // scroll element (see CSS) stops the browser's own pinch so this can take
  // over. Attached natively so the move handler can be non-passive.
  useEffect(() => {
    const el = scrollRef.current
    if (el === null) return
    const spread = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    let startSpread = 0
    let startZoom = 0
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return
      startSpread = spread(e.touches)
      startZoom = zoomRef.current
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || startSpread === 0) return
      e.preventDefault() // suppress native pinch / scroll during the gesture
      userZoomedRef.current = true
      setAutoFit(false)
      setZoom(clampZoom((startZoom * spread(e.touches)) / startSpread))
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startSpread = 0
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  // Fit: the largest zoom that still shows the full text line width. The
  // rightmost text sits at 1.5in (left margin) + 6in (text area) = 7.5in from
  // the page's left edge, so fit that extent to the available width — the blank
  // right margin may crop, maximizing legible text size.
  const fitZoom = useCallback(() => {
    const scroll = scrollRef.current
    if (scroll === null) return
    const style = getComputedStyle(scroll)
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    // Fit the text extent (through 7.5in) rather than the whole sheet,
    // cropping the blank right margin to maximize legible size.
    const extentPx = 7.5 * 96
    const available = scroll.clientWidth - padX
    // A pane that hasn't been laid out yet measures as zero (or, if the element
    // isn't in the document, as NaN via empty computed padding). Either way
    // there's nothing to fit to — leave the zoom alone rather than snapping the
    // page to the 10% floor and making the writer undo it.
    if (!Number.isFinite(available) || available <= 0) return
    userZoomedRef.current = false // an explicit Fit re-enables mobile auto-fit
    setZoom(clampZoom(Math.floor((available / extentPx) * 100)))
  }, [])

  // Showing the preview re-fits it, every time.
  //
  // A zoom you set with the wheel or a pinch is for the page in front of you,
  // not a preference to carry: coming back to the pages later — very likely at
  // a different pane width, after dragging the divider or switching to notes
  // and back — should start from the page fitted, the way opening it does.
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) {
      userZoomedRef.current = false
      setAutoFit(true)
    }
    wasActive.current = active
  }, [active])

  // Desktop auto-fit: while enabled, fit now and on every pane resize (dragging
  // the split divider, window resize). A manual zoom clears `autoFit`, which
  // tears this down. Gated on `active` so it never measures the off-stage box.
  useEffect(() => {
    if (!autoFit || isMobile || !active) return
    const scroll = scrollRef.current
    if (scroll === null) return
    fitZoom()
    const ro = new ResizeObserver(() => fitZoom())
    ro.observe(scroll)
    return () => ro.disconnect()
  }, [autoFit, isMobile, active, fitZoom])

  // Fit the full page width to the pane (mobile). Unlike the desktop `fitZoom`,
  // this fits the whole 8.5in sheet so nothing crops on a phone.
  const fitToPane = useCallback(() => {
    const scroll = scrollRef.current
    if (scroll === null) return
    const style = getComputedStyle(scroll)
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    const pageWidthPx = 8.5 * 96 // full sheet, so nothing crops
    const available = scroll.clientWidth - padX
    if (!Number.isFinite(available) || available <= 0) return
    setZoom(clampZoom(Math.floor((available / pageWidthPx) * 100)))
  }, [])

  // A Fit request from the top-bar options menu (mobile): clear any manual
  // pinch and re-fit the page to the pane. Ignores the initial mount (nonce 0).
  const fitNonceRef = useRef(fitNonce)
  useEffect(() => {
    if (fitNonce === fitNonceRef.current) return
    fitNonceRef.current = fitNonce
    userZoomedRef.current = false
    fitToPane()
  }, [fitNonce, fitToPane])

  // Mobile auto-fit: fit the page to the pane on load and on every pane resize
  // (rotation, keyboard), unless the reader has pinch-zoomed by hand.
  useEffect(() => {
    if (!isMobile || !active) return
    const scroll = scrollRef.current
    if (scroll === null) return
    const fit = () => {
      if (userZoomedRef.current) return // respect a manual pinch
      fitToPane()
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [isMobile, active, fitToPane])

  // The sheets are scaled with `transform`, which (unlike `zoom`) doesn't shrink
  // the element's layout box — so the scroll region would otherwise reserve the
  // full un-scaled size. Size the frame to the scaled extent of its contents so
  // scrolling and centering track what's actually drawn. offsetWidth/Height are
  // pre-transform, so multiplying by the scale gives the on-screen size. The
  // observer catches content growth (pagination, edits); `zoom` covers rescale.
  useLayoutEffect(() => {
    const inner = pagesRef.current
    const frame = pagesFrameRef.current
    if (inner === null || frame === null) return
    const apply = () => {
      const s = zoom / 100
      frame.style.width = `${inner.offsetWidth * s}px`
      frame.style.height = `${inner.offsetHeight * s}px`
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [zoom, pages])

  // Editor double-click → scroll the preview to the element containing that
  // source line (the element whose start line is the greatest ≤ the line), and
  // briefly flash it.
  useEffect(() => {
    if (reveal === null || pagesRef.current === null) return
    let best: HTMLElement | null = null
    let bestLine = -1
    pagesRef.current.querySelectorAll('.el[data-line]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return
      const line = Number(node.getAttribute('data-line'))
      if (line <= reveal.line && line > bestLine) {
        bestLine = line
        best = node
      }
    })
    if (best === null) return
    const el: HTMLElement = best
    const scroll = scrollRef.current
    if (scroll !== null) {
      const eRect = el.getBoundingClientRect()
      const sRect = scroll.getBoundingClientRect()
      scroll.scrollTop += eRect.top - sRect.top - scroll.clientHeight * 0.35
    }
    el.classList.add('el--reveal')
    const timer = window.setTimeout(() => el.classList.remove('el--reveal'), 1200)
    return () => window.clearTimeout(timer)
  }, [reveal])

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
        {el.type === 'character' && el.cont === true ? CONTD_SUFFIX : null}
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
    const startLine = Number(startEl.getAttribute('data-line'))
    // The selection may end in a different element (a multi-line selection);
    // take the end line from there rather than clamping to the start element.
    const endNode = range.endContainer
    const endEl = (
      endNode instanceof Element ? endNode : (endNode?.parentElement ?? null)
    )?.closest('.el[data-line]')
    const endLine =
      endEl instanceof HTMLElement
        ? Number(endEl.getAttribute('data-line'))
        : startLine
    const quote = selection.toString()

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

    onJump?.(startLine)

    // Report the selected span so it can be referenced from a note. The lines
    // are what a reference is anchored by; the quote is only a snapshot for
    // display.
    if (quote.trim() !== '') {
      onSelectRange?.({ startLine, endLine, quote })
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
        {/*
          A read-out, not a control. The slider that used to sit here was a
          third way to do what the wheel and the pinch already do, and it took
          the widest element in the bar to do it — while the thing a reader
          actually wants after zooming is simply "put it back", which is Fit.
        */}
        <span className="preview__zoom-value" aria-live="off">
          {Math.round(zoom)}%
        </span>
        {/* Desktop: Fit + Sections live here. On mobile they move to the
            top-bar options (⋯) menu, so the preview toolbar stays minimal. */}
        {!isMobile && (
          <button
            type="button"
            className={`preview__zoom-fit${
              autoFit ? ' preview__zoom-fit--active' : ''
            }`}
            // One-way: this returns you to the fitted page. There's nothing
            // useful on the other side of the toggle now that the slider is
            // gone — "auto-fit off" only ever meant "keep the zoom I set by
            // hand", which a gesture already does on its own.
            onClick={() => {
              userZoomedRef.current = false
              setAutoFit(true)
            }}
            aria-pressed={autoFit}
            title={
              autoFit
                ? 'Fitted to the pane, and refitting as it resizes'
                : 'Fit the page back to the pane'
            }
          >
            Fit
          </button>
        )}
        {!isMobile && sections.length > 0 && onToggleSections !== undefined && (
          <button
            type="button"
            className={`preview__sections-toggle${
              showSections ? ' preview__sections-toggle--active' : ''
            }`}
            onClick={onToggleSections}
            aria-pressed={showSections}
            title="Show or hide section ranges"
          >
            Sections
          </button>
        )}
      </div>
      <div className="preview__body">
        <div
          className="preview__scroll"
          ref={scrollRef}
        >
          {/* Off-screen single-column layout, used only to measure heights.
              Kept outside the zoom wrapper so pagination stays deterministic. */}
          <div className="preview__measure" ref={measureRef} aria-hidden="true">
            {rows.map(measureRow)}
          </div>

          {/* Sticky section labels. This overlay is a direct child of the
              scroll element — outside the pages' zoom transform — so its
              `position: sticky` pills can pin to the top of the viewport. Tracks
              are placed in scroll-content coordinates by the measuring effect. */}
          {stickyLabels.length > 0 && (
            <div
              className="preview__section-sticky"
              style={{ height: stickyLayerHeight }}
              aria-hidden="true"
            >
              {stickyLabels.map((l) => (
                <div
                  key={l.id}
                  className="preview__section-label-track"
                  style={{ top: l.top, height: l.height, left: l.left }}
                >
                  <span
                    className="preview__section-label"
                    style={
                      {
                        '--section-color': l.color,
                        maxWidth: l.maxWidth,
                      } as CSSProperties
                    }
                  >
                    <span className="preview__section-label-name">{l.label}</span>
                    {l.description !== '' && (
                      <span className="preview__section-label-desc">
                        {l.description}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* `transform: scale` (not `zoom`) scales the rendered sheets: it's
              reliable on every browser, whereas fractional `zoom` mis-rasterizes
              on iOS Safari (block paragraphs overlap). Because transform leaves
              the layout box full-size, the frame is sized to the scaled extent
              in JS (see the effect below) so the scroll region stays correct.
              The measurer lives outside this wrapper, so page breaks are
              unaffected by the scale. */}
          <div className="preview__pages-frame" ref={pagesFrameRef}>
            <div
              className="preview__pages"
              ref={pagesRef}
              style={{ '--preview-zoom': zoom / 100 } as CSSProperties}
              onMouseUp={handleSelectionJump}
              // Touch: mouse events don't fire while selecting, so mirror the
              // desktop mouseup on touchend. Double-tapping a word selects it;
              // read the settled selection on the next frame
              // (handleSelectionJump no-ops for a collapsed selection, e.g. a
              // plain tap or scroll).
              onTouchEnd={() => requestAnimationFrame(handleSelectionJump)}
            >
              {renderTitlePage()}

              {isEmpty
                ? screenplay.titlePage === null && (
                    <div className="preview__page">
                      <p className="preview__empty">Nothing to preview yet.</p>
                    </div>
                  )
                : pages.map((group, p) => {
                    const bands = sectionBands[p]
                    return (
                      <div className="preview__page" key={p}>
                        {bands !== undefined && bands.length > 0 && (
                          <div className="preview__section-bg" aria-hidden="true">
                            {bands.map((b, bi) => (
                              <div
                                key={bi}
                                className="preview__section-band"
                                data-sid={b.id}
                                style={
                                  {
                                    top: b.top,
                                    height: b.height,
                                    '--section-color': b.color,
                                  } as CSSProperties
                                }
                              />
                            ))}
                          </div>
                        )}
                        {p > 0 && (
                          <span className="preview__page-number">{p + 1}.</span>
                        )}
                        {group.map(renderRow)}
                      </div>
                    )
                  })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
