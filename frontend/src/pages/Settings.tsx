import { useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import { useAuthStore } from '../stores/authStore'
import { api } from '../api/client'
import { colors } from '../theme'
import PageShell from '../components/shared/PageShell'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppUser {
  id: string
  username: string
  role: string
  isActive: boolean
  email?: string | null
  createdAt: string
  createdBy?: { id: string; username: string } | null
}

// ─── Role config ──────────────────────────────────────────────────────────────

interface RoleConfig {
  label: string
  pluralLabel: string
  color: string
  badgeBg: string
  badgeText: string
  hasEmail: boolean
}

const ROLE_CONFIG: Record<string, RoleConfig> = {
  [UserRole.ADMIN]: {
    label: 'Admin',
    pluralLabel: 'Admins',
    color: '#1d4ed8',
    badgeBg: '#dbeafe',
    badgeText: '#1e40af',
    hasEmail: true,
  },
  [UserRole.INBOUND_ADMIN]: {
    label: 'Inbound Admin',
    pluralLabel: 'Inbound Admins',
    color: '#b45309',
    badgeBg: '#fef3c7',
    badgeText: '#92400e',
    hasEmail: false,
  },
  [UserRole.PICKER_ADMIN]: {
    label: 'Picker Admin',
    pluralLabel: 'Picker Admins',
    color: '#6d28d9',
    badgeBg: '#ede9fe',
    badgeText: '#5b21b6',
    hasEmail: false,
  },
  [UserRole.PACKER_ADMIN]: {
    label: 'Packer Admin',
    pluralLabel: 'Packer Admins',
    color: '#0e7490',
    badgeBg: '#cffafe',
    badgeText: '#155e75',
    hasEmail: false,
  },
  [UserRole.PICKER]: {
    label: 'Picker',
    pluralLabel: 'Pickers',
    color: '#7c3aed',
    badgeBg: '#ede9fe',
    badgeText: '#6d28d9',
    hasEmail: false,
  },
  [UserRole.PACKER]: {
    label: 'Packer',
    pluralLabel: 'Packers',
    color: '#0f766e',
    badgeBg: '#ccfbf1',
    badgeText: '#115e59',
    hasEmail: false,
  },
}

// ─── Icons ───────────────────────────────────────────────────────────────────

const SettingsIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const UserIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)

const PencilIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const MailIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
)

// ─── Input style helper ───────────────────────────────────────────────────────

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

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({
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

function EditUserModal({
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

function DeleteConfirmModal({
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

// ─── User Role Card ───────────────────────────────────────────────────────────

function UserRoleCard({
  role, users, onAdd, onDelete, onEdit,
}: {
  role: UserRole
  users: AppUser[]
  onAdd: (role: UserRole) => void
  onDelete: (user: AppUser) => void
  onEdit: (user: AppUser) => void
}) {
  const cfg = ROLE_CONFIG[role]

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${colors.border}`,
      borderRadius: '14px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        background: cfg.color, padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 30, height: 30,
            background: 'rgba(255,255,255,0.18)', borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <UserIcon />
          </div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>{cfg.pluralLabel}</span>
          <span style={{
            background: 'rgba(255,255,255,0.22)', borderRadius: '20px', padding: '2px 10px',
            fontSize: '13px', fontWeight: 700, color: '#fff',
          }}>
            {users.length}
          </span>
        </div>
        <button
          onClick={() => onAdd(role)}
          style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '6px 12px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          <PlusIcon /> Add
        </button>
      </div>

      <div style={{ flex: 1 }}>
        {users.length === 0 ? (
          <div style={{ padding: '32px 18px', textAlign: 'center', color: colors.textMuted, fontSize: '13px' }}>
            No {cfg.pluralLabel.toLowerCase()} yet. Add one above.
          </div>
        ) : (
          users.map((u, i) => (
            <div
              key={u.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 18px',
                borderBottom: i < users.length - 1 ? `1px solid #f1f5f9` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', background: cfg.badgeBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, color: cfg.badgeText, flexShrink: 0,
                }}>
                  {u.username.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>
                    {u.username}
                  </div>
                  {cfg.hasEmail ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                      <MailIcon />
                      <span style={{
                        fontSize: '11px',
                        color: u.email ? '#1d4ed8' : colors.textMuted,
                        fontStyle: u.email ? 'normal' : 'italic',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {u.email ?? 'No email — not receiving reports'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: colors.textMuted }}>
                      Added {new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })}
                      {u.createdBy ? ` · by ${u.createdBy.username}` : ''}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={() => onEdit(u)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, borderRadius: '7px',
                    background: 'transparent', border: `1px solid ${colors.border}`,
                    color: '#94a3b8', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#eff6ff'
                    e.currentTarget.style.color = '#1d4ed8'
                    e.currentTarget.style.borderColor = '#bfdbfe'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#94a3b8'
                    e.currentTarget.style.borderColor = colors.border
                  }}
                  title={`Edit ${u.username}`}
                >
                  <PencilIcon />
                </button>
                <button
                  onClick={() => onDelete(u)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, borderRadius: '7px',
                    background: 'transparent', border: `1px solid ${colors.border}`,
                    color: '#94a3b8', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fef2f2'
                    e.currentTarget.style.color = '#dc2626'
                    e.currentTarget.style.borderColor = '#fecaca'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#94a3b8'
                    e.currentTarget.style.borderColor = colors.border
                  }}
                  title={`Remove ${u.username}`}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: '16px', marginTop: '8px' }}>
      <h3 style={{ margin: '0 0 3px', fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: '12px', color: colors.textSecondary }}>{desc}</p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Settings() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [addRole, setAddRole] = useState<UserRole | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [editTarget, setEditTarget] = useState<AppUser | null>(null)

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get<{ users: AppUser[] }>('/users')
      return res.data.users
    },
    refetchInterval: 30_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['picker-admin-stats'] })
      queryClient.invalidateQueries({ queryKey: ['picker-admin-pickers'] })
      queryClient.invalidateQueries({ queryKey: ['packer-admin-stats'] })
      setDeleteTarget(null)
    },
  })

  const activeUsers = allUsers.filter((u) => u.isActive)
  const byRole = (role: UserRole) => activeUsers.filter((u) => u.role === role)

  return (
    <PageShell
      icon={SettingsIcon}
      title="Settings"
      subtitle={`${user?.username} · Admin`}
    >
      {isLoading ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '40px 0', color: colors.textMuted, fontSize: '13px',
        }}>
          <span className="spinner spinner-sm" />
          Loading users...
        </div>
      ) : (
        <>
          <SectionHeader
            title="Admin Users"
            desc="Admin users have access to the web dashboard. Admins with an email address receive nightly reports."
          />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '14px',
            marginBottom: '32px',
          }}>
            <UserRoleCard role={UserRole.ADMIN} users={byRole(UserRole.ADMIN)} onAdd={setAddRole} onDelete={setDeleteTarget} onEdit={setEditTarget} />
            <UserRoleCard role={UserRole.INBOUND_ADMIN} users={byRole(UserRole.INBOUND_ADMIN)} onAdd={setAddRole} onDelete={setDeleteTarget} onEdit={setEditTarget} />
            <UserRoleCard role={UserRole.PICKER_ADMIN} users={byRole(UserRole.PICKER_ADMIN)} onAdd={setAddRole} onDelete={setDeleteTarget} onEdit={setEditTarget} />
            <UserRoleCard role={UserRole.PACKER_ADMIN} users={byRole(UserRole.PACKER_ADMIN)} onAdd={setAddRole} onDelete={setDeleteTarget} onEdit={setEditTarget} />
          </div>

          <SectionHeader
            title="Mobile Users"
            desc="Pickers and packers use the mobile app on handheld devices."
          />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '14px',
          }}>
            <UserRoleCard role={UserRole.PICKER} users={byRole(UserRole.PICKER)} onAdd={setAddRole} onDelete={setDeleteTarget} onEdit={setEditTarget} />
            <UserRoleCard role={UserRole.PACKER} users={byRole(UserRole.PACKER)} onAdd={setAddRole} onDelete={setDeleteTarget} onEdit={setEditTarget} />
          </div>
        </>
      )}

      {addRole && (
        <AddUserModal
          role={addRole}
          onClose={() => setAddRole(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          user={deleteTarget}
          loading={deleteMutation.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </PageShell>
  )
}
