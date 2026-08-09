import { useEffect, useRef, useState } from 'react'
import type { AccInvoiceAttachment } from '@dom/shared'
import type { AttachmentResource } from '../../api/accounting'
import {
  useAttachments, useUploadAttachment, useDeleteAttachment, useReplaceAttachment,
  fetchAttachmentBlobUrl, downloadAttachment,
} from '../../api/accounting'
import { downscaleImage } from '../../lib/imageDownscale'
import { formatManilaDateTime } from '../../lib/manila'
import ConfirmModal from '../shared/ConfirmModal'

export const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp'
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_MB = 10

/** Reject oversize/unsupported files up front — a clear message beats a round-trip 413. */
export function validateAttachment(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return `"${file.name}" is not a supported file type. Allowed: PDF, PNG, JPG, WEBP.`
  if (file.size > MAX_MB * 1024 * 1024) return `"${file.name}" is larger than ${MAX_MB} MB.`
  return null
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const isImage = (mime: string) => mime.startsWith('image/')
const NOUN: Record<AttachmentResource, string> = { sales: 'invoice', expenses: 'expense' }

const PdfIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
  </svg>
)

const thumbBox: React.CSSProperties = {
  width: 52, height: 52, borderRadius: 8, flexShrink: 0, background: '#f8fafc',
  border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
}
const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
  border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', position: 'relative',
}
const previewCard: React.CSSProperties = {
  position: 'absolute', left: 0, top: '100%', marginTop: 6, zIndex: 30,
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
  boxShadow: '0 12px 32px rgba(15,23,42,0.18)', padding: 10, pointerEvents: 'none',
}

/** Big hover preview — an enlarged image, or (for PDFs, which we don't render inline) an icon card. */
function HoverPreview({ url, mime, name }: { url: string | null; mime: string; name: string }) {
  if (isImage(mime) && url) {
    return (
      <div style={previewCard}>
        <img src={url} alt="" style={{ display: 'block', maxWidth: 280, maxHeight: 280, borderRadius: 8, objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{ ...previewCard, width: 200, textAlign: 'center', padding: 20 }}>
      <PdfIcon size={40} />
      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginTop: 8, wordBreak: 'break-word' }}>{name || 'Document'}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Click Download to view</div>
    </div>
  )
}

/** A saved attachment row: thumbnail + hover preview + Replace/Download/Remove. */
function ServerRow({
  resource, recordId, att, onReplace, replacing, onRemove, removing,
}: {
  resource: AttachmentResource; recordId: string; att: AccInvoiceAttachment
  onReplace: (file: File) => void; replacing: boolean
  onRemove: () => void; removing: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [hover, setHover] = useState(false)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isImage(att.mime)) return
    let revoked = false
    let objectUrl: string | null = null
    fetchAttachmentBlobUrl(resource, recordId, att.id)
      .then((u) => { if (revoked) { window.URL.revokeObjectURL(u); return } objectUrl = u; setUrl(u) })
      .catch(() => { /* fall back to the icon */ })
    return () => { revoked = true; if (objectUrl) window.URL.revokeObjectURL(objectUrl) }
  }, [resource, recordId, att.id, att.mime])

  return (
    <div style={rowStyle} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={thumbBox}>{url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PdfIcon />}</div>
      {hover && <HoverPreview url={url} mime={att.mime} name={att.originalName || 'invoice'} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {att.originalName || 'invoice'}
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          {formatBytes(att.sizeBytes)} · {formatManilaDateTime(att.uploadedAt, {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
          })}
        </div>
      </div>
      <input ref={replaceRef} type="file" accept={ACCEPT} hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); if (replaceRef.current) replaceRef.current.value = '' }} />
      <button type="button" className="acc-btn acc-btn-outline acc-btn-sm"
        onClick={() => replaceRef.current?.click()} disabled={replacing || removing}>
        {replacing ? 'Replacing…' : 'Replace'}
      </button>
      <button type="button" className="acc-btn acc-btn-outline acc-btn-sm"
        onClick={() => { void downloadAttachment(resource, recordId, att) }}>Download</button>
      <button type="button" className="acc-btn acc-btn-danger acc-btn-sm"
        onClick={onRemove} disabled={removing || replacing}>Remove</button>
    </div>
  )
}

/** Row for a file still queued in the browser (new record, not yet saved). */
function LocalRow({ file, onRemove, disabled }: { file: File; onRemove: () => void; disabled?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [hover, setHover] = useState(false)
  useEffect(() => {
    if (!isImage(file.type)) return
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return (
    <div style={{ ...rowStyle, borderStyle: 'dashed', background: '#f8fafc' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={thumbBox}>{url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PdfIcon />}</div>
      {hover && <HoverPreview url={url} mime={file.type} name={file.name} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
          {formatBytes(file.size)} · uploads when you save
        </div>
      </div>
      <button type="button" className="acc-btn acc-btn-danger acc-btn-sm" onClick={onRemove} disabled={disabled}>Remove</button>
    </div>
  )
}

interface Props {
  /** 'sales' or 'expenses' — which record type these attachments belong to. */
  resource: AttachmentResource
  /** Present once the sale/expense exists — uploads then go straight to the server. */
  recordId?: string
  /** New-record mode: files wait here until the record has an id. */
  staged: File[]
  onStagedChange: (files: File[]) => void
  /** Set while the parent is flushing the staged queue after a save. */
  uploading?: boolean
}

export default function InvoiceAttachments({ resource, recordId, staged, onStagedChange, uploading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<AccInvoiceAttachment | null>(null)

  const { data: attachments = [], isLoading } = useAttachments(resource, recordId)
  const upload = useUploadAttachment(resource, recordId)
  const replace = useReplaceAttachment(resource, recordId)
  const del = useDeleteAttachment(resource, recordId)

  const pick = () => inputRef.current?.click()

  const onFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return
    setError('')
    setBusy(true)
    // Collect, then hand the parent one new array. Calling onStagedChange per file would
    // read a stale `staged` on every iteration after the first and drop all but the last.
    const queued: File[] = []
    try {
      for (const raw of Array.from(fileList)) {
        const bad = validateAttachment(raw)
        if (bad) { setError(bad); continue }
        // Shrink before it ever leaves the browser: a 3 MB phone photo lands around 400 KB.
        const file = await downscaleImage(raw)
        if (recordId) {
          try {
            await upload.mutateAsync(file)
          } catch (e: any) {
            setError(e?.response?.data?.error || `Could not upload "${file.name}".`)
          }
        } else {
          queued.push(file)
        }
      }
      if (queued.length) onStagedChange([...staged, ...queued])
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onReplace = async (att: AccInvoiceAttachment, raw: File) => {
    setError('')
    const bad = validateAttachment(raw)
    if (bad) { setError(bad); return }
    setReplacingId(att.id)
    try {
      const file = await downscaleImage(raw)
      await replace.mutateAsync({ attId: att.id, file })
    } catch (e: any) {
      setError(e?.response?.data?.error || `Could not replace "${att.originalName || 'this file'}".`)
    } finally {
      setReplacingId(null)
    }
  }

  const removeStaged = (i: number) => onStagedChange(staged.filter((_, idx) => idx !== i))

  return (
    <>
      <div className="acc-section-label acc-section-label-row" style={{ marginTop: 24 }}>
        <span>Attachments</span>
        <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" onClick={pick} disabled={busy || uploading}>
          {busy ? 'Adding…' : '+ Add Invoice File'}
        </button>
      </div>

      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden
        onChange={(e) => { void onFiles(e.target.files) }} />

      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
        Attach the {NOUN[resource]} invoice — a photo or a PDF. You can add more than one. Photos are resized automatically. Hover a file to preview it. Max {MAX_MB} MB per file.
      </p>

      {error && <p className="acc-error" style={{ marginBottom: 12 }}>{error}</p>}

      {recordId && isLoading ? (
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Loading attachments…</p>
      ) : attachments.length === 0 && staged.length === 0 ? (
        <p style={{ fontSize: 13, color: '#94a3b8' }}>No invoice attached yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {attachments.map((att) => (
            <ServerRow key={att.id} resource={resource} recordId={recordId!} att={att}
              onReplace={(file) => { void onReplace(att, file) }} replacing={replacingId === att.id}
              onRemove={() => setConfirmDel(att)} removing={del.isPending} />
          ))}

          {staged.map((file, i) => (
            <LocalRow key={`${file.name}-${i}`} file={file} onRemove={() => removeStaged(i)} disabled={uploading} />
          ))}
        </div>
      )}

      {confirmDel && recordId && (
        <ConfirmModal
          title="Remove attachment?"
          message={`"${confirmDel.originalName || 'This file'}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Remove" tone="danger" busy={del.isPending}
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => {
            try { await del.mutateAsync(confirmDel.id) }
            catch (e: any) { setError(e?.response?.data?.error || 'Could not remove the file.') }
            setConfirmDel(null)
          }} />
      )}
    </>
  )
}
