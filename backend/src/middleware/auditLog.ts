import { FastifyReply, FastifyRequest } from 'fastify'
import { JWTPayload } from '@dom/shared'

export async function auditMarketingAccess(request: FastifyRequest, _reply: FastifyReply) {
  const user = request.user as JWTPayload | undefined
  request.log.info(
    {
      audit: 'marketing-access',
      userId: user?.userId,
      role: user?.role,
      tenantId: user?.tenantId,
      method: request.method,
      url: request.url,
      ts: new Date().toISOString(),
    },
    'marketing-access',
  )
}
