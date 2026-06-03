import { useMemo, useState } from 'react'
import {
  ACC_CUSTOMER_TYPE_LABELS, ACC_SALE_CHANNEL_LABELS, ACC_PAYMENT_METHOD_LABELS,
  AccCustomerType, AccSaleChannel, AccPaymentMethod, AccPaymentStatus, type AccSale, type AccCustomer,
} from '@dom/shared'
import {
  useCustomers, useSaveCustomer, useItems, useCreateItem, useSalesAgents, useNextInvoiceNo, useSaveSale,
} from '../../api/accounting'
import ComboBox from '../../components/shared/ComboBox'
import LineItemsEditor, { type LineRow, emptyLine } from '../../components/accounting/LineItemsEditor'

function todayStr() { return new Date().toISOString().slice(0, 10) }

function initRows(s?: AccSale | null): LineRow[] {
  if (!s || !s.items?.length) return [emptyLine()]
  return s.items.map((it) => ({
    itemId: it.itemId, itemName: it.itemName, description: it.description || '',
    quantity: String(it.quantity), unitCost: String(it.unitCost), discountPct: String(it.discountPct), taxPct: String(it.taxPct),
  }))
}

export default function InvoiceForm({ initial, onClose }: { initial?: AccSale | null; onClose: () => void }) {
  const isEdit = !!initial
  const { data: customers = [] } = useCustomers()
  const saveCustomer = useSaveCustomer()
  const { data: items = [] } = useItems()
  const createItem = useCreateItem()
  const { data: agents = [] } = useSalesAgents()
  const { data: nextNo } = useNextInvoiceNo(!isEdit)
  const save = useSaveSale()

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
    status: (initial?.status ?? AccPaymentStatus.UNPAID) as AccPaymentStatus,
    paymentMethod: (initial?.paymentMethod ?? AccPaymentMethod.CASH) as AccPaymentMethod,
    bankName: initial?.bankName ?? '', accountName: initial?.accountName ?? '',
    referenceNumber: initial?.referenceNumber ?? '', gcashNumber: initial?.gcashNumber ?? '',
  })
  const [rows, setRows] = useState<LineRow[]>(initRows(initial))
  const [error, setError] = useState('')
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
      customerType: f.customerType, customerId: f.customerId, customerName: f.customerName,
      customerAddress: f.customerAddress || null, customerEmail: f.customerEmail || null, customerNumber: f.customerNumber || null,
      contactPerson: f.contactPerson || null,
      dateIssued: f.dateIssued, dueDate: f.dueDate || null, orderReference: f.orderReference || null,
      salesAgentId: f.salesAgentId || null, salesAgentName: agentName || null,
      saleChannel: f.saleChannel, status: f.status,
      paymentMethod: f.status === 'PAID' ? f.paymentMethod : null,
      bankName: f.bankName || null, accountName: f.accountName || null, referenceNumber: f.referenceNumber || null, gcashNumber: f.gcashNumber || null,
      items: validRows.map((r) => ({
        itemId: r.itemId, itemName: r.itemName, description: r.description || null,
        quantity: Number(r.quantity), unitCost: Number(r.unitCost), discountPct: Number(r.discountPct) || 0, taxPct: Number(r.taxPct) || 0,
      })),
    }
    try { await save.mutateAsync(payload); onClose() }
    catch (e: any) { setError(e?.response?.data?.error || 'Save failed') }
  }

  return (
    <div className="acc-modal-backdrop" onClick={onClose}>
      <div className="acc-modal acc-modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="acc-form-head">
          <h3 className="acc-modal-title" style={{ margin: 0 }}>{isEdit ? `Edit ${invoiceNo}` : 'New Invoice'}</h3>
          <button className="acc-btn acc-btn-ghost acc-btn-sm" onClick={onClose}>← Back</button>
        </div>

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
            <ComboBox<AccCustomer> items={customers} value={f.customerName} placeholder="Select / type customer"
              onChange={(text) => set({ customerName: text, customerId: null })}
              onPick={pickCustomer}
              onAddNew={async (name) => { const c = await saveCustomer.mutateAsync({ name, type: f.customerType }); pickCustomer(c as AccCustomer) }} />
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

        <div className="acc-section-label">Items</div>
        <LineItemsEditor rows={rows} onChange={setRows} items={items} onCreateItem={async (name) => createItem.mutateAsync({ name })} />

        {error && <p className="acc-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="acc-modal-foot">
          <button className="acc-btn acc-btn-outline" onClick={onClose}>Cancel</button>
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : isEdit ? 'Update Invoice' : 'Save Invoice'}</button>
        </div>
      </div>
    </div>
  )
}
