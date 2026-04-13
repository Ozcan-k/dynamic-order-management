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
  ] = await Promise.all([
    prisma.order.count({ where: { tenantId } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: today } } }),
    prisma.order.count({ where: { tenantId, delayLevel: 0, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 1, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 2, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 3, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 4, slaCompletedAt: null } }),
  ])

  const remaining = inboundTotal - outboundTotal
  const dispatchRate = inboundTotal > 0 ? Math.round((dispatchedToday / inboundTotal) * 100) : 0
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
  const from = process.env.SMTP_FROM || 'DOM Warehouse System <noreply@example.com>'

  const slaRows = [
    { label: 'D0 — On Time', count: d0, color: '#059669', bg: '#ecfdf5', dot: '#10b981' },
    { label: 'D1 — 4 to 8 hours', count: d1, color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
    { label: 'D2 — 8 to 12 hours', count: d2, color: '#c2410c', bg: '#fff7ed', dot: '#f97316' },
    { label: 'D3 — 12 to 16 hours', count: d3, color: '#dc2626', bg: '#fef2f2', dot: '#ef4444' },
    { label: 'D4 — Over 16 hours', count: d4Active, color: '#991b1b', bg: '#fef2f2', dot: '#dc2626' },
  ].map(r => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.dot};margin-right:8px;vertical-align:middle;"></span>
        <span style="font-size:13px;color:#374151;font-weight:500;">${r.label}</span>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #f1f5f9;text-align:right;">
        <span style="display:inline-block;background:${r.bg};color:${r.color};font-weight:700;font-size:13px;padding:3px 12px;border-radius:20px;">${r.count}</span>
      </td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>DOM Nightly Report</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);border-radius:16px 16px 0 0;padding:32px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <!-- Logo cube (SVG inline) -->
                  <table cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:14px;">
                    <tr><td>
                      <div style="width:48px;height:48px;background:rgba(255,255,255,0.1);border-radius:12px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.2);">
                        <svg width="28" height="28" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M36 14 L54 24 L36 34 L18 24 Z" fill="rgba(255,255,255,0.25)" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
                          <path d="M18 24 L18 46 L36 56 L36 34 Z" fill="rgba(255,255,255,0.15)" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
                          <path d="M54 24 L54 46 L36 56 L36 34 Z" fill="rgba(255,255,255,0.08)" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
                        </svg>
                      </div>
                    </td></tr>
                  </table>
                  <span style="display:inline-block;vertical-align:middle;">
                    <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;line-height:1.1;">DOM</div>
                    <div style="font-size:11px;font-weight:500;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Warehouse System</div>
                  </span>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  <div style="display:inline-block;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:6px 14px;">
                    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Nightly Report</div>
                  </div>
                </td>
              </tr>
            </table>

            <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.1);">
              <div style="font-size:16px;font-weight:600;color:#f8fafc;">${dateStr}</div>
              <div style="font-size:12px;color:#64748b;margin-top:3px;">Generated at ${timeStr} · ${tenantSlug}</div>
            </div>
          </td>
        </tr>

        <!-- ── SUMMARY CARDS ── -->
        <tr>
          <td style="background:#ffffff;padding:28px 36px 20px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Daily Summary</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="31%" style="padding-right:8px;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 12px;text-align:center;">
                    <div style="font-size:32px;font-weight:800;color:#0f172a;line-height:1;">${inboundTotal}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:6px;font-weight:500;">Total Scanned</div>
                  </div>
                </td>
                <td width="4%"></td>
                <td width="31%" style="padding:0 4px;">
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 12px;text-align:center;">
                    <div style="font-size:32px;font-weight:800;color:#059669;line-height:1;">${dispatchedToday}</div>
                    <div style="font-size:11px;color:#047857;margin-top:6px;font-weight:500;">Dispatched Today</div>
                  </div>
                </td>
                <td width="4%"></td>
                <td width="31%" style="padding-left:8px;">
                  <div style="background:${remaining > 0 ? '#fffbeb' : '#f0fdf4'};border:1px solid ${remaining > 0 ? '#fde68a' : '#bbf7d0'};border-radius:12px;padding:18px 12px;text-align:center;">
                    <div style="font-size:32px;font-weight:800;color:${remaining > 0 ? '#b45309' : '#059669'};line-height:1;">${remaining}</div>
                    <div style="font-size:11px;color:${remaining > 0 ? '#92400e' : '#047857'};margin-top:6px;font-weight:500;">Remaining</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Dispatch rate bar -->
            <div style="margin-top:20px;background:#f8fafc;border-radius:10px;padding:14px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><span style="font-size:12px;color:#64748b;font-weight:500;">Dispatch Rate</span></td>
                  <td style="text-align:right;"><span style="font-size:13px;font-weight:700;color:#0f172a;">${dispatchRate}%</span></td>
                </tr>
              </table>
              <div style="margin-top:8px;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${dispatchRate}%;background:linear-gradient(90deg,#059669,#10b981);border-radius:99px;"></div>
              </div>
            </div>
          </td>
        </tr>

        <!-- ── DIVIDER ── -->
        <tr>
          <td style="background:#ffffff;padding:0 36px;">
            <div style="height:1px;background:#f1f5f9;"></div>
          </td>
        </tr>

        <!-- ── SLA BREAKDOWN ── -->
        <tr>
          <td style="background:#ffffff;padding:20px 36px 28px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">SLA Breakdown — Active Orders</div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1f5f9;border-radius:12px;overflow:hidden;">
              <tr style="background:#f8fafc;">
                <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f1f5f9;">Status Level</th>
                <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f1f5f9;">Orders</th>
              </tr>
              ${slaRows}
            </table>
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);border-radius:0 0 16px 16px;padding:24px 36px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">DOM Warehouse System</div>
                  <div style="font-size:11px;color:#64748b;margin-top:3px;">This report is generated automatically every evening.</div>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  <div style="display:inline-block;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 12px;">
                    <span style="font-size:11px;color:#94a3b8;font-weight:600;">Automated · Do not reply</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`

  for (const admin of admins) {
    if (!admin.email) continue
    try {
      await transporter.sendMail({
        from,
        to: admin.email,
        subject: `DOM Nightly Report — ${dateStr} · ${dispatchedToday} dispatched, ${remaining} remaining`,
        html,
      })
    } catch (err) {
      console.error(`[nightlyReport] Failed to send email to ${admin.email}:`, err)
    }
  }

  console.log(`[nightlyReport] Sent to ${admins.length} admin(s) for tenant ${tenantSlug}`)
}

export async function runNightlyReport() {
  const tenants = await prisma.tenant.findMany({ where: { isActive: true }, select: { id: true, slug: true } })
  for (const tenant of tenants) {
    await sendNightlyReport(tenant.id, tenant.slug)
  }
}
