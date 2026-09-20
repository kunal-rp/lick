import type { ReactNode } from 'react'
import type { SidebarTab } from '../layout'
import type { Theme } from '../theme'
import {
  ChevronLeftIcon,
  FolderIcon,
  MoonIcon,
  NoteIcon,
  OutlineIcon,
  SunIcon,
  UsersIcon,
} from './icons'
import './Sidebar.css'

interface SidebarProps {
  tab: SidebarTab
  onSelectTab: (tab: SidebarTab) => void
  collapsed: boolean
  onToggle: () => void
  theme: Theme
  onToggleTheme: () => void
  /** Panel body for the active tab. */
  children: ReactNode
}

const TABS: { key: SidebarTab; label: string; icon: JSX.Element }[] = [
  { key: 'files', label: 'Files', icon: <FolderIcon /> },
  { key: 'outline', label: 'Outline', icon: <OutlineIcon /> },
  { key: 'notes', label: 'Notes', icon: <NoteIcon /> },
  { key: 'cast', label: 'Cast', icon: <UsersIcon /> },
]

/**
 * The single left-hand reference surface: files, outline, notes and cast as
 * tabs of one panel.
 *
 * These used to be three unrelated places. The file tree owned the left edge;
 * Notes competed with the preview for the right pane, so opening your notes
 * destroyed your pages; and Characters & Locations — the only jump-to-line
 * surface in the app — was a collapsed strip *underneath* the preview, which
 * meant the app's outline only existed while the preview did.
 *
 * Highland 2's sidebar is the model here (Navigator, Bin and the rest as tabs
 * of one rail), as is Beat's outline sidebar and Slugline's Outline Navigator.
 * One rail, one place to look, and the right half of the window handed back to
 * the script.
 */
export function Sidebar({
  tab,
  onSelectTab,
  collapsed,
  onToggle,
  theme,
  onToggleTheme,
  children,
}: SidebarProps) {
  if (collapsed) {
    return (
      <aside className="sidebar sidebar--collapsed">
        {/* Collapsed, the rail stays: the tabs double as the way back in, so
            reopening lands on the panel you actually want rather than on
            whichever one you left. */}
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="sidebar__railbtn"
            title={t.label}
            aria-label={t.label}
            onClick={() => {
              onSelectTab(t.key)
              onToggle()
            }}
          >
            {t.icon}
          </button>
        ))}
      </aside>
    )
  }

  const active = TABS.find((t) => t.key === tab) ?? TABS[0]

  return (
    <>
      {/* Mobile only: tapping the dimmed backdrop closes the drawer. */}
      <div className="sidebar__backdrop" onClick={onToggle} aria-hidden="true" />
      <aside className="sidebar">
        <div className="sidebar__head">
          <span className="sidebar__brand">kunal's scripts</span>
          <button
            type="button"
            className="sidebar__iconbtn"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className="sidebar__iconbtn"
            title="Hide panel"
            aria-label="Hide panel"
            onClick={onToggle}
          >
            <ChevronLeftIcon />
          </button>
        </div>

        <div className="sidebar__tabs" role="tablist" aria-label="Sidebar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab}
              tabIndex={t.key === tab ? 0 : -1}
              className={`sidebar__tab${
                t.key === tab ? ' sidebar__tab--active' : ''
              }`}
              title={t.label}
              onClick={() => onSelectTab(t.key)}
            >
              {t.icon}
              <span className="sidebar__tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div
          className="sidebar__body"
          role="tabpanel"
          aria-label={active.label}
        >
          {children}
        </div>
      </aside>
    </>
  )
}
