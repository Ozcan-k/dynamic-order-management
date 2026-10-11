// Column sets for the Accounting exports (v2.102.0). Kept together so the CSV and the
// Excel file of the same screen always carry the same columns in the same order.
import {
  ACC_CUSTOMER_TYPE_LABELS, ACC_COUNTRY_LABELS, ACC_PAYMENT_METHOD_LABELS, ACC_PAYMENT_STATUS_LABELS, ACC_SALE_CHANNEL_LABELS,
  accBalance, accDaysLate, accManilaToday,
  type AccSale, type AccExpense, type AccSalesLedgerRow, type AccExpenseLedgerRow, type AccPaymentLedgerRow,
} from '@dom/shared'
import type { ExportColumn } from './tableExport'

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

export function saleColumns(): ExportColumn<AccSale>[] {
  const today = accManilaToday()
  return [
    { header: 'Invoice', value: (s) => s.invoiceNo, width: 12 },
    { header: 'Issued', value: (s) => day(s.dateIssued), kind: 'date' },
    { header: 'Due', value: (s) => day(s.dueDate), kind: 'date' },
    { header: 'Customer', value: (s) => s.customerName, width: 28 },
    { header: 'Customer type', value: (s) => ACC_CUSTOMER_TYPE_LABELS[s.customerType] },
    { header: 'Store', value: (s) => s.storeName },
    { header: 'Sales agent', value: (s) => s.salesAgentName },
    { header: 'Channel', value: (s) => ACC_SALE_CHANNEL_LABELS[s.saleChannel] },
    { header: 'Total', value: (s) => s.total, kind: 'money', total: true },
    { header: 'Collected', value: (s) => s.paidTotal, kind: 'money', total: true },
    { header: 'Balance', value: (s) => accBalance(s.total, s.paidTotal), kind: 'money', total: true },
    { header: 'Status', value: (s) => ACC_PAYMENT_STATUS_LABELS[s.status] },
    { header: 'Days late', value: (s) => accDaysLate(s.dueDate, s.status, today) || null, kind: 'number', width: 10 },
    { header: 'Note', value: (s) => s.note, width: 30 },
  ]
}

export function expenseColumns(): ExportColumn<AccExpense>[] {
  const today = accManilaToday()
  return [
    { header: 'Expense', value: (e) => e.purchaseNo, width: 12 },
    { header: 'Supplier invoice', value: (e) => e.invoiceNumber },
    { header: 'Issued', value: (e) => day(e.dateIssued), kind: 'date' },
    { header: 'Due', value: (e) => day(e.dueDate), kind: 'date' },
    { header: 'Vendor', value: (e) => e.vendorName, width: 28 },
    { header: 'Country', value: (e) => ACC_COUNTRY_LABELS[e.country] },
    { header: 'Total', value: (e) => e.total, kind: 'money', total: true },
    { header: 'Paid', value: (e) => e.paidTotal, kind: 'money', total: true },
    { header: 'Still to pay', value: (e) => accBalance(e.total, e.paidTotal), kind: 'money', total: true },
    { header: 'Status', value: (e) => ACC_PAYMENT_STATUS_LABELS[e.status] },
    { header: 'Days late', value: (e) => accDaysLate(e.dueDate, e.status, today) || null, kind: 'number', width: 10 },
  ]
}

export const salesLineColumns: ExportColumn<AccSalesLedgerRow>[] = [
  { header: 'Date', value: (r) => day(r.dateIssued), kind: 'date' },
  { header: 'Invoice', value: (r) => r.invoiceNo },
  { header: 'Customer', value: (r) => r.customerName, width: 26 },
  { header: 'Store', value: (r) => r.storeName },
  { header: 'Item', value: (r) => r.itemName, width: 26 },
  { header: 'Category', value: (r) => r.categoryName },
  { header: 'Description', value: (r) => r.description, width: 26 },
  { header: 'Qty', value: (r) => r.quantity, kind: 'number', width: 8 },
  { header: 'Unit price', value: (r) => r.unitCost, kind: 'money' },
  { header: 'Disc %', value: (r) => r.discountPct, kind: 'number', width: 8 },
  { header: 'Tax %', value: (r) => r.taxPct, kind: 'number', width: 8 },
  { header: 'Line total', value: (r) => r.lineTotal, kind: 'money', total: true },
]

export const expenseLineColumns: ExportColumn<AccExpenseLedgerRow>[] = [
  { header: 'Date', value: (r) => day(r.dateIssued), kind: 'date' },
  { header: 'Expense', value: (r) => r.purchaseNo },
  { header: 'Vendor', value: (r) => r.vendorName, width: 26 },
  { header: 'Country', value: (r) => ACC_COUNTRY_LABELS[r.country] },
  { header: 'Category', value: (r) => r.categoryName },
  { header: 'Subcategory', value: (r) => r.subcategoryName },
  { header: 'Item', value: (r) => r.itemName, width: 26 },
  { header: 'Description', value: (r) => r.description, width: 26 },
  { header: 'Qty', value: (r) => r.quantity, kind: 'number', width: 8 },
  { header: 'Unit cost', value: (r) => r.unitCost, kind: 'money' },
  { header: 'Line total', value: (r) => r.lineTotal, kind: 'money', total: true },
]

/** Voided payments are exported (marked) so the trail is complete, but never totalled. */
export function paymentColumns(kind: 'sale' | 'expense'): ExportColumn<AccPaymentLedgerRow>[] {
  return [
    { header: 'Date paid', value: (r) => day(r.paidOn), kind: 'date' },
    { header: kind === 'sale' ? 'Invoice' : 'Expense', value: (r) => r.docNo },
    { header: kind === 'sale' ? 'Customer' : 'Vendor', value: (r) => r.partyName, width: 26 },
    { header: 'Method', value: (r) => (r.method ? ACC_PAYMENT_METHOD_LABELS[r.method] : 'Not recorded') },
    { header: 'Reference', value: (r) => r.referenceNumber },
    { header: kind === 'sale' ? 'Received by' : 'Paid by', value: (r) => r.personName },
    { header: 'Amount', value: (r) => (r.voidedAt ? null : r.amount), kind: 'money', total: true },
    { header: 'Voided amount', value: (r) => (r.voidedAt ? r.amount : null), kind: 'money' },
    { header: 'Source', value: (r) => (r.source === 'MIGRATED' ? 'From Paid status' : 'Recorded') },
  ]
}
