import { useEffect, useState } from 'react'

// Mobile breakpoint. Kept in sync with the `@media (max-width: …)` queries in
// the CSS (App.css, FileNav.css, Preview.css) that reshape the layout for phones.
const MOBILE_QUERY = '(max-width: 768px)'

/** True when the viewport is at mobile width; updates live on resize/rotate. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(MOBILE_QUERY).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isMobile
}
