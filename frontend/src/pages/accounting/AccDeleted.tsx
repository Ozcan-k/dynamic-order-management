import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ACC_COUNTRY_LABELS, type AccSale, type AccExpense } from '@dom/shared'
import {
  useDeletedSales, useDeletedExpenses,
  useRestoreSale, useRestoreExpense, usePurgeSale, usePurgeExpense, money,
} from '../../api/accounting'
import ConfirmModal from '../../components/shared/ConfirmModal'

type Tab = 'sales' | 'expenses'

const pad = (n: number) => String(n).padStart(2, '0')
function monthRange(iso: string): { from: string; to: string } {
  const d = new Date(iso)
  const y = d.getFullYear(); const m = d.getMonth()
  const first = new Date(y, m, 1); const last = new Date(y, m + 1, 0)
  const fmt = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
  return { from: fmt(first), to: fmt(last) }
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AccDeleted() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('sales')

  const sales = useDeletedSales()
  const expenses = useDeletedExpenses()
  const restoreSale = useRestoreSale()
  const restoreExpense = useRestoreExpense()
  const purgeSale = usePurgeSale()
  const purgeExpense = usePurgeExpense()

  // Permanent-delete confirmation target (sale or expense).
  const [purgeTarget, setPurgeTarget] = useState<{ kind: Tab; id: string; label: string } | null>(null)

  const salesRows = sales.data ?? []
  const expenseRows = expenses.data ?? []

  const onRestoreSale = async (s: AccSale) => {
    await restoreSale.mutateAsync(s.id)
    const r = monthRange(s.dateIssued)
    navigate(`/accounting/sales?from=${r.from}&to=${r.to}&search=${encodeURIComponent(s.invoiceNo)}`)
  }
  const onRestoreExpense = async (e: AccExpense) => {
    await restoreExpense.mutateAsync(e.id)
    const r = monthRange(e.dateIssued)
    navigate(`/accounting/expenses?from=${r.from}&to=${r.to}&search=${encodeURIComponent(e.purchaseNo)}`)
  }

  return (
    <div className="acc-page">
      <div className="acc-head acc-head-row">
        <div><h1 className="acc-title">Recycle Bin</h1><p className="acc-sub">Deleted sales &amp; expenses — restore or remove permanently</p></div>
      </div>

      <div className="acc-tabs">
        <button className={`acc-tab${tab === 'sales' ? ' active' : ''}`} onClick={() => setTab('sales')}>Sales ({salesRows.length})</button>
        <button className={`acc-tab${tab === 'expenses' ? ' active' : ''}`} onClick={() => setTab('expenses')}>Expenses ({expenseRows.length})</button>
      </div>

      {tab === 'sales' ? (
        <div className="acc-table-wrap">
          <table>
            <thead><tr>
              <th>Invoice Number</th><th>Record Date</th><th>Customer Name</th>
              <th className="acc-col-num">Amount</th><th>Deleted</th><th className="acc-col-actions">Actions</th>
            </tr></thead>
            <tbody>
              {sales.isLoading ? <tr><td colSpan={6} className="acc-empty">Loading…</td></tr>
                : salesRows.length === 0 ? <tr><td colSpan={6} className="acc-empty">Recycle Bin is empty.</td></tr>
                : salesRows.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.invoiceNo}</td>
                    <td>{new Date(s.dateIssued).toLocaleDateString('en-US')}</td>
                    <td>{s.customerName}</td>
                    <td className="acc-col-num">{money(s.total)}</td>
                    <td><span className="acc-muted">{fmtDateTime(s.deletedAt)}</span></td>
                    <td className="acc-col-actions"><span className="acc-row-actions">
                      <button className="acc-btn acc-btn-primary acc-btn-sm" disabled={restoreSale.isPending} onClick={() => onRestoreSale(s)}>Restore</button>
                      <button className="acc-btn acc-btn-danger acc-btn-sm" onClick={() => setPurgeTarget({ kind: 'sales', id: s.id, label: s.invoiceNo })}>Delete forever</button>
                    </span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="acc-table-wrap">
          <table>
            <thead><tr>
              <th>Expense Number</th><th>Record Date</th><th>Vendor Name</th><th>Country</th>
              <th className="acc-col-num">Amount</th><th>Deleted</th><th className="acc-col-actions">Actions</th>
            </tr></thead>
            <tbody>
              {expenses.isLoading ? <tr><td colSpan={7} className="acc-empty">Loading…</td></tr>
                : expenseRows.length === 0 ? <tr><td colSpan={7} className="acc-empty">Recycle Bin is empty.</td></tr>
                : expenseRows.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{e.purchaseNo}</td>
                    <td>{new Date(e.dateIssued).toLocaleDateString('en-US')}</td>
                    <td>{e.vendorName}</td>
                    <td>{ACC_COUNTRY_LABELS[e.country]}</td>
                    <td className="acc-col-num">{money(e.total)}</td>
                    <td><span className="acc-muted">{fmtDateTime(e.deletedAt)}</span></td>
                    <td className="acc-col-actions"><span className="acc-row-actions">
                      <button className="acc-btn acc-btn-primary acc-btn-sm" disabled={restoreExpense.isPending} onClick={() => onRestoreExpense(e)}>Restore</button>
                      <button className="acc-btn acc-btn-danger acc-btn-sm" onClick={() => setPurgeTarget({ kind: 'expenses', id: e.id, label: e.purchaseNo })}>Delete forever</button>
                    </span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {purgeTarget && (
        <ConfirmModal
          title={`Permanently delete ${purgeTarget.label}?`}
          message="This cannot be undone. The record and its line items are removed for good."
          confirmLabel="Delete forever" tone="danger"
          busy={purgeSale.isPending || purgeExpense.isPending}
          onCancel={() => setPurgeTarget(null)}
          onConfirm={async () => {
            if (purgeTarget.kind === 'sales') await purgeSale.mutateAsync(purgeTarget.id)
            else await purgeExpense.mutateAsync(purgeTarget.id)
            setPurgeTarget(null)
          }} />
      )}
    </div>
  )
}
