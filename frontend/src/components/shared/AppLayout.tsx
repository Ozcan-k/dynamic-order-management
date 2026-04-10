import { useEffect, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import SlaAlertBanner from '../SlaAlertBanner'
import { connectSocket, disconnectSocket } from '../../lib/socket'
import { useAuthStore } from '../../stores/authStore'

interface AppLayoutProps {
  children: ReactNode
}

/**
 * AppLayout — desktop layout wrapper: sidebar on left, content on right.
 * Used for all non-mobile roles (ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN).
 * PICKER and PACKER use their own mobile layout — do not wrap with AppLayout.
 */
export default function AppLayout({ children }: AppLayoutProps) {
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user) return
    connectSocket()
    return () => {
      disconnectSocket()
    }
  }, [user])

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-content">
        <SlaAlertBanner />
        {children}
      </div>
    </div>
  )
}
