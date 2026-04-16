import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useAuthStore, AuthUser } from '../stores/authStore'

function getScanRoute(role: string): string {
  switch (role) {
    case 'ADMIN':
    case 'INBOUND_ADMIN':  return '/inbound-scan'
    case 'PICKER_ADMIN':   return '/picker-admin-scan'
    case 'PACKER_ADMIN':   return '/packer-admin'
    case 'PICKER':         return '/picker'
    case 'PACKER':         return '/packer'
    default:               return '/unauthorized'
  }
}

function ScanIcon() {
  return (
    <div style={{
      width: 56, height: 56,
      background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
      borderRadius: '16px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: '20px',
      boxShadow: '0 8px 24px rgba(59,130,246,0.35)',
    }}>
      <svg width="28" height="28" viewBox="0 0 72 72" fill="none">
        <path d="M36 16 L54 26 L36 36 L18 26 Z"
              fill="rgba(255,255,255,0.22)" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        <path d="M18 26 L18 46 L36 56 L36 36 Z"
              fill="rgba(255,255,255,0.12)" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        <path d="M54 26 L54 46 L36 56 L36 36 Z"
              fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        <line x1="39" y1="41" x2="52" y2="34.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9" />
        <line x1="39" y1="46" x2="52" y2="39.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.6" />
      </svg>
    </div>
  )
}

export default function ScanLogin() {
  const navigate = useNavigate()
  const setUser = useAuthStore((s) => s.setUser)
  const existingUser = useAuthStore((s) => s.user)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [focusField, setFocusField] = useState<'username' | 'password' | null>(null)

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
        username,
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
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #f0f6ff 0%, #f8fafc 60%, #f3f0ff 100%)',
      padding: '24px 20px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        <ScanIcon />

        <h1 style={{
          margin: '0 0 4px',
          fontSize: '22px',
          fontWeight: 800,
          color: '#0f172a',
          letterSpacing: '-0.4px',
          textAlign: 'center',
        }}>
          Scan Station
        </h1>
        <p style={{
          margin: '0 0 28px',
          fontSize: '14px',
          color: '#64748b',
          textAlign: 'center',
        }}>
          Sign in to access your station
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex', flexDirection: 'column', gap: '14px',
            width: '100%',
          }}
        >
          {/* Username */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{
              fontSize: '11px', fontWeight: 700, color: '#374151',
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
                  paddingTop: '14px', paddingBottom: '14px',
                  borderRadius: '12px',
                  border: `2px solid ${focusField === 'username' ? '#3b82f6' : '#e2e8f0'}`,
                  background: focusField === 'username' ? '#eff6ff' : '#f8fafc',
                  fontSize: '16px', outline: 'none', color: '#0f172a',
                  width: '100%', boxSizing: 'border-box',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{
              fontSize: '11px', fontWeight: 700, color: '#374151',
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
                  paddingTop: '14px', paddingBottom: '14px',
                  borderRadius: '12px',
                  border: `2px solid ${focusField === 'password' ? '#3b82f6' : '#e2e8f0'}`,
                  background: focusField === 'password' ? '#eff6ff' : '#f8fafc',
                  fontSize: '16px', outline: 'none', color: '#0f172a',
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
              borderRadius: '10px', padding: '11px 14px',
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
              marginTop: '4px', padding: '15px 0',
              borderRadius: '12px', border: 'none',
              background: loading
                ? 'linear-gradient(135deg, #93c5fd, #a5b4fc)'
                : 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
              color: '#fff', fontSize: '16px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(59,130,246,0.4)',
              transition: 'box-shadow 0.2s, background 0.2s',
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 17, height: 17,
                  border: '2px solid rgba(255,255,255,0.4)',
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

        <p style={{ marginTop: '28px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' }}>
          DOM — Dynamic Order Management
        </p>
      </div>
    </div>
  )
}
