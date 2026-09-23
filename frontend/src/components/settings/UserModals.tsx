import { useState, FormEvent } from 'react'
import { UserRole } from '@dom/shared'
import { api } from '../../api/client'
import { colors } from '../../theme'
import { ROLE_CONFIG, type AppUser } from './roleConfig'

// Add / Edit / Remove user modals — unchanged behaviour, moved from pages/Settings.tsx (v2.92.0).

const inputStyle: React.CSSProperties = {
  padding: '10px 14px', borderRadius: '8px',
  border: `1.5px solid ${colors.border}`, fontSize: '14px',
  outline: 'none', color: colors.textPrimary, background: '#f8fafc',
  boxSizing: 'border-box', width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: '#374151',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}

export function AddUserModal({
  role,
  onClose,
  onSuccess,
}: {
  role: UserRole
  onClose: () => void
  onSuccess: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const cfg = ROLE_CONFIG[role]

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body: Record<string, unknown> = { username: username.trim(), password, role }
      if (cfg.hasEmail && email.trim()) body.email = email.trim()
      await api.post('/users', body)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to create user'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ background: cfg.color, padding: '18px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>
            Add New {cfg.label}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '3px' }}>
            The user will be able to log in immediately after creation.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required autoFocus minLength={3} maxLength={50}
              placeholder="e.g. john_doe"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required minLength={6} maxLength={100}
              placeholder="Min. 6 characters"
              style={inputStyle}
            />
          </div>

          {cfg.hasEmail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>
                Email <span style={{ fontWeight: 400, color: colors.textSecondary, textTransform: 'none', letterSpacing: 0 }}>(optional — for nightly reports)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                placeholder="e.g. admin@company.com"
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px',
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: '13px', color: '#dc2626', fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button" onClick={onClose}
              style={{
                flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600,
                background: '#f1f5f9', color: colors.textSecondary,
                border: 'none', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              style={{
                flex: 2, padding: '10px', fontSize: '13px', fontWeight: 700,
                background: loading ? '#94a3b8' : cfg.color,
                color: '#fff', border: 'none', borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {loading && <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />}
              Add {cfg.label}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

export function EditUserModal({
  user,
  onClose,
  onSuccess,
}: {
  user: AppUser
  onClose: () => void
  onSuccess: () => void
}) {
  const cfg = ROLE_CONFIG[user.role]
  const [username, setUsername] = useState(user.username)
  const [email, setEmail] = useState(user.email ?? '')
  const [newPassword, setNewPassword] = useState('')
  const currentEmpNo = user.employee?.empNo != null ? String(user.employee.empNo) : ''
  const [employeeNo, setEmployeeNo] = useState(currentEmpNo)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const body: Record<string, unknown> = {}
      if (username.trim() !== user.username) body.username = username.trim()
      if (cfg.hasEmail) body.email = email.trim() || null
      if (newPassword.trim().length >= 6) body.password = newPassword.trim()
      if (employeeNo.trim() !== currentEmpNo) {
        body.employeeNo = employeeNo.trim() === '' ? null : Number(employeeNo.trim())
      }
      if (Object.keys(body).length === 0) { onClose(); return }
      await api.patch(`/users/${user.id}`, body)
      onSuccess()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update user'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ background: cfg.color, padding: '18px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>Edit {cfg.label}</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '3px' }}>
            Current username: {user.username}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required autoFocus minLength={3} maxLength={50}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={labelStyle}>
              New Password <span style={{ fontWeight: 400, color: colors.textSecondary, textTransform: 'none', letterSpacing: 0 }}>(leave blank to keep current)</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              maxLength={100}
              placeholder="Enter new password"
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={labelStyle}>Employee ID</label>
            <input
              type="text"
              inputMode="numeric"
              value={employeeNo}
              onChange={(e) => setEmployeeNo(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="e.g. 1004"
              style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }}
            />
            <div style={{ fontSize: '11px', color: colors.textSecondary }}>
              The ID from Employee Schedule. For pickers/packers, Warehouse Report uses it to apply attendance (half days, days off). Leave blank to unlink.
            </div>
          </div>

          {cfg.hasEmail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={labelStyle}>
                Email <span style={{ fontWeight: 400, color: colors.textSecondary, textTransform: 'none', letterSpacing: 0 }}>(for nightly reports)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                placeholder="e.g. admin@company.com"
                style={inputStyle}
              />
              <div style={{ fontSize: '11px', color: colors.textSecondary }}>
                Leave blank to stop receiving nightly reports.
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px',
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: '13px', color: '#dc2626', fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="button" onClick={onClose}
              style={{
                flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600,
                background: '#f1f5f9', color: colors.textSecondary,
                border: 'none', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              style={{
                flex: 2, padding: '10px', fontSize: '13px', fontWeight: 700,
                background: loading ? '#94a3b8' : cfg.color,
                color: '#fff', border: 'none', borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {loading && <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

export function DeleteConfirmModal({
  user, onConfirm, onClose, loading,
}: {
  user: AppUser; onConfirm: () => void; onClose: () => void; loading: boolean
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '380px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, marginBottom: '8px' }}>
            Remove User?
          </div>
          <div style={{ fontSize: '13px', color: colors.textSecondary, marginBottom: '20px' }}>
            <strong style={{ color: colors.textPrimary }}>{user.username}</strong> will be deactivated and can no longer log in.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '10px', fontSize: '13px', fontWeight: 600,
                background: '#f1f5f9', color: colors.textSecondary,
                border: 'none', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm} disabled={loading}
              style={{
                flex: 1, padding: '10px', fontSize: '13px', fontWeight: 700,
                background: loading ? '#fca5a5' : '#dc2626',
                color: '#fff', border: 'none', borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {loading && <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />}
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
