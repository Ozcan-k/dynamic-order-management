import { FastifyInstance } from 'fastify'
import { UserRole, JWTPayload } from '@dom/shared'
import { requireRole } from '../middleware/rbac'
import { getBranding, upsertBranding, readLogoBuffer } from '../services/brandingService'

const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const

export default async function brandingRoutes(fastify: FastifyInstance) {
  // GET /branding — current branding info
  fastify.get(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const data = await getBranding(tenantId)
      return reply.send(data)
    },
  )

  // GET /branding/logo — stream the logo image
  fastify.get(
    '/logo',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { tenantId } = request.user as JWTPayload
      const logo = await readLogoBuffer(tenantId)
      if (!logo) return reply.code(404).send({ error: 'No logo uploaded' })
      reply.header('Content-Type', logo.mime)
      reply.header('Cache-Control', 'private, max-age=60')
      return reply.send(logo.buffer)
    },
  )

  // POST /branding — multipart upload: companyName (field) + logo (optional file)
  fastify.post(
    '/',
    { preHandler: [fastify.authenticate, requireRole(UserRole.ADMIN, UserRole.WAREHOUSE_ADMIN, UserRole.INCIDENT_REPORTER)] },
    async (request, reply) => {
      const { tenantId, userId } = request.user as JWTPayload

      let companyName: string | null = null
      let address: string | null = null
      let email: string | null = null
      let contactNumber: string | null = null
      let logoBuffer: Buffer | null = null
      let logoMime: string | null = null

      const parts = request.parts({ limits: { fileSize: MAX_LOGO_BYTES, files: 1 } })
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'companyName') {
            companyName = String(part.value ?? '').trim()
          } else if (part.fieldname === 'address') {
            address = String(part.value ?? '').trim() || null
          } else if (part.fieldname === 'email') {
            email = String(part.value ?? '').trim() || null
          } else if (part.fieldname === 'contactNumber') {
            contactNumber = String(part.value ?? '').trim() || null
          }
        } else if (part.type === 'file' && part.fieldname === 'logo') {
          if (!ALLOWED_LOGO_MIMES.includes(part.mimetype as typeof ALLOWED_LOGO_MIMES[number])) {
            return reply.code(400).send({ error: `Unsupported image type: ${part.mimetype}` })
          }
          logoBuffer = await streamToBuffer(part.file)
          if (part.file.truncated) {
            return reply.code(413).send({ error: `Logo file exceeds maximum size of ${MAX_LOGO_BYTES} bytes.` })
          }
          logoMime = part.mimetype
        }
      }

      if (!companyName) {
        return reply.code(400).send({ error: 'Company name is required.' })
      }

      const dto = await upsertBranding({
        tenantId,
        updatedById: userId,
        companyName,
        address,
        email,
        contactNumber,
        logo: logoBuffer && logoMime ? { buffer: logoBuffer, mime: logoMime } : undefined,
      })
      return reply.send(dto)
    },
  )
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data',  (c: Buffer) => chunks.push(c))
    stream.on('end',   () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}
