import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import * as svc from '../services/accountingService'
import { generateInvoicePdfBuffer } from '../services/accountingPdfService'

const tenantOf = (request: any) => (request.user as JWTPayload).tenantId

// Optional UUID that tolerates empty strings from the UI (treats '' as null).
// Without this, a blank combo/select field sends "" and z.string().uuid() rejects it → 400 on save.
const nullableUuid = z.preprocess((v) => (v === '' ? null : v), z.string().uuid().nullish())

const lineSchema = z.object({
  itemId: nullableUuid,
  itemName: z.string().min(1).max(200),
  categoryId: nullableUuid,
  categoryName: z.string().max(120).nullish(),
  description: z.string().max(500).nullish(),
  quantity: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  discountPct: z.number().min(0).max(100).optional(),
  taxPct: z.number().min(0).max(100).optional(),
})

const saleSchema = z
  .object({
    customerType: z.enum(['INDIVIDUAL', 'CORPORATION']),
    customerId: nullableUuid,
    customerName: z.string().min(1).max(160),
    customerAddress: z.string().max(400).nullish(),
    customerEmail: z.string().max(160).nullish(),
    customerNumber: z.string().max(80).nullish(),
    contactPerson: z.string().max(160).nullish(),
    dateIssued: z.string(),
    dueDate: z.string().nullish(),
    orderReference: z.string().max(200).nullish(),
    salesAgentId: nullableUuid,
    salesAgentName: z.string().max(160).nullish(),
    saleChannel: z.enum(['FACEBOOK', 'TIKTOK', 'INSTAGRAM', 'MARKETPLACE', 'OTHERS']),
    status: z.enum(['PAID', 'UNPAID']),
    paymentMethod: z.enum(['GCASH', 'CASH', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD']).nullish(),
    bankName: z.string().max(160).nullish(),
    accountName: z.string().max(160).nullish(),
    referenceNumber: z.string().max(120).nullish(),
    gcashNumber: z.string().max(120).nullish(),
    items: z.array(lineSchema).min(1),
  })
  .superRefine((d, ctx) => {
    if (d.status === 'PAID') {
      if (!d.paymentMethod) ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Payment Method is required when Paid' })
      if (d.paymentMethod === 'BANK_TRANSFER') {
        if (!d.bankName) ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'Bank Name is required' })
        if (!d.accountName) ctx.addIssue({ code: 'custom', path: ['accountName'], message: 'Account Name is required' })
        if (!d.referenceNumber) ctx.addIssue({ code: 'custom', path: ['referenceNumber'], message: 'Reference Number is required' })
      }
      if (d.paymentMethod === 'GCASH' && !d.gcashNumber) ctx.addIssue({ code: 'custom', path: ['gcashNumber'], message: 'Gcash Number is required' })
    }
  })

const expenseSchema = z.object({
  invoiceNumber: z.string().max(120).nullish(),
  country: z.enum(['PHILIPPINES', 'CHINA', 'TURKEY', 'CANADA']),
  vendorId: nullableUuid,
  vendorName: z.string().min(1).max(160),
  dateIssued: z.string(),
  dueDate: z.string().nullish(),
  status: z.enum(['PAID', 'UNPAID']),
  paymentMethod: z.enum(['GCASH', 'CASH', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD']).nullish(),
  paidBy: z.string().max(160).nullish(),
  items: z.array(lineSchema).min(1),
}).superRefine((d, ctx) => {
  if (d.status === 'PAID' && !d.paymentMethod) ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Payment Method is required when Paid' })
})

const customerSchema = z.object({
  type: z.enum(['INDIVIDUAL', 'CORPORATION']).optional(),
  name: z.string().min(1).max(160),
  address: z.string().max(400).nullish(),
  email: z.string().max(160).nullish(),
  contactPerson: z.string().max(160).nullish(),
  contactNumber: z.string().max(80).nullish(),
  salesAgentName: z.string().max(160).nullish(),
})
const vendorSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().max(160).nullish(),
  contactNumber: z.string().max(80).nullish(),
  address: z.string().max(400).nullish(),
})

const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_LOGO_BYTES = 5 * 1024 * 1024

export default async function accountingRoutes(fastify: FastifyInstance) {
  const g = { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT)] }

  // ─── Customers ────────────────────────────────────────────────────────────
  fastify.get('/customers', g, async (req) => svc.listCustomers(tenantOf(req), (req.query as any)?.search))
  fastify.post('/customers', g, async (req, reply) => {
    const p = customerSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Invalid body', details: p.error.flatten() })
    return reply.code(201).send(await svc.createCustomer(tenantOf(req), p.data))
  })
  fastify.put('/customers/:id', g, async (req, reply) => {
    const p = customerSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Invalid body' })
    const u = await svc.updateCustomer(tenantOf(req), (req.params as any).id, p.data); if (!u) return reply.code(404).send({ error: 'Not found' }); return u
  })
  fastify.delete('/customers/:id', g, async (req, reply) => {
    const ok = await svc.deleteCustomer(tenantOf(req), (req.params as any).id); if (!ok) return reply.code(404).send({ error: 'Not found' }); return { ok: true }
  })

  // ─── Vendors ──────────────────────────────────────────────────────────────
  fastify.get('/vendors', g, async (req) => svc.listVendors(tenantOf(req), (req.query as any)?.search))
  fastify.post('/vendors', g, async (req, reply) => {
    const p = vendorSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Invalid body', details: p.error.flatten() })
    return reply.code(201).send(await svc.createVendor(tenantOf(req), p.data))
  })
  fastify.put('/vendors/:id', g, async (req, reply) => {
    const p = vendorSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Invalid body' })
    const u = await svc.updateVendor(tenantOf(req), (req.params as any).id, p.data); if (!u) return reply.code(404).send({ error: 'Not found' }); return u
  })
  fastify.delete('/vendors/:id', g, async (req, reply) => {
    const ok = await svc.deleteVendor(tenantOf(req), (req.params as any).id); if (!ok) return reply.code(404).send({ error: 'Not found' }); return { ok: true }
  })

  // ─── Items / Categories catalogs ──────────────────────────────────────────
  fastify.get('/items', g, async (req) => svc.listItems(tenantOf(req)))
  fastify.post('/items', g, async (req, reply) => {
    const p = z.object({ name: z.string().min(1).max(200), unitCost: z.number().nonnegative().nullish() }).safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'Invalid body' })
    return reply.code(201).send(await svc.createItem(tenantOf(req), p.data))
  })
  fastify.get('/categories', g, async (req) => svc.listCategories(tenantOf(req)))
  fastify.post('/categories', g, async (req, reply) => {
    const p = z.object({ name: z.string().min(1).max(120) }).safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'Invalid body' })
    return reply.code(201).send(await svc.createCategory(tenantOf(req), p.data))
  })

  // ─── Sales agents lookup ──────────────────────────────────────────────────
  fastify.get('/sales-agents', g, async (req) => svc.listSalesAgents(tenantOf(req)))

  // ─── Invoices (Sales) ─────────────────────────────────────────────────────
  fastify.get('/sales/stats', g, async (req) => svc.salesStats(tenantOf(req)))
  fastify.get('/sales/next-number', g, async (req) => ({ invoiceNo: await svc.peekNextNumber(tenantOf(req), 'invoice') }))
  fastify.get('/sales', g, async (req) => {
    const q = (req.query as any) ?? {}
    return svc.listSales(tenantOf(req), {
      from: q.from, to: q.to, status: q.status, customerId: q.customerId, saleChannel: q.saleChannel, search: q.search,
      page: Math.max(1, parseInt(q.page) || 1), pageSize: Math.min(200, Math.max(1, parseInt(q.pageSize) || 25)),
    })
  })
  fastify.get('/sales/:id', g, async (req, reply) => {
    const s = await svc.getSale(tenantOf(req), (req.params as any).id); if (!s) return reply.code(404).send({ error: 'Not found' }); return s
  })
  fastify.post('/sales', g, async (req, reply) => {
    const p = saleSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Validation failed', details: p.error.flatten() })
    return reply.code(201).send(await svc.createSale(tenantOf(req), p.data))
  })
  fastify.put('/sales/:id', g, async (req, reply) => {
    const p = saleSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Validation failed', details: p.error.flatten() })
    const u = await svc.updateSale(tenantOf(req), (req.params as any).id, p.data); if (!u) return reply.code(404).send({ error: 'Not found' }); return u
  })
  fastify.delete('/sales/:id', g, async (req, reply) => {
    const ok = await svc.deleteSale(tenantOf(req), (req.params as any).id); if (!ok) return reply.code(404).send({ error: 'Not found' }); return { ok: true }
  })
  fastify.get('/sales/:id/pdf', g, async (req, reply) => {
    const tenantId = tenantOf(req)
    const sale = await svc.getSale(tenantId, (req.params as any).id)
    if (!sale) return reply.code(404).send({ error: 'Not found' })
    const company = await svc.getCompany(tenantId)
    const pdf = await generateInvoicePdfBuffer(sale, company)
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="${sale.invoiceNo.replace('/', '-')}.pdf"`).send(pdf)
  })

  // ─── Purchases (Expenses) ─────────────────────────────────────────────────
  fastify.get('/expenses/stats', g, async (req) => svc.expensesStats(tenantOf(req)))
  fastify.get('/expenses/next-number', g, async (req) => ({ purchaseNo: await svc.peekNextNumber(tenantOf(req), 'purchase') }))
  fastify.get('/expenses', g, async (req) => {
    const q = (req.query as any) ?? {}
    return svc.listExpenses(tenantOf(req), {
      from: q.from, to: q.to, status: q.status, country: q.country, vendorId: q.vendorId, search: q.search,
      page: Math.max(1, parseInt(q.page) || 1), pageSize: Math.min(200, Math.max(1, parseInt(q.pageSize) || 25)),
    })
  })
  fastify.get('/expenses/:id', g, async (req, reply) => {
    const e = await svc.getExpense(tenantOf(req), (req.params as any).id); if (!e) return reply.code(404).send({ error: 'Not found' }); return e
  })
  fastify.post('/expenses', g, async (req, reply) => {
    const p = expenseSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Validation failed', details: p.error.flatten() })
    return reply.code(201).send(await svc.createExpense(tenantOf(req), p.data))
  })
  fastify.put('/expenses/:id', g, async (req, reply) => {
    const p = expenseSchema.safeParse(req.body); if (!p.success) return reply.code(400).send({ error: 'Validation failed', details: p.error.flatten() })
    const u = await svc.updateExpense(tenantOf(req), (req.params as any).id, p.data); if (!u) return reply.code(404).send({ error: 'Not found' }); return u
  })
  fastify.delete('/expenses/:id', g, async (req, reply) => {
    const ok = await svc.deleteExpense(tenantOf(req), (req.params as any).id); if (!ok) return reply.code(404).send({ error: 'Not found' }); return { ok: true }
  })

  // ─── Company profile ──────────────────────────────────────────────────────
  fastify.get('/company', g, async (req) => svc.getCompany(tenantOf(req)))
  fastify.put('/company', g, async (req, reply) => {
    const tenantId = tenantOf(req)
    const fields: Record<string, string> = {}
    let logo: { data: string; mime: string } | undefined
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'logo') {
            const buf = await part.toBuffer()
            if (buf.length > MAX_LOGO_BYTES) return reply.code(413).send({ error: 'Logo too large (max 5 MB)' })
            if (!ALLOWED_LOGO_MIMES.includes(part.mimetype)) return reply.code(415).send({ error: 'Unsupported image type' })
            logo = { data: buf.toString('base64'), mime: part.mimetype }
          } else { await part.toBuffer() }
        } else { fields[part.fieldname] = String(part.value ?? '') }
      }
    } else { Object.assign(fields, (req.body as any) ?? {}) }
    return svc.updateCompany(tenantId, fields, logo)
  })

  // ─── Monthly report ───────────────────────────────────────────────────────
  fastify.get('/report', g, async (req) => {
    const q = (req.query as any) ?? {}
    const month = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : new Date().toISOString().slice(0, 7)
    return svc.getReport(tenantOf(req), month)
  })
}
