import { useEffect, useMemo, useState } from 'react'
import { ACC_CUSTOMER_TYPE_LABELS, type AccCustomer, type AccVendor } from '@dom/shared'
import {
  useCustomers, useSaveCustomer, useDeleteCustomer,
  useVendors, useSaveVendor, useDeleteVendor,
  useCompany, useSaveCompany,
} from '../../api/accounting'
import ConfirmModal from '../../components/shared/ConfirmModal'

type Tab = 'customers' | 'vendors'

// ─── Company Profile modal (button, like Incident branding) ──────────────────
function CompanyModal({ onClose }: { onClose: () => void }) {
  const { data: company } = useCompany()
  const save = useSaveCompany()
  const [form, setForm] = useState({ name: '', address: '', email: '', contactNumber: '', taxId: '' })
  const [logo, setLogo] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (company) {
      setForm({ name: company.name || '', address: company.address || '', email: company.email || '', contactNumber: company.contactNumber || '', taxId: company.taxId || '' })
      setPreview(company.logoData ? `data:${company.logoMime};base64,${company.logoData}` : null)
    }
  }, [company])

  const submit = async () => {
    const fd = new FormData()
    Object.entries(form).forEach(([k, v]) => fd.append(k, v))
    if (logo) fd.append('logo', logo)
    await save.mutateAsync(fd)
    onClose()
  }

  return (
    <div className="acc-modal-backdrop" onClick={onClose}>
      <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="acc-modal-title">Company Profile</h3>
        <p className="acc-muted" style={{ marginTop: -8, marginBottom: 16, fontSize: 13 }}>Used as the letterhead on generated invoices.</p>
        <div style={{ display: 'flex', gap: 18, marginBottom: 16, alignItems: 'center' }}>
          <div className="acc-logo-box">{preview ? <img src={preview} alt="logo" /> : <span className="acc-muted" style={{ fontSize: 12 }}>No logo</span>}</div>
          <div className="acc-field"><label>Company Logo</label><input type="file" accept="image/*" onChange={(e) => { const fl = e.target.files?.[0] || null; setLogo(fl); if (fl) setPreview(URL.createObjectURL(fl)) }} /></div>
        </div>
        <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="acc-field span2"><label>Company Name <span className="req">*</span></label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="acc-field span2"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="acc-field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="acc-field"><label>Contact Number</label><input value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} /></div>
          <div className="acc-field"><label>Tax ID</label><input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></div>
        </div>
        <div className="acc-modal-foot">
          <button className="acc-btn acc-btn-outline" onClick={onClose}>Cancel</button>
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending || !form.name.trim()}>{save.isPending ? 'Saving…' : 'Save Profile'}</button>
        </div>
      </div>
    </div>
  )
}

const emptyCust = { id: undefined as string | undefined, type: 'INDIVIDUAL', name: '', address: '', email: '', contactPerson: '', contactNumber: '' }
const emptyVend = { id: undefined as string | undefined, name: '', email: '', contactNumber: '', address: '' }

export default function AccContacts() {
  const { data: customers = [], isLoading: lc } = useCustomers()
  const { data: vendors = [], isLoading: lv } = useVendors()
  const saveCust = useSaveCustomer(); const delCust = useDeleteCustomer()
  const saveVend = useSaveVendor(); const delVend = useDeleteVendor()

  const [tab, setTab] = useState<Tab>('customers')
  const [search, setSearch] = useState('')
  const [company, setCompany] = useState(false)
  const [editCust, setEditCust] = useState<null | typeof emptyCust>(null)
  const [editVend, setEditVend] = useState<null | typeof emptyVend>(null)
  const [delC, setDelC] = useState<AccCustomer | null>(null)
  const [delV, setDelV] = useState<AccVendor | null>(null)

  const q = search.trim().toLowerCase()
  const shownCustomers = useMemo(
    () => (q ? customers.filter((c) => [c.name, c.email, c.contactNumber, c.contactPerson].some((v) => (v || '').toLowerCase().includes(q))) : customers),
    [customers, q],
  )
  const shownVendors = useMemo(
    () => (q ? vendors.filter((v) => [v.name, v.email, v.contactNumber].some((x) => (x || '').toLowerCase().includes(q))) : vendors),
    [vendors, q],
  )

  // reset search when switching tabs
  useEffect(() => { setSearch('') }, [tab])

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Customers / Vendors</h1><p className="acc-sub">Archive of everyone you invoice or buy from</p></div>
        <button className="acc-btn acc-btn-outline" onClick={() => setCompany(true)}>⚙ Company Profile</button>
      </div>

      {/* tabs */}
      <div className="acc-tabs">
        <button className={`acc-tab${tab === 'customers' ? ' active' : ''}`} onClick={() => setTab('customers')}>Customers ({customers.length})</button>
        <button className={`acc-tab${tab === 'vendors' ? ' active' : ''}`} onClick={() => setTab('vendors')}>Vendors ({vendors.length})</button>
      </div>

      <div className="acc-filter-bar">
        <div className="acc-field" style={{ flex: 1, minWidth: 200 }}><label>Search</label>
          <input placeholder={tab === 'customers' ? 'Name, email, number…' : 'Name, email, number…'} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="acc-field" style={{ alignSelf: 'flex-end' }}>
          {tab === 'customers'
            ? <button className="acc-btn acc-btn-primary" onClick={() => setEditCust({ ...emptyCust })}>+ Add Customer</button>
            : <button className="acc-btn acc-btn-primary" onClick={() => setEditVend({ ...emptyVend })}>+ Add Vendor</button>}
        </div>
      </div>

      {/* Customers tab */}
      {tab === 'customers' && (
        <div className="acc-table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Email</th><th>Number</th><th>Contact Person</th><th>Sales Agent</th><th className="acc-col-actions">Actions</th></tr></thead>
            <tbody>
              {lc ? <tr><td colSpan={7} className="acc-empty">Loading…</td></tr>
                : shownCustomers.length === 0 ? <tr><td colSpan={7} className="acc-empty">{q ? 'No matching customers.' : 'No customers yet.'}</td></tr>
                : shownCustomers.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{ACC_CUSTOMER_TYPE_LABELS[c.type]}</td>
                    <td>{c.email || <span className="acc-muted">—</span>}</td>
                    <td>{c.contactNumber || <span className="acc-muted">—</span>}</td>
                    <td>{c.contactPerson || <span className="acc-muted">—</span>}</td>
                    <td>{c.salesAgentName || <span className="acc-muted">—</span>}</td>
                    <td className="acc-col-actions"><span className="acc-row-actions">
                      <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => setEditCust({ id: c.id, type: c.type, name: c.name, address: c.address || '', email: c.email || '', contactPerson: c.contactPerson || '', contactNumber: c.contactNumber || '' })}>Edit</button>
                      <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setDelC(c)}>Delete</button>
                    </span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Vendors tab */}
      {tab === 'vendors' && (
        <div className="acc-table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Number</th><th>Address</th><th className="acc-col-actions">Actions</th></tr></thead>
            <tbody>
              {lv ? <tr><td colSpan={5} className="acc-empty">Loading…</td></tr>
                : shownVendors.length === 0 ? <tr><td colSpan={5} className="acc-empty">{q ? 'No matching vendors.' : 'No vendors yet.'}</td></tr>
                : shownVendors.map((v) => (
                  <tr key={v.id}>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td>{v.email || <span className="acc-muted">—</span>}</td>
                    <td>{v.contactNumber || <span className="acc-muted">—</span>}</td>
                    <td>{v.address || <span className="acc-muted">—</span>}</td>
                    <td className="acc-col-actions"><span className="acc-row-actions">
                      <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => setEditVend({ id: v.id, name: v.name, email: v.email || '', contactNumber: v.contactNumber || '', address: v.address || '' })}>Edit</button>
                      <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setDelV(v)}>Delete</button>
                    </span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {company && <CompanyModal onClose={() => setCompany(false)} />}

      {editCust && (
        <div className="acc-modal-backdrop" onClick={() => setEditCust(null)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="acc-modal-title">{editCust.id ? 'Edit' : 'New'} Customer</h3>
            <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="acc-field"><label>Type</label><select value={editCust.type} onChange={(e) => setEditCust({ ...editCust, type: e.target.value })}><option value="INDIVIDUAL">Individual</option><option value="CORPORATION">Corporation</option></select></div>
              <div className="acc-field"><label>Name <span className="req">*</span></label><input value={editCust.name} onChange={(e) => setEditCust({ ...editCust, name: e.target.value })} autoFocus /></div>
              <div className="acc-field span2"><label>Address</label><input value={editCust.address} onChange={(e) => setEditCust({ ...editCust, address: e.target.value })} /></div>
              <div className="acc-field"><label>Email</label><input value={editCust.email} onChange={(e) => setEditCust({ ...editCust, email: e.target.value })} /></div>
              <div className="acc-field"><label>Contact Person</label><input value={editCust.contactPerson} onChange={(e) => setEditCust({ ...editCust, contactPerson: e.target.value })} /></div>
              <div className="acc-field span2"><label>Contact Number</label><input value={editCust.contactNumber} onChange={(e) => setEditCust({ ...editCust, contactNumber: e.target.value })} /></div>
            </div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setEditCust(null)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!editCust.name.trim() || saveCust.isPending} onClick={async () => { await saveCust.mutateAsync(editCust); setEditCust(null) }}>{saveCust.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {editVend && (
        <div className="acc-modal-backdrop" onClick={() => setEditVend(null)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="acc-modal-title">{editVend.id ? 'Edit' : 'New'} Vendor</h3>
            <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="acc-field span2"><label>Name <span className="req">*</span></label><input value={editVend.name} onChange={(e) => setEditVend({ ...editVend, name: e.target.value })} autoFocus /></div>
              <div className="acc-field"><label>Email</label><input value={editVend.email} onChange={(e) => setEditVend({ ...editVend, email: e.target.value })} /></div>
              <div className="acc-field"><label>Number</label><input value={editVend.contactNumber} onChange={(e) => setEditVend({ ...editVend, contactNumber: e.target.value })} /></div>
              <div className="acc-field span2"><label>Address</label><input value={editVend.address} onChange={(e) => setEditVend({ ...editVend, address: e.target.value })} /></div>
            </div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setEditVend(null)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!editVend.name.trim() || saveVend.isPending} onClick={async () => { await saveVend.mutateAsync(editVend); setEditVend(null) }}>{saveVend.isPending ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {delC && <ConfirmModal title={`Delete ${delC.name}?`} message="Past invoices keep their saved copy." confirmLabel="Delete" tone="danger" busy={delCust.isPending} onCancel={() => setDelC(null)} onConfirm={async () => { await delCust.mutateAsync(delC.id); setDelC(null) }} />}
      {delV && <ConfirmModal title={`Delete ${delV.name}?`} message="Past expenses keep their saved copy." confirmLabel="Delete" tone="danger" busy={delVend.isPending} onCancel={() => setDelV(null)} onConfirm={async () => { await delVend.mutateAsync(delV.id); setDelV(null) }} />}
    </div>
  )
}
