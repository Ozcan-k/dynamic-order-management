import { PERF_STATUS_LABEL, type PerfDay, type PerfStatus, type PerfTeamReport } from '@dom/shared'
import { buildXlsx, colName, downloadBlob, type XCell, type XStyle } from '../../../lib/xlsxWriter'
import { ATTENDANCE_SHORT, ROLE_LABEL, STATUS_OUTCOME, dayCount, shortDate, weekdayOf } from './perfUi'

// Excel export of the Target Performance tab — same layout as the original
// "Picker Performance Report" workbook (Summary + Daily Performance sheets).

const NAVY = '#17365D'
const BORDER = '#D9E1EA'
const FILL: Record<string, { bg: string; ink: string }> = {
  MET: { bg: '#C6EFCE', ink: '#006100' },
  NEAR: { bg: '#FFEB9C', ink: '#9C5700' },
  BELOW: { bg: '#FFC7CE', ink: '#9C0006' },
  OFF: { bg: '#F2F2F2', ink: '#A6A6A6' },
  IN_PROGRESS: { bg: '#DDEBF7', ink: '#1F4E78' },
}

const title: XStyle = { bold: true, size: 16, color: '#FFFFFF', bg: NAVY, valign: 'center' }
const subtitle: XStyle = { italic: true, size: 10, color: '#44546A', valign: 'center' }
const head: XStyle = { bold: true, size: 10, color: '#FFFFFF', bg: NAVY, align: 'center', valign: 'center', wrap: true, border: NAVY }
const section: XStyle = { bold: true, size: 11, color: NAVY, bg: '#D9EAF7' }
const cell = (extra: XStyle = {}): XStyle => ({ size: 10, border: BORDER, valign: 'center', ...extra })

const kpiLabel = (bg: string): XStyle => ({ bold: true, size: 9, color: '#44546A', bg, align: 'center', valign: 'center', border: BORDER })
const kpiValue = (bg: string, numFmt: string): XStyle => ({ bold: true, size: 16, color: NAVY, bg, align: 'center', valign: 'center', numFmt, border: BORDER })

function statusStyle(status: PerfStatus, extra: XStyle = {}): XStyle {
  const f = FILL[STATUS_OUTCOME[status]]
  return cell({ bold: true, bg: f.bg, color: f.ink, align: 'center', ...extra })
}

function dayCell(d: PerfDay): XCell {
  const f = FILL[d.outcome]
  if (d.outcome === 'OFF') {
    return { v: d.attendance && d.attendance !== 'PRESENT' ? ATTENDANCE_SHORT[d.attendance] : 0, s: cell({ bg: f.bg, color: f.ink, align: 'center', size: 9 }) }
  }
  return { v: d.output, s: cell({ bg: f.bg, color: f.ink, align: 'center', bold: d.outcome === 'MET', numFmt: '#,##0' }) }
}

export function exportTargetXlsx(report: PerfTeamReport): void {
  const role = ROLE_LABEL[report.role]
  const roleUpper = role.one.toUpperCase()
  const days = dayCount(report.from, report.to)
  const s = report.summary

  // ── Sheet 1: Summary ──
  const sumCols = ['Rank', role.one, 'Username', 'Total Output', 'Active Days', 'Target Output', 'Avg / Active Day', 'Achievement %', 'Days Met Target', 'Hit Rate', 'Best Day', 'Status']
  const lastCol = colName(sumCols.length - 1)
  const summary: (XCell | null)[][] = []
  summary.push([{ v: `${roleUpper} PERFORMANCE REPORT`, s: title }, ...Array(sumCols.length - 1).fill({ v: null, s: title })])
  summary.push([{ v: `${days}-day overview | ${report.from} to ${report.to} | ${s.workers} ${role.many.toLowerCase()} | Daily target: ${report.dailyTarget}`, s: subtitle }])
  summary.push([])

  const kpis: { label: string; value: number; fmt: string; bg: string }[] = [
    { label: 'DAILY TARGET', value: report.dailyTarget, fmt: '#,##0', bg: '#D9EAF7' },
    { label: 'TOTAL OUTPUT', value: s.totalOutput, fmt: '#,##0', bg: '#EAF2F8' },
    { label: 'TEAM AVG / ACTIVE DAY', value: Math.round(s.teamAvgPerActiveDay * 10) / 10, fmt: '#,##0.0', bg: '#E2F0D9' },
    { label: 'TARGET DAYS MET', value: s.daysMetTarget, fmt: '#,##0', bg: '#FFF2CC' },
    { label: 'OVERALL HIT RATE', value: s.hitRate, fmt: '0.0%', bg: '#F2F2F2' },
    { label: 'ACHIEVEMENT', value: s.achievement, fmt: '0.0%', bg: '#EDE7F6' },
  ]
  const kpiLabels: (XCell | null)[] = []
  const kpiValues: (XCell | null)[] = []
  const merges: string[] = [`A1:${lastCol}1`, `A2:${lastCol}2`]
  kpis.forEach((k, i) => {
    const c = i * 2
    kpiLabels[c] = { v: k.label, s: kpiLabel(k.bg) }
    kpiLabels[c + 1] = { v: null, s: kpiLabel(k.bg) }
    kpiValues[c] = { v: k.value, s: kpiValue(k.bg, k.fmt) }
    kpiValues[c + 1] = { v: null, s: kpiValue(k.bg, k.fmt) }
    merges.push(`${colName(c)}4:${colName(c + 1)}4`, `${colName(c)}5:${colName(c + 1)}5`)
  })
  summary.push(kpiLabels)
  summary.push(kpiValues)
  summary.push([])
  summary.push([{ v: 'Performance ranking — based on average output per active day', s: section }, ...Array(sumCols.length - 1).fill({ v: null, s: section })])
  merges.push(`A7:${lastCol}7`)
  summary.push(sumCols.map((h) => ({ v: h, s: head })))

  for (const r of report.rows) {
    const isIdle = r.status === 'NO_ACTIVITY'
    const base = cell(isIdle ? { color: '#A6A6A6' } : {})
    summary.push([
      { v: r.rank ?? '—', s: { ...base, align: 'center', bold: true } },
      { v: r.displayName, s: { ...base, bold: true } },
      { v: r.username, s: { ...base, color: '#7F7F7F' } },
      { v: r.totalOutput, s: { ...base, numFmt: '#,##0' } },
      { v: r.activeDays, s: { ...base, numFmt: '0.0', align: 'center' } },
      { v: r.targetOutput, s: { ...base, numFmt: '#,##0' } },
      { v: Math.round(r.avgPerActiveDay * 100) / 100, s: { ...base, numFmt: '#,##0.0', bold: true } },
      { v: r.achievement, s: isIdle ? { ...base, numFmt: '0.0%' } : statusStyle(r.status, { numFmt: '0.0%' }) },
      { v: r.daysMetTarget, s: { ...base, align: 'center' } },
      { v: r.hitRate, s: { ...base, numFmt: '0.0%', align: 'center' } },
      { v: r.bestDay, s: { ...base, numFmt: '#,##0', align: 'center' } },
      { v: PERF_STATUS_LABEL[r.status], s: isIdle ? { ...base, align: 'center' } : statusStyle(r.status) },
    ])
  }
  summary.push([])
  const notesStart = summary.length
  const notes = [
    'REPORTING NOTES',
    `• Output = orders the ${role.one.toLowerCase()} completed that day (Manila time). Daily target: ${report.dailyTarget}.`,
    '• Active day: Present in Employee Schedule = full target, Half Day = half target; Day Off / leave / Absent days are excluded.',
    '• Without a schedule entry, any positive output counts as an active day; zero output is treated as a day off.',
    '• Status: Target Achieved ≥100%; Near Target 90%–99.9%; Below Target <90%. Today (if in range) is excluded as it is still in progress.',
    '• Review attendance records before using this report for disciplinary decisions.',
  ]
  notes.forEach((n, i) => {
    const st: XStyle = i === 0 ? section : { size: 10, color: '#44546A' }
    summary.push([{ v: n, s: st }, ...(i === 0 ? Array(sumCols.length - 1).fill({ v: null, s: section }) : [])])
    merges.push(`A${notesStart + i + 1}:${lastCol}${notesStart + i + 1}`)
  })

  // ── Sheet 2: Daily Performance ──
  const tailCols = ['Total Output', 'Active Days', 'Target Output', 'Avg / Active Day', 'Achievement %', 'Days Met Target', 'Hit Rate', 'Best Day', 'Status']
  const totalCols = 1 + report.dates.length + tailCols.length
  const dLast = colName(totalCols - 1)
  const daily: (XCell | null)[][] = []
  daily.push([{ v: `${roleUpper} DAILY PERFORMANCE — ${days}-DAY REPORT`, s: title }, ...Array(totalCols - 1).fill({ v: null, s: title })])
  daily.push([{ v: `Reporting period: ${report.from} to ${report.to}  |  Daily target: ${report.dailyTarget}  |  Green ≥ target · Yellow 90–99% · Red < 90% · Grey = off / leave (VL, SL, ML, AB, OFF)`, s: subtitle }])
  daily.push([])
  daily.push([
    { v: role.one, s: { ...head, align: 'left' } },
    ...report.dates.map((d) => ({ v: `${weekdayOf(d)}\n${shortDate(d)}`, s: head })),
    ...tailCols.map((h) => ({ v: h, s: head })),
  ])
  for (const r of report.rows) {
    const isIdle = r.status === 'NO_ACTIVITY'
    const base = cell(isIdle ? { color: '#A6A6A6' } : {})
    daily.push([
      { v: r.displayName, s: { ...base, bold: true } },
      ...r.days.map(dayCell),
      { v: r.totalOutput, s: { ...base, numFmt: '#,##0', bold: true } },
      { v: r.activeDays, s: { ...base, numFmt: '0.0', align: 'center' } },
      { v: r.targetOutput, s: { ...base, numFmt: '#,##0' } },
      { v: Math.round(r.avgPerActiveDay * 100) / 100, s: { ...base, numFmt: '#,##0.0', bold: true } },
      { v: r.achievement, s: isIdle ? { ...base, numFmt: '0.0%' } : statusStyle(r.status, { numFmt: '0.0%' }) },
      { v: r.daysMetTarget, s: { ...base, align: 'center' } },
      { v: r.hitRate, s: { ...base, numFmt: '0.0%', align: 'center' } },
      { v: r.bestDay, s: { ...base, numFmt: '#,##0', align: 'center' } },
      { v: PERF_STATUS_LABEL[r.status], s: isIdle ? { ...base, align: 'center' } : statusStyle(r.status) },
    ])
  }
  const totalStyle: XStyle = { bold: true, size: 10, bg: '#EAF2F8', border: BORDER, align: 'center', numFmt: '#,##0' }
  daily.push([
    { v: 'TEAM TOTAL', s: { ...totalStyle, align: 'left' } },
    ...report.daily.map((d) => ({ v: d.output, s: totalStyle })),
    { v: s.totalOutput, s: totalStyle },
    { v: s.activeDays, s: { ...totalStyle, numFmt: '0.0' } },
    { v: s.targetOutput, s: totalStyle },
    { v: Math.round(s.teamAvgPerActiveDay * 100) / 100, s: { ...totalStyle, numFmt: '#,##0.0' } },
    { v: s.achievement, s: { ...totalStyle, numFmt: '0.0%' } },
    { v: s.daysMetTarget, s: totalStyle },
    { v: s.hitRate, s: { ...totalStyle, numFmt: '0.0%' } },
    { v: null, s: totalStyle },
    { v: null, s: totalStyle },
  ])

  const blob = buildXlsx([
    {
      name: 'Summary',
      rows: summary,
      colWidths: [7, 22, 16, 12, 11, 13, 14, 14, 13, 10, 10, 16],
      rowHeights: { 0: 30, 1: 18, 3: 20, 4: 34, 7: 30 },
      merges,
      freeze: { rows: 8, cols: 0 },
      showGrid: false,
    },
    {
      name: 'Daily Performance',
      rows: daily,
      colWidths: [22, ...report.dates.map(() => 7.5), 12, 10, 12, 13, 13, 12, 9, 9, 15],
      rowHeights: { 0: 28, 3: 32 },
      merges: [`A1:${dLast}1`, `A2:${dLast}2`],
      freeze: { rows: 4, cols: 1 },
      showGrid: false,
    },
  ])
  downloadBlob(blob, `DGFSI_${role.one}_Performance_Report_${days}D_${report.to}.xlsx`)
}
