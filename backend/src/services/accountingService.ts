import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

// ─── helpers ────────────────────────────────────────────────────────────────
function num(v: unknown): number {
  if (v === null || v === undefined) return 0
  return v instanceof Prisma.Decimal ? v.toNumber() : Number(v)
}
const r2 = (n: number) => Math.round(n * 100) / 100

interface LineInput {
  itemId?: string | null
  itemName: string
  categoryId?: string | null
  categoryName?: string | null
  description?: string | null
  quantity: number
  unitCost: number
  discountPct?: number
  taxPct?: number
}

function computeLine(l: LineInput) {
  const gross = (l.quantity || 0) * (l.unitCost || 0)
  const disc = gross * ((l.discountPct || 0) / 100)
  const net = gross - disc
  const tax = net * ((l.taxPct || 0) / 100)
  return { gross: r2(gross), disc: r2(disc), tax: r2(tax), lineTotal: r2(net + tax) }
}

function computeTotals(items: LineInput[]) {
  let subtotal = 0, discountTotal = 0, taxTotal = 0, total = 0
  for (const l of items) {
    const c = computeLine(l)
    subtotal += c.gross; discountTotal += c.disc; taxTotal += c.tax; total += c.lineTotal
  }
  return { subtotal: r2(subtotal), discountTotal: r2(discountTotal), taxTotal: r2(taxTotal), total: r2(total) }
}

function serItem(i: any) {
  return {
    ...i,
    quantity: num(i.quantity), unitCost: num(i.unitCost),
    discountPct: num(i.discountPct), taxPct: num(i.taxPct), lineTotal: num(i.lineTotal),
  }
}
function serSale(s: any) {
  return {
    ...s,
    subtotal: num(s.subtotal), discountTotal: num(s.discountTotal), taxTotal: num(s.taxTotal), total: num(s.total),
    items: (s.items ?? []).map(serItem),
  }
}
function serExpense(e: any) {
  return {
    ...e,
    subtotal: num(e.subtotal), discountTotal: num(e.discountTotal), taxTotal: num(e.taxTotal), total: num(e.total),
    items: (e.items ?? []).map(serItem),
  }
}

// ─── numbering ──────────────────────────────────────────────────────────────
async function nextNumber(tenantId: string, kind: 'invoice' | 'purchase'): Promise<string> {
  const counter = await prisma.accCounter.upsert({
    where: { id: `${tenantId}:${kind}` },
    create: { id: `${tenantId}:${kind}`, value: 1 },
    update: { value: { increment: 1 } },
  })
  const prefix = kind === 'invoice' ? 'INV' : 'PUR'
  return `${prefix}/${String(counter.value).padStart(3, '0')}`
}

export async function peekNextNumber(tenantId: string, kind: 'invoice' | 'purchase'): Promise<string> {
  const counter = await prisma.accCounter.findUnique({ where: { id: `${tenantId}:${kind}` } })
  const next = (counter?.value ?? 0) + 1
  return `${kind === 'invoice' ? 'INV' : 'PUR'}/${String(next).padStart(3, '0')}`
}

// ─── auto-capture helpers (archive + catalogs self-populate) ────────────────
async function ensureCustomerId(tenantId: string, d: any): Promise<string | null> {
  if (d.customerId) return d.customerId
  const name = (d.customerName || '').trim()
  if (!name) return null
  const ex = await prisma.accCustomer.findFirst({ where: { tenantId, name } })
  if (ex) {
    if (!ex.salesAgentName && d.salesAgentName) await prisma.accCustomer.update({ where: { id: ex.id }, data: { salesAgentName: d.salesAgentName } })
    return ex.id
  }
  const c = await prisma.accCustomer.create({
    data: {
      tenantId, type: d.customerType ?? 'INDIVIDUAL', name,
      address: d.customerAddress ?? null, email: d.customerEmail ?? null,
      contactPerson: d.contactPerson ?? null, contactNumber: d.customerNumber ?? null,
      salesAgentName: d.salesAgentName ?? null,
    },
  })
  return c.id
}
async function ensureVendorId(tenantId: string, d: any): Promise<string | null> {
  if (d.vendorId) return d.vendorId
  const name = (d.vendorName || '').trim()
  if (!name) return null
  const ex = await prisma.accVendor.findFirst({ where: { tenantId, name } })
  if (ex) return ex.id
  const v = await prisma.accVendor.create({ data: { tenantId, name } })
  return v.id
}
async function ensureItemsCatalog(tenantId: string, items: LineInput[], withCategory: boolean) {
  for (const l of items) {
    if (!l.itemId && l.itemName?.trim()) {
      const name = l.itemName.trim()
      const ex = await prisma.accItem.findFirst({ where: { tenantId, name } })
      l.itemId = ex ? ex.id : (await prisma.accItem.create({ data: { tenantId, name, unitCost: l.unitCost ?? null } })).id
    }
    if (withCategory && !l.categoryId && (l.categoryName || '').trim()) {
      const cname = (l.categoryName as string).trim()
      const ex = await prisma.accCategory.findFirst({ where: { tenantId, name: cname } })
      l.categoryId = ex ? ex.id : (await prisma.accCategory.create({ data: { tenantId, name: cname } })).id
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Master data: customers, vendors, items, categories
// ════════════════════════════════════════════════════════════════════════════
export function listCustomers(tenantId: string, search?: string) {
  const where: any = { tenantId }
  if (search) where.name = { contains: search, mode: 'insensitive' }
  return prisma.accCustomer.findMany({ where, orderBy: { name: 'asc' } })
}
export function createCustomer(tenantId: string, d: any) {
  return prisma.accCustomer.create({
    data: {
      tenantId, type: d.type ?? 'INDIVIDUAL', name: d.name,
      address: d.address ?? null, email: d.email ?? null,
      contactPerson: d.contactPerson ?? null, contactNumber: d.contactNumber ?? null,
      salesAgentName: d.salesAgentName ?? null,
    },
  })
}
export async function updateCustomer(tenantId: string, id: string, d: any) {
  const res = await prisma.accCustomer.updateMany({
    where: { id, tenantId },
    data: {
      type: d.type, name: d.name, address: d.address ?? null, email: d.email ?? null,
      contactPerson: d.contactPerson ?? null, contactNumber: d.contactNumber ?? null,
    },
  })
  if (!res.count) return null
  return prisma.accCustomer.findUnique({ where: { id } })
}
export async function deleteCustomer(tenantId: string, id: string) {
  const res = await prisma.accCustomer.deleteMany({ where: { id, tenantId } })
  return res.count > 0
}

export function listVendors(tenantId: string, search?: string) {
  const where: any = { tenantId }
  if (search) where.name = { contains: search, mode: 'insensitive' }
  return prisma.accVendor.findMany({ where, orderBy: { name: 'asc' } })
}
export function createVendor(tenantId: string, d: any) {
  return prisma.accVendor.create({
    data: { tenantId, name: d.name, email: d.email ?? null, contactNumber: d.contactNumber ?? null, address: d.address ?? null },
  })
}
export async function updateVendor(tenantId: string, id: string, d: any) {
  const res = await prisma.accVendor.updateMany({
    where: { id, tenantId },
    data: { name: d.name, email: d.email ?? null, contactNumber: d.contactNumber ?? null, address: d.address ?? null },
  })
  if (!res.count) return null
  return prisma.accVendor.findUnique({ where: { id } })
}
export async function deleteVendor(tenantId: string, id: string) {
  const res = await prisma.accVendor.deleteMany({ where: { id, tenantId } })
  return res.count > 0
}

export function listItems(tenantId: string) {
  return prisma.accItem.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
}
export function createItem(tenantId: string, d: any) {
  return prisma.accItem.create({ data: { tenantId, name: d.name, unitCost: d.unitCost ?? null } })
}
export function listCategories(tenantId: string) {
  return prisma.accCategory.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
}
export function createCategory(tenantId: string, d: any) {
  return prisma.accCategory.create({ data: { tenantId, name: d.name } })
}

// ════════════════════════════════════════════════════════════════════════════
// Sales agents (read-only lookup of dom SALES_AGENT users — no schema coupling)
// ════════════════════════════════════════════════════════════════════════════
export async function listSalesAgents(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId, role: 'SALES_AGENT' },
    select: { id: true, username: true },
    orderBy: { username: 'asc' },
  })
  return users
}

// ════════════════════════════════════════════════════════════════════════════
// Invoices (Sales)
// ════════════════════════════════════════════════════════════════════════════
function normalizeSalePayment(d: any) {
  const base = { paymentMethod: null as any, bankName: null, accountName: null, referenceNumber: null, gcashNumber: null }
  if (d.status !== 'PAID') return base
  const pm = d.paymentMethod ?? null
  const out: any = { ...base, paymentMethod: pm }
  if (pm === 'BANK_TRANSFER') { out.bankName = d.bankName ?? null; out.accountName = d.accountName ?? null; out.referenceNumber = d.referenceNumber ?? null }
  else if (pm === 'GCASH') { out.gcashNumber = d.gcashNumber ?? null; out.referenceNumber = d.referenceNumber ?? null }
  else if (pm === 'CHECK') { out.referenceNumber = d.referenceNumber ?? null; out.accountName = d.accountName ?? null }
  return out
}

export interface SaleFilters {
  from?: string; to?: string; status?: string; customerId?: string; saleChannel?: string
  search?: string; page: number; pageSize: number
}

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return undefined
  const w: any = {}
  if (from) w.gte = new Date(from)
  if (to) w.lte = new Date(to + 'T23:59:59.999Z')
  return w
}

export async function listSales(tenantId: string, f: SaleFilters) {
  const where: any = { tenantId }
  const dw = dateWhere(f.from, f.to); if (dw) where.dateIssued = dw
  if (f.status) where.status = f.status
  if (f.customerId) where.customerId = f.customerId
  if (f.saleChannel) where.saleChannel = f.saleChannel
  if (f.search) where.OR = [
    { invoiceNo: { contains: f.search, mode: 'insensitive' } },
    { customerName: { contains: f.search, mode: 'insensitive' } },
  ]
  const [items, total] = await Promise.all([
    prisma.accSale.findMany({ where, include: { items: true }, orderBy: { dateIssued: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.accSale.count({ where }),
  ])
  return { items: items.map(serSale), total, page: f.page, pageSize: f.pageSize }
}

export async function salesStats(tenantId: string) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const [all, paid, unpaid, month, count] = await Promise.all([
    prisma.accSale.aggregate({ _sum: { total: true }, where: { tenantId } }),
    prisma.accSale.aggregate({ _sum: { total: true }, where: { tenantId, status: 'PAID' } }),
    prisma.accSale.aggregate({ _sum: { total: true }, where: { tenantId, status: 'UNPAID' } }),
    prisma.accSale.aggregate({ _sum: { total: true }, where: { tenantId, dateIssued: { gte: monthStart } } }),
    prisma.accSale.count({ where: { tenantId } }),
  ])
  return { total: num(all._sum.total), paid: num(paid._sum.total), unpaid: num(unpaid._sum.total), thisMonth: num(month._sum.total), count }
}

export async function getSale(tenantId: string, id: string) {
  return prisma.accSale.findFirst({ where: { id, tenantId }, include: { items: true } }).then((s) => (s ? serSale(s) : null))
}

export async function createSale(tenantId: string, d: any) {
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  d.customerId = await ensureCustomerId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, true)
  const invoiceNo = await nextNumber(tenantId, 'invoice')
  const sale = await prisma.accSale.create({
    data: {
      tenantId, invoiceNo,
      customerType: d.customerType ?? 'INDIVIDUAL',
      customerId: d.customerId ?? null,
      customerName: d.customerName,
      customerAddress: d.customerAddress ?? null,
      customerEmail: d.customerEmail ?? null,
      customerNumber: d.customerNumber ?? null,
      contactPerson: d.contactPerson ?? null,
      dateIssued: d.dateIssued ? new Date(d.dateIssued) : new Date(),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      orderReference: d.orderReference ?? null,
      salesAgentId: d.salesAgentId ?? null,
      salesAgentName: d.salesAgentName ?? null,
      saleChannel: d.saleChannel ?? 'OTHERS',
      status: d.status ?? 'UNPAID',
      ...normalizeSalePayment(d),
      ...totals,
      items: {
        create: items.map((l) => ({
          itemId: l.itemId ?? null, itemName: l.itemName, categoryId: l.categoryId ?? null, categoryName: l.categoryName ?? null,
          description: l.description ?? null,
          quantity: l.quantity, unitCost: l.unitCost, discountPct: l.discountPct ?? 0, taxPct: l.taxPct ?? 0,
          lineTotal: computeLine(l).lineTotal,
        })),
      },
    },
    include: { items: true },
  })
  return serSale(sale)
}

export async function updateSale(tenantId: string, id: string, d: any) {
  const existing = await prisma.accSale.findFirst({ where: { id, tenantId } })
  if (!existing) return null
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  d.customerId = await ensureCustomerId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, true)
  await prisma.accSaleItem.deleteMany({ where: { saleId: id } })
  const sale = await prisma.accSale.update({
    where: { id },
    data: {
      customerType: d.customerType ?? 'INDIVIDUAL',
      customerId: d.customerId ?? null,
      customerName: d.customerName,
      customerAddress: d.customerAddress ?? null,
      customerEmail: d.customerEmail ?? null,
      customerNumber: d.customerNumber ?? null,
      contactPerson: d.contactPerson ?? null,
      dateIssued: d.dateIssued ? new Date(d.dateIssued) : existing.dateIssued,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      orderReference: d.orderReference ?? null,
      salesAgentId: d.salesAgentId ?? null,
      salesAgentName: d.salesAgentName ?? null,
      saleChannel: d.saleChannel ?? 'OTHERS',
      status: d.status ?? 'UNPAID',
      ...normalizeSalePayment(d),
      ...totals,
      items: {
        create: items.map((l) => ({
          itemId: l.itemId ?? null, itemName: l.itemName, categoryId: l.categoryId ?? null, categoryName: l.categoryName ?? null,
          description: l.description ?? null,
          quantity: l.quantity, unitCost: l.unitCost, discountPct: l.discountPct ?? 0, taxPct: l.taxPct ?? 0,
          lineTotal: computeLine(l).lineTotal,
        })),
      },
    },
    include: { items: true },
  })
  return serSale(sale)
}

export async function deleteSale(tenantId: string, id: string) {
  const res = await prisma.accSale.deleteMany({ where: { id, tenantId } })
  return res.count > 0
}

// ════════════════════════════════════════════════════════════════════════════
// Purchases (Expenses)
// ════════════════════════════════════════════════════════════════════════════
export interface ExpenseFilters {
  from?: string; to?: string; status?: string; country?: string; vendorId?: string
  search?: string; page: number; pageSize: number
}

export async function listExpenses(tenantId: string, f: ExpenseFilters) {
  const where: any = { tenantId }
  const dw = dateWhere(f.from, f.to); if (dw) where.dateIssued = dw
  if (f.status) where.status = f.status
  if (f.country) where.country = f.country
  if (f.vendorId) where.vendorId = f.vendorId
  if (f.search) where.OR = [
    { purchaseNo: { contains: f.search, mode: 'insensitive' } },
    { vendorName: { contains: f.search, mode: 'insensitive' } },
    { invoiceNumber: { contains: f.search, mode: 'insensitive' } },
  ]
  const [items, total] = await Promise.all([
    prisma.accExpense.findMany({ where, include: { items: true }, orderBy: { dateIssued: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.accExpense.count({ where }),
  ])
  return { items: items.map(serExpense), total, page: f.page, pageSize: f.pageSize }
}

export async function expensesStats(tenantId: string) {
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const [all, paid, unpaid, month, count] = await Promise.all([
    prisma.accExpense.aggregate({ _sum: { total: true }, where: { tenantId } }),
    prisma.accExpense.aggregate({ _sum: { total: true }, where: { tenantId, status: 'PAID' } }),
    prisma.accExpense.aggregate({ _sum: { total: true }, where: { tenantId, status: 'UNPAID' } }),
    prisma.accExpense.aggregate({ _sum: { total: true }, where: { tenantId, dateIssued: { gte: monthStart } } }),
    prisma.accExpense.count({ where: { tenantId } }),
  ])
  return { total: num(all._sum.total), paid: num(paid._sum.total), unpaid: num(unpaid._sum.total), thisMonth: num(month._sum.total), count }
}

export async function getExpense(tenantId: string, id: string) {
  return prisma.accExpense.findFirst({ where: { id, tenantId }, include: { items: true } }).then((e) => (e ? serExpense(e) : null))
}

export async function createExpense(tenantId: string, d: any) {
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  d.vendorId = await ensureVendorId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, true)
  const purchaseNo = await nextNumber(tenantId, 'purchase')
  const exp = await prisma.accExpense.create({
    data: {
      tenantId, purchaseNo,
      invoiceNumber: d.invoiceNumber || null,
      country: d.country ?? 'PHILIPPINES',
      vendorId: d.vendorId ?? null,
      vendorName: d.vendorName,
      dateIssued: d.dateIssued ? new Date(d.dateIssued) : new Date(),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      status: d.status ?? 'UNPAID',
      paymentMethod: d.status === 'PAID' ? (d.paymentMethod ?? null) : null,
      paidBy: d.status === 'PAID' ? (d.paidBy ?? null) : null,
      ...totals,
      items: {
        create: items.map((l) => ({
          itemId: l.itemId ?? null, itemName: l.itemName, categoryId: l.categoryId ?? null, categoryName: l.categoryName ?? null,
          description: l.description ?? null, quantity: l.quantity, unitCost: l.unitCost,
          discountPct: l.discountPct ?? 0, taxPct: l.taxPct ?? 0, lineTotal: computeLine(l).lineTotal,
        })),
      },
    },
    include: { items: true },
  })
  return serExpense(exp)
}

export async function updateExpense(tenantId: string, id: string, d: any) {
  const existing = await prisma.accExpense.findFirst({ where: { id, tenantId } })
  if (!existing) return null
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  d.vendorId = await ensureVendorId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, true)
  await prisma.accExpenseItem.deleteMany({ where: { expenseId: id } })
  const exp = await prisma.accExpense.update({
    where: { id },
    data: {
      invoiceNumber: d.invoiceNumber || null,
      country: d.country ?? 'PHILIPPINES',
      vendorId: d.vendorId ?? null,
      vendorName: d.vendorName,
      dateIssued: d.dateIssued ? new Date(d.dateIssued) : existing.dateIssued,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      status: d.status ?? 'UNPAID',
      paymentMethod: d.status === 'PAID' ? (d.paymentMethod ?? null) : null,
      paidBy: d.status === 'PAID' ? (d.paidBy ?? null) : null,
      ...totals,
      items: {
        create: items.map((l) => ({
          itemId: l.itemId ?? null, itemName: l.itemName, categoryId: l.categoryId ?? null, categoryName: l.categoryName ?? null,
          description: l.description ?? null, quantity: l.quantity, unitCost: l.unitCost,
          discountPct: l.discountPct ?? 0, taxPct: l.taxPct ?? 0, lineTotal: computeLine(l).lineTotal,
        })),
      },
    },
    include: { items: true },
  })
  return serExpense(exp)
}

export async function deleteExpense(tenantId: string, id: string) {
  const res = await prisma.accExpense.deleteMany({ where: { id, tenantId } })
  return res.count > 0
}

// ════════════════════════════════════════════════════════════════════════════
// Company profile
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
// Monthly Sales / Expense report
// ════════════════════════════════════════════════════════════════════════════
export async function getReport(tenantId: string, month: string) {
  // month = "YYYY-MM"
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
  const range = { gte: start, lte: end }

  const [sales, expenses] = await Promise.all([
    prisma.accSale.findMany({ where: { tenantId, dateIssued: range }, include: { items: true }, orderBy: { dateIssued: 'desc' } }),
    prisma.accExpense.findMany({ where: { tenantId, dateIssued: range }, include: { items: true }, orderBy: { dateIssued: 'desc' } }),
  ])

  const daysInMonth = new Date(y, m, 0).getDate()
  const byDay = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, sales: 0, expenses: 0 }))
  for (const s of sales) { const d = new Date(s.dateIssued).getUTCDate(); byDay[d - 1].sales += num(s.total) }
  for (const e of expenses) { const d = new Date(e.dateIssued).getUTCDate(); byDay[d - 1].expenses += num(e.total) }
  byDay.forEach((d) => { d.sales = r2(d.sales); d.expenses = r2(d.expenses) })

  const totalSales = r2(sales.reduce((a, s) => a + num(s.total), 0))
  const totalExpenses = r2(expenses.reduce((a, e) => a + num(e.total), 0))
  return {
    month, totalSales, totalExpenses, net: r2(totalSales - totalExpenses), byDay,
    sales: sales.map(serSale), expenses: expenses.map(serExpense),
  }
}

// ─── Yearly Sales vs Expenses (12-month buckets) ────────────────────────────
export async function getYearlyReport(tenantId: string, year: number) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  const range = { gte: start, lte: end }
  const [sales, expenses] = await Promise.all([
    prisma.accSale.findMany({ where: { tenantId, dateIssued: range }, select: { dateIssued: true, total: true } }),
    prisma.accExpense.findMany({ where: { tenantId, dateIssued: range }, select: { dateIssued: true, total: true } }),
  ])
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, sales: 0, expenses: 0, net: 0 }))
  for (const s of sales) byMonth[new Date(s.dateIssued).getUTCMonth()].sales += num(s.total)
  for (const e of expenses) byMonth[new Date(e.dateIssued).getUTCMonth()].expenses += num(e.total)
  byMonth.forEach((m) => { m.sales = r2(m.sales); m.expenses = r2(m.expenses); m.net = r2(m.sales - m.expenses) })
  const totalSales = r2(byMonth.reduce((a, m) => a + m.sales, 0))
  const totalExpenses = r2(byMonth.reduce((a, m) => a + m.expenses, 0))
  return { year, byMonth, totalSales, totalExpenses, net: r2(totalSales - totalExpenses), salesCount: sales.length, expenseCount: expenses.length }
}

// ─── Expenses by category (line-item level) for a year ──────────────────────
// Category lives on AccExpenseItem, not on the expense header, so we aggregate
// line totals. `byCategory` = year totals per category (for the "All" breakdown);
// `byMonth` = 12-month trend for the selected category (or all expenses if none).
const UNCATEGORIZED = 'Uncategorized'
export async function getExpenseCategoryReport(tenantId: string, year: number, category?: string) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  const items = await prisma.accExpenseItem.findMany({
    where: { expense: { tenantId, dateIssued: { gte: start, lte: end } } },
    select: { categoryName: true, lineTotal: true, expense: { select: { dateIssued: true } } },
  })
  const catTotals = new Map<string, number>()
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, amount: 0 }))
  for (const it of items) {
    const cat = (it.categoryName || '').trim() || UNCATEGORIZED
    const amt = num(it.lineTotal)
    catTotals.set(cat, (catTotals.get(cat) || 0) + amt)
    if (!category || cat === category) byMonth[new Date(it.expense.dateIssued).getUTCMonth()].amount += amt
  }
  byMonth.forEach((m) => { m.amount = r2(m.amount) })
  const byCategory = Array.from(catTotals.entries())
    .map(([categoryName, amount]) => ({ categoryName, amount: r2(amount) }))
    .sort((a, b) => b.amount - a.amount)
  const total = r2(byCategory.reduce((a, c) => a + c.amount, 0))
  return { year, category: category || null, categories: byCategory.map((c) => c.categoryName), byCategory, byMonth, total }
}
