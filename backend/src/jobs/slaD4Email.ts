import { Worker } from 'bullmq'
import nodemailer from 'nodemailer'
import { prisma } from '../lib/prisma'
import { redisConnection } from '../lib/queues'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
})

export function startSlaD4EmailWorker() {
  const worker = new Worker(
    'slaD4Email',
    async (job) => {
      const { orderId, trackingNumber, tenantId } = job.data as {
        orderId: string
        trackingNumber: string
        tenantId: string
      }

      // Get the order for SLA start time
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { slaStartedAt: true },
      })

      if (!order) return

      const elapsedMs = Date.now() - order.slaStartedAt.getTime()
      const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60))

      // Get all ADMIN users for this tenant who have an email
      const admins = await prisma.user.findMany({
        where: { tenantId, role: 'ADMIN', isActive: true, email: { not: null } },
        select: { email: true },
      })

      if (admins.length === 0) return

      const from = process.env.SMTP_FROM || 'Order System <noreply@example.com>'

      for (const admin of admins) {
        if (!admin.email) continue
        await transporter.sendMail({
          from,
          to: admin.email,
          subject: `[URGENT] Order D4 Alert — ${trackingNumber}`,
          html: `
            <h2 style="color:#dc2626">D4 SLA Alert</h2>
            <p>The following order has exceeded the maximum SLA threshold (16+ hours).</p>
            <table cellpadding="8" style="border-collapse:collapse;font-family:monospace">
              <tr><td><b>Order ID</b></td><td>${orderId}</td></tr>
              <tr><td><b>Tracking #</b></td><td>${trackingNumber}</td></tr>
              <tr><td><b>Elapsed</b></td><td>${elapsedHours} hours</td></tr>
              <tr><td><b>SLA Started</b></td><td>${order.slaStartedAt.toISOString()}</td></tr>
            </table>
            <p style="color:#64748b;font-size:12px">This alert was sent automatically by the Order Management System.</p>
          `,
        })
      }
    },
    { connection: redisConnection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[slaD4Email] job ${job?.id} failed:`, err.message)
  })

  return worker
}
