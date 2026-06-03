import { useEffect, useState } from 'react'
import { useAccCompany, useSaveAccCompany } from '../../api/accounting'

export default function AccCompany() {
  const { data: company } = useAccCompany()
  const save = useSaveAccCompany()

  const [form, setForm] = useState({ name: '', address: '', email: '', contactNumber: '', taxId: '' })
  const [logo, setLogo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '', address: company.address || '', email: company.email || '',
        contactNumber: company.contactNumber || '', taxId: company.taxId || '',
      })
      setPreview(company.logoData ? `data:${company.logoMime};base64,${company.logoData}` : null)
    }
  }, [company])

  const onFile = (f: File | null) => {
    setLogo(f)
    if (f) setPreview(URL.createObjectURL(f))
  }

  const submit = async () => {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    if (logo) fd.append('logo', logo)
    await save.mutateAsync(fd)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="acc-page">
      <div className="acc-head">
        <h1 className="acc-title">Company Profile</h1>
        <p className="acc-sub">Used as the letterhead on generated invoices</p>
      </div>

      <div className="acc-card acc-card-pad" style={{ maxWidth: 640 }}>
        <div style={{ display: 'flex', gap: 24, marginBottom: 20, alignItems: 'center' }}>
          <div className="acc-logo-box">
            {preview ? <img src={preview} alt="logo" /> : <span className="acc-muted" style={{ fontSize: 12 }}>No logo</span>}
          </div>
          <div className="acc-field">
            <label>Company Logo</label>
            <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] || null)} />
            <span className="acc-muted" style={{ fontSize: 12 }}>PNG/JPG, used on invoices</span>
          </div>
        </div>

        <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="acc-field span2"><label>Company Name <span className="req">*</span></label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="acc-field span2"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="acc-field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="acc-field"><label>Contact Number</label><input value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></div>
          <div className="acc-field"><label>Tax ID</label><input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending || !form.name.trim()}>{save.isPending ? 'Saving…' : 'Save Profile'}</button>
          {saved && <span style={{ color: 'var(--acc-success)', fontWeight: 600 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  )
}
