import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../../stores/authStore'
import { api } from '../../api/client'

// ─── SVG Icons ────────────────────────────────────────────────────────────────

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

const UsersIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

const DomLogo = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
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
    path: '/dashboard',
    label: 'Inbound',
    icon: <InboundIcon />,
    roles: [UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN],
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
    roles: [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  },
  {
    path: '/users',
    label: 'Users',
    icon: <UsersIcon />,
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

  const visibleItems = NAV_ITEMS.filter(item =>
    user?.role && item.roles.includes(user.role)
  )

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore — still clear local state
    }
    setUser(null)
    navigate('/login')
  }

  return (
    <nav className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <DomLogo />
        </div>
        <div>
          <div className="sidebar-logo-title">DOM</div>
          <div className="sidebar-logo-sub">Warehouse System</div>
        </div>
      </div>

      {/* Nav label */}
      <div className="sidebar-section-label">Navigation</div>

      {/* Nav links */}
      <div className="sidebar-nav">
        {visibleItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
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
