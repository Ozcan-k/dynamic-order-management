import { useMemo, useState } from 'react'
import { ACC_PAYMENT_METHOD_LABELS, ACC_SALES_STATUS_LABELS, AccPaymentMethod, AccSalesStatus, type AccSale, type AccContact } from '@dom/shared'
import {
  useAccSales, useSaveAccSale, useDeleteAccSale, useCreateAccInvoice, type AccSaleFilters,
  useAccContacts, useSaveAccContact, money,
} from '../../api/accounting'
import ComboBox from '../../components/shared/ComboBox'
import ConfirmModal from '../../components/shared/ConfirmModal'

const blank = {
  id: undefined as string | undefined,
  product: '', price: '', quantity: '1',
  customerId: null as string | null,
  customerName: '', customerAddress: '', customerNumber: '', customerEmail: '', contactPerson: '',
  paymentMethod: AccPaymentMethod.CASH as AccPaymentMethod,
  bankName: '', accountName: '', referenceNumber: '', gcashNumber: '', checkNumber: '',
  salesStatus: AccSalesStatus.PAID as AccSalesStatus, dueDate: '',
}
type FormState = typeof blank

export default function AccSales() {
  const [form, setForm] = useState<FormState>({ ...blank })
  const [filters, setFilters] = useState<AccSaleFilters>({ page: 1, pageSize: 25 })
  const [toDelete, setToDelete] = useState<AccSale | null>(null)
  const [error, setError] = useState('')

  const { data: customers = [] } = useAccContacts('customers')
  const saveCustomer = useSaveAccContact('customers')
  const { data, isLoading } = useAccSales(filters)
  const save = useSaveAccSale()
  const del = useDeleteAccSale()
  const createInvoice = useCreateAccInvoice()

  const total = useMemo(() => (Number(form.price) || 0) * (Number(form.quantity) || 0), [form.price, form.quantity])
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))
  const reset = () => { setForm({ ...blank }); setError('') }

  const pickCustomer = (c: AccContact | null) => {
    if (!c) { set({ customerId: null }); return }
    set({ customerId: c.id, customerName: c.name, customerAddress: c.address || '', customerNumber: c.contactNumber || '', customerEmail: c.email || '', contactPerson: c.contactPerson || '' })
  }

  const buildPayload = () => ({
    id: form.id, product: form.product, price: Number(form.price), quantity: Number(form.quantity),
    customerId: form.customerId, customerName: form.customerName,
    customerAddress: form.customerAddress || null, customerNumber: form.customerNumber || null,
    customerEmail: form.customerEmail || null, contactPerson: form.contactPerson || null,
    paymentMethod: form.paymentMethod, bankName: form.bankName || null, accountName: form.accountName || null,
    referenceNumber: form.referenceNumber || null, gcashNumber: form.gcashNumber || null, checkNumber: form.checkNumber || null,
    salesStatus: form.salesStatus, dueDate: form.salesStatus === 'PENDING' ? form.dueDate || null : null,
  })

  const validate = () => {
    if (!form.product.trim() || !form.customerName.trim() || !form.price) return 'Please fill in Product, Customer and Price.'
    if (form.paymentMethod === 'BANK_TRANSFER' && (!form.bankName || !form.accountName || !form.referenceNumber)) return 'Bank Name, Account Name and Reference Number are required for Bank Transfer.'
    if (form.paymentMethod === 'GCASH' && !form.gcashNumber) return 'Gcash Number is required.'
    if (form.paymentMethod === 'CHECK' && (!form.checkNumber || !form.accountName)) return 'Check Number and Account Name are required for Check.'
    if (form.salesStatus === 'PENDING' && !form.dueDate) return 'Due Date is required when status is Pending.'
    return ''
  }

  const submit = async (): Promise<AccSale | null> => {
    const v = validate()
    if (v) { setError(v); return null }
    setError('')
    try { const saved = await save.mutateAsync(buildPayload()); reset(); return saved as AccSale }
    catch (e: any) { setError(e?.response?.data?.error || 'Save failed'); return null }
  }

  const saveAndInvoice = async () => {
    const saved = form.id ? null : await submit()
    const saleId = saved?.id || form.id
    if (!saleId) return
    const inv = await createInvoice.mutateAsync(saleId)
    window.open(`/accounting/invoices/${inv.id}/pdf`, '_blank')
  }

  const openInvoice = async (s: AccSale) => {
    const inv = await createInvoice.mutateAsync(s.id)
    window.open(`/accounting/invoices/${inv.id}/pdf`, '_blank')
  }

  const editRow = (s: AccSale) => {
    setForm({
      id: s.id, product: s.product, price: String(s.price), quantity: String(s.quantity),
      customerId: s.customerId, customerName: s.customerName, customerAddress: s.customerAddress || '',
      customerNumber: s.customerNumber || '', customerEmail: s.customerEmail || '', contactPerson: s.contactPerson || '',
      paymentMethod: s.paymentMethod, bankName: s.bankName || '', accountName: s.accountName || '',
      referenceNumber: s.referenceNumber || '', gcashNumber: s.gcashNumber || '', checkNumber: s.checkNumber || '',
      salesStatus: s.salesStatus, dueDate: s.dueDate ? s.dueDate.slice(0, 10) : '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="acc-page">
      <div className="acc-head">
        <h1 className="acc-title">Sales</h1>
        <p className="acc-sub">Record sales, generate invoices and review history</p>
      </div>

      <div className="acc-card acc-card-pad" style={{ marginBottom: 24 }}>
        <h3 className="acc-card-title">{form.id ? 'Edit Sale' : 'New Sale'}</h3>
        <div className="acc-form-grid">
          <div className="acc-field"><label>Product <span className="req">*</span></label><input value={form.product} onChange={(e) => set({ product: e.target.value })} /></div>
          <div className="acc-field"><label>Price (unit) <span className="req">*</span></label><input type="number" min="0" step="0.01" value={form.price} onChange={(e) => set({ price: e.target.value })} /></div>
          <div className="acc-field"><label>Quantity</label><input type="number" min="1" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} /></div>

          <div className="acc-field"><label>Customer Name <span className="req">*</span></label>
            <ComboBox items={customers} value={form.customerName} placeholder="Search customer or type…"
              onChange={(text) => set({ customerName: text, customerId: null })}
              onPick={pickCustomer}
              onAddNew={async (name) => { const c = await saveCustomer.mutateAsync({ name, address: '', email: '', contactPerson: '', contactNumber: '' }); pickCustomer(c) }}
            /></div>
          <div className="acc-field"><label>Customer Number</label><input value={form.customerNumber} onChange={(e) => set({ customerNumber: e.target.value })} /></div>
          <div className="acc-field"><label>Customer Email</label><input value={form.customerEmail} onChange={(e) => set({ customerEmail: e.target.value })} /></div>
          <div className="acc-field span2"><label>Customer Address</label><input value={form.customerAddress} onChange={(e) => set({ customerAddress: e.target.value })} /></div>
          <div className="acc-field"><label>Contact Person</label><input value={form.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} /></div>

          <div className="acc-field"><label>Payment Method</label>
            <select value={form.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as AccPaymentMethod })}>
              {Object.entries(ACC_PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>

          {form.paymentMethod === 'BANK_TRANSFER' && <>
            <div className="acc-field"><label>Bank Name <span className="req">*</span></label><input value={form.bankName} onChange={(e) => set({ bankName: e.target.value })} /></div>
            <div className="acc-field"><label>Account Name <span className="req">*</span></label><input value={form.accountName} onChange={(e) => set({ accountName: e.target.value })} /></div>
            <div className="acc-field"><label>Reference Number <span className="req">*</span></label><input value={form.referenceNumber} onChange={(e) => set({ referenceNumber: e.target.value })} /></div>
          </>}
          {form.paymentMethod === 'GCASH' && <>
            <div className="acc-field"><label>Gcash Number <span className="req">*</span></label><input value={form.gcashNumber} onChange={(e) => set({ gcashNumber: e.target.value })} /></div>
            <div className="acc-field"><label>Reference Number</label><input value={form.referenceNumber} onChange={(e) => set({ referenceNumber: e.target.value })} /></div>
          </>}
          {form.paymentMethod === 'CHECK' && <>
            <div className="acc-field"><label>Check Number <span className="req">*</span></label><input value={form.checkNumber} onChange={(e) => set({ checkNumber: e.target.value })} /></div>
            <div className="acc-field"><label>Account Name <span className="req">*</span></label><input value={form.accountName} onChange={(e) => set({ accountName: e.target.value })} /></div>
          </>}

          <div className="acc-field"><label>Sales Status</label>
            <select value={form.salesStatus} onChange={(e) => set({ salesStatus: e.target.value as AccSalesStatus })}>
              {Object.entries(ACC_SALES_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          {form.salesStatus === 'PENDING' &&
            <div className="acc-field"><label>Due Date <span className="req">*</span></label><input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>}
        </div>

        {error && <p className="acc-error" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
          <span className="acc-muted">Total: <span className="acc-total">{money(total)}</span></span>
          <div className="acc-spacer" />
          {form.id && <button className="acc-btn acc-btn-ghost" onClick={reset}>Cancel edit</button>}
          <button className="acc-btn acc-btn-outline" onClick={saveAndInvoice} disabled={save.isPending || createInvoice.isPending}>Create New Invoice</button>
          <button className="acc-btn acc-btn-primary" onClick={() => submit()} disabled={save.isPending}>{save.isPending ? 'Saving…' : form.id ? 'Update Sale' : 'Save Sale'}</button>
        </div>
      </div>

      <div className="acc-filter-bar">
        <div className="acc-field"><label>From</label><input type="date" value={filters.from || ''} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} /></div>
        <div className="acc-field"><label>To</label><input type="date" value={filters.to || ''} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} /></div>
        <div className="acc-field"><label>Payment</label>
          <select value={filters.paymentMethod || ''} onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value, page: 1 })}>
            <option value="">All</option>{Object.entries(ACC_PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="acc-field"><label>Status</label>
          <select value={filters.salesStatus || ''} onChange={(e) => setFilters({ ...filters, salesStatus: e.target.value, page: 1 })}>
            <option value="">All</option>{Object.entries(ACC_SALES_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="acc-field" style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Product or customer…" value={filters.search || ''} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
      </div>

      <div className="acc-table-wrap">
        <table>
          <thead><tr>
            <th>Date</th><th>Product</th><th>Customer</th><th className="acc-col-num">Qty</th><th className="acc-col-num">Total</th>
            <th>Payment</th><th>Status</th><th>Due</th><th className="acc-col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="acc-empty">Loading…</td></tr>
              : (data?.items.length ?? 0) === 0 ? <tr><td colSpan={9} className="acc-empty">No sales found.</td></tr>
              : data!.items.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.date).toLocaleDateString('en-US')}</td>
                  <td>{s.product}</td><td>{s.customerName}</td>
                  <td className="acc-col-num">{s.quantity}</td><td className="acc-col-num">{money(s.total)}</td>
                  <td>{ACC_PAYMENT_METHOD_LABELS[s.paymentMethod]}</td>
                  <td><span className={`acc-badge ${s.salesStatus === 'PAID' ? 'acc-badge-paid' : 'acc-badge-pending'}`}>{ACC_SALES_STATUS_LABELS[s.salesStatus]}</span></td>
                  <td>{s.dueDate ? new Date(s.dueDate).toLocaleDateString('en-US') : <span className="acc-muted">—</span>}</td>
                  <td className="acc-col-actions"><span className="acc-row-actions">
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => openInvoice(s)} title="Generate / open invoice">Invoice</button>
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => editRow(s)}>Edit</button>
                    <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setToDelete(s)}>Delete</button>
                  </span></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="acc-pagination">
          <button className="acc-btn acc-btn-outline acc-btn-sm" disabled={(filters.page || 1) <= 1} onClick={() => setFilters({ ...filters, page: (filters.page || 1) - 1 })}>Prev</button>
          <span>Page {filters.page || 1} / {totalPages}</span>
          <button className="acc-btn acc-btn-outline acc-btn-sm" disabled={(filters.page || 1) >= totalPages} onClick={() => setFilters({ ...filters, page: (filters.page || 1) + 1 })}>Next</button>
        </div>
      )}

      {toDelete && (
        <ConfirmModal title={`Delete sale “${toDelete.product}”?`} message="This cannot be undone." confirmLabel="Delete" tone="danger"
          busy={del.isPending} onCancel={() => setToDelete(null)}
          onConfirm={async () => { await del.mutateAsync(toDelete.id); setToDelete(null) }} />
      )}
    </div>
  )
}
