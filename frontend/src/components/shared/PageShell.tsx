import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMobileSidebar } from '../../lib/mobileSidebar'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../api/client'
import { getLoginRedirect } from '../../lib/loginRedirect'

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
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore — still clear local state
    }
    setUser(null)
    navigate(getLoginRedirect(), { replace: true })
  }

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

          {/* Sign Out — mobile only (desktop uses sidebar) */}
          <button className="header-signout-btn" onClick={handleLogout} aria-label="Sign out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="panel-body">
        {children}
      </main>
    </div>
  )
}
