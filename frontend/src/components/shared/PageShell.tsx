import type { ReactNode } from 'react'

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
  return (
    <div className="panel-root">
      {/* Sticky Header */}
      <header className="panel-header">
        <div className="panel-header-inner">
          {/* Left: icon + title + subtitle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #eff6ff, #e0e7ff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              flexShrink: 0,
            }}>
              {icon}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                {title}
              </h1>
              <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
                {subtitle}
              </p>
            </div>
          </div>

          {/* Right: stats slot */}
          {stats && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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
