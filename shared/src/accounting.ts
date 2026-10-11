// ════════════════════════════════════════════════════════════════════════════
// Accounting module — shared types & enums (frontend + backend)
// Independent invoice/purchase ledger with line items.
// ════════════════════════════════════════════════════════════════════════════

export enum AccPaymentMethod {
  GCASH = 'GCASH',
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum AccPaymentStatus {
  PAID = 'PAID',
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
}

export enum AccCustomerType {
  INDIVIDUAL = 'INDIVIDUAL',
  CORPORATION = 'CORPORATION',
}

export enum AccSaleChannel {
  FACEBOOK = 'FACEBOOK',
  TIKTOK = 'TIKTOK',
  INSTAGRAM = 'INSTAGRAM',
  MARKETPLACE = 'MARKETPLACE',
  OTHERS = 'OTHERS',
}

export enum AccCountry {
  PHILIPPINES = 'PHILIPPINES',
  CHINA = 'CHINA',
  TURKEY = 'TURKEY',
  CANADA = 'CANADA',
}

export const ACC_PAYMENT_METHOD_LABELS: Record<AccPaymentMethod, string> = {
  [AccPaymentMethod.GCASH]: 'Gcash',
  [AccPaymentMethod.CASH]: 'Cash',
  [AccPaymentMethod.BANK_TRANSFER]: 'Bank Transfer',
  [AccPaymentMethod.CHECK]: 'Check',
  [AccPaymentMethod.CREDIT_CARD]: 'Credit Card',
}

export const ACC_PAYMENT_STATUS_LABELS: Record<AccPaymentStatus, string> = {
  [AccPaymentStatus.PAID]: 'Paid',
  [AccPaymentStatus.UNPAID]: 'Unpaid',
  [AccPaymentStatus.PARTIAL]: 'Partial',
}

// ─── Payment math (v2.99.0) ─────────────────────────────────────────────────
// The ONE place status and balance are computed — backend writes and frontend
// previews both call these. Money is compared in whole centavos, never as floats.
export const accCents = (n: number | string | null | undefined): number => Math.round(Number(n || 0) * 100)

/** paid ≥ total → PAID (a ₱0 invoice is paid), 0 < paid → PARTIAL, else UNPAID. */
export function accDeriveStatus(total: number, paid: number): AccPaymentStatus {
  const t = accCents(total), p = accCents(paid)
  if (p >= t) return AccPaymentStatus.PAID
  if (p > 0) return AccPaymentStatus.PARTIAL
  return AccPaymentStatus.UNPAID
}

/** What is still owed, never negative. */
export const accBalance = (total: number, paid: number): number => Math.max(0, accCents(total) - accCents(paid)) / 100

/** Today's date in Manila as YYYY-MM-DD (due dates are compared as calendar days). */
export function accManilaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

/** Whole days past the due date (0 = not late). Computed at read time, never stored. */
export function accDaysLate(dueDate: string | null | undefined, status: AccPaymentStatus | string, today: string = accManilaToday()): number {
  if (!dueDate || status === AccPaymentStatus.PAID) return 0
  const due = Date.parse(dueDate.slice(0, 10) + 'T00:00:00Z')
  const now = Date.parse(today + 'T00:00:00Z')
  return Math.max(0, Math.round((now - due) / 86_400_000))
}

export const ACC_CUSTOMER_TYPE_LABELS: Record<AccCustomerType, string> = {
  [AccCustomerType.INDIVIDUAL]: 'Individual',
  [AccCustomerType.CORPORATION]: 'Corporation',
}

export const ACC_SALE_CHANNEL_LABELS: Record<AccSaleChannel, string> = {
  [AccSaleChannel.FACEBOOK]: 'Facebook',
  [AccSaleChannel.TIKTOK]: 'TikTok',
  [AccSaleChannel.INSTAGRAM]: 'Instagram',
  [AccSaleChannel.MARKETPLACE]: 'Marketplace',
  [AccSaleChannel.OTHERS]: 'Others',
}

export const ACC_COUNTRY_LABELS: Record<AccCountry, string> = {
  [AccCountry.PHILIPPINES]: 'Philippines',
  [AccCountry.CHINA]: 'China',
  [AccCountry.TURKEY]: 'Turkey',
  [AccCountry.CANADA]: 'Canada',
}

export const ACC_CURRENCY = { code: 'PHP', symbol: '₱' } as const

// ─── Master data ────────────────────────────────────────────────────────────
export interface AccCustomer {
  id: string
  type: AccCustomerType
  name: string
  address: string | null
  email: string | null
  contactPerson: string | null
  contactNumber: string | null
  salesAgentName: string | null
  createdAt: string
  updatedAt: string
}

export interface AccVendor {
  id: string
  name: string
  email: string | null
  contactNumber: string | null
  address: string | null
  createdAt: string
  updatedAt: string
}

export interface AccItem {
  id: string
  name: string
  kind?: AccCatalogKind | null
  unitCost: number | null
  createdAt: string
}

export type AccCatalogKind = 'SALE' | 'EXPENSE'

export interface AccCategory {
  id: string
  name: string
  kind?: AccCatalogKind | null
  parentId?: string | null
  subcategories?: { id: string; name: string }[] // populated for EXPENSE parent categories
  createdAt: string
}

export interface AccStore {
  id: string
  name: string
  createdAt: string
}

// ─── Line items ─────────────────────────────────────────────────────────────
export interface AccSaleItem {
  id: string
  itemId: string | null
  itemName: string
  categoryId: string | null
  categoryName: string | null
  description: string | null
  quantity: number
  unitCost: number
  discountPct: number
  taxPct: number
  lineTotal: number
}

export interface AccExpenseItem {
  id: string
  itemId: string | null
  itemName: string
  categoryId: string | null
  categoryName: string | null
  subcategoryId: string | null
  subcategoryName: string | null
  description: string | null
  quantity: number
  unitCost: number
  discountPct: number
  taxPct: number
  lineTotal: number
}

// ─── Invoice (Sale) ─────────────────────────────────────────────────────────
export interface AccSale {
  id: string
  invoiceNo: string
  customerType: AccCustomerType
  customerId: string | null
  customerName: string
  customerAddress: string | null
  customerEmail: string | null
  customerNumber: string | null
  contactPerson: string | null
  dateIssued: string
  dueDate: string | null
  orderReference: string | null
  salesAgentId: string | null
  salesAgentName: string | null
  saleChannel: AccSaleChannel
  storeName: string | null
  status: AccPaymentStatus
  paymentMethod: AccPaymentMethod | null
  bankName: string | null
  accountName: string | null
  referenceNumber: string | null
  gcashNumber: string | null
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  note: string | null
  /** v2.99.0 — sum of non-voided payments; status is derived from it. */
  paidTotal: number
  createdByName: string | null
  updatedByName: string | null
  deletedByName: string | null
  deletedAt: string | null
  items: AccSaleItem[]
  /** Present on GET /sales/:id (newest first, voided included); absent on list rows. */
  payments?: AccSalePayment[]
  /** GET /sales/:id only — what this customer owes across all live invoices. */
  customerOpenBalance?: number
  createdAt: string
  updatedAt: string
}

export type AccPaymentSource = 'MANUAL' | 'MIGRATED'

/** v2.99.0 — one payment received against an invoice. Voided rows stay, struck through. */
export interface AccSalePayment {
  id: string
  saleId: string
  amount: number
  paidOn: string
  method: AccPaymentMethod | null
  bankName: string | null
  accountName: string | null
  referenceNumber: string | null
  gcashNumber: string | null
  note: string | null
  receivedByName: string | null
  source: AccPaymentSource
  createdByName: string | null
  createdAt: string
  voidedAt: string | null
  voidedByName: string | null
  voidReason: string | null
}

/** Body of POST /sales/:id/payments and of `initialPayment` on POST /sales. */
export interface AccPaymentInput {
  amount: number
  paidOn: string
  method: AccPaymentMethod
  bankName?: string | null
  accountName?: string | null
  referenceNumber?: string | null
  gcashNumber?: string | null
  note?: string | null
  receivedByName?: string | null
}

/** Sales list cards + tab counts (all scoped to the list's date range). */
export interface AccSalesStats {
  invoiced: number
  collected: number
  owed: number
  late: number
  lateCount: number
  openCount: number
  count: number
  avg: number
  byStatus: { UNPAID: number; PARTIAL: number; PAID: number }
}

// ─── Receivables (v2.100.0) ─────────────────────────────────────────────────
// Everything here is "as of today (Manila)", independent of any date picker.
export type AccAgingBucket = 'notDue' | 'd1_30' | 'd31_60' | 'd60'
export const ACC_AGING_LABELS: Record<AccAgingBucket, string> = {
  notDue: 'Not due yet', d1_30: '1–30 days late', d31_60: '31–60 days late', d60: 'Over 60 days late',
}
/** Which bucket an open invoice falls in. No due date counts as not due. */
export function accAgingBucket(daysLate: number): AccAgingBucket {
  if (daysLate <= 0) return 'notDue'
  if (daysLate <= 30) return 'd1_30'
  if (daysLate <= 60) return 'd31_60'
  return 'd60'
}
export interface AccAgingRow { bucket: AccAgingBucket; amount: number; count: number }

export interface AccDebtor {
  customerId: string | null
  name: string
  owed: number
  late: number
  invoices: number
}

export interface AccReceivablesOverview {
  asOf: string                       // YYYY-MM-DD, Manila
  owed: number                       // all open invoices
  openCount: number
  late: number                       // part of `owed` past its due date
  lateCount: number
  aging: AccAgingRow[]               // always 4 rows, fixed order
  collectedThisMonth: number         // payments by paidOn, current Manila month
  collectedThisMonthCount: number
  debtors: AccDebtor[]               // top 8 by owed
  debtorCount: number
  trend: { month: string; label: string; invoiced: number; collected: number }[] // last 6 months incl. this one
  /** Filled once expenses carry payments (v2.101.0); null before. */
  payables: { owed: number; count: number; late: number; lateCount: number } | null
}

export interface AccStatementRow {
  date: string
  kind: 'INVOICE' | 'PAYMENT'
  saleId: string
  invoiceNo: string
  details: string
  invoiced: number
  paid: number
  balance: number
}

export interface AccCustomerStatement {
  customer: AccCustomer
  from: string | null
  to: string | null
  asOf: string
  opening: number
  rows: AccStatementRow[]
  invoicedInPeriod: number
  paidInPeriod: number
  closing: number
  owedNow: number
  aging: AccAgingRow[]
  openInvoices: { id: string; invoiceNo: string; dateIssued: string; dueDate: string | null; total: number; paidTotal: number; balance: number; daysLate: number }[]
}

export interface AccPaymentLedgerRow {
  id: string
  saleId: string
  invoiceNo: string
  customerName: string
  paidOn: string
  amount: number
  method: AccPaymentMethod | null
  referenceNumber: string | null
  receivedByName: string | null
  source: AccPaymentSource
  voidedAt: string | null
}

export type AccAttachmentCategory = 'INVOICE' | 'PAYMENT_PROOF'

/** A document (photo or PDF) filed against a Sale or Expense — an invoice, or a payment proof. */
// Same shape for a Sale's or an Expense's attachment — two DB tables (each FKs to its
// own parent), one wire shape. `resource` distinguishes them at the API boundary.
export interface AccInvoiceAttachment {
  id: string
  category: AccAttachmentCategory
  mime: string
  originalName: string | null
  sizeBytes: number
  uploadedAt: string
  /** v2.99.0 — the sale payment a PAYMENT_PROOF belongs to (sales only; null = not linked). */
  paymentId?: string | null
}
export type AccExpenseAttachment = AccInvoiceAttachment
export type AccSaleAttachment = AccInvoiceAttachment

// ─── Purchase (Expense) ─────────────────────────────────────────────────────
export interface AccExpense {
  id: string
  purchaseNo: string
  invoiceNumber: string | null
  country: AccCountry
  vendorId: string | null
  vendorName: string
  dateIssued: string
  dueDate: string | null
  status: AccPaymentStatus
  paymentMethod: AccPaymentMethod | null
  paidBy: string | null
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  deletedAt: string | null
  items: AccExpenseItem[]
  createdAt: string
  updatedAt: string
}

export interface AccCompanyProfile {
  id: string
  name: string
  logoData: string | null
  logoMime: string | null
  address: string | null
  email: string | null
  contactNumber: string | null
  taxId: string | null
  updatedAt: string
}

export interface AccPaginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AccListStats {
  total: number
  paid: number
  unpaid: number
  avg: number
  count: number
}

export interface AccReportData {
  month: string // YYYY-MM
  totalSales: number
  totalExpenses: number
  net: number
  byDay: { day: number; sales: number; expenses: number }[]
  sales: AccSale[]
  expenses: AccExpense[]
}

export interface AccSalesAgent {
  id: string
  username: string
}

// ─── Transactions ledger — one row per line item ────────────────────────────
export interface AccSalesLedgerRow {
  id: string
  saleId: string
  dateIssued: string
  invoiceNo: string
  customerName: string
  storeName: string | null
  itemName: string
  categoryName: string | null
  description: string | null
  quantity: number
  unitCost: number
  discountPct: number
  taxPct: number
  lineTotal: number
}

export interface AccExpenseLedgerRow {
  id: string
  expenseId: string
  dateIssued: string
  purchaseNo: string
  vendorName: string
  country: AccCountry
  itemName: string
  categoryName: string | null
  subcategoryName: string | null
  description: string | null
  quantity: number
  unitCost: number
  discountPct: number
  taxPct: number
  lineTotal: number
}

export interface AccLedger<T> {
  rows: T[]
  total: number
  count: number
}

export interface AccYearlyReport {
  year: number
  byMonth: { month: number; sales: number; expenses: number; net: number }[]
  totalSales: number
  totalExpenses: number
  net: number
  salesCount: number
  expenseCount: number
}

// Range-based sales trend (date-range driven; buckets auto daily/monthly).
export interface AccSalesReport {
  trend: { label: string; amount: number }[]
  /** v2.100.0 — money received in the same buckets, by payment date (cash view). */
  collectedTrend: { label: string; amount: number }[]
  collected: number
  total: number
  count: number
  // invoiceNos: the invoice numbers behind each agent's total — surfaced on hover
  // in the Sales-by-Agent leaderboard (esp. useful for the "Unassigned" bucket).
  byAgent: { name: string; amount: number; count: number; invoiceNos: string[] }[]
}

export interface AccExpenseReport {
  trend: { label: string; amount: number }[]            // date-range bucketed (auto daily/monthly)
  byCategory: { categoryName: string; amount: number }[] // main categories only
  // Flattened category+subcategory rows (country+vendor scope): a category with no
  // subcategory shows as just its name; one with subcategories yields a row per sub,
  // labelled "Category - Subcategory".
  byCategorySub: { label: string; categoryName: string; subcategoryName: string | null; amount: number }[]
  categories: string[]                                  // categories that have spend in range (legacy; UI sources the filter from the catalog)
  total: number          // filtered (country+vendor+category+subcategory) — sum of trend
  byCategoryTotal: number // country+vendor scope (all categories) — % base for the category table
  byCategorySubTotal: number // country+vendor scope (all category+subcategory rows) — % base for the breakdown table
  count: number          // # expenses matching the active filters
}
