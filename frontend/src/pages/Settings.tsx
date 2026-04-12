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
  createdAt: string
  createdBy?: { id: string; username: string } | null
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

// ─── Add User Modal ───────────────────────────────────────────────────────────

function AddUserModal({
  role,
  onClose,
  onSuccess,
}: {
  role: UserRole.PICKER | UserRole.PACKER
  onClose: () => void
  onSuccess: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const roleLabel = role === UserRole.PICKER ? 'Picker' : 'Packer'
  const roleColor = role === UserRole.PICKER ? '#7c3aed' : '#0f766e'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await api.post('/users', { username: username.trim(), password, role })
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
        {/* Header */}
        <div style={{
          background: roleColor,
          padding: '18px 24px',
        }}>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>
            Add New {roleLabel}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '3px' }}>
            The user will be able to log in immediately after creation.
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              minLength={3}
              maxLength={50}
              placeholder="e.g. john_doe"
              style={{
                padding: '10px 14px', borderRadius: '8px',
                border: `1.5px solid ${colors.border}`, fontSize: '14px',
                outline: 'none', color: colors.textPrimary, background: '#f8fafc',
                boxSizing: 'border-box', width: '100%',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              maxLength={100}
              placeholder="Min. 6 characters"
              style={{
                padding: '10px 14px', borderRadius: '8px',
                border: `1.5px solid ${colors.border}`, fontSize: '14px',
                outline: 'none', color: colors.textPrimary, background: '#f8fafc',
                boxSizing: 'border-box', width: '100%',
              }}
            />
          </div>

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
              type="button"
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
              type="submit"
              disabled={loading}
              style={{
                flex: 2, padding: '10px', fontSize: '13px', fontWeight: 700,
                background: loading ? '#c4b5fd' : roleColor,
                color: '#fff', border: 'none', borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}
            >
              {loading && <span className="spinner spinner-sm" style={{ borderTopColor: '#fff' }} />}
              Add {roleLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  user,
  onConfirm,
  onClose,
  loading,
}: {
  user: AppUser
  onConfirm: () => void
  onClose: () => void
  loading: boolean
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
              onClick={onConfirm}
              disabled={loading}
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

// ─── User Card (one per role) ─────────────────────────────────────────────────

function UserRoleCard({
  role,
  users,
  onAdd,
  onDelete,
}: {
  role: UserRole.PICKER | UserRole.PACKER
  users: AppUser[]
  onAdd: (role: UserRole.PICKER | UserRole.PACKER) => void
  onDelete: (user: AppUser) => void
}) {
  const isPicker = role === UserRole.PICKER
  const label = isPicker ? 'Pickers' : 'Packers'
  const headerBg = isPicker ? '#7c3aed' : '#0f766e'
  const badgeBg = isPicker ? '#ede9fe' : '#ccfbf1'
  const badgeText = isPicker ? '#6d28d9' : '#115e59'

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
      {/* Card header */}
      <div style={{
        background: headerBg,
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 30, height: 30,
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}>
            <UserIcon />
          </div>
          <span style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>{label}</span>
          <span style={{
            background: 'rgba(255,255,255,0.22)',
            borderRadius: '20px', padding: '2px 10px',
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
            background: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', fontSize: '12px', fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <PlusIcon /> Add
        </button>
      </div>

      {/* User list */}
      <div style={{ flex: 1 }}>
        {users.length === 0 ? (
          <div style={{
            padding: '32px 18px', textAlign: 'center',
            color: colors.textMuted, fontSize: '13px',
          }}>
            No {label.toLowerCase()} yet. Add one above.
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Avatar */}
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: badgeBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700, color: badgeText, flexShrink: 0,
                }}>
                  {u.username.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>
                    {u.username}
                  </div>
                  <div style={{ fontSize: '11px', color: colors.textMuted }}>
                    Added {new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {u.createdBy ? ` · by ${u.createdBy.username}` : ''}
                  </div>
                </div>
              </div>
              <button
                onClick={() => onDelete(u)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: '7px',
                  background: 'transparent', border: `1px solid ${colors.border}`,
                  color: '#94a3b8', cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
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
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Settings() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [addRole, setAddRole] = useState<UserRole.PICKER | UserRole.PACKER | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)

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
      setDeleteTarget(null)
    },
  })

  const activeUsers = allUsers.filter((u) => u.isActive)
  const pickers = activeUsers.filter((u) => u.role === UserRole.PICKER)
  const packers = activeUsers.filter((u) => u.role === UserRole.PACKER)

  return (
    <PageShell
      icon={SettingsIcon}
      title="Settings"
      subtitle={`${user?.username} · Admin`}
    >
      {/* Section title */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
          User Management
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: colors.textSecondary }}>
          Add or remove pickers and packers. Changes take effect immediately.
        </p>
      </div>

      {isLoading ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '40px 0', color: colors.textMuted, fontSize: '13px',
        }}>
          <span className="spinner spinner-sm" />
          Loading users...
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px',
        }}>
          <UserRoleCard
            role={UserRole.PICKER}
            users={pickers}
            onAdd={setAddRole}
            onDelete={setDeleteTarget}
          />
          <UserRoleCard
            role={UserRole.PACKER}
            users={packers}
            onAdd={setAddRole}
            onDelete={setDeleteTarget}
          />
        </div>
      )}

      {/* Add User Modal */}
      {addRole && (
        <AddUserModal
          role={addRole}
          onClose={() => setAddRole(null)}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      {/* Delete Confirm Modal */}
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
