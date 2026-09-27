import { useState, FormEvent, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { UserRole } from '@dom/shared'
import { api } from '../api/client'
import { useAuthStore, AuthUser } from '../stores/authStore'
import { setLoginRedirect } from '../lib/loginRedirect'

const HANDHELD_ROUTES = ['/inbound-scan', '/picker-admin-scan', '/picker', '/packer', '/stock/scan', '/returns/scan', '/outbound/scan']

// Mirrors the allowedRoles on each <ProtectedRoute> in App.tsx. Keep in sync.
const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/':                  [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  '/dashboard':         [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  '/picker-admin':      [UserRole.ADMIN, UserRole.PICKER_ADMIN],
  '/packer-admin':      [UserRole.ADMIN, UserRole.PACKER_ADMIN],
  '/packed-report':     [UserRole.ADMIN, UserRole.PACKER_ADMIN, UserRole.WAREHOUSE_ADMIN],
  '/outbound':          [UserRole.ADMIN, UserRole.OUTBOUND_ADMIN],
  '/outbound/report':   [UserRole.ADMIN, UserRole.OUTBOUND_ADMIN],
  '/outbound/scan':     [UserRole.ADMIN, UserRole.OUTBOUND_ADMIN],
  '/archive':           [UserRole.ADMIN],
  '/reports':           [UserRole.ADMIN, UserRole.INBOUND_ADMIN, UserRole.PICKER_ADMIN, UserRole.PACKER_ADMIN],
  '/settings':          [UserRole.ADMIN],
  '/inbound-scan':      [UserRole.ADMIN, UserRole.INBOUND_ADMIN],
  '/picker-admin-scan': [UserRole.ADMIN, UserRole.PICKER_ADMIN],
  '/picker':            [UserRole.PICKER],
  '/packer':            [UserRole.PACKER],
  '/returns/scan':      [UserRole.ADMIN, UserRole.RETURN_SCANNER],
  '/sales':             [UserRole.SALES_AGENT],
  '/sales/entry':       [UserRole.SALES_AGENT],
  '/sales/orders':      [UserRole.SALES_AGENT],
  '/marketing-report':  [UserRole.ADMIN],
  '/incident-report':   [UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER],
  '/employee-schedule': [UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER],
  '/accounting':          [UserRole.ADMIN, UserRole.ACCOUNTANT],
  '/accounting/sales':    [UserRole.ADMIN, UserRole.ACCOUNTANT],
  '/accounting/expenses': [UserRole.ADMIN, UserRole.ACCOUNTANT],
  '/accounting/transactions': [UserRole.ADMIN, UserRole.ACCOUNTANT],
  '/accounting/contacts': [UserRole.ADMIN, UserRole.ACCOUNTANT],
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

const FLOW_STAGES = [
  { label: 'Inbound', icon: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /> },
  { label: 'Pick', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
  { label: 'Pack', icon: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></> },
  { label: 'Outbound', icon: <><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></> },
]

const FEATURES = [
  { title: 'Live floor tracking', text: 'Every picker and packer, their queue and pace — in real time.', icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /> },
  { title: 'SLA escalation', text: 'D0–D4 ageing keeps late parcels visible before they slip.', icon: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></> },
  { title: 'Scan-first handhelds', text: 'Barcode workflows built for the warehouse floor.', icon: <><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><line x1="7" y1="12" x2="17" y2="12" /></> },
]

function useManilaTime() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  const time = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })
  const date = now.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short' })
  return { time, date }
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
      const { data } = await api.post<{ user: AuthUser }>('/auth/login', { username: username.trim(), password, deviceType })
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

  const manila = useManilaTime()
  const usernameValid = touched.username && username.trim().length > 0
  const passwordValid = touched.password && password.length > 0

  return (
    <div className="login-root">
      {/* Brand panel — desktop: left half; mobile: compact header */}
      <aside className="login-brand">
        <div className="login-brand-grid" aria-hidden="true" />
        <div className="login-brand-glow" aria-hidden="true" />

        <div className="login-brand-top">
          <DomLogo size={44} />
          <div>
            <div className="login-brand-name">Dynamic Order Management</div>
            <div className="login-brand-tag">Warehouse operations platform</div>
          </div>
        </div>

        <div className="login-brand-body">
          <h1 className="login-brand-headline">
            Every parcel,<br />
            <span>from dock to dispatch.</span>
          </h1>
          <p className="login-brand-lede">
            One live view of inbound, picking, packing and outbound — so the whole floor moves at the same pace.
          </p>

          <div className="login-flow" aria-hidden="true">
            <div className="login-flow-track">
              <span className="login-flow-parcel" />
              <span className="login-flow-parcel login-flow-parcel--2" />
            </div>
            {FLOW_STAGES.map((s, i) => (
              <div className="login-flow-stage" key={s.label} style={{ animationDelay: `${i * 1.8}s` }}>
                <span className="login-flow-node">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {s.icon}
                  </svg>
                </span>
                <span className="login-flow-label">{s.label}</span>
              </div>
            ))}
          </div>

          <ul className="login-features">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className="login-feature-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {f.icon}
                  </svg>
                </span>
                <div>
                  <div className="login-feature-title">{f.title}</div>
                  <div className="login-feature-text">{f.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="login-brand-foot">
          <span className="login-live-dot" aria-hidden="true" />
          <span>Manila</span>
          <span className="login-brand-clock">{manila.time}</span>
          <span className="login-brand-sep" aria-hidden="true">·</span>
          <span>{manila.date}</span>
        </div>
      </aside>

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

      <main className="login-panel">
        <div className="login-card">
          <div className="login-card-heading">
            <span className="login-eyebrow">Secure sign in</span>
            <h2>Welcome back</h2>
            <p>Enter your credentials to open your workspace.</p>
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
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
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
              <div className={`login-input-wrap login-input-wrap--pw ${focusField === 'password' ? 'login-input-wrap--focus' : ''}`}>
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

          <div className="login-card-footer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Trouble signing in? Ask your administrator to reset your password.</span>
          </div>
        </div>
        <p className="login-copyright">© {new Date().getFullYear()} Dynamic Order Management</p>
      </main>
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
    case 'OUTBOUND_ADMIN':
      return '/outbound'
    case 'RETURN_SCANNER':
      return '/returns/scan'
    case 'SALES_AGENT':
      return '/sales'
    case 'INCIDENT_REPORTER':
      return '/incident-report'
    case 'ACCOUNTANT':
      return '/accounting'
    default:
      return '/dashboard'
  }
}
