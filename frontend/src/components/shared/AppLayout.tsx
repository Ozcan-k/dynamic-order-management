import { useEffect, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import SlaAlertBanner from '../SlaAlertBanner'
import { connectSocket, disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/authStore'
import { MobileSidebarProvider, useMobileSidebar } from '../../lib/mobileSidebar'

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
        {children}
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
