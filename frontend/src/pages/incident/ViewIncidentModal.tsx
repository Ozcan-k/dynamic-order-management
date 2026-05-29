import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { INCIDENT_TYPE_LABELS, IncidentType } from '@dom/shared'
import {
  type Incident,
  downloadIncidentPdf,
  downloadSignedFile,
  useUploadSignedFile,
  useSendIncidentEmail,
} from '../../api/incidents'

interface Props {
  incident: Incident
  smtpConfigured: boolean
  onClose: () => void
  onChanged: () => void
}

export default function ViewIncidentModal({ incident, smtpConfigured, onClose, onChanged }: Props) {
  const upload = useUploadSignedFile()
  const sendEmail = useSendIncidentEmail()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [signedBusy, setSignedBusy] = useState(false)

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

  async function handleDownloadSigned() {
    setFeedback(null)
    setSignedBusy(true)
    try {
      await downloadSignedFile(incident.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      setFeedback({ kind: 'err', text: msg })
    } finally {
      setSignedBusy(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFeedback(null)
    try {
      await upload.mutateAsync({ incidentId: incident.id, file })
      setFeedback({ kind: 'ok', text: `Uploaded ${file.name}` })
      onChanged()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setFeedback({ kind: 'err', text: msg })
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
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
              ['Signed File',  incident.signedFilePath ? `Uploaded ${incident.signedUploadedAt ? new Date(incident.signedUploadedAt).toLocaleString() : ''}` : 'Not yet'],
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
            >{upload.isPending ? 'Uploading…' : '📤 Upload Signed'}</button>
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

          {incident.signedFilePath && (
            <button
              type="button"
              onClick={handleDownloadSigned}
              disabled={signedBusy}
              style={{
                fontSize: 12, color: 'var(--color-primary)', textAlign: 'center',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >{signedBusy ? 'Preparing…' : 'Download signed file'}</button>
          )}

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
