import { useEffect } from 'react'

// The CSS custom properties the layout reads on mobile. See App.css `.workspace`.
const H_VAR = '--app-h' // visual viewport height
const TOP_VAR = '--app-top' // visual viewport offset from the layout viewport top

/**
 * Mirrors the *visual* viewport geometry into CSS variables so the workspace can
 * pin itself to the space actually on screen — i.e. above the on-screen keyboard
 * — rather than the layout viewport, whose height and origin the keyboard does
 * not affect on iOS Safari. This is the cross-browser half of the keyboard fix
 * (the `interactive-widget` meta tag handles Android Chrome on its own).
 *
 * Both height AND offset matter: when the keyboard opens, iOS scrolls the visual
 * viewport down within the layout viewport (offsetTop > 0) to reveal the caret.
 * Sizing to height alone leaves the workspace pinned at the layout-viewport top,
 * so its bottom edge lifts above the keyboard and exposes empty page below it.
 * Tracking offsetTop and positioning the workspace there keeps it flush.
 *
 * Only active while `enabled` (mobile widths); on desktop the variables are left
 * unset and the CSS falls back to `100dvh` / `0`. We track both `resize` (the
 * keyboard and browser-chrome changes) and `scroll` (iOS panning the visual
 * viewport), rAF-coalesced.
 */
export function useAppViewportHeight(enabled: boolean): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const root = document.documentElement
    if (!enabled || vv === null) {
      root.style.removeProperty(H_VAR)
      root.style.removeProperty(TOP_VAR)
      return
    }

    let raf = 0
    const apply = () => {
      raf = 0
      root.style.setProperty(H_VAR, `${Math.round(vv.height)}px`)
      root.style.setProperty(TOP_VAR, `${Math.round(vv.offsetTop)}px`)
    }
    const schedule = () => {
      if (raf !== 0) return
      raf = requestAnimationFrame(apply)
    }

    apply()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      root.style.removeProperty(H_VAR)
      root.style.removeProperty(TOP_VAR)
    }
  }, [enabled])
}
