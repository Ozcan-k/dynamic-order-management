import type { ReactNode } from 'react'
import { useMobileSidebar } from '../../lib/mobileSidebar'

interface PageShellProps {
  icon: ReactNode
  title: string
  subtitle: string
  stats?: ReactNode
  children: ReactNode
}

/**
 * PageShell — content-area layout wrapper for every panel page.
 * Renders a sticky white header bar + scrollable gray body area.
 * Must be used inside AppLayout (which provides the sidebar).
 */
export default function PageShell({ icon, title, subtitle, stats, children }: PageShellProps) {
  const { open } = useMobileSidebar()

  return (
    <div className="panel-root">
      {/* Sticky Header */}
      <header className="panel-header">
        <div className="panel-header-inner">
          {/* Hamburger + icon + title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {/* Hamburger — mobile only */}
            <button className="sidebar-hamburger" onClick={open} aria-label="Open menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Page icon */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #eff6ff, #e0e7ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              flexShrink: 0,
            }}>
              {icon}
            </div>

            {/* Title + subtitle */}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </h1>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {subtitle}
              </p>
            </div>
          </div>

          {/* Right: stats slot — scrollable on mobile via .panel-header-stats */}
          {stats && (
            <div className="panel-header-stats">
              {stats}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="panel-body">
        {children}
      </main>
    </div>
  )
}
