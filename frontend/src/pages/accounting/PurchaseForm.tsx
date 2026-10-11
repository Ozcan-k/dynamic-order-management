import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  ACC_COUNTRY_LABELS, ACC_PAYMENT_METHOD_LABELS, AccCountry, AccPaymentMethod, accBalance, accCents, accDeriveStatus, accManilaToday,
  type AccExpense, type AccVendor, type AccPaymentInput,
} from '@dom/shared'
import {
  useVendors, useSaveVendor, useItems, useCreateItem, useCategories, useCreateCategory,
  useNextPurchaseNo, useSaveExpense, useExpense, useDeleteExpense, uploadAttachment, useExpenseDuplicates, money,
} from '../../api/accounting'
import AccIcon from '../../components/accounting/AccIcon'
import { apiErrorMessage, parseAmount } from '../../components/accounting/paymentUtils'
import type { AccCategory } from '@dom/shared'
import ComboBox from '../../components/shared/ComboBox'
import ConfirmModal from '../../components/shared/ConfirmModal'
import LineItemsEditor, { type LineRow, emptyLine } from '../../components/accounting/LineItemsEditor'
import InvoiceAttachments from '../../components/accounting/InvoiceAttachments'

function todayStr() { return accManilaToday() }

// Same per-line rounding as the backend (computeLine/computeTotals), so the
// "total can't go below what is paid" check agrees with the server to the centavo.
function expenseTotal(rows: LineRow[]): number {
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
  const location = useLocation()
  const isEdit = !!initial
  const { data: vendors = [] } = useVendors()
  const saveVendor = useSaveVendor()
  const { data: items = [] } = useItems('EXPENSE')
  const createItem = useCreateItem()
  const { data: categories = [] } = useCategories('EXPENSE')
  const createCategory = useCreateCategory()
  const { data: nextNo } = useNextPurchaseNo(!isEdit)
  const save = useSaveExpense()
  const del = useDeleteExpense()
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The list's query string travels in location.state so its filters survive the round trip.
  const listSearch: string = (location.state as { listSearch?: string } | null)?.listSearch ?? ''
  const toList = () => navigate(`/accounting/expenses${listSearch}`)
  // Leaving an edit goes back to the expense page; a new expense goes back to the list.
  const back = () => (initial ? navigate(`/accounting/expenses/${initial.id}`, { state: { listSearch } }) : toList())

  const [f, setF] = useState({
    vendorId: initial?.vendorId ?? (null as string | null),
    vendorName: initial?.vendorName ?? '',
    invoiceNumber: initial?.invoiceNumber ?? '',
    country: (initial?.country ?? AccCountry.PHILIPPINES) as AccCountry,
    dateIssued: initial ? initial.dateIssued.slice(0, 10) : todayStr(),
    dueDate: initial?.dueDate ? initial.dueDate.slice(0, 10) : '',
  })
  // New expenses only: the first payment, written in the same request. Editing never
  // touches payments — they live on the expense page.
  const [pay, setPay] = useState({ mode: 'none' as PayMode, amount: '', paidOn: todayStr(), method: AccPaymentMethod.CASH as AccPaymentMethod, paidBy: '' })
  const setP = (patch: Partial<typeof pay>) => setPay((x) => ({ ...x, ...patch }))
  const [rows, setRows] = useState<LineRow[]>(initRows(initial))
  const liveTotal = useMemo(() => expenseTotal(rows), [rows])
  const paidSoFar = initial?.paidTotal ?? 0
  const belowPaid = isEdit && accCents(liveTotal) < accCents(paidSoFar)
  // Possible double entry: same supplier invoice no., or same vendor + total + date.
  // Debounced so it does not query on every keystroke. A warning only — Save still works.
  const [dupQ, setDupQ] = useState({ vendorName: '', total: 0, dateIssued: '', invoiceNumber: '' })
  // New-expense mode: files wait here until the save gives us an expense id. Two
  // independent queues — invoices and payment proofs are unrelated documents.
  const [stagedInvoice, setStagedInvoice] = useState<File[]>([])
  const [stagedPayment, setStagedPayment] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [newVendor, setNewVendor] = useState<null | { name: string; email: string; contactNumber: string }>(null)
  const [newCat, setNewCat] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [newSub, setNewSub] = useState({ parentId: '', name: '' })
  const [showNewSub, setShowNewSub] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }))

  const purchaseNo = isEdit ? initial!.purchaseNo : (nextNo?.purchaseNo ?? '…')
  const validRows = useMemo(() => rows.filter((r) => r.itemName.trim() && Number(r.unitCost) >= 0 && Number(r.quantity) > 0), [rows])
  useEffect(() => {
    const t = window.setTimeout(() => setDupQ({ vendorName: f.vendorName.trim(), total: expenseTotal(validRows), dateIssued: f.dateIssued, invoiceNumber: f.invoiceNumber.trim() }), 500)
    return () => window.clearTimeout(t)
  }, [f.vendorName, f.dateIssued, f.invoiceNumber, validRows])
  const { data: duplicates = [] } = useExpenseDuplicates(
    { ...dupQ, total: dupQ.total || undefined, invoiceNumber: dupQ.invoiceNumber || undefined, excludeId: initial?.id },
    !!(dupQ.invoiceNumber || (dupQ.vendorName && dupQ.total > 0 && dupQ.dateIssued)),
  )

  // Set once a brand-new expense has been persisted. It turns a retry into a PUT rather
  // than a second POST, so re-submitting after a failed upload cannot duplicate the record.
  const [savedId, setSavedId] = useState<string | null>(null)
  const expenseId = initial?.id ?? savedId ?? undefined

  const submit = async () => {
    setError('')
    if (!f.vendorName.trim()) return setError('Vendor is required.')
    if (validRows.length === 0) return setError('Add at least one line item (item + qty + unit cost).')
    if (belowPaid) return setError(`${money(paidSoFar)} is already paid on this expense, so the total can't go below that. Void a payment on the expense page first.`)
    const total = expenseTotal(validRows)
    let initialPayment: AccPaymentInput | null = null
    if (!isEdit && !savedId && pay.mode !== 'none' && accCents(total) > 0) {
      const amount = pay.mode === 'full' ? total : parseAmount(pay.amount)
      if (amount === null || amount <= 0) return setError('Enter the amount paid now, like 5,000 or 5,000.50.')
      if (accCents(amount) > accCents(total)) return setError(`${money(amount)} is more than the expense total of ${money(total)}. Choose Paid in full or lower the amount.`)
      initialPayment = { amount, paidOn: pay.paidOn, method: pay.method, paidByName: pay.paidBy.trim() || null }
    }
    const payload: any = {
      id: expenseId,
      vendorId: f.vendorId || null, vendorName: f.vendorName, invoiceNumber: f.invoiceNumber || null,
      country: f.country, dateIssued: f.dateIssued, dueDate: f.dueDate || null,
      initialPayment,
      items: validRows.map((r) => ({
        itemId: r.itemId || null, itemName: r.itemName, categoryId: r.categoryId || null, categoryName: r.categoryName || null,
        subcategoryId: r.subcategoryId || null, subcategoryName: r.subcategoryName || null,
        description: r.description || null, quantity: Number(r.quantity), unitCost: Number(r.unitCost),
        discountPct: Number(r.discountPct) || 0, taxPct: Number(r.taxPct) || 0,
      })),
    }

    let saved: AccExpense
    try { saved = (await save.mutateAsync(payload)) as AccExpense }
    catch (e) { return setError(apiErrorMessage(e, 'Save failed')) }

    // The expense now has an id, so the queued files finally have somewhere to go.
    if (stagedInvoice.length || stagedPayment.length) {
      setUploading(true)
      const firstPaymentId = saved.payments?.length === 1 ? saved.payments[0].id : undefined
      const flush = async (category: 'INVOICE' | 'PAYMENT_PROOF', files: File[]) => {
        const failed: File[] = []
        for (const file of files) {
          try { await uploadAttachment('expenses', saved.id, category, file, category === 'PAYMENT_PROOF' ? firstPaymentId : undefined) } catch { failed.push(file) }
        }
        return failed
      }
      const [failedInvoice, failedPayment] = await Promise.all([flush('INVOICE', stagedInvoice), flush('PAYMENT_PROOF', stagedPayment)])
      setUploading(false)
      setStagedInvoice(failedInvoice)
      setStagedPayment(failedPayment)
      const failedCount = failedInvoice.length + failedPayment.length
      if (failedCount) {
        // The expense itself is saved. Stay on the page rather than navigate away and
        // silently drop the files; savedId makes the retry an update, not a duplicate.
        setSavedId(saved.id)
        const names = [...failedInvoice, ...failedPayment].map((x) => x.name).join(', ')
        setError(`Expense saved, but ${failedCount} file(s) could not be uploaded: ${names}. Press Save again to retry.`)
        return
      }
    }
    navigate(`/accounting/expenses/${saved.id}`, { state: { listSearch } })
  }

  const payTotal = expenseTotal(validRows)
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
        <div><h1 className="acc-title">{isEdit ? `Edit ${purchaseNo}` : 'New Expense'}</h1><p className="acc-sub">Fill in the expense details and line items</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => setNewVendor({ name: '', email: '', contactNumber: '' })}>+ New Vendor</button>
          {isEdit && <button className="acc-btn acc-btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>}
          <button className="acc-btn acc-btn-ghost" onClick={back}>{isEdit ? '← Back to Expense' : '← Back to Expenses'}</button>
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

        </div>
        {duplicates.length > 0 && (
          <div className="acc-dup-warn" role="status">
            <AccIcon name="alert" />
            <div>
              <b>This may already be recorded.</b>
              <ul>
                {duplicates.map((d) => (
                  <li key={d.id}>
                    <Link to={`/accounting/expenses/${d.id}`} target="_blank" rel="noreferrer">{d.purchaseNo}</Link>
                    {' · '}{d.vendorName} · {money(d.total)} · {d.dateIssued}
                    {d.reason === 'SAME_INVOICE_NO' ? ` · same supplier invoice ${d.invoiceNumber}` : ' · same vendor, total and date'}
                  </li>
                ))}
              </ul>
              <small>You can still save. Check the existing expense first to avoid paying twice.</small>
            </div>
          </div>
        )}

        <div className="acc-section-label acc-section-label-row">
          <span>Items</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => { setNewCat(''); setShowNewCat(true) }}>+ New Category</button>
            <button type="button" className="acc-btn acc-btn-outline acc-btn-sm" onClick={() => { setNewSub({ parentId: categories[0]?.id || '', name: '' }); setShowNewSub(true) }}>+ New Subcategory</button>
          </div>
        </div>
        <LineItemsEditor rows={rows} onChange={setRows} items={items} categoryMode="expense" categories={categories}
          onCreateItem={async (name) => createItem.mutateAsync({ name, kind: 'EXPENSE' })} />

        <div className="acc-section-label acc-section-label-row" style={{ marginTop: 22 }}>
          <span>Payment</span><span className="acc-muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>Expense total {money(payTotal)}</span>
        </div>
        {isEdit || savedId ? (
          <div className={`acc-pay-summary${belowPaid ? ' is-bad' : ''}`}>
            <AccIcon name={belowPaid ? 'lock' : 'cash'} />
            <span>
              {belowPaid
                ? <>{money(paidSoFar)} is already paid, so the total can't go below that. To lower it further, void a payment on the expense page first.</>
                : <>{initial?.payments?.filter((x) => !x.voidedAt).length ?? 0} payment(s) · {money(paidSoFar)} paid · {money(accBalance(liveTotal, paidSoFar))} left after this edit. </>}
              {initial && <Link to={`/accounting/expenses/${initial.id}`} state={{ listSearch }}>Manage payments on the expense page</Link>}
            </span>
          </div>
        ) : (
          <div className="acc-v3">
            <fieldset className="acc-choice">
              <legend className="sr-only">Payment when the expense is created</legend>
              {([['none', 'Not paid yet', 'Saved as Unpaid'], ['full', 'Paid in full', `One payment of ${money(payTotal)}`], ['part', 'Part paid', 'A deposit or first instalment']] as const).map(([m, t, sub]) => (
                <label key={m} className={pay.mode === m ? 'is-on' : ''}>
                  <b><input type="radio" name="acc-new-exp-pay" value={m} checked={pay.mode === m} onChange={() => setP({ mode: m })} />{t}</b>
                  <small>{sub}</small>
                </label>
              ))}
            </fieldset>
            {pay.mode !== 'none' && (
              <div className="acc-form-grid" style={{ marginTop: 12 }}>
                {pay.mode === 'part' && (
                  <div className="acc-field"><label htmlFor="acc-ne-amt">Amount paid now <span className="req">*</span></label>
                    <input id="acc-ne-amt" inputMode="decimal" autoComplete="off" value={pay.amount} onChange={(e) => setP({ amount: e.target.value })} placeholder="e.g. 15,000" /></div>
                )}
                <div className="acc-field"><label htmlFor="acc-ne-m">Method</label>
                  <select id="acc-ne-m" value={pay.method} onChange={(e) => setP({ method: e.target.value as AccPaymentMethod })}>
                    {Object.entries(ACC_PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select></div>
                <div className="acc-field"><label htmlFor="acc-ne-d">Date paid</label>
                  <input id="acc-ne-d" type="date" value={pay.paidOn} max={todayStr()} onChange={(e) => setP({ paidOn: e.target.value })} /></div>
                <div className="acc-field"><label htmlFor="acc-ne-by">Paid by</label>
                  <input id="acc-ne-by" value={pay.paidBy} onChange={(e) => setP({ paidBy: e.target.value })} autoComplete="off" placeholder="Who paid" /></div>
              </div>
            )}
            <div className={`acc-outcome${typeof payPreview === 'object' && payPreview?.status === 'PAID' ? ' is-full' : ''}`} aria-live="polite" style={{ marginTop: 12 }}>
              {payPreview === 'empty'
                ? <><AccIcon name="half" /><span>Add line items to see how this will be saved.</span></>
                : payPreview === 'over'
                ? <><AccIcon name="alert" style={{ color: 'var(--acc-bad-ink)' }} /><span>That is more than the expense total of {money(payTotal)}. Choose Paid in full or lower the amount.</span></>
                : payPreview === null
                  ? <><AccIcon name="half" /><span>Enter the amount paid now.</span></>
                  : payPreview.status === 'PAID'
                    ? <><AccIcon name="ok" style={{ color: 'var(--acc-ok-ink)' }} /><span>Saved as <b className="ink-ok">Paid</b>.</span></>
                    : payPreview.status === 'PARTIAL'
                      ? <><AccIcon name="half" style={{ color: 'var(--acc-warn-ink)' }} /><span>Saved as <b className="ink-warn">Partial</b> · {money(payPreview.left)} still to pay. Record the rest from the expense page.</span></>
                      : <><AccIcon name="ring" /><span>Saved as <b>Unpaid</b> · {money(payPreview.left)} to pay.</span></>}
            </div>
          </div>
        )}

        <InvoiceAttachments resource="expenses" category="INVOICE" recordId={expenseId} staged={stagedInvoice} onStagedChange={setStagedInvoice} uploading={uploading} />
        <InvoiceAttachments resource="expenses" category="PAYMENT_PROOF" recordId={expenseId} staged={stagedPayment} onStagedChange={setStagedPayment} uploading={uploading} />

        {error && <p className="acc-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="acc-modal-foot">
          <button className="acc-btn acc-btn-outline" onClick={back} disabled={uploading}>Cancel</button>
          <button className="acc-btn acc-btn-primary" onClick={submit} disabled={save.isPending || uploading}>
            {uploading ? 'Uploading files…' : save.isPending ? 'Saving…' : (isEdit || savedId) ? 'Update Expense' : 'Save Expense'}
          </button>
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

      {confirmDelete && isEdit && (
        <ConfirmModal
          title={`Delete ${purchaseNo}?`}
          message="This moves the expense to the Recycle Bin. You can restore it any time from Accounting → Recycle Bin."
          confirmLabel="Move to Recycle Bin" tone="danger" busy={del.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => { await del.mutateAsync(initial!.id); setConfirmDelete(false); toList() }} />
      )}
    </div>
  )
}
