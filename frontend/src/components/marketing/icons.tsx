// Inline stroke icons (24×24 grid, currentColor) for the Marketing Report.

type P = { size?: number }

function Svg({ size = 14, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const IconTrend = (p: P) => <Svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></Svg>
export const IconPeso = (p: P) => <Svg {...p}><path d="M7 21V3h6a5 5 0 0 1 0 10H7" /><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="10" x2="20" y2="10" /></Svg>
export const IconBag = (p: P) => <Svg {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></Svg>
export const IconBroadcast = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" /></Svg>
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>
export const IconCheckSquare = (p: P) => <Svg {...p}><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>
export const IconMessage = (p: P) => <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>
export const IconUsers = (p: P) => <Svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Svg>
export const IconStore = (p: P) => <Svg {...p}><path d="M3 9 5 3h14l2 6" /><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 13v8h14v-8" /></Svg>
export const IconChevron = (p: P) => <Svg {...p}><polyline points="6 9 12 15 18 9" /></Svg>
export const IconArrowUp = (p: P) => <Svg {...p}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></Svg>
export const IconArrowDown = (p: P) => <Svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></Svg>
export const IconX = (p: P) => <Svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>
export const IconCheck = (p: P) => <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>
