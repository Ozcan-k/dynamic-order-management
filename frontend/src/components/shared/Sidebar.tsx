import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../api/client'
import { disconnectSocket } from '../../lib/socket'
import { useMobileSidebar } from '../../lib/mobileSidebar'
import { getLoginRedirect } from '../../lib/loginRedirect'

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const DashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const InboundIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="8 17 12 21 16 17" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <rect x="3" y="3" width="18" height="4" rx="1" />
  </svg>
)

const PickerAdminIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <polyline points="16 11 18 13 22 9" />
  </svg>
)

const PackerAdminIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const OutboundIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="3" width="15" height="13" rx="1" />
    <path d="M16 8h4l3 3v5h-7V8z" />
    <circle cx="5.5" cy="18.5" r="2.5" />
    <circle cx="18.5" cy="18.5" r="2.5" />
  </svg>
)

const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const ReportsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
)

const ArchiveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" rx="1" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
)

const SalesDashboardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const SalesEntryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
)

const SalesOrdersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
)

const MarketingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const DomLogo = () => (
  <svg width="26" height="26" viewBox="0 0 72 72" fill="none">
    <path d="M36 14 L54 24 L36 34 L18 24 Z"
          fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M18 24 L18 46 L36 56 L36 34 Z"
          fill="rgba(255,255,255,0.12)" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M54 24 L54 46 L36 56 L36 34 Z"
          fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
  </svg>
)

// ─── Nav item config ──────────────────────────────────────────────────────────

interface NavItem {
  path: string
  label: string
  icon: ReactNode
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    icon: <DashboardIcon />,
    roles: [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  },
  {
    path: '/dashboard',
    label: 'Inbound',
    icon: <InboundIcon />,
    roles: [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  },
  {
    path: '/picker-admin',
    label: 'Picker Admin',
    icon: <PickerAdminIcon />,
    roles: [UserRole.ADMIN, UserRole.PICKER_ADMIN],
  },
  {
    path: '/packer-admin',
    label: 'Packer Admin',
    icon: <PackerAdminIcon />,
    roles: [UserRole.ADMIN, UserRole.PACKER_ADMIN],
  },
  {
    path: '/outbound',
    label: 'Outbound',
    icon: <OutboundIcon />,
    roles: [UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN],
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: <ReportsIcon />,
    roles: [UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN],
  },
  {
    path: '/archive',
    label: 'Archive',
    icon: <ArchiveIcon />,
    roles: [UserRole.ADMIN],
  },
  {
    path: '/sales',
    label: 'Sales Dashboard',
    icon: <SalesDashboardIcon />,
    roles: [UserRole.SALES_AGENT, UserRole.ADMIN],
  },
  {
    path: '/sales/entry',
    label: 'My Activity',
    icon: <SalesEntryIcon />,
    roles: [UserRole.SALES_AGENT, UserRole.ADMIN],
  },
  {
    path: '/sales/orders',
    label: 'My Orders',
    icon: <SalesOrdersIcon />,
    roles: [UserRole.SALES_AGENT, UserRole.ADMIN],
  },
  {
    path: '/marketing-report',
    label: 'Marketing Report',
    icon: <MarketingIcon />,
    roles: [UserRole.ADMIN],
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: <SettingsIcon />,
    roles: [UserRole.ADMIN],
  },
]

// ─── Avatar initials ─────────────────────────────────────────────────────────

function SidebarAvatar({ username }: { username: string }) {
  const initials = username.slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%',
      background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '13px', fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials}
    </div>
  )
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()
  const { isOpen, close } = useMobileSidebar()

  const visibleItems = NAV_ITEMS.filter(item =>
    user?.role && item.roles.includes(user.role)
  )

  async function handleLogout() {
    navigate(getLoginRedirect(), { replace: true })
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore — still clear local state
    }
    disconnectSocket()
    setUser(null)
  }

  return (
    <nav className={['sidebar', isOpen ? 'sidebar--mobile-open' : ''].filter(Boolean).join(' ')}>
      {/* Logo + mobile close button */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <DomLogo />
        </div>
        <div style={{ flex: 1 }}>
          <div className="sidebar-logo-title">DOM</div>
          <div className="sidebar-logo-sub">Warehouse System</div>
        </div>
        {/* Close button — mobile only */}
        <button
          className="sidebar-close-btn"
          onClick={close}
          aria-label="Close menu"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Nav label */}
      <div className="sidebar-section-label">Navigation</div>

      {/* Nav links */}
      <div className="sidebar-nav">
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={close}
            className={({ isActive }) =>
              ['sidebar-link', isActive ? 'sidebar-link--active' : ''].filter(Boolean).join(' ')
            }
          >
            <span className="sidebar-link-icon">{item.icon}</span>
            <span className="sidebar-link-label">{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* Bottom: user + logout */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <SidebarAvatar username={user?.username ?? '?'} />
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name">{user?.username}</div>
            <div className="sidebar-user-role">{user?.role?.replace(/_/g, ' ')}</div>
          </div>
        </div>

        <button className="sidebar-logout" onClick={handleLogout}>
          <LogoutIcon />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  )
}
