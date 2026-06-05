import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { INCIDENT_TYPE_LABELS, IncidentType } from '@dom/shared'
import {
  type Incident,
  downloadIncidentPdf,
  downloadIncidentDocument,
  useIncidentDocuments,
  useUploadIncidentDocument,
  useDeleteIncidentDocument,
  useSendIncidentEmail,
} from '../../api/incidents'

// Keep in sync with the backend's MAX_SIGNED_MB (routes/incidents.ts).
const MAX_SIGNED_MB = 10

interface Props {
  incident: Incident
  smtpConfigured: boolean
  onClose: () => void
  onChanged: () => void
}

export default function ViewIncidentModal({ incident, smtpConfigured, onClose, onChanged }: Props) {
  const upload = useUploadIncidentDocument()
  const delDoc = useDeleteIncidentDocument()
  const docsQuery = useIncidentDocuments(incident.id)
  const documents = docsQuery.data ?? []
  const sendEmail = useSendIncidentEmail()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [busyDocId, setBusyDocId] = useState<string | null>(null)

  async function handleDownloadPdf() {
    setFeedback(null)
    setPdfBusy(true)
    try {
      await downloadIncidentPdf(incident.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF download failed'
      setFeedback({ kind: 'err', text: msg })
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleDownloadDoc(docId: string, name: string | null) {
    setFeedback(null)
    setBusyDocId(docId)
    try {
      await downloadIncidentDocument(incident.id, docId, name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      setFeedback({ kind: 'err', text: msg })
    } finally {
      setBusyDocId(null)
    }
  }

  async function handleDeleteDoc(docId: string) {
    setFeedback(null)
    setBusyDocId(docId)
    try {
      await delDoc.mutateAsync({ incidentId: incident.id, docId })
      onChanged()
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? (err instanceof Error ? err.message : 'Delete failed')
      setFeedback({ kind: 'err', text: msg })
    } finally {
      setBusyDocId(null)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFeedback(null)
    const clearInput = () => { if (fileInputRef.current) fileInputRef.current.value = '' }

    // Validate up front so the user gets instant feedback instead of a failed upload.
    const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
    if (file.type && !ALLOWED.includes(file.type)) {
      setFeedback({ kind: 'err', text: 'Unsupported file type. Please upload a PDF, PNG, or JPG.' })
      clearInput()
      return
    }
    if (file.size > MAX_SIGNED_MB * 1024 * 1024) {
      setFeedback({ kind: 'err', text: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The maximum allowed size is ${MAX_SIGNED_MB} MB — please upload a smaller PDF or JPG.` })
      clearInput()
      return
    }

    try {
      await upload.mutateAsync({ incidentId: incident.id, file })
      setFeedback({ kind: 'ok', text: `Uploaded ${file.name}` })
      onChanged()
    } catch (err: any) {
      // Surface the backend's friendly { error } message, not axios's generic text.
      const msg = err?.response?.data?.error ?? (err instanceof Error ? err.message : 'Upload failed')
      setFeedback({ kind: 'err', text: msg })
    }
    clearInput()
  }

  async function handleSendEmail() {
    if (!smtpConfigured) return
    setFeedback(null)
    try {
      const r = await sendEmail.mutateAsync(incident.id)
      setFeedback({ kind: 'ok', text: `Email sent to: ${r.to.join(', ')}` })
      onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Email send failed'
      setFeedback({ kind: 'err', text: msg })
    }
  }

  const typeLabel = INCIDENT_TYPE_LABELS[incident.incidentType as IncidentType]

  const modal = (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 620, width: '92vw' }}
      >
        <div className="modal-header modal-header--primary">
          <div className="modal-icon modal-icon--primary">📄</div>
          <div style={{ flex: 1 }}>
            <div className="modal-title">{typeLabel}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {incident.employeeFullName} · {new Date(incident.incidentDate).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="modal-body" style={{ display: 'grid', gap: 14 }}>

          <InfoTable
            rows={[
              ['Reported By',  `${incident.reportedByFullName} (${humanRole(incident.reportedByRole)})`],
              ['Recipient',    incident.recipientEmail],
              ['Created',      new Date(incident.createdAt).toLocaleString()],
              ...(incident.trackingNumber ? [['Tracking #', `${incident.trackingNumber} · ${incident.platform ?? '—'} · ${incident.shopName ?? '—'}`] as [string, string]] : []),
              ['Email Sent',   incident.emailSentAt ? `${new Date(incident.emailSentAt).toLocaleString()} → ${incident.emailSentTo ?? ''}` : 'Not yet'],
              ['Documents',    documents.length ? `${documents.length} uploaded` : 'None yet'],
            ]}
          />

          <div style={{
            background: '#f8fafc', border: '1px solid var(--color-border)',
            borderRadius: 8, padding: 12, fontSize: 13, color: 'var(--color-text-primary)',
            maxHeight: 120, overflowY: 'auto', whiteSpace: 'pre-wrap',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Admin description</div>
            {incident.adminDescription}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleDownloadPdf}
              disabled={pdfBusy}
            >{pdfBusy ? 'Preparing…' : '⬇ Download PDF'}</button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={upload.isPending}
            >{upload.isPending ? 'Uploading…' : '📤 Upload Document'}</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              hidden
              onChange={handleFileChange}
            />

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSendEmail}
              disabled={!smtpConfigured || sendEmail.isPending}
              title={smtpConfigured ? '' : 'SMTP is not configured on the server.'}
            >{sendEmail.isPending ? 'Sending…' : '✉ Send Email'}</button>
          </div>

          {/* Uploaded documents list */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
              Documents ({documents.length})
            </div>
            {docsQuery.isLoading ? (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</div>
            ) : documents.length === 0 ? (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--color-text-muted)' }}>No documents uploaded yet.</div>
            ) : (
              documents.map((d) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 16 }}>{d.mime.includes('pdf') ? '📄' : '🖼️'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.originalName || 'Document'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{new Date(d.uploadedAt).toLocaleString()}</div>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" disabled={busyDocId === d.id}
                    onClick={() => handleDownloadDoc(d.id, d.originalName)}>
                    {busyDocId === d.id ? '…' : '⬇'}
                  </button>
                  <button type="button" title="Delete document" disabled={busyDocId === d.id}
                    onClick={() => handleDeleteDoc(d.id)}
                    style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {feedback && (
            <div style={{
              fontSize: 13, padding: '10px 12px', borderRadius: 8,
              background: feedback.kind === 'ok' ? '#ecfdf5' : '#fef2f2',
              border: feedback.kind === 'ok' ? '1px solid #a7f3d0' : '1px solid #fecaca',
              color: feedback.kind === 'ok' ? '#047857' : '#b91c1c',
            }}>{feedback.text}</div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

function InfoTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ width: 120, padding: '4px 0', color: 'var(--color-text-muted)', fontWeight: 600 }}>{k}</td>
            <td style={{ padding: '4px 0', color: 'var(--color-text-primary)' }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function humanRole(role: string): string {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
