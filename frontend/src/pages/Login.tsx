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
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Dynamic Order Management</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Username</label>
            <input
              style={styles.input}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
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

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f0f2f5',
  },
  card: {
    background: '#fff',
    borderRadius: 8,
    padding: '40px 36px',
    width: 360,
    boxShadow: '0 2px 16px rgba(0,0,0,0.10)',
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 28,
    color: '#1a1a2e',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#555',
  },
  input: {
    padding: '10px 12px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    fontSize: 14,
    outline: 'none',
  },
  button: {
    marginTop: 8,
    padding: '11px 0',
    borderRadius: 6,
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#dc2626',
    fontSize: 13,
    margin: 0,
  },
}
