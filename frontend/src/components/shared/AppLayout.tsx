import type { ReactNode } from 'react'
import Sidebar from './Sidebar'

interface AppLayoutProps {
  children: ReactNode
}

/**
 * AppLayout — desktop layout wrapper: sidebar on left, content on right.
 * Used for all non-mobile roles (ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN).
 * PICKER and PACKER use their own mobile layout — do not wrap with AppLayout.
 */
export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-content">
        {children}
      </div>
    </div>
  )
}
