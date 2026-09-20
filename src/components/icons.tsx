/**
 * The app's icon set: inline SVG, stroked in `currentColor`.
 *
 * Replaces the emoji glyphs the chrome used to draw with (📄 🗒️ ☰ ⤢ …). Emoji
 * render differently on every platform, can't inherit the surrounding colour,
 * and don't align optically against text — so buttons that mixed them with
 * labels never sat on a common baseline. These are sized in `em` so they scale
 * with whatever type they sit beside, and inherit colour so a hovered or active
 * button tints its icon for free.
 *
 * Geometry follows the Lucide conventions (24×24 box, 2px stroke, round caps),
 * which is what keeps unrelated icons looking like one family.
 */

interface IconProps {
  /** Multiplier on the 1em box, for the few places that need a larger glyph. */
  size?: number
  className?: string
}

function Icon({
  size = 1,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={`${size}em`}
      height={`${size}em`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      /* Nudge onto the text baseline: SVG sits on the line box by default,
         which leaves it riding high next to a label. */
      style={{ verticalAlign: '-0.125em', flex: 'none' }}
    >
      {children}
    </svg>
  )
}

export function MenuIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Icon>
  )
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="15 18 9 12 15 6" />
    </Icon>
  )
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="9 18 15 12 9 6" />
    </Icon>
  )
}

export function ChevronDownIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  )
}

export function FolderIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </Icon>
  )
}

export function FileTextIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </Icon>
  )
}

export function FilePdfIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6" />
      <path d="M14 18v-6h1.5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2Z" />
    </Icon>
  )
}

export function TrashIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  )
}

export function SunIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </Icon>
  )
}

export function MoonIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </Icon>
  )
}

export function PenIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  )
}

export function PagesIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </Icon>
  )
}

export function NoteIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2Z" />
      <path d="M14 21v-5a2 2 0 0 1 2-2h5" />
    </Icon>
  )
}

export function OutlineIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="9" y1="6" x2="21" y2="6" />
      <line x1="13" y1="12" x2="21" y2="12" />
      <line x1="13" y1="18" x2="21" y2="18" />
      <path d="M4 6h.01M8 12H4v6h4" />
    </Icon>
  )
}

export function UsersIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Icon>
  )
}

export function ExpandIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </Icon>
  )
}

export function CollapseIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </Icon>
  )
}

export function HistoryIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </Icon>
  )
}

export function SearchIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </Icon>
  )
}

export function ReplaceIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M14 4h5v5" />
      <path d="M19 4 4 19" />
      <path d="M10 20H5v-5" />
    </Icon>
  )
}

export function PlusIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </Icon>
  )
}

export function CloseIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  )
}

export function MoreIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Icon>
  )
}

export function CheckIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  )
}

export function ChecklistIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polyline points="3 7 5 9 9 5" />
      <polyline points="3 17 5 19 9 15" />
      <line x1="13" y1="7" x2="21" y2="7" />
      <line x1="13" y1="17" x2="21" y2="17" />
    </Icon>
  )
}

export function BulletsIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <line x1="9" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="9" y1="18" x2="21" y2="18" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </Icon>
  )
}

export function CameraIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </Icon>
  )
}

export function DownloadIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </Icon>
  )
}

export function SaveIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </Icon>
  )
}

export function LayersIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </Icon>
  )
}

export function FitIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 9h6v6H9z" />
    </Icon>
  )
}

export function CommandIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 6a3 3 0 1 1 3 3H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3Z" />
    </Icon>
  )
}
