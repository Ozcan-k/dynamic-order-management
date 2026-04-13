import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import Login from './pages/Login'
import Inbound from './pages/Inbound'
import InboundScan from './pages/InboundScan'
import PickerAdmin from './pages/PickerAdmin'
import PickerAdminScan from './pages/PickerAdminScan'
import PickerMobile from './pages/PickerMobile'
import PackerAdmin from './pages/PackerAdmin'
import PackerMobile from './pages/PackerMobile'
import Outbound from './pages/Outbound'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Archive from './pages/Archive'
import Reports from './pages/Reports'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/shared/AppLayout'
import { useAuthStore } from './stores/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

// Placeholder pages — will be replaced in later phases
function PlaceholderPage({ title }: { title: string }) {
  const user = useAuthStore((s) => s.user)
  return (
    <div className="panel-root">
      <header className="panel-header">
        <div className="panel-header-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
              {title}
            </h1>
            <span style={{
              fontSize: '11px', fontWeight: 600, color: '#f59e0b',
              background: '#fef9c3', padding: '2px 8px', borderRadius: '9999px',
            }}>
              Coming Soon
            </span>
          </div>
          <span style={{ fontSize: '13px', color: '#64748b' }}>
            {user?.username} · {user?.role?.replace(/_/g, ' ')}
          </span>
        </div>
      </header>
      <main className="panel-body">
        <div className="empty-state">
          <div className="empty-state-icon">🚧</div>
          <p className="empty-state-title">This page is under construction</p>
          <p className="empty-state-desc">This section will be available in a future release.</p>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN]}>
                <AppLayout><Inbound /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/picker-admin"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PICKER_ADMIN]}>
                <AppLayout><PickerAdmin /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/packer-admin"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PACKER_ADMIN]}>
                <AppLayout><PackerAdmin /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/outbound"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN]}>
                <AppLayout><Outbound /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/archive"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AppLayout><Archive /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN]}>
                <AppLayout><Reports /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <AppLayout><Settings /></AppLayout>
              </ProtectedRoute>
            }
          />
          {/* Handheld scan pages — no sidebar, role-protected */}
          <Route
            path="/inbound-scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN]}>
                <InboundScan />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picker-admin-scan"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PICKER_ADMIN]}>
                <PickerAdminScan />
              </ProtectedRoute>
            }
          />
          {/* Mobile routes — no sidebar */}
          <Route
            path="/picker"
            element={
              <ProtectedRoute allowedRoles={[UserRole.PICKER]}>
                <PickerMobile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/packer"
            element={
              <ProtectedRoute allowedRoles={[UserRole.PACKER]}>
                <PackerMobile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/unauthorized"
            element={<PlaceholderPage title="403 — Forbidden" />}
          />
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.INBOUND_ADMIN]}>
                <AppLayout><Dashboard /></AppLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
