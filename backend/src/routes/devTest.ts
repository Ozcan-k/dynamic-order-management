import type { FastifyInstance } from 'fastify'
import { getIO } from '../lib/socket'
import { prisma } from '../lib/prisma'

/**
 * DEV-ONLY: trigger a fake sla:d4_alert for UI testing.
 * Remove this file before production.
 */
export default async function devTestRoutes(fastify: FastifyInstance) {
  fastify.get('/dev/trigger-d4', async (request, reply) => {
    // Find any D4 order (delay_level = 4) to use as payload
    const order = await prisma.order.findFirst({
      where: { delayLevel: 4 },
      select: {
        id: true,
        trackingNumber: true,
        tenantId: true,
        status: true,
        pickerAssignments: {
          where: { completedAt: null },
          select: { picker: { select: { username: true } } },
          take: 1,
        },
        packerAssignments: {
          where: { completedAt: null },
          select: { packer: { select: { username: true } } },
          take: 1,
        },
      },
    })

    if (!order) {
      return reply.status(404).send({ error: 'No D4 order found in DB' })
    }

    const assignedPicker = order.pickerAssignments[0]?.picker.username ?? null
    const assignedPacker = order.packerAssignments[0]?.packer.username ?? null

    try {
      const io = getIO()
      io.to(`tenant:${order.tenantId}`).emit('sla:d4_alert', {
        orderId: order.id,
        trackingNumber: order.trackingNumber,
        tenantId: order.tenantId,
        status: order.status,
        assignedPicker,
        assignedPacker,
      })
      return { ok: true, emittedFor: order.trackingNumber, tenantId: order.tenantId }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ error: msg })
    }
  })
}
