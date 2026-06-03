import { useMemo, useState } from 'react'
import { ACC_COUNTRY_LABELS, ACC_PAID_FROM_LABELS, AccCountry, AccPaidFrom, type AccExpense } from '@dom/shared'
import {
  useAccExpenses, useSaveAccExpense, useDeleteAccExpense, type AccExpenseFilters,
  useAccContacts, useSaveAccContact, money,
} from '../../api/accounting'
import ComboBox from '../../components/shared/ComboBox'
import ConfirmModal from '../../components/shared/ConfirmModal'

const blank = {
  id: undefined as string | undefined,
  country: AccCountry.PHILIPPINES as AccCountry,
  itemName: '',
  supplierId: null as string | null,
  supplierName: '',
  category: '',
  amount: '',
  quantity: '1',
  paidFrom: AccPaidFrom.CASH as AccPaidFrom,
  paymentReferenceNumber: '',
  checkNumber: '',
  paidBy: '',
}
type FormState = typeof blank

export default function AccExpenses() {
  const [form, setForm] = useState<FormState>({ ...blank })
  const [filters, setFilters] = useState<AccExpenseFilters>({ page: 1, pageSize: 25 })
  const [toDelete, setToDelete] = useState<AccExpense | null>(null)
  const [error, setError] = useState('')

  const { data: suppliers = [] } = useAccContacts('suppliers')
  const saveSupplier = useSaveAccContact('suppliers')
  const { data, isLoading } = useAccExpenses(filters)
  const save = useSaveAccExpense()
  const del = useDeleteAccExpense()

  const total = useMemo(() => (Number(form.amount) || 0) * (Number(form.quantity) || 0), [form.amount, form.quantity])
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))
  const reset = () => { setForm({ ...blank }); setError('') }

  const submit = async () => {
    setError('')
    if (!form.itemName.trim() || !form.supplierName.trim() || !form.category.trim() || !form.paidBy.trim() || !form.amount) {
      setError('Please fill in all required fields.'); return
    }
    const payload: any = {
      id: form.id, country: form.country, itemName: form.itemName,
      supplierId: form.supplierId, supplierName: form.supplierName, category: form.category,
      amount: Number(form.amount), quantity: Number(form.quantity), paidFrom: form.paidFrom,
      paymentReferenceNumber: form.paymentReferenceNumber || null, checkNumber: form.checkNumber || null, paidBy: form.paidBy,
    }
    try { await save.mutateAsync(payload); reset() }
    catch (e: any) { setError(e?.response?.data?.error || 'Save failed') }
  }

  const editRow = (e: AccExpense) => {
    setForm({
      id: e.id, country: e.country, itemName: e.itemName, supplierId: e.supplierId, supplierName: e.supplierName,
      category: e.category, amount: String(e.amount), quantity: String(e.quantity), paidFrom: e.paidFrom,
      paymentReferenceNumber: e.paymentReferenceNumber || '', checkNumber: e.checkNumber || '', paidBy: e.paidBy,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 1

  return (
    <div className="acc-page">
      <div className="acc-head">
        <h1 className="acc-title">Expenses</h1>
        <p className="acc-sub">Record expenses and review the history</p>
      </div>

      <div className="acc-card acc-card-pad" style={{ marginBottom: 24 }}>
        <h3 className="acc-card-title">{form.id ? 'Edit Expense' : 'New Expense'}</h3>
        <div className="acc-form-grid">
          <div className="acc-field"><label>Country</label>
            <select value={form.country} onChange={(e) => set({ country: e.target.value as AccCountry })}>
              {Object.entries(ACC_COUNTRY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="acc-field"><label>Item Name <span className="req">*</span></label><input value={form.itemName} onChange={(e) => set({ itemName: e.target.value })} /></div>
          <div className="acc-field"><label>Category <span className="req">*</span></label><input value={form.category} onChange={(e) => set({ category: e.target.value })} /></div>

          <div className="acc-field"><label>Supplier <span className="req">*</span></label>
            <ComboBox items={suppliers} value={form.supplierName} placeholder="Search supplier or type…"
              onChange={(text) => set({ supplierName: text, supplierId: null })}
              onPick={(c) => set({ supplierName: c ? c.name : form.supplierName, supplierId: c ? c.id : null })}
              onAddNew={async (name) => { const created = await saveSupplier.mutateAsync({ name, address: '', email: '', contactPerson: '', contactNumber: '' }); set({ supplierName: created.name, supplierId: created.id }) }}
            /></div>
          <div className="acc-field"><label>Amount (unit) <span className="req">*</span></label><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set({ amount: e.target.value })} /></div>
          <div className="acc-field"><label>Quantity</label><input type="number" min="1" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} /></div>

          <div className="acc-field"><label>Paid From</label>
            <select value={form.paidFrom} onChange={(e) => set({ paidFrom: e.target.value as AccPaidFrom })}>
              {Object.entries(ACC_PAID_FROM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          {form.paidFrom === 'CHECK' ? (
            <div className="acc-field"><label>Check Number <span className="req">*</span></label><input value={form.checkNumber} onChange={(e) => set({ checkNumber: e.target.value })} /></div>
          ) : form.paidFrom !== 'CASH' ? (
            <div className="acc-field"><label>Payment Reference Number</label><input value={form.paymentReferenceNumber} onChange={(e) => set({ paymentReferenceNumber: e.target.value })} /></div>
          ) : <div className="acc-field" />}
          <div className="acc-field"><label>Paid By <span className="req">*</span></label><input value={form.paidBy} onChange={(e) => set({ paidBy: e.target.value })} /></div>
        </div>

        {error && <p className="acc-error" style={{ marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
          <span className="acc-muted">Total: <span className="acc-total">{money(total)}</span></span>
          <div className="acc-spacer" />
          {form.id && <button className="acc-btn acc-btn-ghost" onClick={reset}>Cancel edit</button>}
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : form.id ? 'Update Expense' : 'Save Expense'}</button>
        </div>
      </div>

      <div className="acc-filter-bar">
        <div className="acc-field"><label>From</label><input type="date" value={filters.from || ''} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} /></div>
        <div className="acc-field"><label>To</label><input type="date" value={filters.to || ''} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} /></div>
        <div className="acc-field"><label>Country</label>
          <select value={filters.country || ''} onChange={(e) => setFilters({ ...filters, country: e.target.value, page: 1 })}>
            <option value="">All</option>{Object.entries(ACC_COUNTRY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="acc-field"><label>Paid From</label>
          <select value={filters.paidFrom || ''} onChange={(e) => setFilters({ ...filters, paidFrom: e.target.value, page: 1 })}>
            <option value="">All</option>{Object.entries(ACC_PAID_FROM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="acc-field" style={{ flex: 1, minWidth: 180 }}><label>Search</label><input placeholder="Item, supplier, category…" value={filters.search || ''} onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })} /></div>
      </div>

      <div className="acc-table-wrap">
        <table>
          <thead><tr>
            <th>ID</th><th>Date</th><th>Item</th><th>Category</th><th>Country</th><th>Supplier</th>
            <th className="acc-col-num">Qty</th><th className="acc-col-num">Total</th><th>Paid From</th><th>Paid By</th><th className="acc-col-actions">Actions</th>
          </tr></thead>
          <tbody>
            {isLoading ? <tr><td colSpan={11} className="acc-empty">Loading…</td></tr>
              : (data?.items.length ?? 0) === 0 ? <tr><td colSpan={11} className="acc-empty">No expenses found.</td></tr>
              : data!.items.map((e) => (
                <tr key={e.id}>
                  <td className="acc-col-num">#{e.expenseNo}</td>
                  <td>{new Date(e.date).toLocaleDateString('en-US')}</td>
                  <td>{e.itemName}</td><td>{e.category}</td><td>{ACC_COUNTRY_LABELS[e.country]}</td><td>{e.supplierName}</td>
                  <td className="acc-col-num">{e.quantity}</td><td className="acc-col-num">{money(e.total)}</td>
                  <td>{ACC_PAID_FROM_LABELS[e.paidFrom]}</td><td>{e.paidBy}</td>
                  <td className="acc-col-actions"><span className="acc-row-actions">
                    <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => editRow(e)}>Edit</button>
                    <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={() => setToDelete(e)}>Delete</button>
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
        <ConfirmModal title={`Delete expense #${toDelete.expenseNo}?`} message="This cannot be undone." confirmLabel="Delete" tone="danger"
          busy={del.isPending} onCancel={() => setToDelete(null)}
          onConfirm={async () => { await del.mutateAsync(toDelete.id); setToDelete(null) }} />
      )}
    </div>
  )
}
