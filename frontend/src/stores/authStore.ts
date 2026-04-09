import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { UserRole } from '@dom/shared'

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  tenantId: string
}

interface AuthState {
  user: AuthUser | null
  setUser: (user: AuthUser | null) => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      isAuthenticated: () => get().user !== null,
    }),
    {
      name: 'auth-storage',
      // Only persist the user object — not the functions
      partialize: (state) => ({ user: state.user }),
    },
  ),
)
