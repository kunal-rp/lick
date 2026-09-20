import { useCallback, useRef, useState, type ReactNode } from 'react'
import './SplitPane.css'

interface SplitPaneProps {
  left: ReactNode
  right: ReactNode
  /** Initial size of the left pane, as a percentage (0–100). */
  initialLeftPercent?: number
  /** Clamp bounds for the left pane, as percentages. */
  minLeftPercent?: number
  maxLeftPercent?: number
  /** Reports the left pane width (%) when a drag finishes. */
  onResize?: (leftPercent: number) => void
  /**
   * Give the left pane the whole width and move the right one off-stage —
   * still rendered and still laid out, just not on screen.
   *
   * Not the same as the caller declining to render `right`. The preview is
   * what paginates the script, and the editor draws its page-break guides
   * from that pagination, so a preview that unmounts leaves the guides frozen
   * at whatever the last render said. Keeping it mounted here, in a parent
   * that never changes, also means React holds onto the component instance —
   * so its scroll position and zoom survive a trip to full-width editing.
   */
  collapsed?: boolean
}

/**
 * Horizontal split with a draggable divider between two panes.
 * Pure pointer-events + a percentage width — no dependencies.
 */
export function SplitPane({
  left,
  right,
  initialLeftPercent = 50,
  minLeftPercent = 20,
  maxLeftPercent = 80,
  onResize,
  collapsed = false,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftPercent, setLeftPercent] = useState(initialLeftPercent)
  const [dragging, setDragging] = useState(false)
  // Latest width, so endDrag can report the final value without a state read.
  const leftRef = useRef(initialLeftPercent)

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      const clamped = Math.min(maxLeftPercent, Math.max(minLeftPercent, pct))
      leftRef.current = clamped
      setLeftPercent(clamped)
    },
    [minLeftPercent, maxLeftPercent],
  )

  const endDrag = useCallback(() => {
    setDragging(false)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', endDrag)
    onResize?.(leftRef.current)
  }, [onPointerMove, onResize])

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      setDragging(true)
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', endDrag)
    },
    [onPointerMove, endDrag],
  )

  return (
    <div
      ref={containerRef}
      className={`split${dragging ? ' split--dragging' : ''}`}
    >
      <div
        className="split__pane"
        style={{ width: collapsed ? '100%' : `${leftPercent}%` }}
      >
        {left}
      </div>
      {!collapsed && (
        <div
          className="split__divider"
          onPointerDown={startDrag}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
        />
      )}
      <div
        className={`split__pane${collapsed ? ' split__pane--offstage' : ''}`}
        style={collapsed ? undefined : { width: `${100 - leftPercent}%` }}
        // Off-stage content is decorative to a reader — it's only mounted so
        // the pagination keeps running.
        aria-hidden={collapsed || undefined}
      >
        {right}
      </div>
    </div>
  )
}
