import { useMemo } from 'react'
import { parse, renderEmphasis } from '../fountain'
import './Preview.css'

interface PreviewProps {
  source: string
}

/**
 * Live-rendered, formatted screenplay preview.
 *
 * Parses the Fountain source (via the stub parser) and lays each element out
 * with classic screenplay formatting rules.
 */
export function Preview({ source }: PreviewProps) {
  const screenplay = useMemo(() => parse(source), [source])

  return (
    <div className="preview">
      <div className="preview__scroll">
        <div className="preview__page">
          {screenplay.elements.length === 0 ? (
            <p className="preview__empty">Nothing to preview yet.</p>
          ) : (
            screenplay.elements.map((el, i) => (
              <p key={i} className={`el el--${el.type}`}>
                {renderEmphasis(el.text)}
              </p>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
