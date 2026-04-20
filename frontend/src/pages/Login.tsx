import { useState, FormEvent, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserRole } from '@dom/shared'
import { api } from '../api/client'
import { useAuthStore, AuthUser } from '../stores/authStore'
import { setLoginRedirect } from '../lib/loginRedirect'

const HANDHELD_ROUTES = ['/inbound-scan', '/picker-admin-scan', '/picker', '/packer']

// Mirrors the allowedRoles on each <ProtectedRoute> in App.tsx. Keep in sync.
const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/':                  [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  '/dashboard':         [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  '/picker-admin':      [UserRole.ADMIN, UserRole.PICKER_ADMIN],
  '/packer-admin':      [UserRole.ADMIN, UserRole.PACKER_ADMIN],
  '/outbound':          [UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN],
  '/archive':           [UserRole.ADMIN],
  '/reports':           [UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN],
  '/settings':          [UserRole.ADMIN],
  '/inbound-scan':      [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  '/picker-admin-scan': [UserRole.ADMIN, UserRole.PICKER_ADMIN],
  '/picker':            [UserRole.PICKER],
  '/packer':            [UserRole.PACKER],
  '/sales':             [UserRole.SALES_AGENT, UserRole.ADMIN],
  '/sales/entry':       [UserRole.SALES_AGENT, UserRole.ADMIN],
  '/sales/orders':      [UserRole.SALES_AGENT, UserRole.ADMIN],
  '/marketing-report':  [UserRole.ADMIN],
}

function canAccess(path: string, role: UserRole): boolean {
  const allowed = ROUTE_ROLES[path]
  return allowed ? allowed.includes(role) : true
}

function DomLogo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" rx="18" fill="url(#logoGrad)" />
      <path d="M36 16 L54 26 L36 36 L18 26 Z"
            fill="rgba(255,255,255,0.18)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 26 L18 46 L36 56 L36 36 Z"
            fill="rgba(255,255,255,0.10)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M54 26 L54 46 L36 56 L36 36 Z"
            fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      <line x1="39" y1="41" x2="52" y2="34.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.85" />
      <line x1="39" y1="46" x2="52" y2="39.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.55" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextRoute = searchParams.get('next') ?? null
  const isHandheld = nextRoute !== null && HANDHELD_ROUTES.includes(nextRoute)
  const setUser = useAuthStore((s) => s.setUser)
  const existingUser = useAuthStore((s) => s.user)
  const showSwitchBanner = !!existingUser && !!nextRoute
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusField, setFocusField] = useState<'username' | 'password' | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState<{ username: boolean; password: boolean }>({ username: false, password: false })

  useEffect(() => {
    setLoginRedirect('/login')
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const deviceType = isHandheld ? 'handheld' : 'desktop'
      const { data } = await api.post<{ user: AuthUser }>('/auth/login', { username, password, deviceType })
      setUser(data.user)
      const target = nextRoute && canAccess(nextRoute, data.user.role)
        ? nextRoute
        : getDefaultRoute(data.user.role)
      navigate(target, { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Login failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const usernameValid = touched.username && username.trim().length > 0
  const passwordValid = touched.password && password.length > 0

  return (
    <div className="login-root">
      {/* Animated particle bg (CSS only) */}
      <div className="login-particles" aria-hidden="true">
        <span /><span /><span /><span /><span />
        <span /><span /><span /><span /><span />
        <span /><span /><span /><span /><span />
      </div>

      {/* Toast-style error */}
      {error && (
        <div className="login-toast" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
            className="login-toast-close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      <div className="login-card">
        {/* Brand */}
        <div className="login-card-brand">
          <DomLogo size={56} />
          <div>
            <div className="login-card-brand-title">Dynamic Order Management</div>
            <div className="login-card-brand-sub">Warehouse operations platform</div>
          </div>
        </div>

        <div className="login-card-heading">
          <h2>Welcome back</h2>
          <p>Sign in to access your workspace</p>
        </div>

        {showSwitchBanner && (
          <div className="login-switch-banner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>This area requires a different account. Please sign in to continue.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {/* Username */}
          <div className="login-field">
            <label>Username</label>
            <div className={`login-input-wrap ${focusField === 'username' ? 'login-input-wrap--focus' : ''}`}>
              <span className="login-input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                placeholder="Enter your username"
                onFocus={() => setFocusField('username')}
                onBlur={() => { setFocusField(null); setTouched(t => ({ ...t, username: true })) }}
              />
              {usernameValid && (
                <span className="login-valid-icon" aria-hidden="true">
                  <CheckIcon />
                </span>
              )}
            </div>
          </div>

          {/* Password */}
          <div className="login-field">
            <label>Password</label>
            <div className={`login-input-wrap ${focusField === 'password' ? 'login-input-wrap--focus' : ''}`}>
              <span className="login-input-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                onFocus={() => setFocusField('password')}
                onBlur={() => { setFocusField(null); setTouched(t => ({ ...t, password: true })) }}
              />
              {passwordValid && (
                <span className="login-valid-icon" style={{ right: '38px' }} aria-hidden="true">
                  <CheckIcon />
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="login-eye-btn"
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`shimmer-btn ${loading ? 'shimmer-btn--loading' : ''}`}
          >
            <span className="shimmer-btn-inner">
              {loading ? (
                <>
                  <span className="shimmer-btn-spinner" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </span>
          </button>
        </form>

        <p className="login-card-footer">Dynamic Order Management System</p>
      </div>
    </div>
  )
}

function getDefaultRoute(role: string): string {
  switch (role) {
    case 'ADMIN':
    case 'INBOUND_ADMIN':
      return '/'
    case 'PICKER_ADMIN':
      return '/picker-admin'
    case 'PACKER_ADMIN':
      return '/packer-admin'
    case 'PICKER':
      return '/picker'
    case 'PACKER':
      return '/packer'
    case 'SALES_AGENT':
      return '/sales'
    default:
      return '/dashboard'
  }
}
