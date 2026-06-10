import PDFDocument from 'pdfkit'
import {
  EMP_DEPARTMENT_LABEL,
  EMP_DEPARTMENT_ORDER,
  type EmpDepartment,
  type EmpReportResponse,
  type EmpReportRow,
} from '@dom/shared'

const navy = '#1e293b'
const gray = '#64748b'
const lightBg = '#f1f5f9'
const border = '#e2e8f0'

// column layout (x offsets within the content area), landscape A4
const COLS = [
  { key: 'id', label: 'ID', w: 38, align: 'left' as const },
  { key: 'name', label: 'Name', w: 150, align: 'left' as const },
  { key: 'present', label: 'Present', w: 50, align: 'right' as const },
  { key: 'halfDay', label: 'Half Day', w: 52, align: 'right' as const },
  { key: 'absent', label: 'Absent', w: 48, align: 'right' as const },
  { key: 'dayOff', label: 'Day Off', w: 50, align: 'right' as const },
  { key: 'vacation', label: 'Vacation', w: 55, align: 'right' as const },
  { key: 'sick', label: 'Sick', w: 42, align: 'right' as const },
  { key: 'maternity', label: 'Maternity', w: 60, align: 'right' as const },
  { key: 'otHours', label: 'OT (h)', w: 46, align: 'right' as const },
  { key: 'workedDays', label: 'Worked Days', w: 74, align: 'right' as const },
  { key: 'totalHours', label: 'Total Hrs', w: 58, align: 'right' as const },
]

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function generateScheduleReportPdf(report: EmpReportResponse): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c as Buffer))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const left = doc.page.margins.left
      const contentW = doc.page.width - doc.page.margins.left - doc.page.margins.right

      // ── Header ──
      doc.fontSize(18).fillColor(navy).font('Helvetica-Bold').text('Employee Schedule Report', left, 40)
      doc.fontSize(11).fillColor(gray).font('Helvetica')
        .text(`${report.period === 'month' ? 'Monthly' : 'Weekly'} · ${report.label}`, left, doc.y + 2)
      doc.moveDown(0.5)

      // ── Summary line ──
      doc.fontSize(9).fillColor(navy).font('Helvetica-Bold')
        .text(
          `Employees: ${report.totals.employees}    Worked Days: ${fmtNum(report.totals.workedDays)}    Total Hours: ${fmtNum(report.totals.totalHours)}    OT Hours: ${fmtNum(report.totals.otHours)}`,
          left, doc.y + 4,
        )
      doc.moveDown(0.6)

      // x positions
      const xs: number[] = []
      let acc = left
      for (const c of COLS) { xs.push(acc); acc += c.w }

      const rowH = 18

      function drawRow(cells: string[], y: number, opts: { head?: boolean; band?: string; bold?: boolean } = {}) {
        if (opts.band) {
          doc.rect(left, y - 3, contentW, rowH).fill(opts.band)
        }
        doc.fontSize(opts.head ? 8 : 8.5).font(opts.head || opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fillColor(opts.head ? gray : navy)
        COLS.forEach((c, i) => {
          doc.text(cells[i] ?? '', xs[i] + 2, y, { width: c.w - 4, align: c.align, lineBreak: false })
        })
      }

      let y = doc.y + 4

      function ensureSpace(extra: number) {
        if (y + extra > doc.page.height - doc.page.margins.bottom) {
          doc.addPage()
          y = doc.page.margins.top
        }
      }

      // ── header row ──
      drawRow(COLS.map((c) => c.label), y, { head: true, band: lightBg })
      y += rowH
      doc.moveTo(left, y - 3).lineTo(left + contentW, y - 3).strokeColor(border).lineWidth(1).stroke()

      const rowFor = (r: EmpReportRow): string[] => [
        `#${r.employee.empNo}`,
        `${r.employee.firstName} ${r.employee.lastName}`,
        fmtNum(r.present), fmtNum(r.halfDay), fmtNum(r.absent), fmtNum(r.dayOff),
        fmtNum(r.vacation), fmtNum(r.sick), fmtNum(r.maternity),
        fmtNum(r.otHours), fmtNum(r.workedDays), fmtNum(r.totalHours),
      ]

      for (const dept of EMP_DEPARTMENT_ORDER) {
        const deptRows = report.rows.filter((r) => r.employee.department === (dept as EmpDepartment))
        if (deptRows.length === 0) continue

        ensureSpace(rowH * 2)
        // department band
        doc.rect(left, y - 3, contentW, rowH).fill('#e0e7ff')
        doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#3730a3')
          .text(EMP_DEPARTMENT_LABEL[dept as EmpDepartment].toUpperCase(), xs[0] + 2, y, { width: contentW - 4, lineBreak: false })
        y += rowH

        let dWorked = 0, dHours = 0, dOt = 0
        deptRows.forEach((r, idx) => {
          ensureSpace(rowH)
          drawRow(rowFor(r), y, { band: idx % 2 === 1 ? '#f8fafc' : undefined })
          dWorked += r.workedDays; dHours += r.totalHours; dOt += r.otHours
          y += rowH
        })

        // department subtotal
        ensureSpace(rowH)
        const sub: string[] = new Array(COLS.length).fill('')
        sub[1] = 'Subtotal'
        sub[9] = fmtNum(dOt)
        sub[10] = fmtNum(dWorked)
        sub[11] = fmtNum(dHours)
        drawRow(sub, y, { bold: true, band: '#eef2ff' })
        y += rowH + 4
      }

      // ── grand total ──
      ensureSpace(rowH)
      doc.moveTo(left, y - 3).lineTo(left + contentW, y - 3).strokeColor(navy).lineWidth(1.2).stroke()
      const gt: string[] = new Array(COLS.length).fill('')
      gt[1] = 'GRAND TOTAL'
      gt[9] = fmtNum(report.totals.otHours)
      gt[10] = fmtNum(report.totals.workedDays)
      gt[11] = fmtNum(report.totals.totalHours)
      drawRow(gt, y + 2, { bold: true })

      // footer
      doc.fontSize(7).fillColor(gray).font('Helvetica')
        .text('Worked Days = Present + 0.5 × Half Day   ·   Total Hours = 8 × Present + 4 × Half Day + OT',
          left, doc.page.height - doc.page.margins.bottom - 10, { width: contentW, align: 'center' })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
