import { Fragment, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  EmpDepartment,
  EMP_DEPARTMENT_LABEL,
  EMP_DEPARTMENT_ORDER,
  type EmpEmployeeDTO,
} from '@dom/shared'
import { colors, radius } from '../../theme'
import ConfirmModal from '../../components/shared/ConfirmModal'
import {
  listEmployees, createEmployee, updateEmployee, deleteEmployee, listLinkableUsers, getAttendanceSummaries, apiErrorMessage, type EmployeeInput, type LinkableUser,
} from '../../api/employeeSchedule'
import EmployeeProfile from './EmployeeProfile'
import { tenure } from './scheduleUi'
import { DEPT_STYLE, initials, fullDate, todayStr } from './config'

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: radius.md,
  border: `1.5px solid ${colors.border}`,
  fontSize: '13px',
  color: colors.textPrimary,
  outline: 'none',
  background: colors.surface,
  width: '100%',
}
const labelStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: colors.textSecondary,
  textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px', display: 'block',
}

function blankForm(): EmployeeInput {
  return {
    department: EmpDepartment.ADMINISTRATIVE,
    firstName: '',
    lastName: '',
    startDate: todayStr(),
    contactNumber: '',
    email: '',
    address: '',
    birthday: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    isActive: true,
    leaveDate: '',
  }
}

/** Build an editable input payload from an existing employee record. */
function dtoToInput(e: EmpEmployeeDTO): EmployeeInput {
  return {
    department: e.department,
    firstName: e.firstName,
    lastName: e.lastName,
    startDate: e.startDate,
    contactNumber: e.contactNumber ?? '',
    email: e.email ?? '',
    address: e.address ?? '',
    birthday: e.birthday ?? '',
    emergencyContactName: e.emergencyContactName ?? '',
    emergencyContactNumber: e.emergencyContactNumber ?? '',
    isActive: e.isActive,
    leaveDate: e.leaveDate ?? '',
    // always echo the links back so Set Inactive / Reactivate never drop them
    userIds: e.userIds,
  }
}

/** Departments whose staff log in as pickers / packers. */
const LINKABLE_ROLE: Partial<Record<EmpDepartment, 'PICKER' | 'PACKER'>> = {
  [EmpDepartment.PICKER]: 'PICKER',
  [EmpDepartment.PACKER]: 'PACKER',
}

/** 'WAREHOUSE_ADMIN' → 'Warehouse Admin' */
const roleLabel = (role: string) => role.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

type StatusView = 'active' | 'inactive' | 'all'

export default function EmployeesTab({ readOnly = false }: { readOnly?: boolean }) {
  const qc = useQueryClient()
  const { data: employees, isLoading } = useQuery({
    queryKey: ['emp', 'employees'],
    queryFn: listEmployees,
    staleTime: 30_000,
  })

  const { data: linkable } = useQuery({
    queryKey: ['emp', 'linkable-users'],
    queryFn: listLinkableUsers,
    staleTime: 60_000,
  })
  const usernameById = new Map((linkable ?? []).map((u) => [u.id, u.username]))

  // last-30-days attendance per employee (read-only, v2.93.0)
  const { data: summaries } = useQuery({
    queryKey: ['emp', 'summary', 30],
    queryFn: () => getAttendanceSummaries(30),
    staleTime: 60_000,
  })

  const [form, setForm] = useState<EmployeeInput>(blankForm)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<EmpEmployeeDTO | null>(null)
  const [toDelete, setToDelete] = useState<EmpEmployeeDTO | null>(null)
  const [toDeactivate, setToDeactivate] = useState<EmpEmployeeDTO | null>(null)
  const [toReactivate, setToReactivate] = useState<EmpEmployeeDTO | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState<EmpDepartment | 'ALL'>('ALL')
  const [view, setView] = useState<StatusView>('active')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['emp', 'employees'] })
    qc.invalidateQueries({ queryKey: ['emp', 'week'] })
    qc.invalidateQueries({ queryKey: ['emp', 'report'] })
    qc.invalidateQueries({ queryKey: ['emp', 'linkable-users'] })
    qc.invalidateQueries({ queryKey: ['emp', 'history'] })
    qc.invalidateQueries({ queryKey: ['emp', 'summary'] })
    // the Warehouse Report target/employee reports read the link
    qc.invalidateQueries({ queryKey: ['reports'] })
  }

  const createMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => { invalidate(); setForm(blankForm()); setError(null); setShowAdd(false) },
    onError: (e: unknown) => setError(apiErrorMessage(e, 'Failed to add employee')),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EmployeeInput }) => updateEmployee(id, input),
    onSuccess: () => { invalidate(); setEditing(null); setToDeactivate(null); setToReactivate(null); setError(null) },
    onError: (e: unknown) => setError(apiErrorMessage(e, 'Failed to update employee')),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => { invalidate(); setToDelete(null); setProfileId(null) },
  })

  const canSubmit = !!(form.firstName?.trim() && form.lastName?.trim() && form.startDate)
  function handleAdd() {
    if (!canSubmit) return
    createMut.mutate({ ...form, isActive: true, leaveDate: '' })
  }

  const all = employees ?? []
  const active = all.filter((e) => e.isActive)
  const inactiveCount = all.length - active.length
  const unlinkedFloor = active.filter((e) => LINKABLE_ROLE[e.department] && e.userIds.length === 0).length

  // team attendance over the last 30 days (active staff with entries)
  const team = useMemo(() => {
    let worked = 0, expected = 0, absent = 0
    for (const e of active) {
      const s = summaries?.byEmployee[e.id]
      if (!s) continue
      worked += s.present + s.halfDay + s.partialDay
      expected += s.present + s.halfDay + s.partialDay + s.absent
      absent += s.absent
    }
    return { rate: expected ? worked / expected : null, absent }
  }, [active, summaries])

  const needle = search.trim().toLowerCase()
  const rows = all
    .filter((e) => view === 'all' || (view === 'active') === e.isActive)
    .filter((e) => dept === 'ALL' || e.department === dept)
    .filter((e) => !needle || `${e.empNo} ${e.firstName} ${e.lastName} ${e.contactNumber ?? ''} ${e.email ?? ''} ${e.userIds.map((id) => usernameById.get(id) ?? '').join(' ')}`.toLowerCase().includes(needle))
  const byDept = EMP_DEPARTMENT_ORDER
    .map((d) => ({ dept: d, rows: rows.filter((e) => e.department === d) }))
    .filter((g) => g.rows.length > 0)
  const deptCount = (d: EmpDepartment) => all.filter((e) => e.department === d && (view === 'all' || (view === 'active') === e.isActive)).length

  return (
    <div className="es-root">
      {/* ── Summary ── */}
      <div className="ee-stats">
        <div className="ee-stat ee-stat--blue"><span>Active employees</span><b>{active.length}</b><small>{EMP_DEPARTMENT_ORDER.map((d) => [d, active.filter((e) => e.department === d).length] as const).filter(([, n]) => n > 0).map(([d, n]) => `${n} ${EMP_DEPARTMENT_LABEL[d].replace(' Staff', '').toLowerCase()}`).join(' · ') || 'no active staff'}</small></div>
        <div className={`ee-stat ee-stat--${team.rate == null ? 'slate' : team.rate >= 0.95 ? 'green' : team.rate >= 0.85 ? 'amber' : 'red'}`}>
          <span>Attendance · 30 days</span><b>{team.rate == null ? '—' : `${Math.round(team.rate * 100)}%`}</b><small>{team.absent} absence{team.absent === 1 ? '' : 's'} across the team</small>
        </div>
        <button type="button" className={`ee-stat ee-stat--${unlinkedFloor ? 'amber' : 'green'}`} onClick={() => { setView('active'); setDept('ALL') }} title="Pickers / packers without a system login can't get their schedule applied in the Warehouse Report">
          <span>Floor staff without login</span><b>{unlinkedFloor}</b><small>pickers / packers not linked</small>
        </button>
        <button type="button" className="ee-stat ee-stat--slate" onClick={() => setView('inactive')} disabled={!inactiveCount}>
          <span>Former employees</span><b>{inactiveCount}</b><small>inactive · history kept</small>
        </button>
      </div>

      {/* ── Toolbar ── */}
      <div className="es-filters">
        <label className="es-search">
          <SearchIcon />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, phone, login" aria-label="Search employees" />
        </label>
        <div className="es-seg" role="group" aria-label="Department">
          <button type="button" className={dept === 'ALL' ? 'is-on' : ''} aria-pressed={dept === 'ALL'} onClick={() => setDept('ALL')}>All</button>
          {EMP_DEPARTMENT_ORDER.map((d) => (
            <button key={d} type="button" className={dept === d ? 'is-on' : ''} aria-pressed={dept === d} onClick={() => setDept(d)}>
              <i style={{ background: DEPT_STYLE[d].accent }} aria-hidden="true" />{EMP_DEPARTMENT_LABEL[d].replace(' Staff', '')} <b>{deptCount(d)}</b>
            </button>
          ))}
        </div>
        <div className="es-seg" role="group" aria-label="Status">
          {(['active', 'inactive', 'all'] as StatusView[]).map((v) => (
            <button key={v} type="button" className={view === v ? 'is-on' : ''} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'active' ? 'Active' : v === 'inactive' ? 'Former' : 'All'}
            </button>
          ))}
        </div>
        {!readOnly && (
          <button type="button" className="es-btn es-btn--primary ee-add-btn" onClick={() => { setShowAdd((s) => !s); setError(null) }} aria-expanded={showAdd}>
            {showAdd ? 'Close form' : '+ Add employee'}
          </button>
        )}
      </div>

      {/* ── Add form (same fields as before; hidden for read-only roles) ── */}
      {!readOnly && showAdd && (
        <div className="ee-card ee-add">
          <h2>Add employee</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            <Field label="Department">
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value as EmpDepartment })} style={inputStyle}>
                {EMP_DEPARTMENT_ORDER.map((d) => <option key={d} value={d}>{EMP_DEPARTMENT_LABEL[d]}</option>)}
              </select>
            </Field>
            <Field label="First Name *">
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" style={inputStyle} autoFocus />
            </Field>
            <Field label="Last Name *">
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" style={inputStyle} />
            </Field>
            <Field label="Start Date *">
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Contact Number">
              <input value={form.contactNumber ?? ''} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} placeholder="e.g. +63 …" style={inputStyle} />
            </Field>
            <Field label="Email Address">
              <input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@email.com" style={inputStyle} />
            </Field>
            <Field label="Birthday">
              <input type="date" value={form.birthday ?? ''} onChange={(e) => setForm({ ...form, birthday: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Emergency Contact Name">
              <input value={form.emergencyContactName ?? ''} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} placeholder="Full name" style={inputStyle} />
            </Field>
            <Field label="Emergency Contact Number">
              <input value={form.emergencyContactNumber ?? ''} onChange={(e) => setForm({ ...form, emergencyContactNumber: e.target.value })} placeholder="e.g. +63 …" style={inputStyle} />
            </Field>
            <Field label="Address" full>
              <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Home address" style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px', flexWrap: 'wrap' }}>
            <button type="button" className="es-btn es-btn--primary" onClick={handleAdd} disabled={!canSubmit || createMut.isPending}>
              {createMut.isPending ? 'Adding…' : '+ Add Employee'}
            </button>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>* required · the ID is assigned automatically · new employees start as Active</span>
            {error && !editing && !toDeactivate && <span style={{ fontSize: '12px', color: colors.danger }}>{error}</span>}
          </div>
        </div>
      )}

      {/* ── List ── */}
      {isLoading ? (
        <div className="es-empty">Loading employees…</div>
      ) : all.length === 0 ? (
        <div className="es-empty">No employees yet.{readOnly ? '' : ' Use “+ Add employee” to add the first one.'}</div>
      ) : rows.length === 0 ? (
        <div className="es-empty">No employee matches these filters.</div>
      ) : (
        <div className="ee-card ee-list-wrap">
          <table className="ee-list">
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee</th>
                <th>Contact</th>
                <th>With us</th>
                <th title="Last 30 days">Attendance · 30d</th>
                {!readOnly && <th className="act"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {byDept.map((g) => {
                const ds = DEPT_STYLE[g.dept]
                return (
                  <Fragment key={g.dept}>
                    <tr className="ee-band" style={{ ['--dept-bg' as string]: ds.band, ['--dept-ink' as string]: ds.bandText }}>
                      <th colSpan={readOnly ? 5 : 6} scope="rowgroup">{EMP_DEPARTMENT_LABEL[g.dept]} <em>{g.rows.length}</em></th>
                    </tr>
                    {g.rows.map((emp) => {
                      const s = summaries?.byEmployee[emp.id]
                      const rate = s?.attendanceRate
                      return (
                        <tr key={emp.id} className={emp.isActive ? '' : 'is-former'}>
                          <td className="ee-id" style={{ color: emp.isActive ? ds.accent : colors.textMuted }}>{emp.empNo}</td>
                          <td>
                            <button type="button" className="ee-name" onClick={() => setProfileId(emp.id)} title="Open profile">
                              <span style={avatarStyle(ds)}>{initials(emp.firstName, emp.lastName)}</span>
                              <span className="ee-name-main">
                                <b>{emp.firstName} {emp.lastName}</b>
                                <span className="ee-name-sub">
                                  {emp.userIds.filter((id) => usernameById.has(id)).map((id) => (
                                    <em key={id} title="Linked system login — used by Warehouse Report" style={{ background: ds.soft, color: ds.bandText }}>@{usernameById.get(id)}</em>
                                  ))}
                                  {LINKABLE_ROLE[emp.department] && emp.userIds.length === 0 && emp.isActive && <em className="ee-warn">no login linked</em>}
                                  {!emp.isActive && <em className="ee-left">Left {emp.leaveDate ? fullDate(emp.leaveDate) : ''}</em>}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className="ee-contact">
                            {emp.contactNumber || emp.email ? (
                              <>
                                {emp.contactNumber && <span>{emp.contactNumber}</span>}
                                {emp.email && <small>{emp.email}</small>}
                              </>
                            ) : <span className="ee-muted">—</span>}
                          </td>
                          <td className="ee-tenure">
                            <span>{tenure(emp.startDate, emp.isActive ? null : emp.leaveDate)}</span>
                            <small>since {fullDate(emp.startDate)}</small>
                          </td>
                          <td className="ee-att">
                            {s ? (
                              <div className="ee-att-cell">
                                <span className="ee-att-bar" aria-hidden="true">
                                  <i style={{ width: `${Math.round((rate ?? 0) * 100)}%`, background: rate == null ? '#cbd5e1' : rate >= 0.95 ? '#16a34a' : rate >= 0.85 ? '#f59e0b' : '#dc2626' }} />
                                </span>
                                <span className="ee-att-text">
                                  <b>{rate == null ? '—' : `${Math.round(rate * 100)}%`}</b>
                                  <small>{fmtDays(s.workedDays)} worked{s.absent ? ` · ${s.absent} absent` : ''}</small>
                                </span>
                              </div>
                            ) : <span className="ee-muted">No entries</span>}
                          </td>
                          {!readOnly && (
                            <td className="act">
                              <div className="ee-actions">
                                <button type="button" className="es-btn ee-act" onClick={() => { setEditing(emp); setError(null) }}>Edit</button>
                                {emp.isActive
                                  ? <button type="button" className="es-btn ee-act ee-act--warn" onClick={() => { setToDeactivate(emp); setError(null) }}>Set inactive</button>
                                  : <button type="button" className="es-btn ee-act ee-act--ok" onClick={() => setToReactivate(emp)}>Reactivate</button>}
                                <button type="button" className="es-icon-btn ee-act--del" onClick={() => setToDelete(emp)} aria-label={`Delete ${emp.firstName} ${emp.lastName}`} title="Delete permanently">
                                  <TrashIcon />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {profileId && (
        <EmployeeProfile
          employeeId={profileId}
          usernameById={usernameById}
          readOnly={readOnly}
          onEdit={(emp) => { setEditing(emp); setError(null) }}
          onClose={() => setProfileId(null)}
        />
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <EditModal
          employee={editing}
          linkable={linkable ?? []}
          busy={updateMut.isPending}
          error={error}
          onCancel={() => { setEditing(null); setError(null) }}
          onSave={(input) => updateMut.mutate({ id: editing.id, input })}
        />
      )}

      {/* ── Set Inactive (asks for leave date) ── */}
      {toDeactivate && (
        <DeactivateModal
          employee={toDeactivate}
          busy={updateMut.isPending}
          error={error}
          onCancel={() => { setToDeactivate(null); setError(null) }}
          onConfirm={(leaveDate) => updateMut.mutate({ id: toDeactivate.id, input: { ...dtoToInput(toDeactivate), isActive: false, leaveDate } })}
        />
      )}

      {/* ── Reactivate ── */}
      {toReactivate && (
        <ConfirmModal
          title="Reactivate employee?"
          message={`Move ${toReactivate.empNo} ${toReactivate.firstName} ${toReactivate.lastName} back to the active roster?`}
          detail="The leave date will be cleared and the employee will appear in the schedule again."
          confirmLabel="Reactivate"
          tone="primary"
          busy={updateMut.isPending}
          onConfirm={() => updateMut.mutate({ id: toReactivate.id, input: { ...dtoToInput(toReactivate), isActive: true, leaveDate: '' } })}
          onCancel={() => setToReactivate(null)}
        />
      )}

      {/* ── Delete confirm ── */}
      {toDelete && (
        <ConfirmModal
          title="Delete employee?"
          message={`Delete ${toDelete.empNo} ${toDelete.firstName} ${toDelete.lastName}?`}
          detail="This permanently removes the employee and all of their schedule entries. To keep their history, use “Set inactive” instead."
          confirmLabel="Delete"
          tone="danger"
          busy={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}

function fmtDays(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? '' : 's'}`
}

const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
)
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
)

// ─── small bits ──────────────────────────────────────────────────────────────
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div style={full ? { gridColumn: '1 / -1' } : undefined}><label style={labelStyle}>{label}</label>{children}</div>
}
function avatarStyle(ds: typeof DEPT_STYLE[keyof typeof DEPT_STYLE]): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: ds.soft, color: ds.bandText,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
  }
}

// ─── Set-inactive modal (leave date) ─────────────────────────────────────────
function DeactivateModal({ employee, busy, error, onConfirm, onCancel }: {
  employee: EmpEmployeeDTO; busy: boolean; error: string | null; onConfirm: (leaveDate: string) => void; onCancel: () => void
}) {
  const [leaveDate, setLeaveDate] = useState<string>(todayStr())
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>Set Inactive</h3>
          <p style={{ margin: '0 0 18px', fontSize: '12px', color: colors.textSecondary }}>
            Mark <strong>{employee.empNo} {employee.firstName} {employee.lastName}</strong> as left the company. Enter their leave date — they’ll move to the Inactive list.
          </p>
          <label style={labelStyle}>Leave Date *</label>
          <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} style={inputStyle} />
          {error && <div style={{ fontSize: '12px', color: colors.danger, marginTop: '10px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
            <button onClick={onCancel} style={ghostBtn}>Cancel</button>
            <button onClick={() => leaveDate && onConfirm(leaveDate)} disabled={!leaveDate || busy} style={{
              padding: '8px 18px', borderRadius: radius.md, border: 'none',
              background: leaveDate ? '#b45309' : colors.border, color: leaveDate ? '#fff' : colors.textMuted,
              fontSize: '13px', fontWeight: 600, cursor: leaveDate ? 'pointer' : 'not-allowed',
            }}>{busy ? 'Saving…' : 'Set Inactive'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edit modal ──────────────────────────────────────────────────────────────
function EditModal({ employee, linkable, busy, error, onSave, onCancel }: {
  employee: EmpEmployeeDTO; linkable: LinkableUser[]; busy: boolean; error: string | null; onSave: (input: EmployeeInput) => void; onCancel: () => void
}) {
  const [form, setForm] = useState<EmployeeInput>(dtoToInput(employee))
  const linkRole = LINKABLE_ROLE[form.department]
  // every login can be linked (v2.87.0), several per employee (v2.88.0); the department's own role first
  const linkedIds = form.userIds ?? []
  const linkedUsers = linkedIds.map((id) => linkable.find((u) => u.id === id)).filter((u): u is LinkableUser => !!u)
  const linkOptions = linkable
    .filter((u) => !linkedIds.includes(u.id))
    .sort((a, b) => Number(b.role === linkRole) - Number(a.role === linkRole))
  const canSave = !!(form.firstName?.trim() && form.lastName?.trim() && form.startDate && (form.isActive || form.leaveDate))

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ padding: '20px', maxHeight: '82vh', overflowY: 'auto' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>Edit Employee {employee.empNo}</h3>
          <p style={{ margin: '0 0 18px', fontSize: '12px', color: colors.textSecondary }}>Update details, contact info, or employment status.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Department" full>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value as EmpDepartment })} style={inputStyle}>
                {EMP_DEPARTMENT_ORDER.map((d) => <option key={d} value={d}>{EMP_DEPARTMENT_LABEL[d]}</option>)}
              </select>
            </Field>
            <Field label="First Name *"><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputStyle} /></Field>
            <Field label="Last Name *"><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputStyle} /></Field>
            <Field label="Start Date *"><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle} /></Field>
            <Field label="Birthday"><input type="date" value={form.birthday ?? ''} onChange={(e) => setForm({ ...form, birthday: e.target.value })} style={inputStyle} /></Field>
            <Field label="Contact Number"><input value={form.contactNumber ?? ''} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} style={inputStyle} /></Field>
            <Field label="Email Address"><input type="email" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} /></Field>
            <Field label="Address" full><input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} /></Field>
            <Field label="Emergency Contact Name"><input value={form.emergencyContactName ?? ''} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} style={inputStyle} /></Field>
            <Field label="Emergency Contact Number"><input value={form.emergencyContactNumber ?? ''} onChange={(e) => setForm({ ...form, emergencyContactNumber: e.target.value })} style={inputStyle} /></Field>

            <Field label="Status">
              <select value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active', leaveDate: e.target.value === 'active' ? '' : (form.leaveDate || todayStr()) })} style={inputStyle}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            {!form.isActive && (
              <Field label="Leave Date *"><input type="date" value={form.leaveDate ?? ''} onChange={(e) => setForm({ ...form, leaveDate: e.target.value })} style={inputStyle} /></Field>
            )}

            <Field label="Linked system logins" full>
              {linkedUsers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {linkedUsers.map((u) => (
                    <span key={u.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600,
                      color: colors.textPrimary, background: colors.surfaceAlt, border: `1px solid ${colors.border}`,
                      padding: '3px 6px 3px 10px', borderRadius: radius.full,
                    }}>
                      @{u.username} <span style={{ fontWeight: 500, color: colors.textMuted }}>{roleLabel(u.role)}</span>
                      <button
                        type="button"
                        aria-label={`Unlink ${u.username}`}
                        onClick={() => setForm({ ...form, userIds: linkedIds.filter((id) => id !== u.id) })}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textMuted, fontSize: '14px', lineHeight: 1, padding: '0 2px' }}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <select
                value=""
                onChange={(e) => e.target.value && setForm({ ...form, userIds: [...linkedIds, e.target.value] })}
                style={inputStyle}
              >
                <option value="">{linkedUsers.length ? '+ Link another login…' : '— Not linked — pick a login —'}</option>
                {linkOptions.map((u) => {
                  const taken = !!u.linkedEmployeeId && u.linkedEmployeeId !== employee.id
                  return (
                    <option key={u.id} value={u.id} disabled={taken}>
                      @{u.username} ({roleLabel(u.role)}){taken ? ' — linked to another employee' : ''}
                    </option>
                  )
                })}
              </select>
              <span style={{ display: 'block', marginTop: '6px', fontSize: '11.5px', color: colors.textMuted, lineHeight: 1.45 }}>
                The system logins of this employee — one person can have several (e.g. a picker and a packer account). Also settable
                from Settings → Employee ID. Warehouse Report → Performance uses picker/packer links to apply the schedule.
              </span>
            </Field>

          </div>

          {error && <div style={{ fontSize: '12px', color: colors.danger, marginTop: '12px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
            <button onClick={onCancel} style={ghostBtn}>Cancel</button>
            <button onClick={() => canSave && onSave(form)} disabled={!canSave || busy} style={{
              padding: '8px 18px', borderRadius: radius.md, border: 'none',
              background: canSave ? colors.primary : colors.border, color: canSave ? '#fff' : colors.textMuted,
              fontSize: '13px', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed',
            }}>{busy ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 18px', borderRadius: radius.md, border: `1.5px solid ${colors.border}`,
  background: colors.surface, color: colors.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}
