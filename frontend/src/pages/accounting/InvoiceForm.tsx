import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ACC_CUSTOMER_TYPE_LABELS, ACC_SALE_CHANNEL_LABELS, ACC_PAYMENT_METHOD_LABELS,
  AccCustomerType, AccSaleChannel, AccPaymentMethod, AccPaymentStatus, type AccSale, type AccCustomer,
} from '@dom/shared'
import {
  useCustomers, useSaveCustomer, useItems, useCreateItem, useCategories, useCreateCategory,
  useStores, useCreateStore, useSalesAgents, useNextInvoiceNo, useSaveSale, useSale,
} from '../../api/accounting'
import ComboBox from '../../components/shared/ComboBox'
import LineItemsEditor, { type LineRow, emptyLine } from '../../components/accounting/LineItemsEditor'

function todayStr() { return new Date().toISOString().slice(0, 10) }

function initRows(s?: AccSale | null): LineRow[] {
  if (!s || !s.items?.length) return [emptyLine()]
  return s.items.map((it) => ({
    itemId: it.itemId, itemName: it.itemName, categoryId: it.categoryId, categoryName: it.categoryName || '',
    subcategoryId: null, subcategoryName: '',
    description: it.description || '',
    quantity: String(it.quantity), unitCost: String(it.unitCost), discountPct: String(it.discountPct), taxPct: String(it.taxPct),
  }))
}

const emptyNewCust = { type: 'CORPORATION' as AccCustomerType, name: '', address: '', email: '', contactPerson: '', contactNumber: '' }

// ─── Page wrapper: resolves the edit record before rendering the form ─────────
export default function InvoiceForm() {
  const { id } = useParams()
  const isEdit = !!id
  const { data: editing, isLoading } = useSale(id)

  if (isEdit && isLoading) return <div className="acc-page"><div className="acc-empty">Loading…</div></div>
  if (isEdit && !editing) return <div className="acc-page"><div className="acc-empty">Invoice not found.</div></div>
  return <InvoiceFormBody key={id ?? 'new'} initial={isEdit ? editing! : null} />
}

function InvoiceFormBody({ initial }: { initial: AccSale | null }) {
  const navigate = useNavigate()
  const isEdit = !!initial
  const { data: customers = [] } = useCustomers()
  const saveCustomer = useSaveCustomer()
  const { data: items = [] } = useItems('SALE')
  const createItem = useCreateItem()
  const { data: categories = [] } = useCategories('SALE')
  const createCategory = useCreateCategory()
  const { data: stores = [] } = useStores()
  const createStore = useCreateStore()
  const { data: agents = [] } = useSalesAgents()
  const { data: nextNo } = useNextInvoiceNo(!isEdit)
  const save = useSaveSale()

  const back = () => navigate('/accounting/sales')

  const [f, setF] = useState({
    customerType: (initial?.customerType ?? AccCustomerType.INDIVIDUAL) as AccCustomerType,
    customerId: initial?.customerId ?? (null as string | null),
    customerName: initial?.customerName ?? '',
    customerAddress: initial?.customerAddress ?? '',
    customerEmail: initial?.customerEmail ?? '',
    customerNumber: initial?.customerNumber ?? '',
    contactPerson: initial?.contactPerson ?? '',
    dateIssued: initial ? initial.dateIssued.slice(0, 10) : todayStr(),
    dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
    orderReference: initial?.orderReference ?? '',
    salesAgentId: initial?.salesAgentId ?? '',
    salesAgentName: initial?.salesAgentName ?? '',
    saleChannel: (initial?.saleChannel ?? AccSaleChannel.OTHERS) as AccSaleChannel,
    storeName: initial?.storeName ?? '',
    status: (initial?.status ?? AccPaymentStatus.UNPAID) as AccPaymentStatus,
    paymentMethod: (initial?.paymentMethod ?? AccPaymentMethod.CASH) as AccPaymentMethod,
    bankName: initial?.bankName ?? '', accountName: initial?.accountName ?? '',
    referenceNumber: initial?.referenceNumber ?? '', gcashNumber: initial?.gcashNumber ?? '',
    note: initial?.note ?? '',
  })
  const [rows, setRows] = useState<LineRow[]>(initRows(initial))
  const [error, setError] = useState('')
  const [newCust, setNewCust] = useState<null | typeof emptyNewCust>(null)
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [newStore, setNewStore] = useState('')
  const [showNewStore, setShowNewStore] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }))

  const pickCustomer = (c: AccCustomer | null) => {
    if (!c) { set({ customerId: null }); return }
    set({ customerId: c.id, customerName: c.name, customerType: c.type, customerAddress: c.address || '', customerEmail: c.email || '', customerNumber: c.contactNumber || '', contactPerson: c.contactPerson || '' })
  }

  const invoiceNo = isEdit ? initial!.invoiceNo : (nextNo?.invoiceNo ?? '…')

  const validRows = useMemo(() => rows.filter((r) => r.itemName.trim() && Number(r.unitCost) >= 0 && Number(r.quantity) > 0), [rows])

  const submit = async () => {
    setError('')
    if (!f.customerName.trim()) return setError('Customer Name is required.')
    if (validRows.length === 0) return setError('Add at least one line item (item + qty + unit cost).')
    if (f.status === 'PAID') {
      if (f.paymentMethod === 'BANK_TRANSFER' && (!f.bankName || !f.accountName || !f.referenceNumber)) return setError('Bank Name, Account Name and Reference Number are required.')
      if (f.paymentMethod === 'GCASH' && !f.gcashNumber) return setError('Gcash Number is required.')
    }
    const agentName = f.salesAgentId ? (agents.find((a) => a.id === f.salesAgentId)?.username ?? f.salesAgentName) : f.salesAgentName
    const payload: any = {
      id: initial?.id,
      customerType: f.customerType, customerId: f.customerId || null, customerName: f.customerName,
      customerAddress: f.customerAddress || null, customerEmail: f.customerEmail || null, customerNumber: f.customerNumber || null,
      contactPerson: f.contactPerson || null,
      dateIssued: f.dateIssued, dueDate: f.dueDate || null, orderReference: f.orderReference || null,
      salesAgentId: f.salesAgentId || null, salesAgentName: agentName || null,
      saleChannel: f.saleChannel, storeName: f.storeName || null, status: f.status,
      paymentMethod: f.status === 'PAID' ? f.paymentMethod : null,
      bankName: f.bankName || null, accountName: f.accountName || null, referenceNumber: f.referenceNumber || null, gcashNumber: f.gcashNumber || null,
      note: f.note.trim() || null,
      items: validRows.map((r) => ({
        itemId: r.itemId || null, itemName: r.itemName, categoryId: r.categoryId || null, categoryName: r.categoryName || null,
        description: r.description || null,
        quantity: Number(r.quantity), unitCost: Number(r.unitCost), discountPct: Number(r.discountPct) || 0, taxPct: Number(r.taxPct) || 0,
      })),
    }
    try { await save.mutateAsync(payload); back() }
    catch (e: any) { setError(e?.response?.data?.error || 'Save failed') }
  }

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">{isEdit ? `Edit ${invoiceNo}` : 'New Invoice'}</h1><p className="acc-sub">Fill in the invoice details and line items</p></div>
        <button className="acc-btn acc-btn-ghost" onClick={back}>← Back to Sales</button>
      </div>

      <div className="acc-card acc-card-pad">
        {/* customer type toggle */}
        <div className="acc-seg" style={{ marginBottom: 14 }}>
          {Object.values(AccCustomerType).map((t) => (
            <button key={t} type="button" className={`acc-seg-btn${f.customerType === t ? ' active' : ''}`} onClick={() => set({ customerType: t })}>
              {ACC_CUSTOMER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="acc-form-grid">
          <div className="acc-field"><label>Customer Name <span className="req">*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <ComboBox<AccCustomer> items={customers} value={f.customerName} placeholder="Select / type customer"
                  onChange={(text) => set({ customerName: text, customerId: null })}
                  onPick={pickCustomer}
                  onAddNew={async (name) => { const c = await saveCustomer.mutateAsync({ name, type: f.customerType }); pickCustomer(c as AccCustomer) }} />
              </div>
              {f.customerType === 'CORPORATION' && (
                <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" style={{ whiteSpace: 'nowrap' }}
                  onClick={() => setNewCust({ ...emptyNewCust, type: AccCustomerType.CORPORATION })}>+ New Customer</button>
              )}
            </div>
          </div>
          <div className="acc-field"><label>Invoice #</label><input value={invoiceNo} disabled /></div>
          <div className="acc-field"><label>Customer Number</label><input value={f.customerNumber} onChange={(e) => set({ customerNumber: e.target.value })} /></div>

          {f.customerType === 'CORPORATION' && <>
            <div className="acc-field span2"><label>Customer Address</label><input value={f.customerAddress} onChange={(e) => set({ customerAddress: e.target.value })} /></div>
            <div className="acc-field"><label>Contact Person</label><input value={f.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} /></div>
          </>}
          <div className="acc-field"><label>Customer Email</label><input value={f.customerEmail} onChange={(e) => set({ customerEmail: e.target.value })} /></div>

          <div className="acc-field"><label>Date of Issue</label><input type="date" value={f.dateIssued} onChange={(e) => set({ dateIssued: e.target.value })} /></div>
          <div className="acc-field"><label>Due On</label><input type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></div>
          <div className="acc-field"><label>Order Reference</label><input value={f.orderReference} onChange={(e) => set({ orderReference: e.target.value })} /></div>

          <div className="acc-field"><label>Sales Agent</label>
            <select value={f.salesAgentId} onChange={(e) => set({ salesAgentId: e.target.value })}>
              <option value="">— None —</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.username}</option>)}
            </select></div>
          <div className="acc-field"><label>Sales Channel</label>
            <select value={f.saleChannel} onChange={(e) => set({ saleChannel: e.target.value as AccSaleChannel })}>
              {Object.entries(ACC_SALE_CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div className="acc-field"><label>Store</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={{ flex: 1 }} value={f.storeName} onChange={(e) => set({ storeName: e.target.value })}>
                <option value="">— None —</option>
                {stores.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                {f.storeName && !stores.some((s) => s.name === f.storeName) && <option value={f.storeName}>{f.storeName}</option>}
              </select>
              <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" style={{ whiteSpace: 'nowrap' }}
                onClick={() => { setNewStore(''); setShowNewStore(true) }}>+ New Store</button>
            </div></div>
          <div className="acc-field"><label>Status</label>
            <select value={f.status} onChange={(e) => set({ status: e.target.value as AccPaymentStatus })}>
              <option value="UNPAID">Unpaid</option><option value="PAID">Paid</option>
            </select></div>

          {f.status === 'PAID' && <>
            <div className="acc-field"><label>Payment Method</label>
              <select value={f.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as AccPaymentMethod })}>
                {Object.entries(ACC_PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            {f.paymentMethod === 'BANK_TRANSFER' && <>
              <div className="acc-field"><label>Bank Name <span className="req">*</span></label><input value={f.bankName} onChange={(e) => set({ bankName: e.target.value })} /></div>
              <div className="acc-field"><label>Account Name <span className="req">*</span></label><input value={f.accountName} onChange={(e) => set({ accountName: e.target.value })} /></div>
              <div className="acc-field"><label>Reference Number <span className="req">*</span></label><input value={f.referenceNumber} onChange={(e) => set({ referenceNumber: e.target.value })} /></div>
            </>}
            {f.paymentMethod === 'GCASH' && <>
              <div className="acc-field"><label>Gcash Number <span className="req">*</span></label><input value={f.gcashNumber} onChange={(e) => set({ gcashNumber: e.target.value })} /></div>
              <div className="acc-field"><label>Reference Number</label><input value={f.referenceNumber} onChange={(e) => set({ referenceNumber: e.target.value })} /></div>
            </>}
            {f.paymentMethod === 'CHECK' && <>
              <div className="acc-field"><label>Check / Reference</label><input value={f.referenceNumber} onChange={(e) => set({ referenceNumber: e.target.value })} /></div>
              <div className="acc-field"><label>Account Name</label><input value={f.accountName} onChange={(e) => set({ accountName: e.target.value })} /></div>
            </>}
          </>}
        </div>

        <div className="acc-section-label acc-section-label-row">
          <span>Items</span>
          <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => { setNewCat(''); setShowNewCat(true) }}>+ New Category</button>
        </div>
        <LineItemsEditor rows={rows} onChange={setRows} items={items} categoryMode="sale" categories={categories}
          onCreateItem={async (name) => createItem.mutateAsync({ name, kind: 'SALE' })} />

        <div className="acc-section-label" style={{ marginTop: 18 }}>Note</div>
        <div className="acc-field">
          <textarea value={f.note} onChange={(e) => set({ note: e.target.value })} rows={3} maxLength={2000}
            placeholder="Optional note about this invoice (e.g. special instructions, follow-up, context)…"
            style={{ width: '100%', resize: 'vertical', minHeight: 64 }} />
        </div>

        {error && <p className="acc-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="acc-modal-foot">
          <button className="acc-btn acc-btn-outline" onClick={back}>Cancel</button>
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : isEdit ? 'Update Invoice' : 'Save Invoice'}</button>
        </div>
      </div>

      {showNewCat && (
        <div className="acc-modal-backdrop" onClick={() => setShowNewCat(false)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="acc-modal-title">New Sales Category</h3>
            <div className="acc-field"><label>Name <span className="req">*</span></label>
              <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Dried Fruits" /></div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setShowNewCat(false)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!newCat.trim() || createCategory.isPending}
                onClick={async () => { await createCategory.mutateAsync({ name: newCat.trim(), kind: 'SALE' }); setShowNewCat(false) }}>
                {createCategory.isPending ? 'Saving…' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewStore && (
        <div className="acc-modal-backdrop" onClick={() => setShowNewStore(false)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="acc-modal-title">New Store</h3>
            <div className="acc-field"><label>Name <span className="req">*</span></label>
              <input autoFocus value={newStore} onChange={(e) => setNewStore(e.target.value)} placeholder="Store name" /></div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setShowNewStore(false)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!newStore.trim() || createStore.isPending}
                onClick={async () => { const s: any = await createStore.mutateAsync({ name: newStore.trim() }); set({ storeName: s.name }); setShowNewStore(false) }}>
                {createStore.isPending ? 'Saving…' : 'Add Store'}
              </button>
            </div>
          </div>
        </div>
      )}

      {newCust && (
        <div className="acc-modal-backdrop" onClick={() => setNewCust(null)}>
          <div className="acc-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="acc-modal-title">New Customer</h3>
            <div className="acc-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="acc-field"><label>Type</label>
                <select value={newCust.type} onChange={(e) => setNewCust({ ...newCust, type: e.target.value as AccCustomerType })}>
                  <option value="INDIVIDUAL">Individual</option><option value="CORPORATION">Corporation</option>
                </select></div>
              <div className="acc-field"><label>Name <span className="req">*</span></label><input autoFocus value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} /></div>
              <div className="acc-field span2"><label>Address</label><input value={newCust.address} onChange={(e) => setNewCust({ ...newCust, address: e.target.value })} /></div>
              <div className="acc-field"><label>Email</label><input value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} /></div>
              <div className="acc-field"><label>Contact Person</label><input value={newCust.contactPerson} onChange={(e) => setNewCust({ ...newCust, contactPerson: e.target.value })} /></div>
              <div className="acc-field span2"><label>Contact Number</label><input value={newCust.contactNumber} onChange={(e) => setNewCust({ ...newCust, contactNumber: e.target.value })} /></div>
            </div>
            <div className="acc-modal-foot">
              <button className="acc-btn acc-btn-outline" onClick={() => setNewCust(null)}>Cancel</button>
              <button className="acc-btn acc-btn-primary" disabled={!newCust.name.trim() || saveCustomer.isPending}
                onClick={async () => { const c = await saveCustomer.mutateAsync(newCust); pickCustomer(c as AccCustomer); setNewCust(null) }}>
                {saveCustomer.isPending ? 'Saving…' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
