import { Worker } from 'bullmq'
import nodemailer from 'nodemailer'
import { prisma } from '../lib/prisma'
import { redisConnection } from '../lib/queues'
import { hardDeleteExpiredOrders } from '../services/archiveService'
import { OrderStatus } from '@dom/shared'
import { getManilaStartOfToday, getManilaDateString } from '../lib/manila'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
})

export function startNightlyReportWorker() {
  const worker = new Worker(
    'nightlyReport',
    async () => {
      const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true } })

      for (const tenant of tenants) {
        await sendNightlyReport(tenant.id, tenant.slug)
        try {
          const { deleted } = await hardDeleteExpiredOrders(tenant.id)
          if (deleted > 0) console.log(`[nightlyReport] Hard-deleted ${deleted} expired archive orders for tenant ${tenant.slug}`)
        } catch (err) {
          console.error(`[nightlyReport] Failed to hard-delete expired orders for tenant ${tenant.slug}:`, err)
        }
      }
    },
    { connection: redisConnection },
  )

  worker.on('failed', (job, err) => {
    console.error(`[nightlyReport] job ${job?.id} failed:`, err.message)
  })

  return worker
}

async function sendNightlyReport(tenantId: string, tenantSlug: string) {
  const admins = await prisma.user.findMany({
    where: { tenantId, role: 'ADMIN', isActive: true, email: { not: null } },
    select: { email: true },
  })

  if (admins.length === 0) {
    console.log(`[nightlyReport] No admin emails configured for tenant ${tenantSlug} — skipping`)
    return
  }

  const today = getManilaStartOfToday()

  const [
    inboundTotal,
    outboundTotal,
    dispatchedToday,
    d0, d1, d2, d3, d4Active,
    d4Orders,
  ] = await Promise.all([
    prisma.order.count({ where: { tenantId } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: today } } }),
    prisma.order.count({ where: { tenantId, delayLevel: 0, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 1, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 2, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 3, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 4, slaCompletedAt: null } }),
    prisma.order.findMany({
      where: { tenantId, delayLevel: 4, slaCompletedAt: null },
      select: { trackingNumber: true, status: true, slaStartedAt: true },
      orderBy: { slaStartedAt: 'asc' },
      take: 20,
    }),
  ])

  const remaining = inboundTotal - outboundTotal
  const dateStr = new Date(getManilaDateString()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Manila' })
  const from = process.env.SMTP_FROM || 'Order System <noreply@example.com>'

  const d4Rows = d4Orders.map(o => {
    const elapsedHours = Math.floor((Date.now() - o.slaStartedAt.getTime()) / 3_600_000)
    return `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${o.trackingNumber}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${o.status.replace(/_/g, ' ')}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#dc2626;font-weight:600">${elapsedHours}h</td>
    </tr>`
  }).join('')

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
      <div style="background:#1e293b;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:18px;color:#fff">DOM — Nightly Report</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#94a3b8">${dateStr} · ${tenantSlug}</p>
      </div>

      <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px">

        <h2 style="margin:0 0 16px;font-size:14px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.05em">Summary</h2>
        <div style="display:flex;gap:12px;margin-bottom:24px">
          <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#0f172a">${inboundTotal}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">Total Scanned</div>
          </div>
          <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#10b981">${dispatchedToday}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">Dispatched Today</div>
          </div>
          <div style="flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#f59e0b">${remaining}</div>
            <div style="font-size:12px;color:#64748b;margin-top:2px">Remaining</div>
          </div>
        </div>

        <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:.05em">SLA Breakdown (Active Orders)</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-weight:600">Level</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600">Count</th>
          </tr>
          ${[['D0 (On Time)', d0, '#10b981'], ['D1 (4–8h)', d1, '#f59e0b'], ['D2 (8–12h)', d2, '#f97316'], ['D3 (12–16h)', d3, '#ef4444'], ['D4 (16h+)', d4Active, '#dc2626']].map(([label, count, color]) => `
          <tr>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:${color};font-weight:500">${label}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${count}</td>
          </tr>`).join('')}
        </table>

        ${d4Orders.length > 0 ? `
        <h2 style="margin:0 0 12px;font-size:14px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:.05em">D4 Orders Requiring Attention</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="background:#fef2f2">
            <th style="padding:8px 12px;text-align:left;font-weight:600">Tracking #</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600">Status</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600">Elapsed</th>
          </tr>
          ${d4Rows}
        </table>
        ` : ''}

        <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">
          This report was generated automatically at 9:00 PM by the Order Management System.
        </p>
      </div>
    </div>
  `

  for (const admin of admins) {
    if (!admin.email) continue
    try {
      await transporter.sendMail({
        from,
        to: admin.email,
        subject: `DOM Nightly Report — ${dateStr} (${remaining} remaining, ${d4Active} D4)`,
        html,
      })
    } catch (err) {
      console.error(`[nightlyReport] Failed to send email to ${admin.email}:`, err)
    }
  }

  console.log(`[nightlyReport] Sent to ${admins.length} admin(s) for tenant ${tenantSlug}`)
}
