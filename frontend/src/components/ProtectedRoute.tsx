import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { UserRole } from '@dom/shared'

interface Props {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

// Handheld/scan routes — workers access these via QR codes on mobile devices.
// On role mismatch, redirect to login (with ?next=) so they can switch accounts seamlessly.
const SCAN_ROUTES = ['/inbound-scan', '/picker-admin-scan', '/picker', '/packer']

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
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
