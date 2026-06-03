import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

// ─── Decimal → number serializers ──────────────────────────────────────────────
function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  return v instanceof Prisma.Decimal ? v.toNumber() : Number(v)
}
function serSale(s: any) {
  return { ...s, price: num(s.price), total: num(s.total) }
}
function serExpense(e: any) {
  return { ...e, amount: num(e.amount), total: num(e.total) }
}
function serInvoice(i: any) {
  const { companyLogoData, companyLogoMime, ...rest } = i
  return { ...rest, totalAmount: num(i.totalAmount) }
}

// ════════════════════════════════════════════════════════════════════════════
// Customers / Suppliers
// ════════════════════════════════════════════════════════════════════════════
type ContactModel = 'accCustomer' | 'accSupplier'
type ContactInput = {
  name: string
  address?: string | null
  email?: string | null
  contactPerson?: string | null
  contactNumber?: string | null
}

export function listContacts(model: ContactModel, tenantId: string, search?: string) {
  const where: any = { tenantId }
  if (search) where.name = { contains: search, mode: 'insensitive' }
  return (prisma as any)[model].findMany({ where, orderBy: { name: 'asc' } })
}
export function createContact(model: ContactModel, tenantId: string, data: ContactInput) {
  return (prisma as any)[model].create({ data: { tenantId, ...data } })
}
export async function updateContact(model: ContactModel, tenantId: string, id: string, data: ContactInput) {
  const res = await (prisma as any)[model].updateMany({ where: { id, tenantId }, data })
  if (res.count === 0) return null
  return (prisma as any)[model].findUnique({ where: { id } })
}
export async function deleteContact(model: ContactModel, tenantId: string, id: string) {
  const res = await (prisma as any)[model].deleteMany({ where: { id, tenantId } })
  return res.count > 0
}

// ════════════════════════════════════════════════════════════════════════════
// Sales
// ════════════════════════════════════════════════════════════════════════════
export interface SaleData {
  date?: Date
  product: string
  price: number
  quantity: number
  customerId?: string | null
  customerName: string
  customerAddress?: string | null
  customerNumber?: string | null
  customerEmail?: string | null
  contactPerson?: string | null
  paymentMethod: any
  bankName?: string | null
  accountName?: string | null
  referenceNumber?: string | null
  gcashNumber?: string | null
  checkNumber?: string | null
  salesStatus: any
  dueDate?: Date | null
}

function normalizeSalePayment(d: SaleData) {
  const base = { bankName: null, accountName: null, referenceNumber: null, gcashNumber: null, checkNumber: null }
  switch (d.paymentMethod) {
    case 'BANK_TRANSFER':
      return { ...base, bankName: d.bankName ?? null, accountName: d.accountName ?? null, referenceNumber: d.referenceNumber ?? null }
    case 'GCASH':
      return { ...base, gcashNumber: d.gcashNumber ?? null, referenceNumber: d.referenceNumber ?? null }
    case 'CHECK':
      return { ...base, checkNumber: d.checkNumber ?? null, accountName: d.accountName ?? null }
    default:
      return base
  }
}

export interface SaleFilters {
  from?: string; to?: string; paymentMethod?: string; salesStatus?: string
  customerId?: string; search?: string; page: number; pageSize: number
}

export async function listSales(tenantId: string, f: SaleFilters) {
  const where: any = { tenantId }
  if (f.from || f.to) {
    where.date = {}
    if (f.from) where.date.gte = new Date(f.from)
    if (f.to) where.date.lte = new Date(f.to + 'T23:59:59.999Z')
  }
  if (f.paymentMethod) where.paymentMethod = f.paymentMethod
  if (f.salesStatus) where.salesStatus = f.salesStatus
  if (f.customerId) where.customerId = f.customerId
  if (f.search) {
    where.OR = [
      { product: { contains: f.search, mode: 'insensitive' } },
      { customerName: { contains: f.search, mode: 'insensitive' } },
    ]
  }
  const [items, total] = await Promise.all([
    prisma.accSale.findMany({ where, orderBy: { date: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.accSale.count({ where }),
  ])
  return { items: items.map(serSale), total, page: f.page, pageSize: f.pageSize }
}

export async function createSale(tenantId: string, d: SaleData) {
  const sale = await prisma.accSale.create({
    data: {
      tenantId,
      date: d.date ?? new Date(),
      product: d.product,
      price: d.price,
      quantity: d.quantity,
      total: d.price * d.quantity,
      customerId: d.customerId ?? null,
      customerName: d.customerName,
      customerAddress: d.customerAddress ?? null,
      customerNumber: d.customerNumber ?? null,
      customerEmail: d.customerEmail ?? null,
      contactPerson: d.contactPerson ?? null,
      paymentMethod: d.paymentMethod,
      ...normalizeSalePayment(d),
      salesStatus: d.salesStatus,
      dueDate: d.salesStatus === 'PENDING' ? d.dueDate ?? null : null,
    },
  })
  return serSale(sale)
}

export async function updateSale(tenantId: string, id: string, d: SaleData) {
  const res = await prisma.accSale.updateMany({
    where: { id, tenantId },
    data: {
      date: d.date ?? undefined,
      product: d.product,
      price: d.price,
      quantity: d.quantity,
      total: d.price * d.quantity,
      customerId: d.customerId ?? null,
      customerName: d.customerName,
      customerAddress: d.customerAddress ?? null,
      customerNumber: d.customerNumber ?? null,
      customerEmail: d.customerEmail ?? null,
      contactPerson: d.contactPerson ?? null,
      paymentMethod: d.paymentMethod,
      ...normalizeSalePayment(d),
      salesStatus: d.salesStatus,
      dueDate: d.salesStatus === 'PENDING' ? d.dueDate ?? null : null,
    },
  })
  if (res.count === 0) return null
  return serSale(await prisma.accSale.findUnique({ where: { id } }))
}

export async function deleteSale(tenantId: string, id: string) {
  const res = await prisma.accSale.deleteMany({ where: { id, tenantId } })
  return res.count > 0
}

// ════════════════════════════════════════════════════════════════════════════
// Expenses
// ════════════════════════════════════════════════════════════════════════════
export interface ExpenseData {
  date?: Date
  country: any
  itemName: string
  supplierId?: string | null
  supplierName: string
  category: string
  amount: number
  quantity: number
  paidFrom: any
  paymentReferenceNumber?: string | null
  checkNumber?: string | null
  paidBy: string
}

function normalizePaidFrom(d: ExpenseData) {
  if (d.paidFrom === 'CHECK') return { checkNumber: d.checkNumber ?? null, paymentReferenceNumber: null }
  if (d.paidFrom === 'CASH') return { checkNumber: null, paymentReferenceNumber: null }
  return { checkNumber: null, paymentReferenceNumber: d.paymentReferenceNumber ?? null }
}

export interface ExpenseFilters {
  from?: string; to?: string; country?: string; category?: string
  paidFrom?: string; supplierId?: string; search?: string; page: number; pageSize: number
}

export async function listExpenses(tenantId: string, f: ExpenseFilters) {
  const where: any = { tenantId }
  if (f.from || f.to) {
    where.date = {}
    if (f.from) where.date.gte = new Date(f.from)
    if (f.to) where.date.lte = new Date(f.to + 'T23:59:59.999Z')
  }
  if (f.country) where.country = f.country
  if (f.category) where.category = { contains: f.category, mode: 'insensitive' }
  if (f.paidFrom) where.paidFrom = f.paidFrom
  if (f.supplierId) where.supplierId = f.supplierId
  if (f.search) {
    where.OR = [
      { itemName: { contains: f.search, mode: 'insensitive' } },
      { supplierName: { contains: f.search, mode: 'insensitive' } },
      { category: { contains: f.search, mode: 'insensitive' } },
    ]
  }
  const [items, total] = await Promise.all([
    prisma.accExpense.findMany({ where, orderBy: { date: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.accExpense.count({ where }),
  ])
  return { items: items.map(serExpense), total, page: f.page, pageSize: f.pageSize }
}

export async function createExpense(tenantId: string, d: ExpenseData) {
  const e = await prisma.accExpense.create({
    data: {
      tenantId,
      date: d.date ?? new Date(),
      country: d.country,
      itemName: d.itemName,
      supplierId: d.supplierId ?? null,
      supplierName: d.supplierName,
      category: d.category,
      amount: d.amount,
      quantity: d.quantity,
      total: d.amount * d.quantity,
      paidFrom: d.paidFrom,
      ...normalizePaidFrom(d),
      paidBy: d.paidBy,
    },
  })
  return serExpense(e)
}

export async function updateExpense(tenantId: string, id: string, d: ExpenseData) {
  const res = await prisma.accExpense.updateMany({
    where: { id, tenantId },
    data: {
      date: d.date ?? undefined,
      country: d.country,
      itemName: d.itemName,
      supplierId: d.supplierId ?? null,
      supplierName: d.supplierName,
      category: d.category,
      amount: d.amount,
      quantity: d.quantity,
      total: d.amount * d.quantity,
      paidFrom: d.paidFrom,
      ...normalizePaidFrom(d),
      paidBy: d.paidBy,
    },
  })
  if (res.count === 0) return null
  return serExpense(await prisma.accExpense.findUnique({ where: { id } }))
}

export async function deleteExpense(tenantId: string, id: string) {
  const res = await prisma.accExpense.deleteMany({ where: { id, tenantId } })
  return res.count > 0
}

// ════════════════════════════════════════════════════════════════════════════
// Company profile (logo stored as base64 in DB)
// ════════════════════════════════════════════════════════════════════════════
export async function getCompany(tenantId: string) {
  let p = await prisma.accCompanyProfile.findUnique({ where: { tenantId } })
  if (!p) p = await prisma.accCompanyProfile.create({ data: { tenantId, name: 'My Company' } })
  return p
}

export async function updateCompany(
  tenantId: string,
  fields: { name?: string; address?: string; email?: string; contactNumber?: string; taxId?: string },
  logo?: { data: string; mime: string },
) {
  await getCompany(tenantId)
  return prisma.accCompanyProfile.update({
    where: { tenantId },
    data: {
      ...(fields.name !== undefined ? { name: fields.name } : {}),
      ...(fields.address !== undefined ? { address: fields.address } : {}),
      ...(fields.email !== undefined ? { email: fields.email } : {}),
      ...(fields.contactNumber !== undefined ? { contactNumber: fields.contactNumber } : {}),
      ...(fields.taxId !== undefined ? { taxId: fields.taxId } : {}),
      ...(logo ? { logoData: logo.data, logoMime: logo.mime } : {}),
    },
  })
}

// ════════════════════════════════════════════════════════════════════════════
// Invoices
// ════════════════════════════════════════════════════════════════════════════
async function nextInvoiceNo(tenantId: string): Promise<string> {
  const year = new Date().getFullYear()
  const key = `${tenantId}:invoice:${year}`
  const counter = await prisma.accCounter.upsert({
    where: { id: key },
    create: { id: key, value: 1 },
    update: { value: { increment: 1 } },
  })
  return `INV-${year}-${String(counter.value).padStart(4, '0')}`
}

export async function createInvoiceForSale(tenantId: string, saleId: string) {
  const sale = await prisma.accSale.findFirst({ where: { id: saleId, tenantId }, include: { invoice: true } })
  if (!sale) return { error: 'not_found' as const }
  if (sale.invoice) return { invoice: serInvoice(sale.invoice) }

  const company = await getCompany(tenantId)
  const invoiceNo = await nextInvoiceNo(tenantId)
  const invoice = await prisma.accInvoice.create({
    data: {
      tenantId,
      invoiceNo,
      saleId: sale.id,
      companyName: company.name,
      companyLogoData: company.logoData,
      companyLogoMime: company.logoMime,
      companyAddress: company.address,
      companyEmail: company.email,
      companyContact: company.contactNumber,
      totalAmount: sale.total,
    },
  })
  await prisma.accSale.update({ where: { id: sale.id }, data: { invoiceId: invoice.id } })
  return { invoice: serInvoice(invoice) }
}

export async function getInvoiceWithSale(tenantId: string, id: string) {
  return prisma.accInvoice.findFirst({ where: { id, tenantId }, include: { sale: true } })
}

// ════════════════════════════════════════════════════════════════════════════
// Dashboard
// ════════════════════════════════════════════════════════════════════════════
export async function getDashboard(tenantId: string) {
  const where = { tenantId }
  const [salesAgg, expenseAgg, pendingAgg, salesCount, expenseCount, recentSales, recentExpenses] = await Promise.all([
    prisma.accSale.aggregate({ _sum: { total: true }, where }),
    prisma.accExpense.aggregate({ _sum: { total: true }, where }),
    prisma.accSale.aggregate({ _sum: { total: true }, where: { ...where, salesStatus: 'PENDING' } }),
    prisma.accSale.count({ where }),
    prisma.accExpense.count({ where }),
    prisma.accSale.findMany({ where, orderBy: { date: 'desc' }, take: 5 }),
    prisma.accExpense.findMany({ where, orderBy: { date: 'desc' }, take: 5 }),
  ])
  const totalSales = num(salesAgg._sum.total)
  const totalExpenses = num(expenseAgg._sum.total)
  return {
    totalSales,
    totalExpenses,
    net: totalSales - totalExpenses,
    pendingReceivables: num(pendingAgg._sum.total),
    salesCount,
    expenseCount,
    recentSales: recentSales.map(serSale),
    recentExpenses: recentExpenses.map(serExpense),
  }
}
