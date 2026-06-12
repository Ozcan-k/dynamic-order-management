import { useEffect, useMemo, useState } from 'react'
import { AccCustomerType, type AccCustomer, type AccVendor } from '@dom/shared'
import {
  useCustomers, useSaveCustomer, useDeleteCustomer,
  useVendors, useSaveVendor, useDeleteVendor,
  useCompany, useSaveCompany,
} from '../../api/accounting'
import ConfirmModal from '../../components/shared/ConfirmModal'
import Pagination from '../../components/shared/Pagination'

type Tab = 'individual' | 'corporation' | 'vendors'

const PAGE_SIZE = 12

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

  const [tab, setTab] = useState<Tab>('individual')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [company, setCompany] = useState(false)
  const [editCust, setEditCust] = useState<null | typeof emptyCust>(null)
  const [editVend, setEditVend] = useState<null | typeof emptyVend>(null)
  const [delC, setDelC] = useState<AccCustomer | null>(null)
  const [delV, setDelV] = useState<AccVendor | null>(null)

  const isCorpTab = tab === 'corporation'

  const individuals = useMemo(() => customers.filter((c) => c.type === AccCustomerType.INDIVIDUAL), [customers])
  const corporations = useMemo(() => customers.filter((c) => c.type === AccCustomerType.CORPORATION), [customers])

  const q = search.trim().toLowerCase()
  const filteredCustomers = useMemo(() => {
    const base = isCorpTab ? corporations : individuals
    return q ? base.filter((c) => [c.name, c.email, c.contactNumber, c.contactPerson].some((v) => (v || '').toLowerCase().includes(q))) : base
  }, [individuals, corporations, isCorpTab, q])
  const filteredVendors = useMemo(
    () => (q ? vendors.filter((v) => [v.name, v.email, v.contactNumber].some((x) => (x || '').toLowerCase().includes(q))) : vendors),
    [vendors, q],
  )

  // reset search + page when switching tabs
  useEffect(() => { setSearch(''); setPage(1) }, [tab])
  // reset to first page when the filter result shrinks below the current page
  useEffect(() => { setPage(1) }, [q])

  // ── pagination slice for the active list ──
  const activeCount = tab === 'vendors' ? filteredVendors.length : filteredCustomers.length
  const totalPages = Math.max(1, Math.ceil(activeCount / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, activeCount)
  const pagedCustomers = filteredCustomers.slice(pageStart, pageEnd)
  const pagedVendors = filteredVendors.slice(pageStart, pageEnd)

  const nameLabel = isCorpTab ? 'Company Name' : 'Name'

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Customers / Vendors</h1><p className="acc-sub">Archive of everyone you invoice or buy from</p></div>
        <button className="acc-btn acc-btn-outline" onClick={() => setCompany(true)}>⚙ Company Profile</button>
      </div>

      {/* tabs */}
      <div className="acc-tabs">
        <button className={`acc-tab${tab === 'individual' ? ' active' : ''}`} onClick={() => setTab('individual')}>Individual Customers ({individuals.length})</button>
        <button className={`acc-tab${tab === 'corporation' ? ' active' : ''}`} onClick={() => setTab('corporation')}>Corporation Customers ({corporations.length})</button>
        <button className={`acc-tab${tab === 'vendors' ? ' active' : ''}`} onClick={() => setTab('vendors')}>Vendors ({vendors.length})</button>
      </div>

      <div className="acc-filter-bar">
        <div className="acc-field" style={{ flex: 1, minWidth: 200 }}><label>Search</label>
          <input placeholder="Name, email, number…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="acc-field" style={{ alignSelf: 'flex-end' }}>
          {tab === 'vendors'
            ? <button className="acc-btn acc-btn-primary" onClick={() => setEditVend({ ...emptyVend })}>+ Add Vendor</button>
            : <button className="acc-btn acc-btn-primary" onClick={() => setEditCust({ ...emptyCust, type: isCorpTab ? 'CORPORATION' : 'INDIVIDUAL' })}>+ Add {isCorpTab ? 'Corporation' : 'Customer'}</button>}
        </div>
      </div>

      {/* Customers (Individual / Corporation) */}
      {tab !== 'vendors' && (
        <>
          <div className="acc-table-wrap">
            <table>
              <thead><tr><th>{nameLabel}</th><th>Email</th><th>Number</th><th>Contact Person</th><th>Sales Agent</th><th className="acc-col-actions">Actions</th></tr></thead>
              <tbody>
                {lc ? <tr><td colSpan={6} className="acc-empty">Loading…</td></tr>
                  : pagedCustomers.length === 0 ? <tr><td colSpan={6} className="acc-empty">{q ? 'No matching customers.' : `No ${isCorpTab ? 'corporation' : 'individual'} customers yet.`}</td></tr>
                  : pagedCustomers.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
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
          {activeCount > PAGE_SIZE && (
            <div style={{ marginTop: 12 }}>
              <Pagination page={safePage} totalPages={totalPages} totalCount={activeCount} pageStart={pageStart} pageEnd={pageEnd} onChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Vendors tab */}
      {tab === 'vendors' && (
        <>
          <div className="acc-table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Number</th><th>Address</th><th className="acc-col-actions">Actions</th></tr></thead>
              <tbody>
                {lv ? <tr><td colSpan={5} className="acc-empty">Loading…</td></tr>
                  : pagedVendors.length === 0 ? <tr><td colSpan={5} className="acc-empty">{q ? 'No matching vendors.' : 'No vendors yet.'}</td></tr>
                  : pagedVendors.map((v) => (
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
          {activeCount > PAGE_SIZE && (
            <div style={{ marginTop: 12 }}>
              <Pagination page={safePage} totalPages={totalPages} totalCount={activeCount} pageStart={pageStart} pageEnd={pageEnd} onChange={setPage} />
            </div>
          )}
        </>
      )}

      {company && <CompanyModal onClose={() => setCompany(false)} />}

      {editCust && (
        <div className="acc-modal-backdrop" onClick={() => setEditCust(null)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="acc-modal-title">{editCust.id ? 'Edit' : 'New'} {editCust.type === 'CORPORATION' ? 'Corporation' : 'Customer'}</h3>
            <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="acc-field"><label>Type</label><select value={editCust.type} onChange={(e) => setEditCust({ ...editCust, type: e.target.value })}><option value="INDIVIDUAL">Individual</option><option value="CORPORATION">Corporation</option></select></div>
              <div className="acc-field"><label>{editCust.type === 'CORPORATION' ? 'Company Name' : 'Name'} <span className="req">*</span></label><input value={editCust.name} onChange={(e) => setEditCust({ ...editCust, name: e.target.value })} autoFocus /></div>
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
