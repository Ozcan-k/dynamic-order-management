import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore, AuthUser } from '../stores/authStore'
import { setLoginRedirect } from '../lib/loginRedirect'
import LoginBrandPanel, { BrandFeature } from '../components/auth/LoginBrandPanel'

function getScanRoute(role: string): string {
  switch (role) {
    case 'ADMIN':
    case 'INBOUND_ADMIN':  return '/inbound-scan'
    case 'PICKER_ADMIN':   return '/picker-admin-scan'
    case 'PACKER_ADMIN':   return '/packer-admin-scan'
    case 'PICKER':         return '/picker'
    case 'PACKER':         return '/packer'
    case 'STOCK_KEEPER':   return '/stock/scan'
    case 'RETURN_SCANNER': return '/returns/scan'
    case 'OUTBOUND_ADMIN': return '/outbound/scan'
    default:               return '/unauthorized'
  }
}

const FEATURES: BrandFeature[] = [
  { title: 'Straight to your station', text: 'Your role decides the screen — no menus to dig through.', icon: <><polyline points="9 18 15 12 9 6" /></> },
  { title: 'Built for handhelds', text: 'Big touch targets and barcode scanning on the floor.', icon: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="7" y1="12" x2="17" y2="12" /></> },
  { title: 'Back here on sign-out', text: 'This device returns to the scan sign-in when you log out.', icon: <><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></> },
]

export default function ScanLogin() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const existingUser = useAuthStore((s) => s.user)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusField, setFocusField] = useState<'username' | 'password' | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Remember that this device entered via /scan so logout/401 returns here.
  useEffect(() => {
    setLoginRedirect('/scan')
  }, [])

  // Already logged in → redirect immediately
  useEffect(() => {
    if (existingUser) {
      navigate(getScanRoute(existingUser.role), { replace: true })
    }
  }, [existingUser, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.post<{ user: AuthUser }>('/auth/login', {
        username: username.trim(),
        password,
        deviceType: 'handheld',
      })
      setUser(data.user)
      navigate(getScanRoute(data.user.role), { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Invalid username or password.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-root">
      <LoginBrandPanel
        tag="Scan station"
        headline={<>Pick up a device,<br /><span>start scanning.</span></>}
        lede="Sign in on this handheld to open your station — inbound, picking, packing, stock, returns or outbound."
        features={FEATURES}
      />

      <main className="login-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-eyebrow">Handheld sign in</span>
            <h2>Scan Station</h2>
            <p>Sign in to open your station.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {/* Username */}
            <div className="login-field">
              <label htmlFor="scan-username">Username</label>
              <div className={`login-input-wrap ${focusField === 'username' ? 'login-input-wrap--focus' : ''}`}>
                <span className="login-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <input
                  id="scan-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  autoFocus
                  required
                  placeholder="Enter your username"
                  onFocus={() => setFocusField('username')}
                  onBlur={() => setFocusField(null)}
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label htmlFor="scan-password">Password</label>
              <div className={`login-input-wrap login-input-wrap--pw ${focusField === 'password' ? 'login-input-wrap--focus' : ''}`}>
                <span className="login-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="scan-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  onFocus={() => setFocusField('password')}
                  onBlur={() => setFocusField(null)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="login-eye-btn"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-inline-error" role="alert">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

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
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </span>
            </button>
          </form>

          <div className="login-card-footer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Trouble signing in? Ask your supervisor or administrator to reset your password.</span>
          </div>
        </div>
        <p className="login-copyright">© {new Date().getFullYear()} Dynamic Order Management</p>
      </main>
    </div>
  )
}
