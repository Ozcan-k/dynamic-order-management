import path from 'path'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { SALES_STORES, accCents, accDeriveStatus, accManilaToday, accDaysLate, accAgingBucket, type AccAgingBucket } from '@dom/shared'
import { prisma } from '../lib/prisma'
import { ACCOUNTING_DIR, extFromMime, ensureUploadDirs } from '../lib/uploads'

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
  subcategoryId?: string | null
  subcategoryName?: string | null
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
function serPayment(p: any) {
  return { ...p, amount: num(p.amount) }
}
function serSale(s: any) {
  return {
    ...s,
    subtotal: num(s.subtotal), discountTotal: num(s.discountTotal), taxTotal: num(s.taxTotal), total: num(s.total),
    paidTotal: num(s.paidTotal),
    items: (s.items ?? []).map(serItem),
    ...(s.payments ? { payments: s.payments.map(serPayment) } : {}),
  }
}
function serExpense(e: any) {
  return {
    ...e,
    subtotal: num(e.subtotal), discountTotal: num(e.discountTotal), taxTotal: num(e.taxTotal), total: num(e.total),
    paidTotal: num(e.paidTotal),
    items: (e.items ?? []).map(serItem),
    ...(e.payments ? { payments: e.payments.map(serPayment) } : {}),
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
// Items still self-populate the catalog when typed freely, but are now kind-scoped
// (Sales and Expense item catalogs are independent). Categories/subcategories no
// longer auto-create — they come exclusively from the managed (select-only) lists.
async function ensureItemsCatalog(tenantId: string, items: LineInput[], kind: 'SALE' | 'EXPENSE') {
  for (const l of items) {
    if (!l.itemId && l.itemName?.trim()) {
      const name = l.itemName.trim()
      const ex = await prisma.accItem.findFirst({ where: { tenantId, name, kind } })
      l.itemId = ex ? ex.id : (await prisma.accItem.create({ data: { tenantId, name, kind, unitCost: l.unitCost ?? null } })).id
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

export function listItems(tenantId: string, kind: 'SALE' | 'EXPENSE') {
  return prisma.accItem.findMany({ where: { tenantId, kind }, orderBy: { name: 'asc' } })
}
export function createItem(tenantId: string, d: { name: string; unitCost?: number | null; kind: 'SALE' | 'EXPENSE' }) {
  return prisma.accItem.create({ data: { tenantId, name: d.name, kind: d.kind, unitCost: d.unitCost ?? null } })
}
// ─── Managed catalogs: categories (kind-scoped, hierarchical) + stores ───────
const DEFAULT_SALE_CATEGORIES = [
  'Dried Fruits', 'Nuts', 'Seeds', 'Trail Mix', 'Herbal Teas', 'Superfood',
  'Essential Oils', 'Herbs & Spices', 'Grain/Pulses', 'Essential Cooking',
  'Protein & Energy Bars', 'Hookah Items',
]
const DEFAULT_EXPENSE_TAXONOMY: Record<string, string[]> = {
  'Packaging': ['Bubble Wrap', 'Emailer Pouch', 'Box', 'Tape', 'Bottle', 'Pouch'],
  'Utilities': ['Manila Water', 'Meralco', 'Internet'],
  'Professional Fees': ['Accountant Fee', 'Lawyer Fee', 'Manpower Agency'],
  'Salaries and Wages': ['Salaries', 'OT', 'Incentives'],
  'Employee Benefits and Allowances': ['SSS', 'PhilHealth', 'Pag-IBIG', 'Incentive Leaves', '13th Month'],
}

// Idempotent per-tenant seeding. Inserts only (no destructive schema op), so it is
// safe to run on every list call and needs no manual prod step. The first time a
// SALE catalog is seeded we also purge the pre-v2.56 shared (kind=NULL) categories
// the user asked to retire — existing line items keep their denormalized names.
async function ensureCatalogs(tenantId: string) {
  const saleCount = await prisma.accCategory.count({ where: { tenantId, kind: 'SALE' } })
  if (saleCount === 0) {
    await prisma.accCategory.deleteMany({ where: { tenantId, kind: null } })
    await prisma.accCategory.createMany({ data: DEFAULT_SALE_CATEGORIES.map((name) => ({ tenantId, name, kind: 'SALE' as const })) })
  }
  const expCount = await prisma.accCategory.count({ where: { tenantId, kind: 'EXPENSE', parentId: null } })
  if (expCount === 0) {
    for (const [parentName, subs] of Object.entries(DEFAULT_EXPENSE_TAXONOMY)) {
      const parent = await prisma.accCategory.create({ data: { tenantId, name: parentName, kind: 'EXPENSE' } })
      if (subs.length) await prisma.accCategory.createMany({ data: subs.map((name) => ({ tenantId, name, kind: 'EXPENSE' as const, parentId: parent.id })) })
    }
  }
  const storeCount = await prisma.accStore.count({ where: { tenantId } })
  if (storeCount === 0) {
    await prisma.accStore.createMany({ data: SALES_STORES.map((name) => ({ tenantId, name })) })
  }
}

export async function listCategories(tenantId: string, kind: 'SALE' | 'EXPENSE') {
  await ensureCatalogs(tenantId)
  if (kind === 'EXPENSE') {
    const parents = await prisma.accCategory.findMany({
      where: { tenantId, kind: 'EXPENSE', parentId: null },
      include: { children: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    })
    return parents.map((p) => ({
      id: p.id, name: p.name, kind: p.kind, parentId: p.parentId, createdAt: p.createdAt,
      subcategories: p.children.map((c) => ({ id: c.id, name: c.name })),
    }))
  }
  return prisma.accCategory.findMany({ where: { tenantId, kind: 'SALE' }, orderBy: { name: 'asc' } })
}
export function createCategory(tenantId: string, d: { name: string; kind: 'SALE' | 'EXPENSE'; parentId?: string | null }) {
  return prisma.accCategory.create({ data: { tenantId, name: d.name, kind: d.kind, parentId: d.parentId ?? null } })
}
export async function updateCategory(tenantId: string, id: string, d: { name: string }) {
  const res = await prisma.accCategory.updateMany({ where: { id, tenantId }, data: { name: d.name } })
  if (!res.count) return null
  return prisma.accCategory.findUnique({ where: { id } })
}
export async function deleteCategory(tenantId: string, id: string) {
  const res = await prisma.accCategory.deleteMany({ where: { id, tenantId } }) // children cascade
  return res.count > 0
}

export async function listStores(tenantId: string) {
  await ensureCatalogs(tenantId)
  return prisma.accStore.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
}
export function createStore(tenantId: string, d: { name: string }) {
  return prisma.accStore.create({ data: { tenantId, name: d.name } })
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
// ─── Payments (v2.99.0) ─────────────────────────────────────────────────────
// A sale's paid_total is the sum of its non-voided payments, rewritten in the same
// transaction as every payment change while the sale row is locked FOR UPDATE, so two
// people recording a payment at once can never push the invoice past its total.

/** A business rule refused the request — the route maps `code` to an HTTP status. */
export class AccPaymentRuleError extends Error {
  constructor(public code: 'OVERPAYMENT' | 'TOTAL_BELOW_PAID' | 'INVALID_AMOUNT', message: string) {
    super(message)
    this.name = 'AccPaymentRuleError'
  }
}

export interface PaymentInput {
  amount: number
  paidOn: string
  method: 'GCASH' | 'CASH' | 'BANK_TRANSFER' | 'CHECK' | 'CREDIT_CARD'
  bankName?: string | null
  accountName?: string | null
  referenceNumber?: string | null
  gcashNumber?: string | null
  note?: string | null
  receivedByName?: string | null
  paidByName?: string | null
}

const peso =(cents: number) => '₱' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Only the fields that belong to the chosen method are kept (same rules as the old invoice form). */
function paymentFields(p: PaymentInput) {
  const m = p.method
  return {
    method: m,
    bankName: m === 'BANK_TRANSFER' ? p.bankName || null : null,
    accountName: m === 'BANK_TRANSFER' || m === 'CHECK' ? p.accountName || null : null,
    gcashNumber: m === 'GCASH' ? p.gcashNumber || null : null,
    referenceNumber: p.referenceNumber || null,
    note: p.note?.trim() || null,
    receivedByName: p.receivedByName?.trim() || null,
  }
}

type Tx = Prisma.TransactionClient

/** Row-locks the sale (FOR UPDATE) for the rest of the transaction, then reads it. */
async function lockSale(tx: Tx, tenantId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM acc_sales WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`
  if (!rows.length) return null
  return tx.accSale.findUnique({ where: { id } })
}

/** Recomputes paid_total from the ledger and derives status. Call inside the locking tx. */
async function syncPaid(tx: Tx, saleId: string) {
  const [agg, sale] = await Promise.all([
    tx.accSalePayment.aggregate({ _sum: { amount: true }, where: { saleId, voidedAt: null } }),
    tx.accSale.findUnique({ where: { id: saleId }, select: { total: true } }),
  ])
  const paid = num(agg._sum.amount)
  await tx.accSale.update({ where: { id: saleId }, data: { paidTotal: paid, status: accDeriveStatus(num(sale!.total), paid) } })
}

/** Amount rules shared by sales and expenses; returns the amount in centavos. */
function checkPaymentAmount(amount: number, total: number, alreadyPaid: number, noun: 'invoice' | 'expense') {
  const amountC = accCents(amount)
  if (amountC <= 0) throw new AccPaymentRuleError('INVALID_AMOUNT', 'Enter an amount greater than ₱0.00.')
  const balanceC = Math.max(0, accCents(total) - accCents(alreadyPaid))
  if (amountC > balanceC) {
    throw new AccPaymentRuleError('OVERPAYMENT', `${peso(amountC)} is more than the ${peso(balanceC)} left on this ${noun}.`)
  }
  return amountC
}

async function insertPayment(tx: Tx, tenantId: string, saleId: string, total: number, alreadyPaid: number, p: PaymentInput, actor: string | null) {
  const amountC = checkPaymentAmount(p.amount, total, alreadyPaid, 'invoice')
  return tx.accSalePayment.create({
    data: {
      tenantId, saleId, amount: amountC / 100, paidOn: new Date(p.paidOn), source: 'MANUAL', createdByName: actor,
      ...paymentFields(p),
    },
  })
}

/** Username for "created by" / "voided by" stamps. JWTs carry only the user id. */
export async function actorName(userId: string | undefined): Promise<string | null> {
  if (!userId) return null
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } })
  return u?.username ?? null
}

export async function addSalePayment(tenantId: string, saleId: string, p: PaymentInput, actor: string | null) {
  const ok = await prisma.$transaction(async (tx) => {
    const sale = await lockSale(tx, tenantId, saleId)
    if (!sale || sale.deletedAt) return false
    await insertPayment(tx, tenantId, saleId, num(sale.total), num(sale.paidTotal), p, actor)
    await syncPaid(tx, saleId)
    return true
  })
  return ok ? getSale(tenantId, saleId) : null
}

/** A payment is never deleted — voiding keeps the row (who, when, why) and drops it from paid_total. */
export async function voidSalePayment(tenantId: string, saleId: string, paymentId: string, reason: string, actor: string | null) {
  const ok = await prisma.$transaction(async (tx) => {
    const sale = await lockSale(tx, tenantId, saleId)
    if (!sale || sale.deletedAt) return false
    const res = await tx.accSalePayment.updateMany({
      where: { id: paymentId, saleId, voidedAt: null },
      data: { voidedAt: new Date(), voidedByName: actor, voidReason: reason.trim() },
    })
    if (!res.count) return false
    await syncPaid(tx, saleId)
    return true
  })
  return ok ? getSale(tenantId, saleId) : null
}

/**
 * v2.99.0 one-time, idempotent: every pre-v3 PAID invoice (total > 0) without payments
 * gets ONE payment rebuilt from its legacy columns — amount = total, paidOn = dateIssued
 * (owner's decision), method/bank/GCash as recorded — and paid_total = total. Binned
 * invoices are included so a restore stays consistent. UNPAID invoices are untouched.
 * paid_total is set with plain SQL so updated_at keeps its real "last edited" value.
 * Safe to run on every boot: once done the candidate query is empty.
 */
export async function migrateSalePayments(): Promise<number> {
  const candidates = await prisma.accSale.findMany({
    where: { status: 'PAID', paidTotal: 0, total: { gt: 0 }, payments: { none: {} } },
    select: { id: true },
  })
  let migrated = 0
  for (const { id } of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM acc_sales WHERE id = ${id} FOR UPDATE`
      const s = await tx.accSale.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } })
      if (!s || s.status !== 'PAID' || s._count.payments > 0 || num(s.paidTotal) !== 0 || num(s.total) <= 0) return false
      await tx.accSalePayment.create({
        data: {
          tenantId: s.tenantId, saleId: s.id, amount: s.total, paidOn: s.dateIssued, method: s.paymentMethod ?? null,
          bankName: s.bankName, accountName: s.accountName, referenceNumber: s.referenceNumber, gcashNumber: s.gcashNumber,
          source: 'MIGRATED',
        },
      })
      await tx.$executeRaw`UPDATE acc_sales SET paid_total = total WHERE id = ${id}`
      return true
    })
    if (done) migrated++
  }
  return migrated
}

// ─── Expense payments (v2.101.0) — the same ledger rules, money going out ────
async function lockExpense(tx: Tx, tenantId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM acc_expenses WHERE id = ${id} AND tenant_id = ${tenantId} FOR UPDATE`
  if (!rows.length) return null
  return tx.accExpense.findUnique({ where: { id } })
}

async function syncExpensePaid(tx: Tx, expenseId: string) {
  const [agg, exp] = await Promise.all([
    tx.accExpensePayment.aggregate({ _sum: { amount: true }, where: { expenseId, voidedAt: null } }),
    tx.accExpense.findUnique({ where: { id: expenseId }, select: { total: true } }),
  ])
  const paid = num(agg._sum.amount)
  await tx.accExpense.update({ where: { id: expenseId }, data: { paidTotal: paid, status: accDeriveStatus(num(exp!.total), paid) } })
}

async function insertExpensePayment(tx: Tx, tenantId: string, expenseId: string, total: number, alreadyPaid: number, p: PaymentInput, actor: string | null) {
  const amountC = checkPaymentAmount(p.amount, total, alreadyPaid, 'expense')
  const { receivedByName: _r, ...fields } = paymentFields(p)
  return tx.accExpensePayment.create({
    data: {
      tenantId, expenseId, amount: amountC / 100, paidOn: new Date(p.paidOn), source: 'MANUAL', createdByName: actor,
      ...fields, paidByName: p.paidByName?.trim() || null,
    },
  })
}

export async function addExpensePayment(tenantId: string, expenseId: string, p: PaymentInput, actor: string | null) {
  const ok = await prisma.$transaction(async (tx) => {
    const exp = await lockExpense(tx, tenantId, expenseId)
    if (!exp || exp.deletedAt) return false
    await insertExpensePayment(tx, tenantId, expenseId, num(exp.total), num(exp.paidTotal), p, actor)
    await syncExpensePaid(tx, expenseId)
    return true
  })
  return ok ? getExpense(tenantId, expenseId) : null
}

export async function voidExpensePayment(tenantId: string, expenseId: string, paymentId: string, reason: string, actor: string | null) {
  const ok = await prisma.$transaction(async (tx) => {
    const exp = await lockExpense(tx, tenantId, expenseId)
    if (!exp || exp.deletedAt) return false
    const res = await tx.accExpensePayment.updateMany({
      where: { id: paymentId, expenseId, voidedAt: null },
      data: { voidedAt: new Date(), voidedByName: actor, voidReason: reason.trim() },
    })
    if (!res.count) return false
    await syncExpensePaid(tx, expenseId)
    return true
  })
  return ok ? getExpense(tenantId, expenseId) : null
}

/**
 * v2.101.0 one-time, idempotent — the expense twin of migrateSalePayments(): every
 * pre-v3 PAID expense (total > 0) without payments gets ONE MIGRATED payment (amount =
 * total, paidOn = dateIssued, method + paid_by from the legacy columns) and
 * paid_total = total via plain SQL (updated_at untouched). UNPAID is left alone.
 */
export async function migrateExpensePayments(): Promise<number> {
  const candidates = await prisma.accExpense.findMany({
    where: { status: 'PAID', paidTotal: 0, total: { gt: 0 }, payments: { none: {} } },
    select: { id: true },
  })
  let migrated = 0
  for (const { id } of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM acc_expenses WHERE id = ${id} FOR UPDATE`
      const e = await tx.accExpense.findUnique({ where: { id }, include: { _count: { select: { payments: true } } } })
      if (!e || e.status !== 'PAID' || e._count.payments > 0 || num(e.paidTotal) !== 0 || num(e.total) <= 0) return false
      await tx.accExpensePayment.create({
        data: { tenantId: e.tenantId, expenseId: e.id, amount: e.total, paidOn: e.dateIssued, method: e.paymentMethod ?? null, paidByName: e.paidBy, source: 'MIGRATED' },
      })
      await tx.$executeRaw`UPDATE acc_expenses SET paid_total = total WHERE id = ${id}`
      return true
    })
    if (done) migrated++
  }
  return migrated
}

export interface SaleFilters {
  from?: string; to?: string; status?: string; late?: boolean; customerId?: string; saleChannel?: string
  salesAgent?: string; store?: string
  search?: string; page: number; pageSize: number
}

// Agent/store are snapshot names on the invoice. 'none' = the field was left empty.
function nameFilter(field: 'salesAgentName' | 'storeName', v: string) {
  return v === 'none' ? { OR: [{ [field]: null }, { [field]: '' }] } : { [field]: v }
}

/** Due before today (Manila calendar day) and not fully paid. */
function lateWhere() {
  return { dueDate: { lt: new Date(accManilaToday() + 'T00:00:00.000Z') }, status: { not: 'PAID' as const } }
}

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return undefined
  const w: any = {}
  if (from) w.gte = new Date(from)
  if (to) w.lte = new Date(to + 'T23:59:59.999Z')
  return w
}

export async function listSales(tenantId: string, f: SaleFilters) {
  const where: any = { tenantId, deletedAt: null }
  const dw = dateWhere(f.from, f.to); if (dw) where.dateIssued = dw
  if (f.status) where.status = f.status
  if (f.late) Object.assign(where, lateWhere())
  if (f.customerId) where.customerId = f.customerId
  if (f.saleChannel) where.saleChannel = f.saleChannel
  const and: any[] = []
  if (f.salesAgent) and.push(nameFilter('salesAgentName', f.salesAgent))
  if (f.store) and.push(nameFilter('storeName', f.store))
  if (and.length) where.AND = and
  if (f.search) where.OR = [
    { invoiceNo: { contains: f.search, mode: 'insensitive' } },
    { customerName: { contains: f.search, mode: 'insensitive' } },
  ]
  // The list table only renders header columns — do NOT join every invoice's line
  // items here (serSale tolerates a missing `items` relation → []). Fetching items
  // for each row was a needless join + payload that slowed the page. The edit screen
  // loads the full record (with items) separately via getSale().
  const [items, total] = await Promise.all([
    prisma.accSale.findMany({ where, orderBy: [{ dateIssued: 'desc' }, { createdAt: 'desc' }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.accSale.count({ where }),
  ])
  return { items: items.map(serSale), total, page: f.page, pageSize: f.pageSize }
}

// Summary strip + tab counts for the Sales list page. Scoped to the same date range as
// the list's DateRangePicker (from/to), so Invoiced reconciles with Report → Sales for
// the same period (v2.74 rule). Collected = paid_total of those invoices; Late = what is
// still owed on the ones past their due date today (Manila).
export async function salesStats(tenantId: string, from?: string, to?: string) {
  const base: any = { tenantId, deletedAt: null }
  const dw = dateWhere(from, to); if (dw) base.dateIssued = dw
  const [byStatus, late] = await Promise.all([
    prisma.accSale.groupBy({ by: ['status'], where: base, _sum: { total: true, paidTotal: true }, _count: { _all: true } }),
    prisma.accSale.aggregate({ where: { ...base, ...lateWhere() }, _sum: { total: true, paidTotal: true }, _count: { _all: true } }),
  ])
  let invoicedC = 0, collectedC = 0, count = 0
  const counts = { UNPAID: 0, PARTIAL: 0, PAID: 0 }
  for (const g of byStatus) {
    invoicedC += accCents(num(g._sum.total)); collectedC += accCents(num(g._sum.paidTotal)); count += g._count._all
    counts[g.status as keyof typeof counts] = g._count._all
  }
  const lateC = accCents(num(late._sum.total)) - accCents(num(late._sum.paidTotal))
  return {
    invoiced: invoicedC / 100, collected: collectedC / 100, owed: (invoicedC - collectedC) / 100,
    late: lateC / 100, lateCount: late._count._all, openCount: counts.UNPAID + counts.PARTIAL,
    count, avg: count > 0 ? r2(invoicedC / 100 / count) : 0, byStatus: counts,
  }
}

export async function getSale(tenantId: string, id: string) {
  const s = await prisma.accSale.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { items: true, payments: { orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }] } },
  })
  if (!s) return null
  // What this customer owes across all live invoices (by archive id, else by name).
  const who = s.customerId ? { customerId: s.customerId } : { customerName: s.customerName }
  const open = await prisma.accSale.aggregate({ where: { tenantId, deletedAt: null, ...who }, _sum: { total: true, paidTotal: true } })
  return { ...serSale(s), customerOpenBalance: (accCents(num(open._sum.total)) - accCents(num(open._sum.paidTotal))) / 100 }
}

export async function createSale(tenantId: string, d: any, actor: string | null = null) {
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  // A tab opened before v2.99.0 still posts the old "status: PAID + paymentMethod" shape.
  // Honour it as one full payment on the invoice date instead of dropping the payment.
  let initial: PaymentInput | null = d.initialPayment ?? null
  if (!initial && d.status === 'PAID' && d.paymentMethod) {
    initial = {
      amount: totals.total, paidOn: d.dateIssued, method: d.paymentMethod,
      bankName: d.bankName, accountName: d.accountName, referenceNumber: d.referenceNumber, gcashNumber: d.gcashNumber,
    }
  }
  // Refuse a bad first payment BEFORE taking an invoice number, so a rejected save never
  // leaves a gap in the INV/ sequence. (insertPayment re-checks under the transaction.)
  if (initial && accCents(totals.total) > 0) {
    const amountC = accCents(initial.amount)
    if (amountC <= 0) throw new AccPaymentRuleError('INVALID_AMOUNT', 'Enter an amount greater than ₱0.00.')
    if (amountC > accCents(totals.total)) {
      throw new AccPaymentRuleError('OVERPAYMENT', `${peso(amountC)} is more than the invoice total of ${peso(accCents(totals.total))}.`)
    }
  }
  d.customerId = await ensureCustomerId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, 'SALE')
  const invoiceNo = await nextNumber(tenantId, 'invoice')
  const id = await prisma.$transaction(async (tx) => {
    const sale = await tx.accSale.create({
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
        storeName: d.storeName ?? null,
        // Status is never taken from the request: it follows the payments (₱0 → PAID).
        status: accDeriveStatus(totals.total, 0),
        note: d.note ?? null,
        createdByName: actor,
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
    })
    // A ₱0 invoice is already PAID; there is nothing to record against it.
    if (initial && accCents(totals.total) > 0) {
      await insertPayment(tx, tenantId, sale.id, totals.total, 0, initial, actor)
      await syncPaid(tx, sale.id)
    }
    return sale.id
  })
  return getSale(tenantId, id)
}

export async function updateSale(tenantId: string, id: string, d: any, actor: string | null = null) {
  const existing = await prisma.accSale.findFirst({ where: { id, tenantId, deletedAt: null } })
  if (!existing) return null
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  d.customerId = await ensureCustomerId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, 'SALE')
  // Payments are managed on the invoice page, never through this form; the legacy
  // payment columns are left exactly as they are. The only payment rule here: the new
  // total may not drop below what has already been collected.
  const ok = await prisma.$transaction(async (tx) => {
    const locked = await lockSale(tx, tenantId, id)
    if (!locked || locked.deletedAt) return false
    if (accCents(totals.total) < accCents(num(locked.paidTotal))) {
      throw new AccPaymentRuleError('TOTAL_BELOW_PAID',
        `${peso(accCents(num(locked.paidTotal)))} is already collected on this invoice, so the total can't go below that. Void a payment first.`)
    }
    await tx.accSaleItem.deleteMany({ where: { saleId: id } })
    await tx.accSale.update({
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
        storeName: d.storeName ?? null,
        note: d.note ?? null,
        updatedByName: actor,
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
    })
    // A changed total can move the status (e.g. a PAID invoice that grew is PARTIAL now).
    await syncPaid(tx, id)
    return true
  })
  return ok ? getSale(tenantId, id) : null
}

// Soft-delete: stamp deletedAt so the sale drops out of every live query but can be
// restored from the Recycle Bin. Only stamps rows that are not already deleted.
export async function deleteSale(tenantId: string, id: string, actor: string | null = null) {
  const res = await prisma.accSale.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date(), deletedByName: actor } })
  return res.count > 0
}
export async function restoreSale(tenantId: string, id: string) {
  const res = await prisma.accSale.updateMany({ where: { id, tenantId, deletedAt: { not: null } }, data: { deletedAt: null, deletedByName: null } })
  if (!res.count) return null
  return getSale(tenantId, id)
}
// Permanent removal — only ever reachable from the Recycle Bin, and only for rows
// already soft-deleted. Line items cascade.
export async function purgeSale(tenantId: string, id: string) {
  // Unlink the invoice files BEFORE the row goes: the cascade drops the attachment
  // rows, and with them the only record of which files on disk belonged here.
  const owned = await prisma.accSale.findFirst({ where: { id, tenantId, deletedAt: { not: null } }, select: { id: true } })
  if (!owned) return false
  const files = await prisma.accSaleAttachment.findMany({ where: { saleId: id }, select: { fileName: true } })
  const res = await prisma.accSale.deleteMany({ where: { id, tenantId, deletedAt: { not: null } } })
  if (res.count === 0) return false
  for (const f of files) {
    try { await fs.unlink(path.join(ACCOUNTING_DIR, f.fileName)) } catch { /* already gone */ }
  }
  return true
}
export async function listDeletedSales(tenantId: string) {
  const rows = await prisma.accSale.findMany({ where: { tenantId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
  return rows.map(serSale)
}

// ─── Transactions ledger — flat per-line-item rows (Sales) ──────────────────
// One row PER line item, so an invoice with N items yields N rows. Date-range
// filtered by the invoice's dateIssued (same semantics as the list/report).
export async function listSalesLedger(tenantId: string, from?: string, to?: string) {
  const where: any = { tenantId, deletedAt: null }
  const dw = dateWhere(from, to); if (dw) where.dateIssued = dw
  const sales = await prisma.accSale.findMany({ where, orderBy: { dateIssued: 'desc' }, include: { items: true } })
  const rows = sales.flatMap((s) =>
    s.items.map((it) => ({
      id: it.id, saleId: s.id, dateIssued: s.dateIssued, invoiceNo: s.invoiceNo,
      customerName: s.customerName, storeName: s.storeName,
      itemName: it.itemName, categoryName: it.categoryName, description: it.description,
      quantity: num(it.quantity), unitCost: num(it.unitCost), discountPct: num(it.discountPct), taxPct: num(it.taxPct), lineTotal: num(it.lineTotal),
    })),
  )
  return { rows, total: rows.reduce((a, r) => a + r.lineTotal, 0), count: rows.length }
}

// ─── Transactions ledger — payments received (v2.99.0) ──────────────────────
// One row per payment, filtered by the date the money came in (paidOn) — the cash
// view, next to the line-item (accrual) view above. Voided payments are listed so the
// trail is complete, but never counted in the total. Binned invoices are left out.
export async function listPaymentsLedger(tenantId: string, from?: string, to?: string, kind: 'sale' | 'expense' = 'sale') {
  const dw = dateWhere(from, to)
  const order = [{ paidOn: 'desc' as const }, { createdAt: 'desc' as const }]
  const rows = kind === 'sale'
    ? (await prisma.accSalePayment.findMany({
        where: { tenantId, sale: { deletedAt: null }, ...(dw ? { paidOn: dw } : {}) }, orderBy: order,
        include: { sale: { select: { invoiceNo: true, customerName: true } } },
      })).map((p) => ({
        id: p.id, kind, recordId: p.saleId, docNo: p.sale.invoiceNo, partyName: p.sale.customerName,
        paidOn: p.paidOn, amount: num(p.amount), method: p.method, referenceNumber: p.referenceNumber,
        personName: p.receivedByName, source: p.source, voidedAt: p.voidedAt,
      }))
    : (await prisma.accExpensePayment.findMany({
        where: { tenantId, expense: { deletedAt: null }, ...(dw ? { paidOn: dw } : {}) }, orderBy: order,
        include: { expense: { select: { purchaseNo: true, vendorName: true } } },
      })).map((p) => ({
        id: p.id, kind, recordId: p.expenseId, docNo: p.expense.purchaseNo, partyName: p.expense.vendorName,
        paidOn: p.paidOn, amount: num(p.amount), method: p.method, referenceNumber: p.referenceNumber,
        personName: p.paidByName, source: p.source, voidedAt: p.voidedAt,
      }))
  const live = rows.filter((r) => !r.voidedAt)
  return { rows, total: live.reduce((a, r) => a + accCents(r.amount), 0) / 100, count: live.length }
}

// ─── Transactions ledger — flat per-line-item rows (Expenses) ───────────────
export async function listExpenseLedger(tenantId: string, from?: string, to?: string) {
  const where: any = { tenantId, deletedAt: null }
  const dw = dateWhere(from, to); if (dw) where.dateIssued = dw
  const expenses = await prisma.accExpense.findMany({ where, orderBy: { dateIssued: 'desc' }, include: { items: true } })
  const rows = expenses.flatMap((e) =>
    e.items.map((it) => ({
      id: it.id, expenseId: e.id, dateIssued: e.dateIssued, purchaseNo: e.purchaseNo,
      vendorName: e.vendorName, country: e.country,
      itemName: it.itemName, categoryName: it.categoryName, subcategoryName: it.subcategoryName, description: it.description,
      quantity: num(it.quantity), unitCost: num(it.unitCost), discountPct: num(it.discountPct), taxPct: num(it.taxPct), lineTotal: num(it.lineTotal),
    })),
  )
  return { rows, total: rows.reduce((a, r) => a + r.lineTotal, 0), count: rows.length }
}

// ════════════════════════════════════════════════════════════════════════════
// Purchases (Expenses)
// ════════════════════════════════════════════════════════════════════════════
export interface ExpenseFilters {
  from?: string; to?: string; status?: string; late?: boolean; country?: string; vendorId?: string
  category?: string; subcategory?: string
  search?: string; page: number; pageSize: number
}

export async function listExpenses(tenantId: string, f: ExpenseFilters) {
  const where: any = { tenantId, deletedAt: null }
  const dw = dateWhere(f.from, f.to); if (dw) where.dateIssued = dw
  if (f.status) where.status = f.status
  if (f.late) Object.assign(where, lateWhere())
  if (f.country) where.country = f.country
  if (f.vendorId) where.vendorId = f.vendorId
  // Category/subcategory live on line items → match expenses that have a matching line.
  if (f.category || f.subcategory) {
    const some: any = {}
    if (f.category) some.categoryName = f.category
    if (f.subcategory) some.subcategoryName = f.subcategory
    where.items = { some }
  }
  if (f.search) where.OR = [
    { purchaseNo: { contains: f.search, mode: 'insensitive' } },
    { vendorName: { contains: f.search, mode: 'insensitive' } },
    { invoiceNumber: { contains: f.search, mode: 'insensitive' } },
  ]
  // List table renders header columns only — skip the per-row line-item join
  // (serExpense tolerates a missing `items` relation → []). The edit screen loads
  // the full record via getExpense().
  const [items, total] = await Promise.all([
    prisma.accExpense.findMany({ where, orderBy: [{ dateIssued: 'desc' }, { createdAt: 'desc' }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
    prisma.accExpense.count({ where }),
  ])
  return { items: items.map(serExpense), total, page: f.page, pageSize: f.pageSize }
}

// Summary strip + tab counts for the Expenses list — same shape and rules as
// salesStats (invoiced = billed, collected = paid out, owed = still to pay), scoped
// to the list's DateRangePicker so it reconciles with Report → Expenses.
export async function expensesStats(tenantId: string, from?: string, to?: string) {
  const base: any = { tenantId, deletedAt: null }
  const dw = dateWhere(from, to); if (dw) base.dateIssued = dw
  const [byStatus, late] = await Promise.all([
    prisma.accExpense.groupBy({ by: ['status'], where: base, _sum: { total: true, paidTotal: true }, _count: { _all: true } }),
    prisma.accExpense.aggregate({ where: { ...base, ...lateWhere() }, _sum: { total: true, paidTotal: true }, _count: { _all: true } }),
  ])
  let billedC = 0, paidC = 0, count = 0
  const counts = { UNPAID: 0, PARTIAL: 0, PAID: 0 }
  for (const g of byStatus) {
    billedC += accCents(num(g._sum.total)); paidC += accCents(num(g._sum.paidTotal)); count += g._count._all
    counts[g.status as keyof typeof counts] = g._count._all
  }
  const lateC = accCents(num(late._sum.total)) - accCents(num(late._sum.paidTotal))
  return {
    invoiced: billedC / 100, collected: paidC / 100, owed: (billedC - paidC) / 100,
    late: lateC / 100, lateCount: late._count._all, openCount: counts.UNPAID + counts.PARTIAL,
    count, avg: count > 0 ? r2(billedC / 100 / count) : 0, byStatus: counts,
  }
}

export async function getExpense(tenantId: string, id: string) {
  const e = await prisma.accExpense.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: { items: true, payments: { orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }] } },
  })
  if (!e) return null
  const who = e.vendorId ? { vendorId: e.vendorId } : { vendorName: e.vendorName }
  const open = await prisma.accExpense.aggregate({ where: { tenantId, deletedAt: null, ...who }, _sum: { total: true, paidTotal: true } })
  return { ...serExpense(e), vendorOpenBalance: (accCents(num(open._sum.total)) - accCents(num(open._sum.paidTotal))) / 100 }
}

export async function createExpense(tenantId: string, d: any, actor: string | null = null) {
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  // A tab opened before v2.101.0 posts "status: PAID + paymentMethod + paidBy": one full payment.
  let initial: PaymentInput | null = d.initialPayment ?? null
  if (!initial && d.status === 'PAID' && d.paymentMethod) {
    initial = { amount: totals.total, paidOn: d.dateIssued, method: d.paymentMethod, paidByName: d.paidBy }
  }
  // Refused BEFORE a PUR/ number is taken, so a rejected save leaves no gap.
  if (initial && accCents(totals.total) > 0) {
    const amountC = accCents(initial.amount)
    if (amountC <= 0) throw new AccPaymentRuleError('INVALID_AMOUNT', 'Enter an amount greater than ₱0.00.')
    if (amountC > accCents(totals.total)) {
      throw new AccPaymentRuleError('OVERPAYMENT', `${peso(amountC)} is more than the expense total of ${peso(accCents(totals.total))}.`)
    }
  }
  d.vendorId = await ensureVendorId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, 'EXPENSE')
  const purchaseNo = await nextNumber(tenantId, 'purchase')
  const id = await prisma.$transaction(async (tx) => {
    const exp = await tx.accExpense.create({
      data: {
        tenantId, purchaseNo,
        invoiceNumber: d.invoiceNumber || null,
        country: d.country ?? 'PHILIPPINES',
        vendorId: d.vendorId ?? null,
        vendorName: d.vendorName,
        dateIssued: d.dateIssued ? new Date(d.dateIssued) : new Date(),
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        status: accDeriveStatus(totals.total, 0),
        createdByName: actor,
        ...totals,
        items: {
          create: items.map((l) => ({
            itemId: l.itemId ?? null, itemName: l.itemName, categoryId: l.categoryId ?? null, categoryName: l.categoryName ?? null,
            subcategoryId: l.subcategoryId ?? null, subcategoryName: l.subcategoryName ?? null,
            description: l.description ?? null, quantity: l.quantity, unitCost: l.unitCost,
            discountPct: l.discountPct ?? 0, taxPct: l.taxPct ?? 0, lineTotal: computeLine(l).lineTotal,
          })),
        },
      },
    })
    if (initial && accCents(totals.total) > 0) {
      await insertExpensePayment(tx, tenantId, exp.id, totals.total, 0, initial, actor)
      await syncExpensePaid(tx, exp.id)
    }
    return exp.id
  })
  return getExpense(tenantId, id)
}

export async function updateExpense(tenantId: string, id: string, d: any, actor: string | null = null) {
  const existing = await prisma.accExpense.findFirst({ where: { id, tenantId, deletedAt: null } })
  if (!existing) return null
  const items: LineInput[] = d.items ?? []
  const totals = computeTotals(items)
  d.vendorId = await ensureVendorId(tenantId, d)
  await ensureItemsCatalog(tenantId, items, 'EXPENSE')
  // Payments live on the expense page; the legacy payment columns are left as they are.
  const ok = await prisma.$transaction(async (tx) => {
    const locked = await lockExpense(tx, tenantId, id)
    if (!locked || locked.deletedAt) return false
    if (accCents(totals.total) < accCents(num(locked.paidTotal))) {
      throw new AccPaymentRuleError('TOTAL_BELOW_PAID',
        `${peso(accCents(num(locked.paidTotal)))} is already paid on this expense, so the total can't go below that. Void a payment first.`)
    }
    await tx.accExpenseItem.deleteMany({ where: { expenseId: id } })
    await tx.accExpense.update({
      where: { id },
      data: {
        invoiceNumber: d.invoiceNumber || null,
        country: d.country ?? 'PHILIPPINES',
        vendorId: d.vendorId ?? null,
        vendorName: d.vendorName,
        dateIssued: d.dateIssued ? new Date(d.dateIssued) : existing.dateIssued,
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        updatedByName: actor,
        ...totals,
        items: {
          create: items.map((l) => ({
            itemId: l.itemId ?? null, itemName: l.itemName, categoryId: l.categoryId ?? null, categoryName: l.categoryName ?? null,
            subcategoryId: l.subcategoryId ?? null, subcategoryName: l.subcategoryName ?? null,
            description: l.description ?? null, quantity: l.quantity, unitCost: l.unitCost,
            discountPct: l.discountPct ?? 0, taxPct: l.taxPct ?? 0, lineTotal: computeLine(l).lineTotal,
          })),
        },
      },
    })
    await syncExpensePaid(tx, id)
    return true
  })
  return ok ? getExpense(tenantId, id) : null
}

/**
 * Possible double entry (a warning, never a block): another live expense with the same
 * supplier invoice number, or the same vendor + total + date.
 */
export async function findExpenseDuplicates(tenantId: string, q: { vendorName?: string; total?: number; dateIssued?: string; invoiceNumber?: string; excludeId?: string }) {
  const or: any[] = []
  if (q.invoiceNumber?.trim()) or.push({ invoiceNumber: { equals: q.invoiceNumber.trim(), mode: 'insensitive' } })
  if (q.vendorName?.trim() && q.total !== undefined && q.dateIssued) {
    or.push({ vendorName: { equals: q.vendorName.trim(), mode: 'insensitive' }, total: q.total, dateIssued: dayStart(q.dateIssued) })
  }
  if (!or.length) return []
  const rows = await prisma.accExpense.findMany({
    where: { tenantId, deletedAt: null, OR: or, ...(q.excludeId ? { id: { not: q.excludeId } } : {}) },
    orderBy: { dateIssued: 'desc' }, take: 5,
    select: { id: true, purchaseNo: true, vendorName: true, invoiceNumber: true, dateIssued: true, total: true },
  })
  return rows.map((r) => ({
    ...r, dateIssued: isoDay(r.dateIssued)!, total: num(r.total),
    reason: q.invoiceNumber?.trim() && r.invoiceNumber?.toLowerCase() === q.invoiceNumber.trim().toLowerCase() ? 'SAME_INVOICE_NO' as const : 'SAME_VENDOR_TOTAL_DATE' as const,
  }))
}

// Soft-delete (see deleteSale) — restorable from the Recycle Bin.
export async function deleteExpense(tenantId: string, id: string, actor: string | null = null) {
  const res = await prisma.accExpense.updateMany({ where: { id, tenantId, deletedAt: null }, data: { deletedAt: new Date(), deletedByName: actor } })
  return res.count > 0
}
export async function restoreExpense(tenantId: string, id: string) {
  const res = await prisma.accExpense.updateMany({ where: { id, tenantId, deletedAt: { not: null } }, data: { deletedAt: null, deletedByName: null } })
  if (!res.count) return null
  return getExpense(tenantId, id)
}
export async function purgeExpense(tenantId: string, id: string) {
  // Unlink the invoice files BEFORE the row goes: the cascade drops the attachment
  // rows, and with them the only record of which files on disk belonged here.
  const owned = await prisma.accExpense.findFirst({ where: { id, tenantId, deletedAt: { not: null } }, select: { id: true } })
  if (!owned) return false
  const files = await prisma.accExpenseAttachment.findMany({ where: { expenseId: id }, select: { fileName: true } })
  const res = await prisma.accExpense.deleteMany({ where: { id, tenantId, deletedAt: { not: null } } })
  if (res.count === 0) return false
  for (const f of files) {
    try { await fs.unlink(path.join(ACCOUNTING_DIR, f.fileName)) } catch { /* already gone */ }
  }
  return true
}
export async function listDeletedExpenses(tenantId: string) {
  const rows = await prisma.accExpense.findMany({ where: { tenantId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } })
  return rows.map(serExpense)
}

// ════════════════════════════════════════════════════════════════════════════
// Invoice attachments — the supporting document behind a Sale or Expense
// (photo or PDF). Kind-scoped like categories/items: same shape, two backing
// tables (AccSaleAttachment / AccExpenseAttachment) since they FK to different
// parents, so the DB call itself branches per kind rather than casting to `any`.
// ════════════════════════════════════════════════════════════════════════════

export type AttachmentKind = 'sale' | 'expense'
export type AttachmentCategory = 'INVOICE' | 'PAYMENT_PROOF'

/** Thrown when an identical invoice (same name + same type) is re-uploaded. */
export class DuplicateAttachmentError extends Error {
  constructor() {
    super('DUPLICATE_ATTACHMENT')
    this.name = 'DuplicateAttachmentError'
  }
}

interface AttachmentRow { id: string; category: AttachmentCategory; mime: string; originalName: string | null; sizeBytes: number; uploadedAt: Date; paymentId?: string | null }
const serAttachment = (a: AttachmentRow) => ({
  id: a.id, category: a.category, mime: a.mime, originalName: a.originalName, sizeBytes: a.sizeBytes, uploadedAt: a.uploadedAt.toISOString(),
  ...(a.paymentId !== undefined ? { paymentId: a.paymentId } : {}),
})
// paymentId: the payment a PAYMENT_PROOF belongs to (sales since v2.99.0, expenses since v2.101.0).
const ATTACHMENT_SELECT = { id: true, category: true, mime: true, originalName: true, sizeBytes: true, uploadedAt: true, paymentId: true } as const

/** Soft-deleted sales/expenses still own their files — the Recycle Bin must be able to restore them. */
async function ownedRecord(tenantId: string, kind: AttachmentKind, recordId: string) {
  if (kind === 'sale') return prisma.accSale.findFirst({ where: { id: recordId, tenantId }, select: { id: true } })
  return prisma.accExpense.findFirst({ where: { id: recordId, tenantId }, select: { id: true } })
}

function findAttachment(kind: AttachmentKind, recordId: string, attachmentId: string) {
  return kind === 'sale'
    ? prisma.accSaleAttachment.findFirst({ where: { id: attachmentId, saleId: recordId }, select: { id: true, fileName: true, category: true } })
    : prisma.accExpenseAttachment.findFirst({ where: { id: attachmentId, expenseId: recordId }, select: { id: true, fileName: true, category: true } })
}

// Duplicate-name check is scoped per category — a "receipt.jpg" invoice and a "receipt.jpg"
// payment proof on the same record are different documents, not a re-upload of the same one.
function findDuplicate(kind: AttachmentKind, recordId: string, category: AttachmentCategory, mime: string, name: string, excludeId?: string) {
  const notSelf = excludeId ? { id: { not: excludeId } } : {}
  return kind === 'sale'
    ? prisma.accSaleAttachment.findFirst({ where: { saleId: recordId, category, mime, originalName: { equals: name, mode: 'insensitive' }, ...notSelf }, select: { id: true } })
    : prisma.accExpenseAttachment.findFirst({ where: { expenseId: recordId, category, mime, originalName: { equals: name, mode: 'insensitive' }, ...notSelf }, select: { id: true } })
}

export async function listAttachments(tenantId: string, kind: AttachmentKind, recordId: string, category: AttachmentCategory) {
  if (!(await ownedRecord(tenantId, kind, recordId))) return null
  const rows = kind === 'sale'
    ? await prisma.accSaleAttachment.findMany({ where: { saleId: recordId, category }, orderBy: { uploadedAt: 'asc' }, select: ATTACHMENT_SELECT })
    : await prisma.accExpenseAttachment.findMany({ where: { expenseId: recordId, category }, orderBy: { uploadedAt: 'asc' }, select: ATTACHMENT_SELECT })
  return rows.map(serAttachment)
}

export async function addAttachment(
  tenantId: string,
  kind: AttachmentKind,
  recordId: string,
  category: AttachmentCategory,
  buffer: Buffer,
  mime: string,
  originalName: string | null,
  paymentId: string | null = null,
) {
  if (!(await ownedRecord(tenantId, kind, recordId))) return null
  // A payment proof may name the sale payment it proves; it must be one of this sale's.
  if (paymentId) {
    const own = kind === 'sale'
      ? await prisma.accSalePayment.findFirst({ where: { id: paymentId, saleId: recordId }, select: { id: true } })
      : await prisma.accExpensePayment.findFirst({ where: { id: paymentId, expenseId: recordId }, select: { id: true } })
    if (!own) return null
  }

  const name = (originalName ?? '').trim()
  if (name && (await findDuplicate(kind, recordId, category, mime, name))) throw new DuplicateAttachmentError()

  await ensureUploadDirs()
  const fileName = `${recordId}-${randomUUID()}${extFromMime(mime) || '.bin'}`
  await fs.writeFile(path.join(ACCOUNTING_DIR, fileName), buffer)

  const data = { category, fileName, mime, originalName: name || null, sizeBytes: buffer.length }
  const row = kind === 'sale'
    ? await prisma.accSaleAttachment.create({ data: { saleId: recordId, ...data, paymentId }, select: ATTACHMENT_SELECT })
    : await prisma.accExpenseAttachment.create({ data: { expenseId: recordId, ...data, paymentId }, select: ATTACHMENT_SELECT })
  return serAttachment(row)
}

/** Swaps the file behind an existing attachment row in place — same id, new content, position preserved. */
export async function replaceAttachment(
  tenantId: string,
  kind: AttachmentKind,
  recordId: string,
  attachmentId: string,
  buffer: Buffer,
  mime: string,
  originalName: string | null,
) {
  if (!(await ownedRecord(tenantId, kind, recordId))) return null
  const existing = await findAttachment(kind, recordId, attachmentId)
  if (!existing) return null

  const name = (originalName ?? '').trim()
  if (name && (await findDuplicate(kind, recordId, existing.category as AttachmentCategory, mime, name, attachmentId))) throw new DuplicateAttachmentError()

  await ensureUploadDirs()
  const fileName = `${recordId}-${randomUUID()}${extFromMime(mime) || '.bin'}`
  await fs.writeFile(path.join(ACCOUNTING_DIR, fileName), buffer)

  const data = { fileName, mime, originalName: name || null, sizeBytes: buffer.length, uploadedAt: new Date() }
  const row = kind === 'sale'
    ? await prisma.accSaleAttachment.update({ where: { id: attachmentId }, data, select: ATTACHMENT_SELECT })
    : await prisma.accExpenseAttachment.update({ where: { id: attachmentId }, data, select: ATTACHMENT_SELECT })

  // Old file is only unlinked once the new one is safely written and the row repointed.
  try { await fs.unlink(path.join(ACCOUNTING_DIR, existing.fileName)) } catch { /* already gone */ }
  return serAttachment(row)
}

export async function readAttachment(tenantId: string, kind: AttachmentKind, recordId: string, attachmentId: string) {
  if (!(await ownedRecord(tenantId, kind, recordId))) return null
  const row = kind === 'sale'
    ? await prisma.accSaleAttachment.findFirst({ where: { id: attachmentId, saleId: recordId }, select: { fileName: true, mime: true, originalName: true } })
    : await prisma.accExpenseAttachment.findFirst({ where: { id: attachmentId, expenseId: recordId }, select: { fileName: true, mime: true, originalName: true } })
  if (!row) return null
  try {
    const buffer = await fs.readFile(path.join(ACCOUNTING_DIR, row.fileName))
    return { buffer, mime: row.mime, originalName: row.originalName }
  } catch {
    return null
  }
}

export async function deleteAttachment(tenantId: string, kind: AttachmentKind, recordId: string, attachmentId: string) {
  if (!(await ownedRecord(tenantId, kind, recordId))) return false
  const row = await findAttachment(kind, recordId, attachmentId)
  if (!row) return false
  if (kind === 'sale') await prisma.accSaleAttachment.delete({ where: { id: row.id } })
  else await prisma.accExpenseAttachment.delete({ where: { id: row.id } })
  try { await fs.unlink(path.join(ACCOUNTING_DIR, row.fileName)) } catch { /* already gone */ }
  return true
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
    prisma.accSale.findMany({ where: { tenantId, deletedAt: null, dateIssued: range }, include: { items: true }, orderBy: { dateIssued: 'desc' } }),
    prisma.accExpense.findMany({ where: { tenantId, deletedAt: null, dateIssued: range }, include: { items: true }, orderBy: { dateIssued: 'desc' } }),
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
    prisma.accSale.findMany({ where: { tenantId, deletedAt: null, dateIssued: range }, select: { dateIssued: true, total: true } }),
    prisma.accExpense.findMany({ where: { tenantId, deletedAt: null, dateIssued: range }, select: { dateIssued: true, total: true } }),
  ])
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, sales: 0, expenses: 0, net: 0 }))
  for (const s of sales) byMonth[new Date(s.dateIssued).getUTCMonth()].sales += num(s.total)
  for (const e of expenses) byMonth[new Date(e.dateIssued).getUTCMonth()].expenses += num(e.total)
  byMonth.forEach((m) => { m.sales = r2(m.sales); m.expenses = r2(m.expenses); m.net = r2(m.sales - m.expenses) })
  const totalSales = r2(byMonth.reduce((a, m) => a + m.sales, 0))
  const totalExpenses = r2(byMonth.reduce((a, m) => a + m.expenses, 0))
  return { year, byMonth, totalSales, totalExpenses, net: r2(totalSales - totalExpenses), salesCount: sales.length, expenseCount: expenses.length }
}

// ─── Expense analytics (powers the whole Report → Expenses tab) ─────────────
// Date-range driven (matches the Expenses list page's DateRangePicker semantics via
// `dateWhere`). Filters (country / vendor / category / subcategory) affect everything.
// Category/subcategory live on the line item (AccExpenseItem), not the expense header,
// so totals are aggregated at line-item level. `trend` = per-day or per-month buckets
// (auto granularity, see buildBuckets) honoring every filter; `byCategory` = composition
// for the country+vendor scope (all categories); `bySubcategory` = composition for the
// country+vendor+category scope (all subcategories); `total` = fully-filtered sum.
const UNCATEGORIZED = 'Uncategorized'
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_MS = 24 * 60 * 60 * 1000

// Resolve the effective [start,end] for bucketing. When the range is open-ended
// ("All" preset → empty from/to), fall back to the data-derived min/max so the trend
// still spans exactly the data. Returns null when there is nothing to plot.
function resolveRange(from: string | undefined, to: string | undefined, dates: Date[]): { start: Date; end: Date } | null {
  let start = from ? new Date(from + 'T00:00:00.000Z') : undefined
  let end = to ? new Date(to + 'T23:59:59.999Z') : undefined
  if (!start || !end) {
    if (dates.length === 0) {
      if (start) return { start, end: start }
      if (end) return { start: end, end }
      return null
    }
    const times = dates.map((d) => d.getTime())
    if (!start) start = new Date(Math.min(...times))
    if (!end) end = new Date(Math.max(...times))
  }
  return { start, end }
}

// Auto granularity: daily buckets for spans up to 92 days, monthly beyond. Labels
// include the year only when the range straddles a year boundary.
function buildBuckets(start: Date, end: Date) {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  const spanDays = Math.floor((endDay - startDay) / DAY_MS) + 1
  const daily = spanDays <= 92
  const multiYear = start.getUTCFullYear() !== end.getUTCFullYear()
  const labels: string[] = []
  const index = new Map<string, number>()
  if (daily) {
    for (let cur = startDay; cur <= endDay; cur += DAY_MS) {
      const d = new Date(cur)
      index.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`, labels.length)
      labels.push(multiYear ? `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}` : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`)
    }
  } else {
    let y = start.getUTCFullYear(), m = start.getUTCMonth()
    const ey = end.getUTCFullYear(), em = end.getUTCMonth()
    while (y < ey || (y === ey && m <= em)) {
      index.set(`${y}-${m}`, labels.length)
      labels.push(multiYear ? `${MONTH_ABBR[m]} '${String(y).slice(2)}` : MONTH_ABBR[m])
      m++; if (m > 11) { m = 0; y++ }
    }
  }
  const keyOf = (d: Date) => daily
    ? `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
    : `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  const trend = labels.map((label) => ({ label, amount: 0 }))
  const add = (d: Date, amt: number) => { const i = index.get(keyOf(d)); if (i !== undefined) trend[i].amount += amt }
  return { trend, add }
}

// ─── Sales trend (Report → Sales tab; date-range driven) ────────────────────
export async function getSalesReport(tenantId: string, opts: { from?: string; to?: string }) {
  const where: any = { tenantId, deletedAt: null }
  const dw = dateWhere(opts.from, opts.to); if (dw) where.dateIssued = dw
  const sales = await prisma.accSale.findMany({ where, select: { dateIssued: true, total: true, salesAgentName: true, invoiceNo: true } })
  const range = resolveRange(opts.from, opts.to, sales.map((s) => new Date(s.dateIssued)))
  if (!range) return { trend: [], collectedTrend: [], collected: 0, total: 0, count: 0, byAgent: [] }
  const { trend, add } = buildBuckets(range.start, range.end)
  // v2.100.0 — Collected: money that came in during the same buckets, by payment date
  // (cash view). Voided payments and binned invoices never count.
  const collectedBuckets = buildBuckets(range.start, range.end)
  const pays = await prisma.accSalePayment.findMany({
    where: { tenantId, voidedAt: null, sale: { deletedAt: null }, paidOn: { gte: range.start, lte: range.end } },
    select: { paidOn: true, amount: true },
  })
  let collectedC = 0
  for (const p of pays) { collectedBuckets.add(new Date(p.paidOn), num(p.amount)); collectedC += accCents(num(p.amount)) }
  const collectedTrend = collectedBuckets.trend.map((t) => ({ label: t.label, amount: r2(t.amount) }))
  let total = 0
  // Sales per agent over the selected period — name + amount + invoice count +
  // the invoice numbers behind it (surfaced on hover, esp. for "Unassigned").
  const agentMap = new Map<string, { amount: number; count: number; invoiceNos: string[] }>()
  for (const s of sales) {
    const amt = num(s.total)
    add(new Date(s.dateIssued), amt)
    total += amt
    const name = (s.salesAgentName || '').trim() || 'Unassigned'
    const a = agentMap.get(name) ?? { amount: 0, count: 0, invoiceNos: [] }
    a.amount += amt; a.count += 1; a.invoiceNos.push(s.invoiceNo)
    agentMap.set(name, a)
  }
  trend.forEach((t) => { t.amount = r2(t.amount) })
  const byAgent = [...agentMap.entries()]
    .map(([name, v]) => ({ name, amount: r2(v.amount), count: v.count, invoiceNos: v.invoiceNos }))
    .sort((a, b) => b.amount - a.amount)
  return { trend, collectedTrend, collected: collectedC / 100, total: r2(total), count: sales.length, byAgent }
}

// ════════════════════════════════════════════════════════════════════════════
// Receivables (v2.100.0) — who owes what, how late, and when money came in.
// Always "as of today (Manila)"; computed from paid_total + the payment ledger.
// ════════════════════════════════════════════════════════════════════════════
const AGING_ORDER: AccAgingBucket[] = ['notDue', 'd1_30', 'd31_60', 'd60']
const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const dayStart = (day: string) => new Date(day + 'T00:00:00.000Z')

function emptyAging() {
  return new Map<AccAgingBucket, { amount: number; count: number }>(AGING_ORDER.map((b) => [b, { amount: 0, count: 0 }]))
}
const agingRows = (m: ReturnType<typeof emptyAging>) => AGING_ORDER.map((b) => ({ bucket: b, amount: m.get(b)!.amount / 100, count: m.get(b)!.count }))

export async function getReceivablesOverview(tenantId: string) {
  const today = accManilaToday()
  const open = await prisma.accSale.findMany({
    where: { tenantId, deletedAt: null, status: { not: 'PAID' } },
    select: { customerId: true, customerName: true, total: true, paidTotal: true, dueDate: true },
  })
  const aging = emptyAging()
  const debtors = new Map<string, { customerId: string | null; name: string; owed: number; late: number; invoices: number }>()
  let owedC = 0, lateC = 0, lateCount = 0
  for (const s of open) {
    const balC = Math.max(0, accCents(num(s.total)) - accCents(num(s.paidTotal)))
    if (balC === 0) continue
    const daysLate = accDaysLate(isoDay(s.dueDate), 'UNPAID', today)
    const a = aging.get(accAgingBucket(daysLate))!; a.amount += balC; a.count += 1
    owedC += balC
    if (daysLate > 0) { lateC += balC; lateCount += 1 }
    const key = s.customerId ?? `name:${s.customerName.trim().toLowerCase()}`
    const d = debtors.get(key) ?? { customerId: s.customerId, name: s.customerName, owed: 0, late: 0, invoices: 0 }
    d.owed += balC; d.invoices += 1; if (daysLate > 0) d.late += balC
    debtors.set(key, d)
  }

  // Last 6 calendar months including this one: invoiced by issue date, collected by payment date.
  const [ty, tm] = today.split('-').map(Number)
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(ty, tm - 1 - i, 1))
    months.push(d.toISOString().slice(0, 7))
  }
  const since = dayStart(months[0] + '-01')
  const monthStart = dayStart(today.slice(0, 7) + '-01')
  const [salesSince, paysSince] = await Promise.all([
    prisma.accSale.findMany({ where: { tenantId, deletedAt: null, dateIssued: { gte: since } }, select: { dateIssued: true, total: true } }),
    prisma.accSalePayment.findMany({ where: { tenantId, voidedAt: null, sale: { deletedAt: null }, paidOn: { gte: since } }, select: { paidOn: true, amount: true } }),
  ])
  const inv = new Map(months.map((m) => [m, 0])), col = new Map(months.map((m) => [m, 0]))
  for (const s of salesSince) { const k = s.dateIssued.toISOString().slice(0, 7); if (inv.has(k)) inv.set(k, inv.get(k)! + accCents(num(s.total))) }
  let monthC = 0, monthCount = 0
  for (const p of paysSince) {
    const k = p.paidOn.toISOString().slice(0, 7)
    if (col.has(k)) col.set(k, col.get(k)! + accCents(num(p.amount)))
    if (p.paidOn >= monthStart) { monthC += accCents(num(p.amount)); monthCount += 1 }
  }

  const ranked = [...debtors.values()].sort((a, b) => b.owed - a.owed)
  return {
    asOf: today,
    owed: owedC / 100, openCount: open.filter((s) => accCents(num(s.total)) > accCents(num(s.paidTotal))).length,
    late: lateC / 100, lateCount,
    aging: agingRows(aging),
    collectedThisMonth: monthC / 100, collectedThisMonthCount: monthCount,
    debtors: ranked.slice(0, 8).map((d) => ({ ...d, owed: d.owed / 100, late: d.late / 100 })),
    debtorCount: ranked.length,
    trend: months.map((m) => ({
      month: m,
      label: new Date(m + '-01T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
      invoiced: inv.get(m)! / 100, collected: col.get(m)! / 100,
    })),
    payables: await getPayablesSummary(tenantId, today),
  }
}

/** What is still owed to vendors (v2.101.0): open expenses, and the late part. */
async function getPayablesSummary(tenantId: string, today: string): Promise<{ owed: number; count: number; late: number; lateCount: number } | null> {
  const open = await prisma.accExpense.findMany({
    where: { tenantId, deletedAt: null, status: { not: 'PAID' } },
    select: { total: true, paidTotal: true, dueDate: true },
  })
  let owedC = 0, count = 0, lateC = 0, lateCount = 0
  for (const e of open) {
    const balC = Math.max(0, accCents(num(e.total)) - accCents(num(e.paidTotal)))
    if (!balC) continue
    owedC += balC; count += 1
    if (accDaysLate(isoDay(e.dueDate), 'UNPAID', today) > 0) { lateC += balC; lateCount += 1 }
  }
  return { owed: owedC / 100, count, late: lateC / 100, lateCount }
}

/**
 * A customer's account: every live invoice (by issue date) and every non-voided payment
 * (by payment date) on one timeline with a running balance. `from`/`to` narrow the rows;
 * everything before `from` is rolled into the opening balance, so the closing balance is
 * always what they owe as of `to` (or today).
 */
export async function getCustomerStatement(tenantId: string, customerId: string, from?: string, to?: string) {
  const customer = await prisma.accCustomer.findFirst({ where: { id: customerId, tenantId } })
  if (!customer) return null
  const today = accManilaToday()
  const sales = await prisma.accSale.findMany({
    where: { tenantId, deletedAt: null, customerId },
    include: { payments: { where: { voidedAt: null }, orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }] } },
    orderBy: [{ dateIssued: 'asc' }, { createdAt: 'asc' }],
  })
  type Ev = { date: string; order: number; kind: 'INVOICE' | 'PAYMENT'; saleId: string; invoiceNo: string; details: string; inv: number; paid: number }
  const METHOD: Record<string, string> = { GCASH: 'GCash', CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', CHECK: 'Check', CREDIT_CARD: 'Card' }
  const events: Ev[] = []
  for (const s of sales) {
    const due = s.dueDate ? s.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null
    events.push({ date: isoDay(s.dateIssued)!, order: 0, kind: 'INVOICE', saleId: s.id, invoiceNo: s.invoiceNo, details: `Invoice ${s.invoiceNo}${due ? ` · due ${due}` : ''}`, inv: accCents(num(s.total)), paid: 0 })
    for (const p of s.payments) {
      const parts = [`Payment · ${p.method ? METHOD[p.method] ?? p.method : 'method not recorded'}`, p.referenceNumber ? `Ref ${p.referenceNumber}` : null, `for ${s.invoiceNo}`]
      events.push({ date: isoDay(p.paidOn)!, order: 1, kind: 'PAYMENT', saleId: s.id, invoiceNo: s.invoiceNo, details: parts.filter(Boolean).join(' · '), inv: 0, paid: accCents(num(p.amount)) })
    }
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order))

  let running = 0, opening = 0, invP = 0, paidP = 0
  const rows: { date: string; kind: 'INVOICE' | 'PAYMENT'; saleId: string; invoiceNo: string; details: string; invoiced: number; paid: number; balance: number }[] = []
  for (const e of events) {
    running += e.inv - e.paid
    if (from && e.date < from) { opening = running; continue }
    if (to && e.date > to) continue
    invP += e.inv; paidP += e.paid
    rows.push({ date: e.date, kind: e.kind, saleId: e.saleId, invoiceNo: e.invoiceNo, details: e.details, invoiced: e.inv / 100, paid: e.paid / 100, balance: running / 100 })
  }
  const closing = opening + invP - paidP

  const aging = emptyAging()
  const openInvoices = []
  let owedNowC = 0
  for (const s of sales) {
    const balC = Math.max(0, accCents(num(s.total)) - accCents(num(s.paidTotal)))
    if (balC === 0) continue
    const daysLate = accDaysLate(isoDay(s.dueDate), 'UNPAID', today)
    const a = aging.get(accAgingBucket(daysLate))!; a.amount += balC; a.count += 1
    owedNowC += balC
    openInvoices.push({ id: s.id, invoiceNo: s.invoiceNo, dateIssued: isoDay(s.dateIssued)!, dueDate: isoDay(s.dueDate), total: num(s.total), paidTotal: num(s.paidTotal), balance: balC / 100, daysLate })
  }
  return {
    customer, from: from ?? null, to: to ?? null, asOf: today,
    opening: opening / 100, rows, invoicedInPeriod: invP / 100, paidInPeriod: paidP / 100, closing: closing / 100,
    owedNow: owedNowC / 100, aging: agingRows(aging), openInvoices,
  }
}

/**
 * A vendor's account — the expense-side twin of getCustomerStatement: every live expense
 * (by issue date) and every non-voided payment to the vendor (by payment date) with a
 * running balance of what is still owed to them. Same opening/closing rules.
 */
export async function getVendorStatement(tenantId: string, vendorId: string, from?: string, to?: string) {
  const vendor = await prisma.accVendor.findFirst({ where: { id: vendorId, tenantId } })
  if (!vendor) return null
  const today = accManilaToday()
  const expenses = await prisma.accExpense.findMany({
    where: { tenantId, deletedAt: null, vendorId },
    include: { payments: { where: { voidedAt: null }, orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }] } },
    orderBy: [{ dateIssued: 'asc' }, { createdAt: 'asc' }],
  })
  type Ev = { date: string; order: number; kind: 'BILL' | 'PAYMENT'; expenseId: string; purchaseNo: string; details: string; billed: number; paid: number }
  const METHOD: Record<string, string> = { GCASH: 'GCash', CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', CHECK: 'Check', CREDIT_CARD: 'Card' }
  const events: Ev[] = []
  for (const e of expenses) {
    const due = e.dueDate ? e.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null
    const head = [`Expense ${e.purchaseNo}`, e.invoiceNumber ? `inv ${e.invoiceNumber}` : null, due ? `due ${due}` : null]
    events.push({ date: isoDay(e.dateIssued)!, order: 0, kind: 'BILL', expenseId: e.id, purchaseNo: e.purchaseNo, details: head.filter(Boolean).join(' · '), billed: accCents(num(e.total)), paid: 0 })
    for (const p of e.payments) {
      const parts = [`Payment · ${p.method ? METHOD[p.method] ?? p.method : 'method not recorded'}`, p.referenceNumber ? `Ref ${p.referenceNumber}` : null, p.paidByName ? `by ${p.paidByName}` : null, `for ${e.purchaseNo}`]
      events.push({ date: isoDay(p.paidOn)!, order: 1, kind: 'PAYMENT', expenseId: e.id, purchaseNo: e.purchaseNo, details: parts.filter(Boolean).join(' · '), billed: 0, paid: accCents(num(p.amount)) })
    }
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order))

  let running = 0, opening = 0, billedP = 0, paidP = 0
  const rows: { date: string; kind: 'BILL' | 'PAYMENT'; expenseId: string; purchaseNo: string; details: string; billed: number; paid: number; balance: number }[] = []
  for (const e of events) {
    running += e.billed - e.paid
    if (from && e.date < from) { opening = running; continue }
    if (to && e.date > to) continue
    billedP += e.billed; paidP += e.paid
    rows.push({ date: e.date, kind: e.kind, expenseId: e.expenseId, purchaseNo: e.purchaseNo, details: e.details, billed: e.billed / 100, paid: e.paid / 100, balance: running / 100 })
  }
  const closing = opening + billedP - paidP

  const aging = emptyAging()
  const openExpenses = []
  let owedNowC = 0
  for (const e of expenses) {
    const balC = Math.max(0, accCents(num(e.total)) - accCents(num(e.paidTotal)))
    if (balC === 0) continue
    const daysLate = accDaysLate(isoDay(e.dueDate), 'UNPAID', today)
    const a = aging.get(accAgingBucket(daysLate))!; a.amount += balC; a.count += 1
    owedNowC += balC
    openExpenses.push({ id: e.id, purchaseNo: e.purchaseNo, invoiceNumber: e.invoiceNumber, dateIssued: isoDay(e.dateIssued)!, dueDate: isoDay(e.dueDate), total: num(e.total), paidTotal: num(e.paidTotal), balance: balC / 100, daysLate })
  }
  return {
    vendor, from: from ?? null, to: to ?? null, asOf: today,
    opening: opening / 100, rows, billedInPeriod: billedP / 100, paidInPeriod: paidP / 100, closing: closing / 100,
    owedNow: owedNowC / 100, aging: agingRows(aging), openExpenses,
  }
}

interface ExpenseReportOpts {
  from?: string
  to?: string
  country?: string
  vendorId?: string
  category?: string
  subcategory?: string
}

export async function getExpenseReport(tenantId: string, opts: ExpenseReportOpts) {
  const expWhere: any = { tenantId, deletedAt: null }
  const dw = dateWhere(opts.from, opts.to); if (dw) expWhere.dateIssued = dw
  if (opts.country) expWhere.country = opts.country
  if (opts.vendorId) expWhere.vendorId = opts.vendorId

  const items = await prisma.accExpenseItem.findMany({
    where: { expense: expWhere },
    select: { categoryName: true, subcategoryName: true, lineTotal: true, expenseId: true, expense: { select: { dateIssued: true } } },
  })

  // Categories were sometimes entered as a single flat "Main - Sub" name (e.g.
  // "Packaging - Email Pouch") instead of using the dedicated subcategory field, so
  // by-category alone would wrongly show each sub as its own category. splitCat
  // normalises BOTH shapes: a real subcategory field, or a " - " inside the name.
  const splitCat = (categoryName?: string | null, subcategoryName?: string | null) => {
    const raw = (categoryName || '').trim()
    const sub = (subcategoryName || '').trim()
    if (sub) return { main: raw || UNCATEGORIZED, sub }                                  // proper parent/child
    const idx = raw.indexOf(' - ')
    if (idx >= 0) return { main: raw.slice(0, idx).trim() || UNCATEGORIZED, sub: raw.slice(idx + 3).trim() } // flat "Main - Sub"
    return { main: raw || UNCATEGORIZED, sub: '' }                                       // plain category
  }
  const range = resolveRange(opts.from, opts.to, items.map((it) => new Date(it.expense.dateIssued)))
  const { trend, add } = range ? buildBuckets(range.start, range.end) : { trend: [] as { label: string; amount: number }[], add: (_d: Date, _a: number) => {} }

  const catTotals = new Map<string, number>() // keyed by MAIN category
  // Combined main-category + subcategory breakdown (country+vendor scope, all
  // categories). A category with no subcategory shows as its bare main name; one with
  // a subcategory becomes a "Main - Sub" row.
  const combo = new Map<string, { categoryName: string; subcategoryName: string | null; amount: number }>()
  const matched = new Set<string>()
  let total = 0
  for (const it of items) {
    const rawCn = (it.categoryName || '').trim()
    const rawSn = (it.subcategoryName || '').trim()
    const { main, sub } = splitCat(rawCn, rawSn)
    const amt = num(it.lineTotal)
    catTotals.set(main, (catTotals.get(main) || 0) + amt)            // by-category: rolled up to the MAIN category
    const key = JSON.stringify([main, sub])
    const ex = combo.get(key)
    if (ex) ex.amount += amt
    else combo.set(key, { categoryName: main, subcategoryName: sub || null, amount: amt })
    // Filters accept either the raw stored value (the catalog dropdown) or the derived
    // main/sub (a click on a rolled-up chart bar), so both drill-downs work.
    const catMatch = !opts.category || opts.category === rawCn || opts.category === main
    const subMatch = !opts.subcategory || opts.subcategory === rawSn || opts.subcategory === sub
    if (catMatch && subMatch) {
      add(new Date(it.expense.dateIssued), amt)
      total += amt
      matched.add(it.expenseId)
    }
  }
  trend.forEach((t) => { t.amount = r2(t.amount) })
  const byCategory = Array.from(catTotals.entries())
    .map(([categoryName, amount]) => ({ categoryName, amount: r2(amount) }))
    .sort((a, b) => b.amount - a.amount)
  const byCategorySub = Array.from(combo.values())
    .map((v) => ({
      label: v.subcategoryName ? `${v.categoryName} - ${v.subcategoryName}` : v.categoryName,
      categoryName: v.categoryName,
      subcategoryName: v.subcategoryName,
      amount: r2(v.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
  const byCategoryTotal = r2(byCategory.reduce((a, c) => a + c.amount, 0))
  const byCategorySubTotal = r2(byCategorySub.reduce((a, c) => a + c.amount, 0))
  return {
    trend,
    byCategory,
    byCategorySub,
    categories: byCategory.map((c) => c.categoryName),
    total: r2(total),
    byCategoryTotal,
    byCategorySubTotal,
    count: matched.size,
  }
}
