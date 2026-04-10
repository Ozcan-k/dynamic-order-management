import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore, AuthUser } from '../stores/authStore'

export default function Login() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { data } = await api.post<{ user: AuthUser }>('/auth/login', { username, password })
      setUser(data.user)
      navigate(getDefaultRoute(data.user.role))
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
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '56px', marginBottom: '12px' }}>📦</div>
          <h1 className="login-brand-title" style={{
            margin: '0 0 10px',
            fontSize: '32px',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.5px',
            lineHeight: 1.2,
          }}>
            Dynamic Order<br />Management
          </h1>
          <p className="login-brand-subtitle" style={{
            margin: 0,
            fontSize: '15px',
            color: '#94a3b8',
            maxWidth: '320px',
            lineHeight: 1.6,
          }}>
            Real-time warehouse operations — inbound scanning, picking, packing, and outbound tracking.
          </p>
        </div>

        <div className="login-brand-features" style={{
          display: 'flex', flexDirection: 'column', gap: '12px',
          width: '100%', maxWidth: '320px',
        }}>
          {[
            { icon: '🔍', text: 'Auto platform detection' },
            { icon: '⚡', text: 'Real-time SLA tracking' },
            { icon: '👥', text: 'Multi-role access control' },
          ].map(({ icon, text }) => (
            <div key={text} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '10px', padding: '12px 16px',
            }}>
              <span style={{ fontSize: '18px' }}>{icon}</span>
              <span style={{ color: '#cbd5e1', fontSize: '14px', fontWeight: 500 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div className="login-form-panel">
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
              Sign in
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
              Enter your credentials to access the panel
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: '12px', fontWeight: 600, color: '#374151',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                placeholder="Enter your username"
                style={{
                  padding: '13px 16px', borderRadius: '10px',
                  border: '2px solid #e2e8f0', fontSize: '15px',
                  outline: 'none', color: '#0f172a', width: '100%',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{
                fontSize: '12px', fontWeight: 600, color: '#374151',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="Enter your password"
                style={{
                  padding: '13px 16px', borderRadius: '10px',
                  border: '2px solid #e2e8f0', fontSize: '15px',
                  outline: 'none', color: '#0f172a', width: '100%',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => (e.target.style.borderColor = '#3b82f6')}
                onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: '8px', padding: '10px 14px',
                fontSize: '13px', color: '#dc2626', fontWeight: 500,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '4px', padding: '14px 0',
                borderRadius: '10px', border: 'none',
                background: loading ? '#93c5fd' : '#2563eb',
                color: '#fff', fontSize: '15px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                width: '100%', transition: 'background 0.15s',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>

          <p style={{ marginTop: '28px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
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
      return '/dashboard'
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
