import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  UserRole,
  JWTPayload,
  IncidentType,
  INCIDENT_TYPE_LABELS,
  Platform,
  requiresParcelContext,
} from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import {
  createIncident,
  updateIncident,
  deleteIncident,
  listIncidents,
  getIncidentById,
  getIncidentStats,
  getIncidentPivot,
  lookupOrderByTrackingNumber,
  saveSignedFile,
  readSignedFile,
  listIncidentDocuments,
  addIncidentDocument,
  readIncidentDocument,
  deleteIncidentDocument,
  DuplicateDocumentError,
  markEmailSent,
  listSelectableUsers,
  getRememberedFullName,
} from '../services/incidentService'
import { generateIncidentPdfBuffer } from '../services/incidentPdfService'
import { isSmtpConfigured, sendIncidentEmail } from '../services/incidentEmailService'

const MAX_SIGNED_MB = 10
const MAX_SIGNED_BYTES = MAX_SIGNED_MB * 1024 * 1024 // plenty for a signed PDF/JPG scan
const ALLOWED_SIGNED_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'] as const
const TOO_LARGE_MSG = `File is too large. The maximum allowed size is ${MAX_SIGNED_MB} MB — please upload a smaller PDF or JPG (scan at lower resolution or compress it).`

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const ListQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  pageSize:       z.coerce.number().int().min(1).max(100).default(25),
  search:         z.string().max(120).optional(),
  type:           z.nativeEnum(IncidentType).optional(),
  employeeUserId: z.string().uuid().optional(),
  from:           z.string().regex(DATE_RE).optional(),
  to:             z.string().regex(DATE_RE).optional(),
})

const CreateBodySchema = z.object({
  incidentType:       z.nativeEnum(IncidentType),
  incidentDate:       z.string(),
  employeeUserId:     z.string().uuid(),
  employeeFullName:   z.string().min(2).max(120),
  employeeEmail:      z.string().email(),
  recipientEmail:     z.string().email(),
  reportedByUserId:   z.string().uuid(),
  reportedByFullName: z.string().min(2).max(120),
  reportedByRole:     z.string().min(1).max(40),
  adminDescription:   z.string().min(5).max(4000),
  trackingNumber:     z.string().max(80).optional(),
  platform:           z.nativeEnum(Platform).optional(),
  shopName:           z.string().max(120).optional(),
  witnessName:        z.string().max(120).optional(),
  witnessPosition:    z.string().max(80).optional(),
})

const LookupTnSchema = z.object({
  tn: z.string().min(1).max(80),
})

const SendEmailBodySchema = z.object({
  // No body fields — recipients are read from the incident row.
}).optional()

export default async function incidentRoutes(fastify: FastifyInstance) {
  // ─── List + stats + pivot ──────────────────────────────────────────────────

  fastify.get(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const parsed = ListQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() })
      const { tenantId } = request.user as JWTPayload
      const data = await listIncidents(tenantId, parsed.data)
      return reply.send(data)
    },
  )

  fastify.get(
    '/stats',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const stats = await getIncidentStats(tenantId)
      return reply.send({ ...stats, smtpConfigured: isSmtpConfigured() })
    },
  )

  fastify.get(
    '/pivot',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const data = await getIncidentPivot(tenantId)
      return reply.send(data)
    },
  )

  fastify.get(
    '/types',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (_request, reply) => {
      const list = Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
        requiresParcel: requiresParcelContext(value as IncidentType),
      }))
      return reply.send(list)
    },
  )

  fastify.get(
    '/lookup-tn',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const parsed = LookupTnSchema.safeParse(request.query)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid query' })
      const { tenantId } = request.user as JWTPayload
      const order = await lookupOrderByTrackingNumber(tenantId, parsed.data.tn.trim())
      if (!order) return reply.send({ found: false })
      return reply.send({ found: true, ...order })
    },
  )

  fastify.get(
    '/selectable-users',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const users = await listSelectableUsers(tenantId)
      return reply.send(users)
    },
  )

  fastify.get(
    '/remembered-name/:userId',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { userId } = request.params as { userId: string }
      const { tenantId } = request.user as JWTPayload
      const fullName = await getRememberedFullName(tenantId, userId)
      return reply.send({ fullName })
    },
  )

  // ─── Create ────────────────────────────────────────────────────────────────

  fastify.post(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const parsed = CreateBodySchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      const body = parsed.data

      // For parcel-context incident types, all 3 parcel fields must be filled.
      if (requiresParcelContext(body.incidentType)) {
        if (!body.trackingNumber || !body.platform || !body.shopName) {
          return reply.code(400).send({
            error: 'Tracking number, platform and shop name are required for this incident type.',
          })
        }
      }

      const { tenantId, userId } = request.user as JWTPayload
      const created = await createIncident({
        tenantId,
        createdById: userId,
        incidentType:       body.incidentType,
        incidentDate:       new Date(body.incidentDate),
        employeeUserId:     body.employeeUserId,
        employeeFullName:   body.employeeFullName.trim(),
        employeeEmail:      body.employeeEmail.trim(),
        recipientEmail:     body.recipientEmail.trim(),
        reportedByUserId:   body.reportedByUserId,
        reportedByFullName: body.reportedByFullName.trim(),
        reportedByRole:     body.reportedByRole.trim(),
        adminDescription:   body.adminDescription.trim(),
        trackingNumber:     body.trackingNumber?.trim(),
        platform:           body.platform,
        shopName:           body.shopName?.trim(),
        witnessName:        body.witnessName?.trim(),
        witnessPosition:    body.witnessPosition?.trim(),
      })
      return reply.code(201).send(created)
    },
  )

  // ─── Update ──────────────────────────────────────────────────────────────────

  fastify.patch(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const parsed = CreateBodySchema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() })
      const body = parsed.data

      if (requiresParcelContext(body.incidentType)) {
        if (!body.trackingNumber || !body.platform || !body.shopName) {
          return reply.code(400).send({
            error: 'Tracking number, platform and shop name are required for this incident type.',
          })
        }
      }

      const { tenantId } = request.user as JWTPayload
      const updated = await updateIncident(tenantId, id, {
        incidentType:       body.incidentType,
        incidentDate:       new Date(body.incidentDate),
        employeeUserId:     body.employeeUserId,
        employeeFullName:   body.employeeFullName.trim(),
        employeeEmail:      body.employeeEmail.trim(),
        recipientEmail:     body.recipientEmail.trim(),
        reportedByUserId:   body.reportedByUserId,
        reportedByFullName: body.reportedByFullName.trim(),
        reportedByRole:     body.reportedByRole.trim(),
        adminDescription:   body.adminDescription.trim(),
        trackingNumber:     body.trackingNumber?.trim(),
        platform:           body.platform,
        shopName:           body.shopName?.trim(),
        witnessName:        body.witnessName?.trim(),
        witnessPosition:    body.witnessPosition?.trim(),
      })
      if (!updated) return reply.code(404).send({ error: 'Incident not found' })
      return reply.send(updated)
    },
  )

  // ─── Delete ──────────────────────────────────────────────────────────────────

  // NOTE: delete is intentionally NOT granted to INCIDENT_REPORTER — that role
  // may create/edit/email any incident but can never delete one.
  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload
      const deleted = await deleteIncident(tenantId, id)
      if (!deleted) return reply.code(404).send({ error: 'Incident not found' })
      return reply.send(deleted)
    },
  )

  // ─── Single incident + PDF ─────────────────────────────────────────────────

  fastify.get(
    '/:id',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload
      const incident = await getIncidentById(tenantId, id)
      if (!incident) return reply.code(404).send({ error: 'Incident not found' })
      return reply.send(incident)
    },
  )

  fastify.get(
    '/:id/pdf',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload
      const incident = await getIncidentById(tenantId, id)
      if (!incident) return reply.code(404).send({ error: 'Incident not found' })
      const pdf = await generateIncidentPdfBuffer(incident)
      const filename = `incident-${id.slice(0, 8)}.pdf`
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="${filename}"`)
      return reply.send(pdf)
    },
  )

  // ─── Signed file upload + download ─────────────────────────────────────────

  fastify.post(
    '/:id/signed',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload
      const incident = await getIncidentById(tenantId, id)
      if (!incident) return reply.code(404).send({ error: 'Incident not found' })

      const file = await request.file({ limits: { fileSize: MAX_SIGNED_BYTES } })
      if (!file) return reply.code(400).send({ error: 'No file uploaded' })
      if (!ALLOWED_SIGNED_MIMES.includes(file.mimetype as typeof ALLOWED_SIGNED_MIMES[number])) {
        return reply.code(400).send({ error: `Unsupported file type: ${file.mimetype}. Allowed: PDF, PNG, JPG.` })
      }

      // @fastify/multipart (throwFileSizeLimit defaults to true) THROWS once the stream
      // passes limits.fileSize, so the truncated check below was never reached — the raw
      // 413 propagated as an unfriendly "request file too large" message. Catch it and
      // return a clear, human message instead. Keep the truncated check as a fallback.
      let buffer: Buffer
      try {
        buffer = await file.toBuffer()
      } catch (err: any) {
        if (err?.code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: TOO_LARGE_MSG })
        }
        throw err
      }
      if (file.file.truncated) {
        return reply.code(413).send({ error: TOO_LARGE_MSG })
      }

      const updated = await saveSignedFile(tenantId, id, buffer, file.mimetype)
      return reply.send(updated)
    },
  )

  fastify.get(
    '/:id/signed',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload
      const signed = await readSignedFile(tenantId, id)
      if (!signed) return reply.code(404).send({ error: 'No signed file uploaded yet' })
      reply.header('Content-Type', signed.mime)
      reply.header('Content-Disposition', `inline; filename="incident-${id.slice(0, 8)}-signed${guessExt(signed.mime)}"`)
      return reply.send(signed.buffer)
    },
  )

  // ─── Multiple documents per incident (list / upload / download / delete) ────
  const docRoles = [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)]

  fastify.get('/:id/documents', { preHandler: docRoles }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as JWTPayload
    const docs = await listIncidentDocuments(tenantId, id)
    if (docs === null) return reply.code(404).send({ error: 'Incident not found' })
    return reply.send({ documents: docs })
  })

  fastify.post('/:id/documents', { preHandler: docRoles }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { tenantId } = request.user as JWTPayload
    const incident = await getIncidentById(tenantId, id)
    if (!incident) return reply.code(404).send({ error: 'Incident not found' })

    const file = await request.file({ limits: { fileSize: MAX_SIGNED_BYTES } })
    if (!file) return reply.code(400).send({ error: 'No file uploaded' })
    if (!ALLOWED_SIGNED_MIMES.includes(file.mimetype as typeof ALLOWED_SIGNED_MIMES[number])) {
      return reply.code(400).send({ error: `Unsupported file type: ${file.mimetype}. Allowed: PDF, PNG, JPG.` })
    }
    let buffer: Buffer
    try {
      buffer = await file.toBuffer()
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send({ error: TOO_LARGE_MSG })
      throw err
    }
    if (file.file.truncated) return reply.code(413).send({ error: TOO_LARGE_MSG })

    try {
      const doc = await addIncidentDocument(tenantId, id, buffer, file.mimetype, file.filename ?? null)
      if (!doc) return reply.code(404).send({ error: 'Incident not found' })
      return reply.code(201).send(doc)
    } catch (err) {
      if (err instanceof DuplicateDocumentError) {
        return reply.code(409).send({ error: `"${file.filename}" is already uploaded for this incident. Rename the file or delete the existing one first.` })
      }
      throw err
    }
  })

  fastify.get('/:id/documents/:docId', { preHandler: docRoles }, async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string }
    const { tenantId } = request.user as JWTPayload
    const doc = await readIncidentDocument(tenantId, id, docId)
    if (!doc) return reply.code(404).send({ error: 'Document not found' })
    const fallback = `incident-${id.slice(0, 8)}-doc${guessExt(doc.mime)}`
    reply.header('Content-Type', doc.mime)
    reply.header('Content-Disposition', `inline; filename="${(doc.originalName || fallback).replace(/"/g, '')}"`)
    return reply.send(doc.buffer)
  })

  fastify.delete('/:id/documents/:docId', { preHandler: docRoles }, async (request, reply) => {
    const { id, docId } = request.params as { id: string; docId: string }
    const { tenantId } = request.user as JWTPayload
    const ok = await deleteIncidentDocument(tenantId, id, docId)
    if (!ok) return reply.code(404).send({ error: 'Document not found' })
    return reply.send({ ok: true })
  })

  // ─── Send email ─────────────────────────────────────────────────────────────

  fastify.post(
    '/:id/email',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      void SendEmailBodySchema // declared for future fields
      if (!isSmtpConfigured()) {
        return reply.code(503).send({ error: 'SMTP is not configured on the server.' })
      }
      const { id } = request.params as { id: string }
      const { tenantId } = request.user as JWTPayload
      const incident = await getIncidentById(tenantId, id)
      if (!incident) return reply.code(404).send({ error: 'Incident not found' })

      const pdf = await generateIncidentPdfBuffer(incident)
      const typeLabel = INCIDENT_TYPE_LABELS[incident.incidentType as IncidentType]
      const recipients = Array.from(new Set([incident.recipientEmail, incident.employeeEmail].filter(Boolean)))
      const subject = `Incident Report — ${typeLabel} — ${incident.employeeFullName}`
      const bodyText =
        `An incident report has been issued for ${incident.employeeFullName}.\n\n` +
        `Type: ${typeLabel}\n` +
        `Date: ${incident.incidentDate.toISOString().slice(0, 10)}\n` +
        `Reported by: ${incident.reportedByFullName} (${incident.reportedByRole})\n\n` +
        `Please find the official incident report attached as a PDF.`
      const bodyHtml = `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a;">
          <h2 style="color:#1f3a8a; margin: 0 0 8px;">Incident Report</h2>
          <p>An incident report has been issued for <b>${escapeHtml(incident.employeeFullName)}</b>.</p>
          <table cellpadding="6" style="border-collapse: collapse; font-size: 13px;">
            <tr><td><b>Type</b></td><td>${escapeHtml(typeLabel)}</td></tr>
            <tr><td><b>Date</b></td><td>${incident.incidentDate.toISOString().slice(0, 10)}</td></tr>
            <tr><td><b>Reported by</b></td><td>${escapeHtml(incident.reportedByFullName)} (${escapeHtml(incident.reportedByRole)})</td></tr>
          </table>
          <p>The official incident report is attached as a PDF.</p>
        </div>`

      try {
        await sendIncidentEmail({
          to: recipients,
          subject,
          pdfBuffer: pdf,
          pdfFilename: `incident-${id.slice(0, 8)}.pdf`,
          bodyText,
          bodyHtml,
        })
        await markEmailSent(tenantId, id, recipients.join(', '))
        return reply.send({ sent: true, to: recipients })
      } catch (err) {
        request.log.error({ err, incidentId: id }, '[incidents] email send failed')
        const message = err instanceof Error ? err.message : 'Email send failed'
        return reply.code(500).send({ error: message })
      }
    },
  )
}

function guessExt(mime: string): string {
  if (mime === 'application/pdf') return '.pdf'
  if (mime === 'image/png')       return '.png'
  if (mime === 'image/jpeg')      return '.jpg'
  return ''
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
