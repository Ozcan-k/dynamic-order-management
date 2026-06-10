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

const blankForm: EmployeeInput = {
  department: EmpDepartment.ADMINISTRATIVE,
  firstName: '',
  lastName: '',
  startDate: todayStr(),
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
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['emp', 'employees'] })
    qc.invalidateQueries({ queryKey: ['emp', 'week'] })
    qc.invalidateQueries({ queryKey: ['emp', 'report'] })
  }

  const createMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => { invalidate(); setForm(blankForm); setError(null) },
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Failed to add employee'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, input }: { id: string; input: EmployeeInput }) => updateEmployee(id, input),
    onSuccess: () => { invalidate(); setEditing(null); setError(null) },
    onError: (e: any) => setError(e?.response?.data?.error ?? 'Failed to update employee'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => { invalidate(); setToDelete(null) },
  })

  const canSubmit = form.firstName.trim() && form.lastName.trim() && form.startDate

  function handleAdd() {
    if (!canSubmit) return
    createMut.mutate(form)
  }

  const grouped = EMP_DEPARTMENT_ORDER.map((dept) => ({
    dept,
    rows: (employees ?? []).filter((e) => e.department === dept),
  }))
  const total = employees?.length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ── Add form ── */}
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border}`,
        borderRadius: radius.xl, boxShadow: shadow.card, padding: '20px',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
          Add Employee
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(150px, 1fr) auto', gap: '12px', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Department</label>
            <select
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value as EmpDepartment })}
              style={inputStyle}
            >
              {EMP_DEPARTMENT_ORDER.map((d) => (
                <option key={d} value={d}>{EMP_DEPARTMENT_LABEL[d]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>First Name</label>
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="First name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Last name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!canSubmit || createMut.isPending}
            style={{
              padding: '9px 20px', borderRadius: radius.md, border: 'none',
              background: canSubmit ? colors.primary : colors.border,
              color: canSubmit ? '#fff' : colors.textMuted,
              fontSize: '13px', fontWeight: 600,
              cursor: canSubmit ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', height: 38,
            }}
          >
            {createMut.isPending ? 'Adding…' : '+ Add Employee'}
          </button>
        </div>
        {error && !editing && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: colors.danger }}>{error}</div>
        )}
      </div>

      {/* ── Grouped list ── */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: colors.textSecondary }}>Loading employees…</div>
      ) : total === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px', color: colors.textSecondary,
          background: colors.surface, border: `1px dashed ${colors.borderStrong}`, borderRadius: radius.xl,
        }}>
          No employees yet. Add your first employee above.
        </div>
      ) : (
        grouped.filter((g) => g.rows.length > 0).map((g) => {
          const ds = DEPT_STYLE[g.dept]
          return (
            <div key={g.dept} style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: radius.xl, boxShadow: shadow.card, overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px', background: ds.band, borderBottom: `1px solid ${colors.border}`,
              }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: ds.bandText, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {EMP_DEPARTMENT_LABEL[g.dept]}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: ds.bandText, opacity: 0.8 }}>
                  {g.rows.length} {g.rows.length === 1 ? 'employee' : 'employees'}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                      {['Employee ID', 'Name', 'Department', 'Start Date', 'Actions'].map((h, i) => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: i === 4 ? 'right' : 'left',
                          fontSize: '11px', fontWeight: 700, color: colors.textSecondary,
                          textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((emp, i) => (
                      <tr key={emp.id} style={{
                        background: i % 2 === 0 ? colors.surface : colors.surfaceAlt,
                        borderBottom: `1px solid ${colors.border}`,
                      }}>
                        <td style={{ padding: '10px 16px', fontWeight: 700, color: ds.accent, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          #{emp.empNo}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                              background: ds.soft, color: ds.bandText,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', fontWeight: 700,
                            }}>{initials(emp.firstName, emp.lastName)}</span>
                            <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                              {emp.firstName} {emp.lastName}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', color: colors.textSecondary }}>
                          {EMP_DEPARTMENT_LABEL[emp.department]}
                        </td>
                        <td style={{ padding: '10px 16px', color: colors.textSecondary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {fullDate(emp.startDate)}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => { setEditing(emp); setError(null) }}
                            style={actionBtn(colors.info, colors.infoLight)}
                          >Edit</button>
                          <button
                            onClick={() => setToDelete(emp)}
                            style={{ ...actionBtn(colors.danger, colors.dangerLight), marginLeft: 8 }}
                          >Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
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

function actionBtn(color: string, bg: string): React.CSSProperties {
  return {
    padding: '5px 12px', fontSize: '12px', fontWeight: 600,
    borderRadius: radius.sm, border: `1.5px solid ${color}33`,
    background: bg, color, cursor: 'pointer',
  }
}

// ─── Edit modal ──────────────────────────────────────────────────────────────
function EditModal({ employee, busy, error, onSave, onCancel }: {
  employee: EmpEmployeeDTO
  busy: boolean
  error: string | null
  onSave: (input: EmployeeInput) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<EmployeeInput>({
    department: employee.department,
    firstName: employee.firstName,
    lastName: employee.lastName,
    startDate: employee.startDate,
  })
  const canSave = form.firstName.trim() && form.lastName.trim() && form.startDate

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>
            Edit Employee #{employee.empNo}
          </h3>
          <p style={{ margin: '0 0 18px', fontSize: '12px', color: colors.textSecondary }}>
            Update the employee's department, name, or start date.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Department</label>
              <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value as EmpDepartment })} style={inputStyle}>
                {EMP_DEPARTMENT_ORDER.map((d) => <option key={d} value={d}>{EMP_DEPARTMENT_LABEL[d]}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>First Name</label>
                <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Last Name</label>
                <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} style={inputStyle} />
            </div>
            {error && <div style={{ fontSize: '12px', color: colors.danger }}>{error}</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
            <button onClick={onCancel} style={{
              padding: '8px 18px', borderRadius: radius.md, border: `1.5px solid ${colors.border}`,
              background: colors.surface, color: colors.textSecondary, fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>Cancel</button>
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
