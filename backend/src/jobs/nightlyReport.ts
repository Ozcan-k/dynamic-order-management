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

const DAY_MS = 86_400_000

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
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
  const yesterday = new Date(today.getTime() - DAY_MS)
  const tomorrow = new Date(today.getTime() + DAY_MS)
  const sevenDaysAgo = new Date(today.getTime() - 6 * DAY_MS)

  const [
    inboundTotal,
    outboundTotal,
    dispatchedToday,
    dispatchedYesterday,
    remainingActive,
    d0, d1, d2, d3, d4Active,
    weeklyDispatchedRows,
    topCarriersRaw,
    pickerCompletions,
    packerCompletions,
  ] = await Promise.all([
    prisma.order.count({ where: { tenantId } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: today, lt: tomorrow } } }),
    prisma.order.count({ where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: yesterday, lt: today } } }),
    prisma.order.count({ where: { tenantId, status: { not: OrderStatus.OUTBOUND }, archivedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 0, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 1, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 2, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 3, slaCompletedAt: null } }),
    prisma.order.count({ where: { tenantId, delayLevel: 4, slaCompletedAt: null } }),
    prisma.order.findMany({
      where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: sevenDaysAgo, lt: tomorrow } },
      select: { slaCompletedAt: true },
    }),
    prisma.order.groupBy({
      by: ['carrierName'],
      where: { tenantId, status: OrderStatus.OUTBOUND, slaCompletedAt: { gte: today, lt: tomorrow } },
      _count: { _all: true },
    }),
    prisma.pickerAssignment.findMany({
      where: { completedAt: { gte: today, lt: tomorrow }, order: { tenantId } },
      select: { pickerId: true, picker: { select: { username: true } } },
    }),
    prisma.packerAssignment.findMany({
      where: { completedAt: { gte: today, lt: tomorrow }, order: { tenantId } },
      select: { packerId: true, packer: { select: { username: true } } },
    }),
  ])

  // ── Derived metrics ────────────────────────────────────────────────────────
  const remaining = remainingActive
  // Fixed: was `dispatchedToday / inboundTotal` (lifetime). Now: % of today's workload dispatched.
  const dailyWorkload = dispatchedToday + remaining
  const dispatchRate = dailyWorkload > 0 ? Math.round((dispatchedToday / dailyWorkload) * 100) : 0

  const dispatchDelta = dispatchedToday - dispatchedYesterday
  const deltaPct = dispatchedYesterday > 0
    ? Math.round((dispatchDelta / dispatchedYesterday) * 100)
    : (dispatchedToday > 0 ? 100 : 0)

  // 7-day series bucketing by Manila date
  const weekCounts = new Map<string, number>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS)
    weekCounts.set(getManilaDateString(d), 0)
  }
  for (const row of weeklyDispatchedRows) {
    if (!row.slaCompletedAt) continue
    const k = getManilaDateString(row.slaCompletedAt)
    if (weekCounts.has(k)) weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1)
  }
  const weekSeries = [...weekCounts.entries()] // [[date, count], ...] oldest → newest

  // Top 5 carriers
  const topCarriers = topCarriersRaw
    .map(r => ({ name: r.carrierName ?? 'Unassigned', count: r._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Top 3 pickers + packers
  const tally = <T extends { pickerId?: string; packerId?: string }>(
    rows: T[], idKey: 'pickerId' | 'packerId', nameGetter: (r: T) => string,
  ) => {
    const m = new Map<string, { name: string; count: number }>()
    for (const r of rows) {
      const id = r[idKey] as string
      const cur = m.get(id) ?? { name: nameGetter(r), count: 0 }
      cur.count++
      m.set(id, cur)
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 3)
  }
  const topPickers = tally(pickerCompletions, 'pickerId', (r: any) => r.picker?.username ?? 'Unknown')
  const topPackers = tally(packerCompletions, 'packerId', (r: any) => r.packer?.username ?? 'Unknown')

  const criticalCount = d3 + d4Active

  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
  const timeStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
  const from = process.env.SMTP_FROM || 'DOM Warehouse System <noreply@example.com>'

  // ── HTML builders ──────────────────────────────────────────────────────────

  const deltaBadge = (() => {
    if (dispatchDelta === 0) {
      return `<span style="display:inline-block;background:#f1f5f9;color:#64748b;font-weight:700;font-size:12px;padding:4px 10px;border-radius:999px;">— no change vs yesterday</span>`
    }
    const up = dispatchDelta > 0
    const bg = up ? '#ecfdf5' : '#fef2f2'
    const fg = up ? '#059669' : '#dc2626'
    const arrow = up ? '▲' : '▼'
    const sign = up ? '+' : ''
    return `<span style="display:inline-block;background:${bg};color:${fg};font-weight:700;font-size:12px;padding:4px 10px;border-radius:999px;">${arrow} ${sign}${dispatchDelta} (${sign}${deltaPct}%) vs yesterday</span>`
  })()

  // Sparkline (7 days) — inline SVG
  const sparkline = (() => {
    const w = 520, h = 56, pad = 4
    const max = Math.max(1, ...weekSeries.map(([, v]) => v))
    const step = weekSeries.length > 1 ? (w - pad * 2) / (weekSeries.length - 1) : 0
    const pts = weekSeries.map(([, v], i) => {
      const x = pad + i * step
      const y = h - pad - (v / max) * (h - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    const polyPts = pts.join(' ')
    const areaPts = `${pad},${h - pad} ${polyPts} ${w - pad},${h - pad}`
    const dots = weekSeries.map(([, v], i) => {
      const x = pad + i * step
      const y = h - pad - (v / max) * (h - pad * 2)
      const isLast = i === weekSeries.length - 1
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isLast ? 4 : 2.5}" fill="${isLast ? '#0ea5e9' : '#7dd3fc'}" stroke="#ffffff" stroke-width="${isLast ? 2 : 1}"/>`
    }).join('')
    const labels = weekSeries.map(([date], i) => {
      const x = pad + i * step
      const d = new Date(`${date}T12:00:00+08:00`)
      const label = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Asia/Manila' })
      return `<text x="${x.toFixed(1)}" y="${h + 14}" text-anchor="middle" font-size="10" fill="#94a3b8" font-family="Arial,sans-serif">${esc(label)}</text>`
    }).join('')
    return `
      <svg width="100%" height="${h + 20}" viewBox="0 0 ${w} ${h + 20}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="${areaPts}" fill="rgba(14,165,233,0.12)"/>
        <polyline points="${polyPts}" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        ${labels}
      </svg>`
  })()

  // Stacked SLA bar
  const slaBar = (() => {
    const total = d0 + d1 + d2 + d3 + d4Active
    if (total === 0) {
      return `<div style="background:#f1f5f9;border-radius:999px;height:22px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#64748b;font-weight:600;">No active orders</div>`
    }
    const segs = [
      { count: d0, color: '#10b981' },
      { count: d1, color: '#f59e0b' },
      { count: d2, color: '#f97316' },
      { count: d3, color: '#ef4444' },
      { count: d4Active, color: '#b91c1c' },
    ]
    const cells = segs.map(s => {
      if (s.count === 0) return ''
      const pct = (s.count / total) * 100
      return `<td style="background:${s.color};height:22px;width:${pct.toFixed(2)}%;"></td>`
    }).join('')
    return `<table cellpadding="0" cellspacing="0" style="width:100%;border-radius:999px;overflow:hidden;background:#f1f5f9;"><tr>${cells}</tr></table>`
  })()

  const slaRows = [
    { label: 'D0 — On Time', count: d0, color: '#059669', bg: '#ecfdf5', dot: '#10b981' },
    { label: 'D1 — 4 to 8 hours', count: d1, color: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
    { label: 'D2 — 8 to 12 hours', count: d2, color: '#c2410c', bg: '#fff7ed', dot: '#f97316' },
    { label: 'D3 — 12 to 16 hours', count: d3, color: '#dc2626', bg: '#fef2f2', dot: '#ef4444' },
    { label: 'D4 — Over 16 hours', count: d4Active, color: '#991b1b', bg: '#fef2f2', dot: '#b91c1c' },
  ].map(r => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.dot};margin-right:8px;vertical-align:middle;"></span>
        <span style="font-size:13px;color:#374151;font-weight:500;">${r.label}</span>
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;text-align:right;">
        <span style="display:inline-block;background:${r.bg};color:${r.color};font-weight:700;font-size:13px;padding:3px 12px;border-radius:20px;">${r.count}</span>
      </td>
    </tr>`).join('')

  // Top carriers list
  const carriersHtml = topCarriers.length === 0
    ? `<div style="padding:18px;text-align:center;font-size:12px;color:#94a3b8;background:#f8fafc;border-radius:10px;">No carriers dispatched today</div>`
    : topCarriers.map((c, i) => {
        const maxCount = topCarriers[0].count
        const pct = maxCount > 0 ? (c.count / maxCount) * 100 : 0
        return `
          <tr>
            <td style="padding:10px 0;vertical-align:middle;width:24px;">
              <span style="display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;background:${i === 0 ? '#fef3c7' : '#f1f5f9'};color:${i === 0 ? '#b45309' : '#64748b'};border-radius:6px;font-size:11px;font-weight:700;">${i + 1}</span>
            </td>
            <td style="padding:10px 12px;vertical-align:middle;">
              <div style="font-size:13px;font-weight:600;color:#0f172a;margin-bottom:4px;">${esc(c.name.replace(/_/g, ' '))}</div>
              <div style="height:4px;background:#f1f5f9;border-radius:99px;overflow:hidden;">
                <div style="height:100%;width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#3b82f6,#0ea5e9);border-radius:99px;"></div>
              </div>
            </td>
            <td style="padding:10px 0;vertical-align:middle;text-align:right;width:48px;">
              <span style="font-size:14px;font-weight:700;color:#0f172a;">${c.count}</span>
            </td>
          </tr>`
      }).join('')

  const buildPerformerList = (list: { name: string; count: number }[], emptyMsg: string) => {
    if (list.length === 0) {
      return `<div style="padding:14px;text-align:center;font-size:12px;color:#94a3b8;background:#f8fafc;border-radius:10px;">${emptyMsg}</div>`
    }
    const medals = ['🥇', '🥈', '🥉']
    return list.map((p, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:${i === 0 ? '#fffbeb' : '#f8fafc'};border:1px solid ${i === 0 ? '#fde68a' : '#e2e8f0'};border-radius:10px;margin-bottom:6px;">
        <span style="font-size:13px;color:#0f172a;font-weight:600;">
          <span style="margin-right:6px;">${medals[i] ?? '•'}</span>${esc(p.name)}
        </span>
        <span style="font-size:13px;font-weight:700;color:${i === 0 ? '#b45309' : '#475569'};">${p.count}</span>
      </div>`).join('')
  }
  const pickersHtml = buildPerformerList(topPickers, 'No pickers completed orders today')
  const packersHtml = buildPerformerList(topPackers, 'No packers completed orders today')

  const criticalAlertHtml = criticalCount > 0 ? `
    <tr>
      <td style="background:#ffffff;padding:0 36px;">
        <div style="background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%);border:1px solid #fecaca;border-radius:12px;padding:16px 20px;display:flex;align-items:center;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:40px;vertical-align:middle;">
              <div style="width:36px;height:36px;background:#dc2626;border-radius:10px;display:flex;align-items:center;justify-content:center;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
            </td>
            <td style="padding-left:14px;vertical-align:middle;">
              <div style="font-size:13px;font-weight:700;color:#991b1b;">${criticalCount} order${criticalCount !== 1 ? 's' : ''} require immediate attention</div>
              <div style="font-size:12px;color:#b91c1c;margin-top:2px;">${d3} in D3 (12–16h) · ${d4Active} in D4 (over 16h)</div>
            </td>
          </tr></table>
        </div>
      </td>
    </tr>
    <tr><td style="background:#ffffff;height:20px;"></td></tr>` : ''

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
              <div style="font-size:12px;color:#64748b;margin-top:3px;">Generated at ${timeStr} · ${esc(tenantSlug)}</div>
            </div>
          </td>
        </tr>

        <!-- ── HERO KPI ── -->
        <tr>
          <td style="background:#ffffff;padding:28px 36px 20px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Today at a glance</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:52px;font-weight:900;color:#0f172a;line-height:1;letter-spacing:-1.5px;">${dispatchedToday}</div>
                  <div style="font-size:13px;color:#64748b;margin-top:6px;font-weight:600;">orders dispatched today</div>
                  <div style="margin-top:10px;">${deltaBadge}</div>
                </td>
                <td style="vertical-align:middle;text-align:right;width:140px;">
                  <div style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 16px;min-width:120px;">
                    <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Dispatch Rate</div>
                    <div style="font-size:26px;font-weight:800;color:#0f172a;line-height:1;margin-top:6px;">${dispatchRate}%</div>
                    <div style="font-size:10px;color:#94a3b8;margin-top:4px;">of today's workload</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- 7-day sparkline -->
            <div style="margin-top:22px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
                <tr>
                  <td><span style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Dispatched · last 7 days</span></td>
                  <td style="text-align:right;"><span style="font-size:11px;color:#64748b;font-weight:600;">Total ${weekSeries.reduce((s, [, v]) => s + v, 0)}</span></td>
                </tr>
              </table>
              ${sparkline}
            </div>
          </td>
        </tr>

        ${criticalAlertHtml}

        <!-- ── SUMMARY CARDS ── -->
        <tr>
          <td style="background:#ffffff;padding:4px 36px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="31%" style="padding-right:8px;">
                  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 12px;text-align:center;">
                    <div style="font-size:28px;font-weight:800;color:#0f172a;line-height:1;">${inboundTotal}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:6px;font-weight:500;">Total Scanned</div>
                  </div>
                </td>
                <td width="4%"></td>
                <td width="31%" style="padding:0 4px;">
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 12px;text-align:center;">
                    <div style="font-size:28px;font-weight:800;color:#059669;line-height:1;">${outboundTotal}</div>
                    <div style="font-size:11px;color:#047857;margin-top:6px;font-weight:500;">Total Dispatched</div>
                  </div>
                </td>
                <td width="4%"></td>
                <td width="31%" style="padding-left:8px;">
                  <div style="background:${remaining > 0 ? '#fffbeb' : '#f0fdf4'};border:1px solid ${remaining > 0 ? '#fde68a' : '#bbf7d0'};border-radius:12px;padding:16px 12px;text-align:center;">
                    <div style="font-size:28px;font-weight:800;color:${remaining > 0 ? '#b45309' : '#059669'};line-height:1;">${remaining}</div>
                    <div style="font-size:11px;color:${remaining > 0 ? '#92400e' : '#047857'};margin-top:6px;font-weight:500;">Active Pipeline</div>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── SLA VISUAL BAR + TABLE ── -->
        <tr>
          <td style="background:#ffffff;padding:8px 36px 20px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">SLA Distribution — Active Orders</div>
            ${slaBar}
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border:1px solid #f1f5f9;border-radius:12px;overflow:hidden;">
              ${slaRows}
            </table>
          </td>
        </tr>

        <!-- ── TOP CARRIERS TODAY ── -->
        <tr>
          <td style="background:#ffffff;padding:8px 36px 20px;">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">Top carriers dispatched today</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${carriersHtml}
            </table>
          </td>
        </tr>

        <!-- ── TOP PERFORMERS ── -->
        <tr>
          <td style="background:#ffffff;padding:8px 36px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="48%" style="vertical-align:top;padding-right:8px;">
                  <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Top Pickers</div>
                  ${pickersHtml}
                </td>
                <td width="4%"></td>
                <td width="48%" style="vertical-align:top;padding-left:8px;">
                  <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Top Packers</div>
                  ${packersHtml}
                </td>
              </tr>
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

  const subjectDelta = dispatchDelta === 0 ? '' : ` (${dispatchDelta > 0 ? '+' : ''}${dispatchDelta})`
  const subject = `DOM Nightly Report — ${dateStr} · ${dispatchedToday} dispatched${subjectDelta}, ${remaining} in pipeline`

  for (const admin of admins) {
    if (!admin.email) continue
    try {
      await transporter.sendMail({
        from,
        to: admin.email,
        subject,
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
