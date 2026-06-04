import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ACC_COUNTRY_LABELS, ACC_PAYMENT_METHOD_LABELS, AccCountry, AccPaymentMethod, AccPaymentStatus,
  type AccExpense, type AccVendor,
} from '@dom/shared'
import {
  useVendors, useSaveVendor, useItems, useCreateItem, useCategories, useCreateCategory,
  useNextPurchaseNo, useSaveExpense, useExpense,
} from '../../api/accounting'
import type { AccCategory } from '@dom/shared'
import ComboBox from '../../components/shared/ComboBox'
import LineItemsEditor, { type LineRow, emptyLine } from '../../components/accounting/LineItemsEditor'

function todayStr() { return new Date().toISOString().slice(0, 10) }
function initRows(e?: AccExpense | null): LineRow[] {
  if (!e || !e.items?.length) return [emptyLine()]
  return e.items.map((it) => ({
    itemId: it.itemId, itemName: it.itemName, categoryId: it.categoryId, categoryName: it.categoryName || '',
    subcategoryId: it.subcategoryId, subcategoryName: it.subcategoryName || '',
    description: it.description || '', quantity: String(it.quantity), unitCost: String(it.unitCost),
    discountPct: String(it.discountPct), taxPct: String(it.taxPct),
  }))
}

// ─── Page wrapper: resolves the edit record before rendering the form ─────────
export default function PurchaseForm() {
  const { id } = useParams()
  const isEdit = !!id
  const { data: editing, isLoading } = useExpense(id)

  if (isEdit && isLoading) return <div className="acc-page"><div className="acc-empty">Loading…</div></div>
  if (isEdit && !editing) return <div className="acc-page"><div className="acc-empty">Expense not found.</div></div>
  return <PurchaseFormBody key={id ?? 'new'} initial={isEdit ? editing! : null} />
}

function PurchaseFormBody({ initial }: { initial: AccExpense | null }) {
  const navigate = useNavigate()
  const isEdit = !!initial
  const { data: vendors = [] } = useVendors()
  const saveVendor = useSaveVendor()
  const { data: items = [] } = useItems('EXPENSE')
  const createItem = useCreateItem()
  const { data: categories = [] } = useCategories('EXPENSE')
  const createCategory = useCreateCategory()
  const { data: nextNo } = useNextPurchaseNo(!isEdit)
  const save = useSaveExpense()

  const back = () => navigate('/accounting/expenses')

  const [f, setF] = useState({
    vendorId: initial?.vendorId ?? (null as string | null),
    vendorName: initial?.vendorName ?? '',
    invoiceNumber: initial?.invoiceNumber ?? '',
    country: (initial?.country ?? AccCountry.PHILIPPINES) as AccCountry,
    dateIssued: initial ? initial.dateIssued.slice(0, 10) : todayStr(),
    dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
    status: (initial?.status ?? AccPaymentStatus.UNPAID) as AccPaymentStatus,
    paymentMethod: (initial?.paymentMethod ?? AccPaymentMethod.CASH) as AccPaymentMethod,
    paidBy: initial?.paidBy ?? '',
  })
  const [rows, setRows] = useState<LineRow[]>(initRows(initial))
  const [error, setError] = useState('')
  const [newVendor, setNewVendor] = useState<null | { name: string; email: string; contactNumber: string }>(null)
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [newSub, setNewSub] = useState({ parentId: '', name: '' })
  const [showNewSub, setShowNewSub] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }))

  const purchaseNo = isEdit ? initial!.purchaseNo : (nextNo?.purchaseNo ?? '…')
  const validRows = useMemo(() => rows.filter((r) => r.itemName.trim() && Number(r.unitCost) >= 0 && Number(r.quantity) > 0), [rows])

  const submit = async () => {
    setError('')
    if (!f.vendorName.trim()) return setError('Vendor is required.')
    if (validRows.length === 0) return setError('Add at least one line item (item + qty + unit cost).')
    const payload: any = {
      id: initial?.id,
      vendorId: f.vendorId || null, vendorName: f.vendorName, invoiceNumber: f.invoiceNumber || null,
      country: f.country, dateIssued: f.dateIssued, dueDate: f.dueDate || null,
      status: f.status, paymentMethod: f.status === 'PAID' ? f.paymentMethod : null, paidBy: f.status === 'PAID' ? (f.paidBy || null) : null,
      items: validRows.map((r) => ({
        itemId: r.itemId || null, itemName: r.itemName, categoryId: r.categoryId || null, categoryName: r.categoryName || null,
        subcategoryId: r.subcategoryId || null, subcategoryName: r.subcategoryName || null,
        description: r.description || null, quantity: Number(r.quantity), unitCost: Number(r.unitCost),
        discountPct: Number(r.discountPct) || 0, taxPct: Number(r.taxPct) || 0,
      })),
    }
    try { await save.mutateAsync(payload); back() }
    catch (e: any) { setError(e?.response?.data?.error || 'Save failed') }
  }

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">{isEdit ? `Edit ${purchaseNo}` : 'New Expense'}</h1><p className="acc-sub">Fill in the expense details and line items</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => setNewVendor({ name: '', email: '', contactNumber: '' })}>+ New Vendor</button>
          <button className="acc-btn acc-btn-ghost" onClick={back}>← Back to Expenses</button>
        </div>
      </div>

      <div className="acc-card acc-card-pad">
        <div className="acc-form-grid">
          <div className="acc-field"><label>Vendor Name <span className="req">*</span></label>
            <ComboBox<AccVendor> items={vendors} value={f.vendorName} placeholder="Select / type vendor"
              onChange={(text) => set({ vendorName: text, vendorId: null })}
              onPick={(v) => set(v ? { vendorName: v.name, vendorId: v.id } : { vendorId: null })}
              onAddNew={async (name) => { const v = await saveVendor.mutateAsync({ name }); set({ vendorName: (v as AccVendor).name, vendorId: (v as AccVendor).id }) }} />
          </div>
          <div className="acc-field"><label>Expense #</label><input value={purchaseNo} disabled /></div>
          <div className="acc-field"><label>Invoice Number</label><input value={f.invoiceNumber} placeholder="optional" onChange={(e) => set({ invoiceNumber: e.target.value })} /></div>

          <div className="acc-field"><label>Country</label>
            <select value={f.country} onChange={(e) => set({ country: e.target.value as AccCountry })}>
              {Object.entries(ACC_COUNTRY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="acc-field"><label>Date of Issue</label><input type="date" value={f.dateIssued} onChange={(e) => set({ dateIssued: e.target.value })} /></div>
          <div className="acc-field"><label>Due On</label><input type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>

          <div className="acc-field"><label>Status</label>
            <select value={f.status} onChange={(e) => set({ status: e.target.value as AccPaymentStatus })}>
              <option value="UNPAID">Unpaid</option><option value="PAID">Paid</option>
            </select></div>
          {f.status === 'PAID' && <>
            <div className="acc-field"><label>Payment Method</label>
              <select value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as AccPaymentMethod })}>
                {Object.entries(ACC_PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div className="acc-field"><label>Paid By</label><input value={f.paidBy} onChange={(e) => set({ paidBy: e.target.value })} /></div>
          </>}
        </div>

        <div className="acc-section-label acc-section-label-row">
          <span>Items</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => { setNewCat(''); setShowNewCat(true) }}>+ New Category</button>
            <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => { setNewSub({ parentId: categories[0]?.id || '', name: '' }); setShowNewSub(true) }}>+ New Subcategory</button>
          </div>
        </div>
        <LineItemsEditor rows={rows} onChange={setRows} items={items} categoryMode="expense" categories={categories}
          onCreateItem={async (name) => createItem.mutateAsync({ name, kind: 'EXPENSE' })} />

        {error && <p className="acc-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="acc-modal-foot">
          <button className="acc-btn acc-btn-outline" onClick={back}>Cancel</button>
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : isEdit ? 'Update Expense' : 'Save Expense'}</button>
        </div>
      </div>

      {showNewCat && (
        <div className="acc-modal-backdrop" onClick={() => setShowNewCat(false)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="acc-modal-title">New Expense Category</h3>
            <div className="acc-field"><label>Name <span className="req">*</span></label>
              <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Packaging" /></div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setShowNewCat(false)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!newCat.trim() || createCategory.isPending}
                onClick={async () => { await createCategory.mutateAsync({ name: newCat.trim(), kind: 'EXPENSE' }); setShowNewCat(false) }}>
                {createCategory.isPending ? 'Saving…' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewSub && (
        <div className="acc-modal-backdrop" onClick={() => setShowNewSub(false)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h3 className="acc-modal-title">New Subcategory</h3>
            <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="acc-field"><label>Parent Category <span className="req">*</span></label>
                <select value={newSub.parentId} onChange={(e) => setNewSub({ ...newSub, parentId: e.target.value })}>
                  <option value="">— Select —</option>
                  {(categories as AccCategory[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div className="acc-field"><label>Name <span className="req">*</span></label>
                <input autoFocus value={newSub.name} onChange={(e) => setNewSub({ ...newSub, name: e.target.value })} placeholder="e.g. Bubble Wrap" /></div>
            </div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setShowNewSub(false)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!newSub.parentId || !newSub.name.trim() || createCategory.isPending}
                onClick={async () => { await createCategory.mutateAsync({ name: newSub.name.trim(), kind: 'EXPENSE', parentId: newSub.parentId }); setShowNewSub(false) }}>
                {createCategory.isPending ? 'Saving…' : 'Add Subcategory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newVendor && (
        <div className="acc-modal-backdrop" onClick={() => setNewVendor(null)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="acc-modal-title">New Vendor</h3>
            <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="acc-field"><label>Name <span className="req">*</span></label><input autoFocus value={newVendor.name} onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })} /></div>
              <div className="acc-field"><label>Email</label><input value={newVendor.email} onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })} /></div>
              <div className="acc-field"><label>Number</label><input value={newVendor.contactNumber} onChange={(e) => setNewVendor({ ...newVendor, contactNumber: e.target.value })} /></div>
            </div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setNewVendor(null)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!newVendor.name.trim() || saveVendor.isPending}
                onClick={async () => { const v = await saveVendor.mutateAsync(newVendor); set({ vendorName: (v as AccVendor).name, vendorId: (v as AccVendor).id }); setNewVendor(null) }}>
                {saveVendor.isPending ? 'Saving…' : 'Add Vendor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
