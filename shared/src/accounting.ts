// ════════════════════════════════════════════════════════════════════════════
// Accounting module — shared types & enums (frontend + backend)
// Fully independent of the order pipeline.
// ════════════════════════════════════════════════════════════════════════════

export enum AccPaymentMethod {
  GCASH = 'GCASH',
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
}

export enum AccSalesStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
}

export enum AccCountry {
  PHILIPPINES = 'PHILIPPINES',
  CHINA = 'CHINA',
  TURKEY = 'TURKEY',
  CANADA = 'CANADA',
}

export enum AccPaidFrom {
  BANK = 'BANK',
  GCASH = 'GCASH',
  CREDIT_CARD = 'CREDIT_CARD',
  CASH = 'CASH',
  CHECK = 'CHECK',
}

export const ACC_PAYMENT_METHOD_LABELS: Record<AccPaymentMethod, string> = {
  [AccPaymentMethod.GCASH]: 'Gcash',
  [AccPaymentMethod.CASH]: 'Cash',
  [AccPaymentMethod.BANK_TRANSFER]: 'Bank Transfer',
  [AccPaymentMethod.CHECK]: 'Check',
}

export const ACC_SALES_STATUS_LABELS: Record<AccSalesStatus, string> = {
  [AccSalesStatus.PAID]: 'Paid',
  [AccSalesStatus.PENDING]: 'Pending',
}

export const ACC_COUNTRY_LABELS: Record<AccCountry, string> = {
  [AccCountry.PHILIPPINES]: 'Philippines',
  [AccCountry.CHINA]: 'China',
  [AccCountry.TURKEY]: 'Turkey',
  [AccCountry.CANADA]: 'Canada',
}

export const ACC_PAID_FROM_LABELS: Record<AccPaidFrom, string> = {
  [AccPaidFrom.BANK]: 'Bank',
  [AccPaidFrom.GCASH]: 'Gcash',
  [AccPaidFrom.CREDIT_CARD]: 'Credit Card',
  [AccPaidFrom.CASH]: 'Cash',
  [AccPaidFrom.CHECK]: 'Check',
}

export const ACC_CURRENCY = { code: 'PHP', symbol: '₱' } as const

export interface AccContact {
  id: string
  name: string
  address: string | null
  email: string | null
  contactPerson: string | null
  contactNumber: string | null
  createdAt: string
  updatedAt: string
}

export interface AccSale {
  id: string
  date: string
  product: string
  price: number
  quantity: number
  total: number
  customerId: string | null
  customerName: string
  customerAddress: string | null
  customerNumber: string | null
  customerEmail: string | null
  contactPerson: string | null
  paymentMethod: AccPaymentMethod
  bankName: string | null
  accountName: string | null
  referenceNumber: string | null
  gcashNumber: string | null
  checkNumber: string | null
  salesStatus: AccSalesStatus
  dueDate: string | null
  invoiceId: string | null
  createdAt: string
  updatedAt: string
}

export interface AccExpense {
  id: string
  expenseNo: number
  date: string
  country: AccCountry
  itemName: string
  supplierId: string | null
  supplierName: string
  category: string
  amount: number
  quantity: number
  total: number
  paidFrom: AccPaidFrom
  paymentReferenceNumber: string | null
  checkNumber: string | null
  paidBy: string
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

export interface AccInvoice {
  id: string
  invoiceNo: string
  saleId: string
  issuedDate: string
  companyName: string
  totalAmount: number
  createdAt: string
}

export interface AccPaginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface AccDashboardSummary {
  totalSales: number
  totalExpenses: number
  net: number
  pendingReceivables: number
  salesCount: number
  expenseCount: number
  recentSales: AccSale[]
  recentExpenses: AccExpense[]
}
