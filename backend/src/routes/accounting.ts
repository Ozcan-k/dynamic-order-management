import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import * as svc from '../services/accountingService'
import { generateInvoicePdfBuffer } from '../services/accountingPdfService'

const guard = (fastify: FastifyInstance) => ({
  preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.ACCOUNTANT)],
})

const tenantOf = (request: any) => (request.user as JWTPayload).tenantId

const contactSchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(400).nullish(),
  email: z.string().max(160).nullish(),
  contactPerson: z.string().max(160).nullish(),
  contactNumber: z.string().max(80).nullish(),
})

const saleSchema = z
  .object({
    date: z.coerce.date().optional(),
    product: z.string().min(1).max(200),
    price: z.number().nonnegative(),
    quantity: z.number().int().positive(),
    customerId: z.string().uuid().nullish(),
    customerName: z.string().min(1).max(160),
    customerAddress: z.string().max(400).nullish(),
    customerNumber: z.string().max(80).nullish(),
    customerEmail: z.string().max(160).nullish(),
    contactPerson: z.string().max(160).nullish(),
    paymentMethod: z.enum(['GCASH', 'CASH', 'BANK_TRANSFER', 'CHECK']),
    bankName: z.string().max(160).nullish(),
    accountName: z.string().max(160).nullish(),
    referenceNumber: z.string().max(120).nullish(),
    gcashNumber: z.string().max(120).nullish(),
    checkNumber: z.string().max(120).nullish(),
    salesStatus: z.enum(['PAID', 'PENDING']),
    dueDate: z.coerce.date().nullish(),
  })
  .superRefine((d, ctx) => {
    if (d.paymentMethod === 'BANK_TRANSFER') {
      if (!d.bankName) ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'Bank Name is required' })
      if (!d.accountName) ctx.addIssue({ code: 'custom', path: ['accountName'], message: 'Account Name is required' })
      if (!d.referenceNumber) ctx.addIssue({ code: 'custom', path: ['referenceNumber'], message: 'Reference Number is required' })
    }
    if (d.paymentMethod === 'GCASH' && !d.gcashNumber) ctx.addIssue({ code: 'custom', path: ['gcashNumber'], message: 'Gcash Number is required' })
    if (d.paymentMethod === 'CHECK') {
      if (!d.checkNumber) ctx.addIssue({ code: 'custom', path: ['checkNumber'], message: 'Check Number is required' })
      if (!d.accountName) ctx.addIssue({ code: 'custom', path: ['accountName'], message: 'Account Name is required' })
    }
    if (d.salesStatus === 'PENDING' && !d.dueDate) ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Due Date is required when Pending' })
  })

const expenseSchema = z
  .object({
    date: z.coerce.date().optional(),
    country: z.enum(['PHILIPPINES', 'CHINA', 'TURKEY', 'CANADA']),
    itemName: z.string().min(1).max(200),
    supplierId: z.string().uuid().nullish(),
    supplierName: z.string().min(1).max(160),
    category: z.string().min(1).max(120),
    amount: z.number().nonnegative(),
    quantity: z.number().int().positive(),
    paidFrom: z.enum(['BANK', 'GCASH', 'CREDIT_CARD', 'CASH', 'CHECK']),
    paymentReferenceNumber: z.string().max(120).nullish(),
    checkNumber: z.string().max(120).nullish(),
    paidBy: z.string().min(1).max(160),
  })
  .superRefine((d, ctx) => {
    if (d.paidFrom === 'CHECK' && !d.checkNumber) ctx.addIssue({ code: 'custom', path: ['checkNumber'], message: 'Check Number is required' })
  })

const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
const MAX_LOGO_BYTES = 5 * 1024 * 1024

export default async function accountingRoutes(fastify: FastifyInstance) {
  const g = guard(fastify)

  // ─── Customers / Suppliers ──────────────────────────────────────────────────
  for (const [path, model] of [['/customers', 'accCustomer'], ['/suppliers', 'accSupplier']] as const) {
    fastify.get(path, g, async (request) => {
      const { search } = (request.query as any) ?? {}
      return svc.listContacts(model, tenantOf(request), search ? String(search) : undefined)
    })
    fastify.post(path, g, async (request, reply) => {
      const parsed = contactSchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      return reply.code(201).send(await svc.createContact(model, tenantOf(request), parsed.data))
    })
    fastify.put(`${path}/:id`, g, async (request, reply) => {
      const parsed = contactSchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      const updated = await svc.updateContact(model, tenantOf(request), (request.params as any).id, parsed.data)
      if (!updated) return reply.code(404).send({ error: 'Not found' })
      return updated
    })
    fastify.delete(`${path}/:id`, g, async (request, reply) => {
      const ok = await svc.deleteContact(model, tenantOf(request), (request.params as any).id)
      if (!ok) return reply.code(404).send({ error: 'Not found' })
      return { ok: true }
    })
  }

  // ─── Sales ──────────────────────────────────────────────────────────────────
  fastify.get('/sales', g, async (request) => {
    const q = (request.query as any) ?? {}
    return svc.listSales(tenantOf(request), {
      from: q.from, to: q.to, paymentMethod: q.paymentMethod, salesStatus: q.salesStatus,
      customerId: q.customerId, search: q.search,
      page: Math.max(1, parseInt(q.page) || 1),
      pageSize: Math.min(200, Math.max(1, parseInt(q.pageSize) || 25)),
    })
  })
  fastify.post('/sales', g, async (request, reply) => {
    const parsed = saleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    return reply.code(201).send(await svc.createSale(tenantOf(request), parsed.data as any))
  })
  fastify.put('/sales/:id', g, async (request, reply) => {
    const parsed = saleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    const updated = await svc.updateSale(tenantOf(request), (request.params as any).id, parsed.data as any)
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })
  fastify.delete('/sales/:id', g, async (request, reply) => {
    const ok = await svc.deleteSale(tenantOf(request), (request.params as any).id)
    if (!ok) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // ─── Expenses ─────────────────────────────────────────────────────────────────
  fastify.get('/expenses', g, async (request) => {
    const q = (request.query as any) ?? {}
    return svc.listExpenses(tenantOf(request), {
      from: q.from, to: q.to, country: q.country, category: q.category, paidFrom: q.paidFrom,
      supplierId: q.supplierId, search: q.search,
      page: Math.max(1, parseInt(q.page) || 1),
      pageSize: Math.min(200, Math.max(1, parseInt(q.pageSize) || 25)),
    })
  })
  fastify.post('/expenses', g, async (request, reply) => {
    const parsed = expenseSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    return reply.code(201).send(await svc.createExpense(tenantOf(request), parsed.data as any))
  })
  fastify.put('/expenses/:id', g, async (request, reply) => {
    const parsed = expenseSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() })
    const updated = await svc.updateExpense(tenantOf(request), (request.params as any).id, parsed.data as any)
    if (!updated) return reply.code(404).send({ error: 'Not found' })
    return updated
  })
  fastify.delete('/expenses/:id', g, async (request, reply) => {
    const ok = await svc.deleteExpense(tenantOf(request), (request.params as any).id)
    if (!ok) return reply.code(404).send({ error: 'Not found' })
    return { ok: true }
  })

  // ─── Company profile ──────────────────────────────────────────────────────────
  fastify.get('/company', g, async (request) => {
    return svc.getCompany(tenantOf(request))
  })
  fastify.put('/company', g, async (request, reply) => {
    const tenantId = tenantOf(request)
    const fields: Record<string, string> = {}
    let logo: { data: string; mime: string } | undefined

    if (request.isMultipart()) {
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'logo') {
            const buf = await part.toBuffer()
            if (buf.length > MAX_LOGO_BYTES) return reply.code(413).send({ error: 'Logo too large (max 5 MB)' })
            if (!ALLOWED_LOGO_MIMES.includes(part.mimetype)) return reply.code(415).send({ error: 'Unsupported image type' })
            logo = { data: buf.toString('base64'), mime: part.mimetype }
          } else {
            await part.toBuffer()
          }
        } else {
          fields[part.fieldname] = String(part.value ?? '')
        }
      }
    } else {
      Object.assign(fields, (request.body as any) ?? {})
    }
    return svc.updateCompany(tenantId, fields, logo)
  })

  // ─── Invoices ─────────────────────────────────────────────────────────────────
  fastify.post('/invoices', g, async (request, reply) => {
    const parsed = z.object({ saleId: z.string().uuid() }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' })
    const result = await svc.createInvoiceForSale(tenantOf(request), parsed.data.saleId)
    if ('error' in result) return reply.code(404).send({ error: 'Sale not found' })
    return reply.code(201).send(result.invoice)
  })

  fastify.get('/invoices/:id/pdf', g, async (request, reply) => {
    const invoice = await svc.getInvoiceWithSale(tenantOf(request), (request.params as any).id)
    if (!invoice) return reply.code(404).send({ error: 'Not found' })
    const sale = invoice.sale
    const pdf = await generateInvoicePdfBuffer({
      invoiceNo: invoice.invoiceNo,
      issuedDate: invoice.issuedDate,
      companyName: invoice.companyName,
      companyLogo: invoice.companyLogoData ? { buffer: Buffer.from(invoice.companyLogoData, 'base64') } : null,
      companyAddress: invoice.companyAddress,
      companyEmail: invoice.companyEmail,
      companyContact: invoice.companyContact,
      customerName: sale.customerName,
      customerAddress: sale.customerAddress,
      customerEmail: sale.customerEmail,
      customerNumber: sale.customerNumber,
      contactPerson: sale.contactPerson,
      product: sale.product,
      quantity: sale.quantity,
      price: Number(sale.price),
      total: Number(sale.total),
      paymentMethod: sale.paymentMethod,
      salesStatus: sale.salesStatus,
      dueDate: sale.dueDate,
    })
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `inline; filename="${invoice.invoiceNo}.pdf"`)
      .send(pdf)
  })

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  fastify.get('/dashboard', g, async (request) => {
    return svc.getDashboard(tenantOf(request))
  })
}
