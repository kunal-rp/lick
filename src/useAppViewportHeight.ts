import { useEffect } from 'react'

// The CSS custom property the layout reads for its height on mobile. See the
// `--app-h` fallback in App.css (`.workspace`).
const VAR = '--app-h'

/**
 * Mirrors the *visual* viewport height into the `--app-h` CSS variable so the
 * workspace can size itself to the space actually on screen — i.e. above the
 * on-screen keyboard — instead of the layout viewport, whose height the keyboard
 * does not affect on iOS Safari. This is the cross-browser half of the keyboard
 * fix (the `interactive-widget` meta tag handles Android Chrome on its own).
 *
 * Only active while `enabled` (mobile widths); on desktop the variable is left
 * unset and the CSS falls back to `100dvh`. We track `resize` (fired for the
 * keyboard and browser-chrome changes) but not `scroll`, so panning the page
 * doesn't thrash the layout.
 */
export function useAppViewportHeight(enabled: boolean): void {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const root = document.documentElement
    if (!enabled || vv === null) {
      root.style.removeProperty(VAR)
      return
    }

    let raf = 0
    const apply = () => {
      raf = 0
      root.style.setProperty(VAR, `${Math.round(vv.height)}px`)
    }
    const onResize = () => {
      if (raf !== 0) return
      raf = requestAnimationFrame(apply)
    }

    apply()
    vv.addEventListener('resize', onResize)
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      vv.removeEventListener('resize', onResize)
      root.style.removeProperty(VAR)
    }
  }, [enabled])
}
