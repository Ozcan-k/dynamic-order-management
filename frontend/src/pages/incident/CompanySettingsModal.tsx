import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useBranding, useUpdateBranding, brandingLogoUrl } from '../../api/branding'

interface Props {
  onClose: () => void
}

export default function CompanySettingsModal({ onClose }: Props) {
  const branding = useBranding()
  const update   = useUpdateBranding()

  const [companyName,   setCompanyName]   = useState<string>('')
  const [address,       setAddress]       = useState<string>('')
  const [email,         setEmail]         = useState<string>('')
  const [contactNumber, setContactNumber] = useState<string>('')
  const [logo,          setLogo]          = useState<File | null>(null)
  const [preview,       setPreview]       = useState<string | null>(null)
  const [error,         setError]         = useState<string | null>(null)

  // Initial fill from server data
  if (branding.data && !companyName && !logo) {
    if (branding.data.companyName)   setCompanyName(branding.data.companyName)
    if (branding.data.address)       setAddress(branding.data.address)
    if (branding.data.email)         setEmail(branding.data.email)
    if (branding.data.contactNumber) setContactNumber(branding.data.contactNumber)
  }

  function handleLogoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    setLogo(file)
    if (file) {
      const url = URL.createObjectURL(file)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!companyName.trim()) {
      setError('Company name is required.')
      return
    }
    try {
      await update.mutateAsync({
        companyName: companyName.trim(),
        address: address.trim(),
        email: email.trim(),
        contactNumber: contactNumber.trim(),
        logo,
      })
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save branding'
      setError(msg)
    }
  }

  const existingLogoUrl = branding.data?.hasLogo ? brandingLogoUrl(branding.data.updatedAt) : null

  const modal = (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: '92vw' }}
      >
        <div className="modal-header modal-header--primary">
          <div className="modal-icon modal-icon--primary">⚙</div>
          <div style={{ flex: 1 }}>
            <div className="modal-title">Company Settings</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Used as letterhead on every incident report PDF.</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>Company Name *</span>
              <input
                type="text" required value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Your Company, Inc."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14 }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>Address</span>
              <textarea
                value={address} rows={2}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Unit / Street, City, Province, ZIP"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>Contact Number</span>
                <input
                  type="text" value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="+63 9XX XXX XXXX"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: 0.4, textTransform: 'uppercase' }}>Email</span>
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="company@email.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 14 }}
                />
              </label>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>Logo</div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{
                  width: 90, height: 90, borderRadius: 12, border: '1px dashed var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                  background: '#f8fafc',
                }}>
                  {preview
                    ? <img src={preview} alt="preview" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                    : existingLogoUrl
                      ? <img src={existingLogoUrl} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                      : <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>No logo</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoPick}
                    style={{ fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                    PNG / JPG / WebP, max 2 MB. Square images work best.
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
                padding: '10px 12px', borderRadius: 8, fontSize: 13,
              }}>{error}</div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={update.isPending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={update.isPending} style={{ minWidth: 100 }}>
              {update.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
