import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import Login from './pages/Login'
import Inbound from './pages/Inbound'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuthStore } from './stores/authStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

// Placeholder pages — will be replaced in later phases
function PlaceholderPage({ title }: { title: string }) {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  return (
    <div style={{ padding: 32 }}>
      <h2>{title}</h2>
      <p>
        Logged in as: <strong>{user?.username}</strong> ({user?.role})
      </p>
      <button
        onClick={async () => {
          await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
          setUser(null)
        }}
      >
        Logout
      </button>
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
                <Inbound />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picker-admin"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PICKER_ADMIN]}>
                <PlaceholderPage title="Picker Admin" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/packer-admin"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.PACKER_ADMIN]}>
                <PlaceholderPage title="Packer Admin" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/picker"
            element={
              <ProtectedRoute allowedRoles={[UserRole.PICKER]}>
                <PlaceholderPage title="Picker Panel" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/packer"
            element={
              <ProtectedRoute allowedRoles={[UserRole.PACKER]}>
                <PlaceholderPage title="Packer Panel" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                <PlaceholderPage title="User Management" />
              </ProtectedRoute>
            }
          />
          <Route
            path="/unauthorized"
            element={<PlaceholderPage title="403 — Forbidden" />}
          />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
