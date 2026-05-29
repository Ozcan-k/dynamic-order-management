import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { IncidentType, Platform } from '@dom/shared'
import {
  useIncidentTypes,
  useSelectableUsers,
  useCreateIncident,
  fetchRememberedFullName,
  lookupTrackingNumber,
  type CreateIncidentInput,
  type SelectableUser,
} from '../../api/incidents'
import { useAuthStore } from '../../stores/authStore'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function CreateIncidentModal({ onClose, onCreated }: Props) {
  const currentUser = useAuthStore((s) => s.user)
  const types       = useIncidentTypes()
  const users       = useSelectableUsers()
  const create      = useCreateIncident()

  const today = new Date().toISOString().slice(0, 10)

  const [incidentType,       setIncidentType]       = useState<IncidentType | ''>('')
  const [incidentDate,       setIncidentDate]       = useState<string>(today)
  const [employeeUserId,     setEmployeeUserId]     = useState<string>('')
  const [employeeFullName,   setEmployeeFullName]   = useState<string>('')
  const [employeeEmail,      setEmployeeEmail]      = useState<string>('')
  const [recipientEmail,     setRecipientEmail]     = useState<string>('')
  const [reportedByUserId,   setReportedByUserId]   = useState<string>('')
  const [reportedByFullName, setReportedByFullName] = useState<string>('')
  const [reportedByRole,     setReportedByRole]     = useState<string>('')
  const [adminDescription,   setAdminDescription]   = useState<string>('')
  const [trackingNumber,     setTrackingNumber]     = useState<string>('')
  const [platform,           setPlatform]           = useState<Platform | ''>('')
  const [shopName,           setShopName]           = useState<string>('')
  const [error,              setError]              = useState<string | null>(null)

  const typeMeta = useMemo(() => types.data?.find((t) => t.value === incidentType), [types.data, incidentType])
  const needsParcel = !!typeMeta?.requiresParcel

  // Pre-fill the "Reported By" block with the logged-in admin once the user list arrives.
  useEffect(() => {
    if (!currentUser || reportedByUserId) return
    setReportedByUserId(currentUser.id)
    setReportedByRole(currentUser.role)
    // Try to remember a previously-typed full name for this admin
    void fetchRememberedFullName(currentUser.id).then((name) => {
      if (name) setReportedByFullName(name)
      else setReportedByFullName(currentUser.username)
    }).catch(() => setReportedByFullName(currentUser.username))
  }, [currentUser, reportedByUserId])

  function handleEmployeePicked(userId: string, list: SelectableUser[]) {
    setEmployeeUserId(userId)
    const u = list.find((x) => x.id === userId)
    if (!u) return
    if (u.email) setEmployeeEmail(u.email)
    void fetchRememberedFullName(u.id).then((name) => {
      if (name) setEmployeeFullName(name)
      else setEmployeeFullName(u.username)
    }).catch(() => setEmployeeFullName(u.username))
  }

  async function handleLookupTn() {
    if (!trackingNumber.trim()) return
    try {
      const r = await lookupTrackingNumber(trackingNumber.trim())
      if (r.found) {
        setPlatform(r.platform)
        if (r.shopName) setShopName(r.shopName)
      }
    } catch { /* silent */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!incidentType || !employeeUserId || !reportedByUserId) {
      setError('Please fill all required fields.')
      return
    }
    if (needsParcel && (!trackingNumber.trim() || !platform || !shopName.trim())) {
      setError('Tracking number, platform and shop are required for this incident type.')
      return
    }

    const input: CreateIncidentInput = {
      incidentType,
      incidentDate,
      employeeUserId,
      employeeFullName,
      employeeEmail,
      recipientEmail,
      reportedByUserId,
      reportedByFullName,
      reportedByRole,
      adminDescription,
    }
    if (needsParcel) {
      input.trackingNumber = trackingNumber.trim()
      input.platform       = platform as Platform
      input.shopName       = shopName.trim()
    }

    try {
      await create.mutateAsync(input)
      onCreated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create incident'
      setError(msg)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
    fontSize: 14, background: '#fff', color: 'var(--color-text-primary)', fontFamily: 'inherit',
  }

  const modal = (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card modal-card--wide"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 720, width: '92vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header modal-header--primary">
          <div className="modal-icon modal-icon--primary">+</div>
          <div style={{ flex: 1 }}>
            <div className="modal-title">Create Incident Report</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Formal HR documentation — all fields are saved verbatim to the PDF.</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1 }}>
          <div className="modal-body" style={{ display: 'grid', gap: 16 }}>

            <Row>
              <Field label="Incident Type *">
                <select
                  className="styled-select"
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value as IncidentType | '')}
                  required
                  style={{ width: '100%' }}
                >
                  <option value="">— Select —</option>
                  {types.data?.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Incident Date *">
                <input
                  type="date" required value={incidentDate}
                  onChange={(e) => setIncidentDate(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            </Row>

            <SectionLabel>Employee (person involved)</SectionLabel>
            <Row>
              <Field label="Employee *">
                <select
                  className="styled-select"
                  value={employeeUserId}
                  onChange={(e) => handleEmployeePicked(e.target.value, users.data ?? [])}
                  required
                  style={{ width: '100%' }}
                >
                  <option value="">— Select user —</option>
                  {users.data?.map((u) => (
                    <option key={u.id} value={u.id}>{u.username} · {humanRole(u.role)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Full Name (as on PDF) *">
                <input
                  type="text" required value={employeeFullName}
                  onChange={(e) => setEmployeeFullName(e.target.value)}
                  placeholder="e.g. Juan Dela Cruz"
                  style={inputStyle}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Employee Email *">
                <input
                  type="email" required value={employeeEmail}
                  onChange={(e) => setEmployeeEmail(e.target.value)}
                  placeholder="employee@company.com"
                  style={inputStyle}
                />
              </Field>
              <Field label="Recipient Email (HR / Supervisor) *">
                <input
                  type="email" required value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="hr@company.com"
                  style={inputStyle}
                />
              </Field>
            </Row>

            <SectionLabel>Reported By (you)</SectionLabel>
            <Row>
              <Field label="Full Name *">
                <input
                  type="text" required value={reportedByFullName}
                  onChange={(e) => setReportedByFullName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  style={inputStyle}
                />
              </Field>
              <Field label="Role *">
                <input
                  type="text" required value={reportedByRole}
                  onChange={(e) => setReportedByRole(e.target.value)}
                  placeholder="e.g. Admin / Supervisor"
                  style={inputStyle}
                />
              </Field>
            </Row>

            {needsParcel && (
              <>
                <SectionLabel>Parcel Reference (required for this incident type)</SectionLabel>
                <Row>
                  <Field label="Tracking Number *">
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text" required value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        onBlur={handleLookupTn}
                        placeholder="e.g. PH26923..."
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        onClick={handleLookupTn}
                        title="Auto-fill platform + shop from the order"
                      >Lookup</button>
                    </div>
                  </Field>
                  <Field label="Platform *">
                    <select
                      className="styled-select"
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as Platform | '')}
                      required
                      style={{ width: '100%' }}
                    >
                      <option value="">— Select —</option>
                      {Object.values(Platform).map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                </Row>
                <Row>
                  <Field label="Shop Name *">
                    <input
                      type="text" required value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="e.g. Acme PH Official"
                      style={inputStyle}
                    />
                  </Field>
                  <div />
                </Row>
              </>
            )}

            <SectionLabel>Detailed Description by Reporting Officer</SectionLabel>
            <Field label="Description (will appear under the template paragraph on the PDF) *">
              <textarea
                required value={adminDescription}
                onChange={(e) => setAdminDescription(e.target.value)}
                rows={5} maxLength={4000}
                placeholder="Describe the incident in detail: what happened, when, who was involved, what was observed, etc."
                style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
              />
            </Field>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                padding: '10px 12px', borderRadius: 8, fontSize: 13,
              }}>{error}</div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={create.isPending} style={{ minWidth: 140 }}>
              {create.isPending ? 'Creating…' : 'Create Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase',
      letterSpacing: 0.6, paddingBottom: 4, borderBottom: '1px solid var(--color-border)',
    }}>{children}</div>
  )
}

function humanRole(role: string): string {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
