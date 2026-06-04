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
  unitCost: number | null
  createdAt: string
}

export interface AccCategory {
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
  items: AccSaleItem[]
  createdAt: string
  updatedAt: string
}

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
  thisMonth: number
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

export interface AccYearlyReport {
  year: number
  byMonth: { month: number; sales: number; expenses: number; net: number }[]
  totalSales: number
  totalExpenses: number
  net: number
  salesCount: number
  expenseCount: number
}

export interface AccExpenseCategoryReport {
  year: number
  category: string | null
  categories: string[]
  byCategory: { categoryName: string; amount: number }[]
  byMonth: { month: number; amount: number }[]
  total: number
}
