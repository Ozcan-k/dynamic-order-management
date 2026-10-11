import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import {
  ACC_CUSTOMER_TYPE_LABELS, ACC_SALE_CHANNEL_LABELS, ACC_PAYMENT_METHOD_LABELS,
  AccCustomerType, AccSaleChannel, AccPaymentMethod, accBalance, accCents, accDeriveStatus, accManilaToday,
  type AccSale, type AccCustomer, type AccPaymentInput,
} from '@dom/shared'
import {
  useCustomers, useSaveCustomer, useItems, useCreateItem, useCategories, useCreateCategory,
  useStores, useCreateStore, useSalesAgents, useNextInvoiceNo, useSaveSale, useSale, useDeleteSale,
  uploadAttachment, money,
} from '../../api/accounting'
import ComboBox from '../../components/shared/ComboBox'
import ConfirmModal from '../../components/shared/ConfirmModal'
import LineItemsEditor, { type LineRow, emptyLine } from '../../components/accounting/LineItemsEditor'
import InvoiceAttachments from '../../components/accounting/InvoiceAttachments'
import AccIcon from '../../components/accounting/AccIcon'
import { parseAmount } from '../../components/accounting/paymentUtils'

function todayStr() { return accManilaToday() }

// Same per-line rounding as the backend's computeLine/computeTotals, so the "total can't
// go below what is collected" check here agrees with the server to the centavo.
function invoiceTotal(rows: LineRow[]): number {
  const r2 = (n: number) => Math.round(n * 100) / 100
  let t = 0
  for (const l of rows) {
    const gross = (Number(l.quantity) || 0) * (Number(l.unitCost) || 0)
    const net = gross - gross * ((Number(l.discountPct) || 0) / 100)
    t += r2(net + net * ((Number(l.taxPct) || 0) / 100))
  }
  return r2(t)
}

type PayMode = 'none' | 'full' | 'part'

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
  const del = useDeleteSale()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Leaving goes to where the person came from: the invoice page when editing, the list otherwise.
  const back = () => navigate(initial ? `/accounting/sales/${initial.id}` : '/accounting/sales')

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
    note: initial?.note ?? '',
  })
  // New invoices only: the first payment, written in the same request as the invoice.
  // Editing never touches payments — they live on the invoice page.
  const [pay, setPay] = useState({
    mode: 'none' as PayMode, amount: '', paidOn: todayStr(), method: AccPaymentMethod.CASH as AccPaymentMethod,
    bankName: '', accountName: '', referenceNumber: '', gcashNumber: '',
  })
  const setP = (patch: Partial<typeof pay>) => setPay((p) => ({ ...p, ...patch }))
  const [rows, setRows] = useState<LineRow[]>(initRows(initial))
  const liveTotal = useMemo(() => invoiceTotal(rows), [rows])
  const collected = initial?.paidTotal ?? 0
  const belowCollected = isEdit && accCents(liveTotal) < accCents(collected)
  // New-invoice mode: files wait here until the save gives us a sale id. Two independent
  // queues — invoices and payment proofs are unrelated documents.
  const [stagedInvoice, setStagedInvoice] = useState<File[]>([])
  const [stagedPayment, setStagedPayment] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [newCust, setNewCust] = useState<null | typeof emptyNewCust>(null)
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [newStore, setNewStore] = useState('')
  const [showNewStore, setShowNewStore] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }))

  // Set once a brand-new invoice has been persisted. It turns a retry into a PUT rather
  // than a second POST, so re-submitting after a failed upload cannot duplicate the record.
  const [savedId, setSavedId] = useState<string | null>(null)
  const saleId = initial?.id ?? savedId ?? undefined

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
    if (belowCollected) return setError(`${money(collected)} is already collected on this invoice, so the total can't go below that. Void a payment on the invoice page first.`)
    const total = invoiceTotal(validRows)
    let initialPayment: AccPaymentInput | null = null
    if (!isEdit && !savedId && pay.mode !== 'none' && accCents(total) > 0) {
      const amount = pay.mode === 'full' ? total : parseAmount(pay.amount)
      if (amount === null || amount <= 0) return setError('Enter the amount the customer paid now, like 5,000 or 5,000.50.')
      if (accCents(amount) > accCents(total)) return setError(`${money(amount)} is more than the invoice total of ${money(total)}. Choose Paid in full or lower the amount.`)
      if (pay.method === 'BANK_TRANSFER' && (!pay.bankName.trim() || !pay.accountName.trim() || !pay.referenceNumber.trim())) return setError('Bank, account name and reference number are needed for a bank transfer.')
      if (pay.method === 'GCASH' && !pay.gcashNumber.trim()) return setError('The GCash number is needed.')
      initialPayment = {
        amount, paidOn: pay.paidOn, method: pay.method,
        bankName: pay.bankName || null, accountName: pay.accountName || null,
        referenceNumber: pay.referenceNumber || null, gcashNumber: pay.gcashNumber || null,
      }
    }
    const agentName = f.salesAgentId ? (agents.find((a) => a.id === f.salesAgentId)?.username ?? f.salesAgentName) : f.salesAgentName
    const payload: any = {
      id: saleId,
      customerType: f.customerType, customerId: f.customerId || null, customerName: f.customerName,
      customerAddress: f.customerAddress || null, customerEmail: f.customerEmail || null, customerNumber: f.customerNumber || null,
      contactPerson: f.contactPerson || null,
      dateIssued: f.dateIssued, dueDate: f.dueDate || null, orderReference: f.orderReference || null,
      salesAgentId: f.salesAgentId || null, salesAgentName: agentName || null,
      saleChannel: f.saleChannel, storeName: f.storeName || null,
      note: f.note.trim() || null,
      initialPayment,
      items: validRows.map((r) => ({
        itemId: r.itemId || null, itemName: r.itemName, categoryId: r.categoryId || null, categoryName: r.categoryName || null,
        description: r.description || null,
        quantity: Number(r.quantity), unitCost: Number(r.unitCost), discountPct: Number(r.discountPct) || 0, taxPct: Number(r.taxPct) || 0,
      })),
    }
    let saved: AccSale
    try { saved = (await save.mutateAsync(payload)) as AccSale }
    catch (e: any) { return setError(e?.response?.data?.error || 'Save failed') }

    // The invoice now has an id, so the queued files finally have somewhere to go.
    if (stagedInvoice.length || stagedPayment.length) {
      setUploading(true)
      // A proof queued with a first payment belongs to that payment.
      const firstPaymentId = saved.payments?.length === 1 ? saved.payments[0].id : undefined
      const flush = async (category: 'INVOICE' | 'PAYMENT_PROOF', files: File[]) => {
        const failed: File[] = []
        for (const file of files) {
          try { await uploadAttachment('sales', saved.id, category, file, category === 'PAYMENT_PROOF' ? firstPaymentId : undefined) } catch { failed.push(file) }
        }
        return failed
      }
      const [failedInvoice, failedPayment] = await Promise.all([flush('INVOICE', stagedInvoice), flush('PAYMENT_PROOF', stagedPayment)])
      setUploading(false)
      setStagedInvoice(failedInvoice)
      setStagedPayment(failedPayment)
      const failedCount = failedInvoice.length + failedPayment.length
      if (failedCount) {
        // The invoice itself is saved. Stay on the page rather than navigate away and
        // silently drop the files; savedId makes the retry an update, not a duplicate.
        setSavedId(saved.id)
        const names = [...failedInvoice, ...failedPayment].map((x) => x.name).join(', ')
        setError(`Invoice saved, but ${failedCount} file(s) could not be uploaded: ${names}. Press Save again to retry.`)
        return
      }
    }
    navigate(`/accounting/sales/${saved.id}`)
  }

  const payTotal = invoiceTotal(validRows)
  const partValue = parseAmount(pay.amount)
  const payPreview = (() => {
    if (accCents(payTotal) === 0) return 'empty' as const
    if (pay.mode === 'none') return { status: accDeriveStatus(payTotal, 0), left: payTotal }
    if (pay.mode === 'full') return { status: accDeriveStatus(payTotal, payTotal), left: 0 }
    if (partValue === null || partValue <= 0) return null
    if (accCents(partValue) > accCents(payTotal)) return 'over' as const
    return { status: accDeriveStatus(payTotal, partValue), left: accBalance(payTotal, partValue) }
  })()

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">{isEdit ? `Edit ${invoiceNo}` : 'New Invoice'}</h1><p className="acc-sub">Fill in the invoice details and line items</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isEdit && <button className="acc-btn acc-btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button className="acc-btn acc-btn-ghost" onClick={back}>{isEdit ? '← Back to Invoice' : '← Back to Sales'}</button>
        </div>
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

        <div className="acc-section-label acc-section-label-row" style={{ marginTop: 22 }}>
          <span>Payment</span><span className="acc-muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Invoice total {money(payTotal)}</span>
        </div>
        {isEdit || savedId ? (
          <div className={`acc-pay-summary${belowCollected ? ' is-bad' : ''}`}>
            <AccIcon name={belowCollected ? 'lock' : 'cash'} />
            <span>
              {belowCollected
                ? <>{money(collected)} is already collected, so the total can't go below that. To lower it further, void a payment on the invoice page first.</>
                : <>{initial?.payments?.filter((p) => !p.voidedAt).length ?? 0} payment(s) · {money(collected)} collected · {money(accBalance(liveTotal, collected))} left after this edit. </>}
              {initial && <Link to={`/accounting/sales/${initial.id}`}>Manage payments on the invoice page</Link>}
            </span>
          </div>
        ) : (
          <div className="acc-v3">
            <fieldset className="acc-choice">
              <legend className="sr-only">Payment when the invoice is created</legend>
              {([['none', 'Not paid yet', 'Saved as Unpaid'], ['full', 'Paid in full', `One payment of ${money(payTotal)}`], ['part', 'Part paid', 'The customer paid a deposit']] as const).map(([m, t, s]) => (
                <label key={m} className={pay.mode === m ? 'is-on' : ''}>
                  <b><input type="radio" name="acc-new-pay" value={m} checked={pay.mode === m} onChange={() => setP({ mode: m })} />{t}</b>
                  <small>{s}</small>
                </label>
              ))}
            </fieldset>
            {pay.mode !== 'none' && (
              <div className="acc-form-grid" style={{ marginTop: 12 }}>
                {pay.mode === 'part' && (
                  <div className="acc-field"><label htmlFor="acc-np-amt">Amount paid now <span className="req">*</span></label>
                    <input id="acc-np-amt" inputMode="decimal" autoComplete="off" value={pay.amount} onChange={(e) => setP({ amount: e.target.value })} placeholder="e.g. 15,000" /></div>
                )}
                <div className="acc-field"><label htmlFor="acc-np-m">Method</label>
                  <select id="acc-np-m" value={pay.method} onChange={(e) => setP({ method: e.target.value as AccPaymentMethod })}>
                    {Object.entries(ACC_PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                <div className="acc-field"><label htmlFor="acc-np-d">Date paid</label>
                  <input id="acc-np-d" type="date" value={pay.paidOn} max={todayStr()} onChange={(e) => setP({ paidOn: e.target.value })} /></div>
                {pay.method === 'BANK_TRANSFER' && <>
                  <div className="acc-field"><label>Bank <span className="req">*</span></label><input value={pay.bankName} onChange={(e) => setP({ bankName: e.target.value })} /></div>
                  <div className="acc-field"><label>Account Name <span className="req">*</span></label><input value={pay.accountName} onChange={(e) => setP({ accountName: e.target.value })} /></div>
                  <div className="acc-field"><label>Reference No. <span className="req">*</span></label><input value={pay.referenceNumber} onChange={(e) => setP({ referenceNumber: e.target.value })} /></div>
                </>}
                {pay.method === 'GCASH' && <>
                  <div className="acc-field"><label>GCash Number <span className="req">*</span></label><input inputMode="tel" value={pay.gcashNumber} onChange={(e) => setP({ gcashNumber: e.target.value })} /></div>
                  <div className="acc-field"><label>Reference No.</label><input value={pay.referenceNumber} onChange={(e) => setP({ referenceNumber: e.target.value })} /></div>
                </>}
                {pay.method === 'CHECK' && <>
                  <div className="acc-field"><label>Check No.</label><input value={pay.referenceNumber} onChange={(e) => setP({ referenceNumber: e.target.value })} /></div>
                  <div className="acc-field"><label>Account Name</label><input value={pay.accountName} onChange={(e) => setP({ accountName: e.target.value })} /></div>
                </>}
              </div>
            )}
            <div className={`acc-outcome${typeof payPreview === 'object' && payPreview?.status === 'PAID' ? ' is-full' : ''}`} aria-live="polite" style={{ marginTop: 12 }}>
              {payPreview === 'empty'
                ? <><AccIcon name="half" /><span>Add line items to see how this will be saved.</span></>
                : payPreview === 'over'
                ? <><AccIcon name="alert" style={{ color: 'var(--acc-bad-ink)' }} /><span>That is more than the invoice total of {money(payTotal)}. Choose Paid in full or lower the amount.</span></>
                : payPreview === null
                  ? <><AccIcon name="half" /><span>Enter the amount paid now.</span></>
                  : payPreview.status === 'PAID'
                    ? <><AccIcon name="ok" style={{ color: 'var(--acc-ok-ink)' }} /><span>Saved as <b className="ink-ok">Paid</b>.</span></>
                    : payPreview.status === 'PARTIAL'
                      ? <><AccIcon name="half" style={{ color: 'var(--acc-warn-ink)' }} /><span>Saved as <b className="ink-warn">Partial</b> · {money(payPreview.left)} left. Record the rest from the invoice page.</span></>
                      : <><AccIcon name="ring" /><span>Saved as <b>Unpaid</b> · {money(payPreview.left)} to collect.</span></>}
            </div>
          </div>
        )}

        <InvoiceAttachments resource="sales" category="INVOICE" recordId={saleId} staged={stagedInvoice} onStagedChange={setStagedInvoice} uploading={uploading} />
        <InvoiceAttachments resource="sales" category="PAYMENT_PROOF" recordId={saleId} staged={stagedPayment} onStagedChange={setStagedPayment} uploading={uploading} />

        {error && <p className="acc-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="acc-modal-foot">
          <button className="acc-btn acc-btn-outline" onClick={back} disabled={uploading}>Cancel</button>
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending || uploading}>
            {uploading ? 'Uploading files…' : save.isPending ? 'Saving…' : (isEdit || savedId) ? 'Update Invoice' : 'Save Invoice'}
          </button>
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

      {confirmDelete && isEdit && (
        <ConfirmModal
          title={`Delete ${invoiceNo}?`}
          message="This moves the invoice to the Recycle Bin. You can restore it any time from Accounting → Recycle Bin."
          confirmLabel="Move to Recycle Bin" tone="danger" busy={del.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => { await del.mutateAsync(initial!.id); setConfirmDelete(false); navigate('/accounting/sales') }} />
      )}
    </div>
  )
}
