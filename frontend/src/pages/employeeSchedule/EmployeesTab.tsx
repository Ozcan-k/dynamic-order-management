import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  EmpDepartment,
  EMP_DEPARTMENT_LABEL,
  EMP_DEPARTMENT_ORDER,
  type EmpEmployeeDTO,
} from '@dom/shared'
import { colors, radius, shadow } from '../../theme'
import ConfirmModal from '../../components/shared/ConfirmModal'
import {
  listEmployees, createEmployee, updateEmployee, deleteEmployee, type EmployeeInput,
} from '../../api/employeeSchedule'
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
  }
}

export default function EmployeesTab() {
  const qc = useQueryClient()
  const { data: employees, isLoading } = useQuery({
    queryKey: ['emp', 'employees'],
    queryFn: listEmployees,
    staleTime: 30_000,
  })

  const [form, setForm] = useState<EmployeeInput>(blankForm)
  const [editing, setEditing] = useState<EmpEmployeeDTO | null>(null)
  const [toDelete, setToDelete] = useState<EmpEmployeeDTO | null>(null)
  const [toDeactivate, setToDeactivate] = useState<EmpEmployeeDTO | null>(null)
  const [toReactivate, setToReactivate] = useState<EmpEmployeeDTO | null>(null)
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['emp', 'employees'] })
    qc.invalidateQueries({ queryKey: ['emp', 'week'] })
    qc.invalidateQueries({ queryKey: ['emp', 'report'] })
  }

  const createMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => { invalidate(); setForm(blankForm()); setError(null) },
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Failed to add employee'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EmployeeInput }) => updateEmployee(id, input),
    onSuccess: () => { invalidate(); setEditing(null); setToDeactivate(null); setToReactivate(null); setError(null) },
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Failed to update employee'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => { invalidate(); setToDelete(null) },
  })

  const canSubmit = !!(form.firstName?.trim() && form.lastName?.trim() && form.startDate)
  function handleAdd() {
    if (!canSubmit) return
    createMut.mutate({ ...form, isActive: true, leaveDate: '' })
  }

  const all = employees ?? []
  const active = all.filter((e) => e.isActive)
  const inactive = all.filter((e) => !e.isActive).sort((a, b) => (b.leaveDate ?? '').localeCompare(a.leaveDate ?? ''))
  const activeByDept = EMP_DEPARTMENT_ORDER.map((dept) => ({ dept, rows: active.filter((e) => e.department === dept) }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Add form ── */}
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.xl, boxShadow: shadow.card, padding: '20px' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>Add Employee</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
          <Field label="Department">
            <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value as EmpDepartment })} style={inputStyle}>
              {EMP_DEPARTMENT_ORDER.map((d) => <option key={d} value={d}>{EMP_DEPARTMENT_LABEL[d]}</option>)}
            </select>
          </Field>
          <Field label="First Name *">
            <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" style={inputStyle} />
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
          <button onClick={handleAdd} disabled={!canSubmit || createMut.isPending} style={{
            padding: '9px 22px', borderRadius: radius.md, border: 'none',
            background: canSubmit ? colors.primary : colors.border, color: canSubmit ? '#fff' : colors.textMuted,
            fontSize: '13px', fontWeight: 600, cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}>{createMut.isPending ? 'Adding…' : '+ Add Employee'}</button>
          <span style={{ fontSize: '11px', color: colors.textMuted }}>* required · new employees are added as Active</span>
          {error && !editing && !toDeactivate && <span style={{ fontSize: '12px', color: colors.danger }}>{error}</span>}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: colors.textSecondary }}>Loading employees…</div>
      ) : all.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: colors.textSecondary, background: colors.surface, border: `1px dashed ${colors.borderStrong}`, borderRadius: radius.xl }}>
          No employees yet. Add your first employee above.
        </div>
      ) : (
        <>
          {/* ── Active employees (grouped by department) ── */}
          {activeByDept.filter((g) => g.rows.length > 0).map((g) => {
            const ds = DEPT_STYLE[g.dept]
            return (
              <div key={g.dept} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.xl, boxShadow: shadow.card, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: ds.band, borderBottom: `1px solid ${colors.border}` }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: ds.bandText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{EMP_DEPARTMENT_LABEL[g.dept]}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: ds.bandText, opacity: 0.8 }}>{g.rows.length} {g.rows.length === 1 ? 'employee' : 'employees'}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                        {['Employee ID', 'Name', 'Contact', 'Start Date', 'Actions'].map((h, i) => (
                          <th key={h} style={thStyle(i === 4 ? 'right' : 'left')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((emp, i) => (
                        <tr key={emp.id} style={{ background: i % 2 === 0 ? colors.surface : colors.surfaceAlt, borderBottom: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: ds.accent, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>#{emp.empNo}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={avatarStyle(ds)}>{initials(emp.firstName, emp.lastName)}</span>
                              <span style={{ fontWeight: 600, color: colors.textPrimary }}>{emp.firstName} {emp.lastName}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 16px', color: colors.textSecondary, whiteSpace: 'nowrap' }}>{emp.contactNumber || <span style={{ color: colors.textMuted }}>—</span>}</td>
                          <td style={{ padding: '10px 16px', color: colors.textSecondary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fullDate(emp.startDate)}</td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => { setEditing(emp); setError(null) }} style={actionBtn(colors.info, colors.infoLight)}>Edit</button>
                            <button onClick={() => { setToDeactivate(emp); setError(null) }} style={{ ...actionBtn('#b45309', '#fffbeb'), marginLeft: 8 }}>Set Inactive</button>
                            <button onClick={() => setToDelete(emp)} style={{ ...actionBtn(colors.danger, colors.dangerLight), marginLeft: 8 }}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* ── Inactive / former employees ── */}
          {inactive.length > 0 && (
            <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.xl, boxShadow: shadow.card, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: '#f1f5f9', borderBottom: `1px solid ${colors.border}` }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Inactive / Former Employees
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>{inactive.length} {inactive.length === 1 ? 'employee' : 'employees'}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                      {['Employee ID', 'Name', 'Department', 'Start Date', 'Leave Date', 'Actions'].map((h, i) => (
                        <th key={h} style={thStyle(i === 5 ? 'right' : 'left')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inactive.map((emp, i) => {
                      const ds = DEPT_STYLE[emp.department]
                      return (
                        <tr key={emp.id} style={{ background: i % 2 === 0 ? colors.surface : colors.surfaceAlt, borderBottom: `1px solid ${colors.border}`, opacity: 0.92 }}>
                          <td style={{ padding: '10px 16px', fontWeight: 700, color: colors.textMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>#{emp.empNo}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ ...avatarStyle(ds), filter: 'grayscale(0.5)' }}>{initials(emp.firstName, emp.lastName)}</span>
                              <span style={{ fontWeight: 600, color: colors.textSecondary }}>{emp.firstName} {emp.lastName}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 16px', color: colors.textSecondary }}>{EMP_DEPARTMENT_LABEL[emp.department]}</td>
                          <td style={{ padding: '10px 16px', color: colors.textSecondary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fullDate(emp.startDate)}</td>
                          <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: radius.full, background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: '12px' }}>
                              {emp.leaveDate ? fullDate(emp.leaveDate) : '—'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => { setEditing(emp); setError(null) }} style={actionBtn(colors.info, colors.infoLight)}>Edit</button>
                            <button onClick={() => setToReactivate(emp)} style={{ ...actionBtn(colors.success, '#ecfdf5'), marginLeft: 8 }}>Reactivate</button>
                            <button onClick={() => setToDelete(emp)} style={{ ...actionBtn(colors.danger, colors.dangerLight), marginLeft: 8 }}>Delete</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <EditModal
          employee={editing}
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
          message={`Move #${toReactivate.empNo} ${toReactivate.firstName} ${toReactivate.lastName} back to the active roster?`}
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
          message={`Delete #${toDelete.empNo} ${toDelete.firstName} ${toDelete.lastName}?`}
          detail="This permanently removes the employee and all of their schedule entries."
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
function thStyle(align: 'left' | 'right'): React.CSSProperties {
  return {
    padding: '10px 16px', textAlign: align, fontSize: '11px', fontWeight: 700, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
  }
}
function actionBtn(color: string, bg: string): React.CSSProperties {
  return { padding: '5px 12px', fontSize: '12px', fontWeight: 600, borderRadius: radius.sm, border: `1.5px solid ${color}33`, background: bg, color, cursor: 'pointer' }
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
            Mark <strong>#{employee.empNo} {employee.firstName} {employee.lastName}</strong> as left the company. Enter their leave date — they’ll move to the Inactive list.
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
function EditModal({ employee, busy, error, onSave, onCancel }: {
  employee: EmpEmployeeDTO; busy: boolean; error: string | null; onSave: (input: EmployeeInput) => void; onCancel: () => void
}) {
  const [form, setForm] = useState<EmployeeInput>(dtoToInput(employee))
  const canSave = !!(form.firstName?.trim() && form.lastName?.trim() && form.startDate && (form.isActive || form.leaveDate))

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ padding: '20px', maxHeight: '82vh', overflowY: 'auto' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>Edit Employee #{employee.empNo}</h3>
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
