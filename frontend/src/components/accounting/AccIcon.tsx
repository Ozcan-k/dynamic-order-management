// Small stroke icon set for the Accounting v3 screens (payments, status, due dates).
// One stroke weight, 24px grid, currentColor — same drawing style as the sidebar icons.
import type { CSSProperties } from 'react'

const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v5M18 9.5v5" /></>,
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18h2" /></>,
  bank: <path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" />,
  check: <><rect x="2.5" y="6" width="19" height="12" rx="1.5" /><path d="M6 13.5h6M6 10.5h3.5M15 14.5c1-1 1.8-2 3-2" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h3" /></>,
  file: <><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" /><path d="M14 2.5V8h5.5" /></>,
  edit: <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.2" /></>,
  ok: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16 9.6" /></>,
  half: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" /></>,
  ring: <circle cx="12" cy="12" r="9" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  clip: <path d="m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10 17a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
} as const

export type AccIconName = keyof typeof PATHS

export default function AccIcon({ name, size = 16, className, style }: { name: AccIconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className} style={{ flex: 'none', ...style }}>
      {PATHS[name]}
    </svg>
  )
}
