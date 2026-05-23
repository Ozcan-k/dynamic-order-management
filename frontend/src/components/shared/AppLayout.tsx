import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import SlaAlertBanner from '../SlaAlertBanner'
import { connectSocket, disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/authStore'
import { MobileSidebarProvider, useMobileSidebar } from '../../lib/mobileSidebar'

/**
 * Phase H v2.39.0: Wraps page children with a div keyed on pathname so the
 * .route-transition fade-up re-fires on every navigation. Scan pages
 * bypass AppLayout entirely, so they're never animated this way (their
 * timing is field-validated and must not compete with route motion).
 */
function PageContent({ children }: { children: ReactNode }) {
  const location = useLocation()
  return (
    <div key={location.pathname} className="route-transition">
      {children}
    </div>
  )
}

function AppLayoutInner({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const { isOpen, close } = useMobileSidebar()

  useEffect(() => {
    if (!user) return
    connectSocket()
    return () => { disconnectSocket() }
  }, [user])

  return (
    <div className="app-layout">
      <Sidebar />

      {/* Mobile backdrop overlay */}
      <div
        className={['sidebar-mobile-overlay', isOpen ? 'sidebar-mobile-overlay--visible' : ''].filter(Boolean).join(' ')}
        onClick={close}
      />

      <div className="app-content">
        <SlaAlertBanner />
        <PageContent>{children}</PageContent>
      </div>
    </div>
  )
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MobileSidebarProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </MobileSidebarProvider>
  )
}
