import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { UserRole } from '@dom/shared'
import { getLoginRedirect } from '../lib/loginRedirect'

interface Props {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

// Handheld/scan routes — workers access these via QR codes on mobile devices.
// On role mismatch, redirect to login (with ?next=) so they can switch accounts seamlessly.
const SCAN_ROUTES = ['/inbound-scan', '/picker-admin-scan', '/packer-admin-scan', '/picker', '/packer', '/stock/scan']

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    const loginPath = getLoginRedirect()
    // /scan handles its own redirect after login via role; only /login needs ?next=
    if (loginPath === '/scan') {
      return <Navigate to="/scan" replace />
    }
    const next = location.pathname !== '/login' ? `?next=${encodeURIComponent(location.pathname)}` : ''
    return <Navigate to={`/login${next}`} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (SCAN_ROUTES.includes(location.pathname)) {
      return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
    }
    return <Navigate to="/unauthorized" replace />
  }

  return <>{children}</>
}
