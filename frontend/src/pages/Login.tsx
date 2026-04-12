import { useState, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore, AuthUser } from '../stores/authStore'

const HANDHELD_ROUTES = ['/inbound-scan', '/picker-admin-scan', '/picker', '/packer']

function DomLogo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="72" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="logoGradSm" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" rx="18" fill="url(#logoGrad)" />
      {/* Top face of box */}
      <path d="M36 16 L54 26 L36 36 L18 26 Z"
            fill="rgba(255,255,255,0.18)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Left face */}
      <path d="M18 26 L18 46 L36 56 L36 36 Z"
            fill="rgba(255,255,255,0.10)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Right face */}
      <path d="M54 26 L54 46 L36 56 L36 36 Z"
            fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Scan line on right face */}
      <line x1="39" y1="41" x2="52" y2="34.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.85" />
      <line x1="39" y1="46" x2="52" y2="39.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.55" />
    </svg>
  )
}

function SmallLogo() {
  return (
    <div style={{
      width: 36, height: 36,
      background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
      borderRadius: '9px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="20" height="20" viewBox="0 0 72 72" fill="none">
        <path d="M36 16 L54 26 L36 36 L18 26 Z"
              fill="rgba(255,255,255,0.2)" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        <path d="M18 26 L18 46 L36 56 L36 36 Z"
              fill="rgba(255,255,255,0.12)" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        <path d="M54 26 L54 46 L36 56 L36 36 Z"
              fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

const features = [
  {
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="8 17 12 21 16 17" /><line x1="12" y1="3" x2="12" y2="21" />
        <rect x="3" y="3" width="7" height="4" rx="1" /><rect x="14" y="3" width="7" height="4" rx="1" />
      </svg>
    ),
    label: 'Auto platform detection',
  },
  {
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
    label: 'Real-time SLA tracking',
  },
  {
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    label: 'Multi-role access control',
  },
]

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextRoute = searchParams.get('next') ?? null
  const isHandheld = nextRoute !== null && HANDHELD_ROUTES.includes(nextRoute)
  const setUser = useAuthStore((s) => s.setUser)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusField, setFocusField] = useState<'username' | 'password' | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const deviceType = isHandheld ? 'handheld' : 'desktop'
      const { data } = await api.post<{ user: AuthUser }>('/auth/login', { username, password, deviceType })
      setUser(data.user)
      navigate(nextRoute ?? getDefaultRoute(data.user.role))
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Login failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-root">
      {/* Left — branding */}
      <div className="login-brand">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px' }}>
          <DomLogo size={76} />
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              margin: 0,
              fontSize: '30px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.6px',
              lineHeight: 1.2,
            }}>
              Dynamic Order<br />Management
            </h1>
          </div>
        </div>

        <div className="login-brand-features" style={{
          display: 'flex', flexDirection: 'column', gap: '10px',
          width: '100%', maxWidth: '300px',
        }}>
          {features.map(({ icon, label }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '13px',
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: '12px', padding: '12px 16px',
            }}>
              <span style={{ color: '#93c5fd', display: 'flex', flexShrink: 0 }}>{icon}</span>
              <span style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: 500 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div className="login-form-panel">
        <div style={{ width: '100%', maxWidth: '360px' }}>
          {/* Brand mark */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            marginBottom: '28px',
          }}>
            <SmallLogo />
            <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>
              DOM System
            </span>
          </div>

          <div style={{ marginBottom: '28px' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '26px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
              Welcome back
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
              Sign in to access your workspace
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Username */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: '11.5px', fontWeight: 600, color: '#374151',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Username
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: focusField === 'username' ? '#3b82f6' : '#94a3b8',
                  display: 'flex', transition: 'color 0.15s', pointerEvents: 'none',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  onBlur={() => setFocusField(null)}
                  style={{
                    paddingLeft: '42px', paddingRight: '16px',
                    paddingTop: '13px', paddingBottom: '13px',
                    borderRadius: '10px',
                    border: `2px solid ${focusField === 'username' ? '#3b82f6' : '#e2e8f0'}`,
                    background: focusField === 'username' ? '#eff6ff' : '#f8fafc',
                    fontSize: '15px', outline: 'none', color: '#0f172a',
                    width: '100%', boxSizing: 'border-box',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: '11.5px', fontWeight: 600, color: '#374151',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                  color: focusField === 'password' ? '#3b82f6' : '#94a3b8',
                  display: 'flex', transition: 'color 0.15s', pointerEvents: 'none',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  onFocus={() => setFocusField('password')}
                  onBlur={() => setFocusField(null)}
                  style={{
                    paddingLeft: '42px', paddingRight: '16px',
                    paddingTop: '13px', paddingBottom: '13px',
                    borderRadius: '10px',
                    border: `2px solid ${focusField === 'password' ? '#3b82f6' : '#e2e8f0'}`,
                    background: focusField === 'password' ? '#eff6ff' : '#f8fafc',
                    fontSize: '15px', outline: 'none', color: '#0f172a',
                    width: '100%', boxSizing: 'border-box',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                />
              </div>
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: '10px', padding: '10px 14px',
                fontSize: '13px', color: '#dc2626', fontWeight: 500,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '6px', padding: '14px 0',
                borderRadius: '10px', border: 'none',
                background: loading
                  ? 'linear-gradient(135deg, #93c5fd, #a5b4fc)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                color: '#fff', fontSize: '15px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: loading ? 'none' : '0 4px 18px rgba(59,130,246,0.38)',
                transition: 'box-shadow 0.2s, background 0.2s',
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.7s linear infinite',
                  }} />
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
            </button>
          </form>

          <p style={{ marginTop: '32px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
            Dynamic Order Management System
          </p>
        </div>
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
    default:
      return '/dashboard'
  }
}
