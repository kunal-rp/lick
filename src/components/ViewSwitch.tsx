import type { ReactNode } from 'react'
import './ViewSwitch.css'

export interface ViewOption<T extends string> {
  key: T
  label: string
  icon: ReactNode
}

interface ViewSwitchProps<T extends string> {
  value: T
  options: ViewOption<T>[]
  onChange: (value: T) => void
  label: string
  /** Drop the labels and show icons only, for tight bars. */
  compact?: boolean
}

/**
 * A segmented control over a small set of mutually exclusive views.
 *
 * Replaces the cycle button this bar used to carry, which showed only where you
 * *were* — never where a tap would take you — and hid direct access behind an
 * invisible 400ms long-press. Apple's HIG draws the line precisely here: a
 * segmented control answers "which version of this screen am I viewing?", which
 * is exactly the question Editor / Preview / Notes asks. Every destination is
 * visible, reachable in one tap, and the current one is stated rather than
 * inferred.
 *
 * Implemented as a radiogroup so the whole control is one tab stop and arrow
 * keys move between segments, which is what a screen reader expects of it.
 */
export function ViewSwitch<T extends string>({
  value,
  options,
  onChange,
  label,
  compact = false,
}: ViewSwitchProps<T>) {
  const move = (delta: number) => {
    const i = options.findIndex((o) => o.key === value)
    const next = options[(i + delta + options.length) % options.length]
    if (next !== undefined) onChange(next.key)
  }

  return (
    <div
      className={`viewswitch${compact ? ' viewswitch--compact' : ''}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        }
      }}
    >
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            // Only the active segment is in the tab order; the arrow keys reach
            // the rest. Standard roving-tabindex for a radiogroup.
            tabIndex={active ? 0 : -1}
            className={`viewswitch__seg${
              active ? ' viewswitch__seg--active' : ''
            }`}
            title={o.label}
            aria-label={o.label}
            onClick={() => onChange(o.key)}
          >
            {o.icon}
            {!compact && (
              <span className="viewswitch__label">{o.label}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
