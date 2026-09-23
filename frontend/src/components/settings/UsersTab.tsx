import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UserRole } from '@dom/shared'
import { api } from '../../api/client'
import { ROLE_CONFIG, ROLE_SECTIONS, type AppUser } from './roleConfig'
import { AddUserModal, DeleteConfirmModal, EditUserModal } from './UserModals'
import { IconEdit, IconMail, IconPlus, IconSearch, IconTrash, IconUndo, IconUser } from './settingsIcons'

// Settings → Users (v2.92.0 redesign). Same data and the same add / edit / remove
// modals as before; adds role counts, search, role + active/inactive filters and
// reactivation of removed (deactivated) users.

type StatusFilter = 'active' | 'inactive' | 'all'

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })

export default function UsersTab({ users, isLoading }: { users: AppUser[]; isLoading: boolean }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [status, setStatus] = useState<StatusFilter>('active')
  const [addRole, setAddRole] = useState<UserRole | null>(null)
  const [editTarget, setEditTarget] = useState<AppUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)

  const refreshUsers = () => {
    qc.invalidateQueries({ queryKey: ['users'] })
    qc.invalidateQueries({ queryKey: ['picker-admin-stats'] })
    qc.invalidateQueries({ queryKey: ['picker-admin-pickers'] })
    qc.invalidateQueries({ queryKey: ['packer-admin-stats'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/users/${userId}`),
    onSuccess: () => { refreshUsers(); setDeleteTarget(null) },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Failed to delete user')
      alert(`Delete failed: ${msg}`)
    },
  })

  const reactivate = useMutation({
    mutationFn: (userId: string) => api.patch(`/users/${userId}`, { isActive: true }),
    onSuccess: refreshUsers,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to reactivate user'
      alert(msg)
    },
  })

  const active = users.filter((u) => u.isActive)
  const inactiveCount = users.length - active.length
  const noEmpId = active.filter((u) => !u.employee).length
  const admins = active.filter((u) => u.role === UserRole.ADMIN)
  const adminsWithEmail = admins.filter((u) => u.email).length

  const activeByRole = useMemo(() => {
    const m = new Map<string, number>()
    for (const u of active) m.set(u.role, (m.get(u.role) ?? 0) + 1)
    return m
  }, [active])

  const needle = q.trim().toLowerCase()
  const visible = users.filter((u) => {
    if (status === 'active' && !u.isActive) return false
    if (status === 'inactive' && u.isActive) return false
    if (roleFilter && u.role !== roleFilter) return false
    if (needle) {
      const hay = `${u.username} ${u.email ?? ''} ${u.employee?.empNo ?? ''} ${ROLE_CONFIG[u.role]?.label ?? ''}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
  const filtering = !!needle || !!roleFilter || status !== 'active'

  const sections = ROLE_SECTIONS.map((s) => ({
    ...s,
    cards: s.roles
      .filter((r) => !roleFilter || r === roleFilter)
      .map((role) => ({ role, users: visible.filter((u) => u.role === role) }))
      .filter((c) => !filtering || c.users.length > 0),
  })).filter((s) => s.cards.length > 0)

  if (isLoading) {
    return <div className="set-loading"><span className="spinner spinner-sm" /> Loading users…</div>
  }

  return (
    <div className="set-tab">
      <div className="set-stats">
        <Stat label="Active users" value={active.length} hint={`${activeByRole.size} roles in use`} tone="blue" />
        <Stat label="Removed users" value={inactiveCount} hint="deactivated · can be reactivated" tone="slate"
          onClick={inactiveCount ? () => setStatus('inactive') : undefined} />
        <Stat label="No employee ID" value={noEmpId} hint="not linked to Employee Schedule" tone={noEmpId ? 'amber' : 'green'} />
        <Stat label="Report emails" value={`${adminsWithEmail}/${admins.length}`} hint="admins receiving nightly reports" tone="teal" />
      </div>

      <div className="set-role-chips" role="group" aria-label="Filter by role">
        {ROLE_SECTIONS.flatMap((s) => s.roles).map((role) => {
          const cfg = ROLE_CONFIG[role]
          const on = roleFilter === role
          return (
            <button
              key={role}
              type="button"
              className={`set-role-chip${on ? ' is-on' : ''}`}
              style={{ ['--role' as string]: cfg.color, ['--role-bg' as string]: cfg.badgeBg }}
              onClick={() => setRoleFilter(on ? '' : role)}
              aria-pressed={on}
            >
              <i aria-hidden="true" />
              {cfg.pluralLabel}
              <b>{activeByRole.get(role) ?? 0}</b>
            </button>
          )
        })}
      </div>

      <div className="set-toolbar">
        <label className="set-search">
          <IconSearch />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search username, email or employee ID" aria-label="Search users" />
        </label>
        <div className="set-seg" role="group" aria-label="Status">
          {(['active', 'inactive', 'all'] as StatusFilter[]).map((s) => (
            <button key={s} type="button" className={status === s ? 'is-on' : ''} onClick={() => setStatus(s)} aria-pressed={status === s}>
              {s === 'active' ? 'Active' : s === 'inactive' ? 'Removed' : 'All'}
            </button>
          ))}
        </div>
        {filtering && (
          <button type="button" className="set-clear" onClick={() => { setQ(''); setRoleFilter(''); setStatus('active') }}>Clear filters</button>
        )}
      </div>

      {sections.length === 0 && <div className="set-empty">No users match these filters.</div>}

      {sections.map((section) => (
        <section key={section.title} className="set-section">
          <header className="set-section-head">
            <h3>{section.title}</h3>
            <p>{section.desc}</p>
          </header>
          <div className="set-role-grid">
            {section.cards.map(({ role, users: list }) => (
              <RoleCard
                key={role}
                role={role}
                users={list}
                onAdd={() => setAddRole(role)}
                onEdit={setEditTarget}
                onDelete={setDeleteTarget}
                onReactivate={(u) => reactivate.mutate(u.id)}
                reactivatingId={reactivate.isPending ? reactivate.variables ?? null : null}
              />
            ))}
          </div>
        </section>
      ))}

      {addRole && (
        <AddUserModal role={addRole} onClose={() => setAddRole(null)} onSuccess={() => qc.invalidateQueries({ queryKey: ['users'] })} />
      )}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['users'] })
            // the Employee ID edits the Employee Schedule link too
            qc.invalidateQueries({ queryKey: ['emp'] })
          }}
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
    </div>
  )
}

function Stat({ label, value, hint, tone, onClick }: {
  label: string; value: number | string; hint: string; tone: 'blue' | 'slate' | 'amber' | 'green' | 'teal'; onClick?: () => void
}) {
  const body = (
    <>
      <span>{label}</span>
      <b>{value}</b>
      <small>{hint}</small>
    </>
  )
  return onClick
    ? <button type="button" className={`set-stat set-stat--${tone} is-clickable`} onClick={onClick}>{body}</button>
    : <div className={`set-stat set-stat--${tone}`}>{body}</div>
}

function RoleCard({ role, users, onAdd, onEdit, onDelete, onReactivate, reactivatingId }: {
  role: UserRole
  users: AppUser[]
  onAdd: () => void
  onEdit: (u: AppUser) => void
  onDelete: (u: AppUser) => void
  onReactivate: (u: AppUser) => void
  reactivatingId: string | null
}) {
  const cfg = ROLE_CONFIG[role]
  return (
    <article className="set-role-card" style={{ ['--role' as string]: cfg.color, ['--role-bg' as string]: cfg.badgeBg, ['--role-ink' as string]: cfg.badgeText }}>
      <header className="set-role-head">
        <span className="set-role-icon"><IconUser /></span>
        <h4>{cfg.pluralLabel}</h4>
        <span className="set-role-count">{users.length}</span>
        <button type="button" className="set-role-add" onClick={onAdd} aria-label={`Add ${cfg.label}`}>
          <IconPlus /> Add
        </button>
      </header>
      {users.length === 0 ? (
        <p className="set-role-empty">No {cfg.pluralLabel.toLowerCase()} yet.</p>
      ) : (
        <ul className="set-user-list">
          {users.map((u) => (
            <li key={u.id} className={u.isActive ? '' : 'is-inactive'}>
              <span className="set-avatar" aria-hidden="true">{u.username.slice(0, 2).toUpperCase()}</span>
              <div className="set-user-main">
                <div className="set-user-name">
                  <b>{u.username}</b>
                  {u.employee
                    ? <span className="set-chip">ID {u.employee.empNo}</span>
                    : <span className="set-chip set-chip--warn">No employee ID</span>}
                  {!u.isActive && <span className="set-chip set-chip--muted">Removed</span>}
                </div>
                {cfg.hasEmail ? (
                  <small className={u.email ? 'set-user-mail' : 'set-user-mail is-missing'}>
                    <IconMail /> {u.email ?? 'No email — not receiving reports'}
                  </small>
                ) : (
                  <small>Added {fmtDate(u.createdAt)}{u.createdBy ? ` · by ${u.createdBy.username}` : ''}</small>
                )}
              </div>
              <div className="set-user-actions">
                {u.isActive ? (
                  <>
                    <button type="button" className="set-icon-btn" onClick={() => onEdit(u)} title={`Edit ${u.username}`} aria-label={`Edit ${u.username}`}><IconEdit /></button>
                    <button type="button" className="set-icon-btn set-icon-btn--danger" onClick={() => onDelete(u)} title={`Remove ${u.username}`} aria-label={`Remove ${u.username}`}><IconTrash /></button>
                  </>
                ) : (
                  <button type="button" className="set-text-btn" onClick={() => onReactivate(u)} disabled={reactivatingId === u.id}>
                    <IconUndo /> {reactivatingId === u.id ? 'Reactivating…' : 'Reactivate'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
