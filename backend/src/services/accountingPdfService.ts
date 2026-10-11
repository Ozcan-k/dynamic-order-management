import PDFDocument from 'pdfkit'

const PESO = 'PHP '
function money(n: number): string {
  return PESO + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface SaleLike {
  invoiceNo: string
  dateIssued: string
  dueDate: string | null
  customerName: string
  customerAddress: string | null
  customerEmail: string | null
  customerNumber: string | null
  contactPerson: string | null
  orderReference: string | null
  status: string
  paymentMethod: string | null
  subtotal: number
  discountTotal: number
  taxTotal: number
  total: number
  paidTotal?: number
  payments?: { amount: number; paidOn: string | Date; method: string | null; referenceNumber: string | null; voidedAt: string | Date | null }[]
  items: { itemName: string; description: string | null; quantity: number; unitCost: number; discountPct: number; taxPct: number; lineTotal: number }[]
}

const METHOD_LABEL: Record<string, string> = { GCASH: 'GCash', CASH: 'Cash', BANK_TRANSFER: 'Bank Transfer', CHECK: 'Check', CREDIT_CARD: 'Credit Card' }
const STAMP: Record<string, { text: string; color: string }> = {
  PAID: { text: 'PAID', color: '#15803d' },
  PARTIAL: { text: 'PARTIALLY PAID', color: '#b45309' },
  UNPAID: { text: 'UNPAID', color: '#475569' },
}
interface CompanyLike {
  name: string
  logoData: string | null
  address: string | null
  email: string | null
  contactNumber: string | null
}

interface StatementLike {
  customer: { name: string; address: string | null; email: string | null; contactPerson: string | null; contactNumber: string | null }
  from: string | null
  to: string | null
  asOf: string
  opening: number
  rows: { date: string; details: string; invoiced: number; paid: number; balance: number }[]
  invoicedInPeriod: number
  paidInPeriod: number
  closing: number
  owedNow: number
  aging: { bucket: string; amount: number }[]
}

const AGING_PDF_LABEL: Record<string, string> = { notDue: 'Not due', d1_30: '1–30 days', d31_60: '31–60 days', d60: 'Over 60' }
const fmtDay = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** v2.100.0 — customer statement (account history + running balance) on the invoice letterhead. */
export function generateStatementPdfBuffer(st: StatementLike, company: CompanyLike): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c as Buffer))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      const navy = '#1e293b', gray = '#64748b', ink = '#0f172a'
      const BOTTOM = 760

      // Letterhead (same as the invoice)
      const headerY = 50
      if (company.logoData) {
        try { doc.image(Buffer.from(company.logoData, 'base64'), 50, headerY, { fit: [120, 60] }) } catch { /* skip */ }
      }
      doc.fontSize(18).fillColor(navy).font('Helvetica-Bold').text(company.name, 300, headerY, { width: 245, align: 'right' })
      const companyLines = [company.address, company.email, company.contactNumber].filter(Boolean).join('\n')
      if (companyLines) doc.fontSize(9).fillColor(gray).font('Helvetica').text(companyLines, 300, doc.y + 4, { width: 245, align: 'right' })
      const dividerY = Math.max(130, doc.y + 12)
      doc.moveTo(50, dividerY).lineTo(545, dividerY).strokeColor('#0f172a').lineWidth(1.5).stroke().lineWidth(1)

      doc.fontSize(22).fillColor(ink).font('Helvetica-Bold').text('STATEMENT', 50, dividerY + 14)
      const period = st.from || st.to ? `${st.from ? fmtDay(st.from) : 'Start'} – ${st.to ? fmtDay(st.to) : fmtDay(st.asOf)}` : `All activity to ${fmtDay(st.asOf)}`
      doc.fontSize(10).fillColor(gray).font('Helvetica').text(period, 50, dividerY + 42)

      const metaY = dividerY + 66
      doc.fontSize(9).fillColor(gray).text('CUSTOMER', 50, metaY)
      doc.fontSize(11).fillColor(ink).font('Helvetica-Bold').text(st.customer.name, 50, metaY + 12, { width: 260 })
      doc.fontSize(9.5).fillColor(gray).font('Helvetica')
        .text([st.customer.contactPerson, st.customer.contactNumber, st.customer.email, st.customer.address].filter(Boolean).join('\n'), 50, doc.y + 2, { width: 260 })
      const leftEnd = doc.y
      doc.fontSize(9).fillColor(gray).text('AMOUNT DUE', 345, metaY, { width: 200, align: 'right' })
      doc.fontSize(20).fillColor(ink).font('Helvetica-Bold').text(money(st.closing), 345, metaY + 12, { width: 200, align: 'right' })
      doc.fontSize(9).fillColor(gray).font('Helvetica').text(`as of ${fmtDay(st.to ?? st.asOf)}`, 345, metaY + 38, { width: 200, align: 'right' })

      let y = Math.max(leftEnd, metaY + 54) + 16
      const COLS = { date: 50, details: 112, inv: 330, paid: 405, bal: 475 }
      const header = () => {
        doc.fontSize(8.5).fillColor(gray).font('Helvetica-Bold')
        doc.text('DATE', COLS.date, y); doc.text('DETAILS', COLS.details, y)
        doc.text('INVOICED', COLS.inv, y, { width: 70, align: 'right' }); doc.text('PAID', COLS.paid, y, { width: 65, align: 'right' }); doc.text('BALANCE', COLS.bal, y, { width: 70, align: 'right' })
        y += 13
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#cbd5e1').stroke()
        y += 6
        doc.font('Helvetica').fontSize(9).fillColor(ink)
      }
      header()
      const row = (date: string, details: string, inv: string, paid: string, bal: string) => {
        const h = Math.max(16, doc.heightOfString(details, { width: 210 }) + 6)
        if (y + h > BOTTOM) { doc.addPage(); y = 50; header() }
        doc.text(date, COLS.date, y, { width: 58 }); doc.text(details, COLS.details, y, { width: 210 })
        doc.text(inv, COLS.inv, y, { width: 70, align: 'right' }); doc.text(paid, COLS.paid, y, { width: 65, align: 'right' }); doc.text(bal, COLS.bal, y, { width: 70, align: 'right' })
        y += h
      }
      const m = (n: number) => (n ? money(n).replace('PHP ', '') : '')
      // Drop the year from the date column only when every row is in the same year.
      const years = new Set([...(st.from ? [st.from] : []), ...st.rows.map((r) => r.date)].map((d) => d.slice(0, 4)))
      const day = (iso: string) => (years.size <= 1 ? fmtDay(iso).replace(/, \d{4}$/, '') : fmtDay(iso))
      if (st.from) row(day(st.from), 'Opening balance', '', '', money(st.opening).replace('PHP ', ''))
      if (!st.rows.length) row('', 'No activity in this period.', '', '', '')
      for (const r of st.rows) row(day(r.date), r.details, m(r.invoiced), m(r.paid), money(r.balance).replace('PHP ', ''))

      if (y + 120 > BOTTOM) { doc.addPage(); y = 50 }
      doc.moveTo(50, y + 2).lineTo(545, y + 2).strokeColor('#0f172a').lineWidth(1.5).stroke().lineWidth(1)
      y += 10
      doc.font('Helvetica').fontSize(9.5).fillColor(gray)
      doc.text(`Invoiced in period: ${money(st.invoicedInPeriod)}    ·    Paid in period: ${money(st.paidInPeriod)}`, 50, y, { width: 330 })
      doc.font('Helvetica-Bold').fontSize(11).fillColor(ink).text('Amount due', 330, y, { width: 140, align: 'right' }).text(money(st.closing), 475, y, { width: 70, align: 'right' })
      y += 30

      // Aging of what is owed today
      doc.fontSize(9).fillColor(gray).font('Helvetica-Bold').text(`OWED TODAY BY AGE · ${money(st.owedNow)}`, 50, y)
      y += 14
      const w = 495 / 4
      st.aging.forEach((a, i) => {
        const x = 50 + i * w
        doc.rect(x, y, w, 38).strokeColor('#cbd5e1').stroke()
        doc.fontSize(8).fillColor(gray).font('Helvetica').text(AGING_PDF_LABEL[a.bucket] ?? a.bucket, x + 8, y + 7, { width: w - 16 })
        doc.fontSize(10.5).fillColor(ink).font('Helvetica-Bold').text(money(a.amount), x + 8, y + 19, { width: w - 16 })
      })

      doc.page.margins.bottom = 0
      doc.fontSize(8).fillColor(gray).font('Helvetica').text('Please quote the invoice number with your payment. Thank you for your business.', 50, 790, { align: 'center', width: 495, lineBreak: false })
      doc.end()
    } catch (err) { reject(err) }
  })
}

export function generateInvoicePdfBuffer(sale: SaleLike, company: CompanyLike): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c as Buffer))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      const navy = '#1e293b', gray = '#64748b', primary = '#2563eb'

      // Header
      const headerY = 50
      if (company.logoData) {
        try { doc.image(Buffer.from(company.logoData, 'base64'), 50, headerY, { fit: [120, 60] }) } catch { /* skip */ }
      }
      // Company block (right). Place the address *below* the (possibly multi-line)
      // name using PDFKit's own cursor (doc.y) so a long name can't overlap it.
      const rightX = 300, rightW = 245
      doc.fontSize(18).fillColor(navy).font('Helvetica-Bold').text(company.name, rightX, headerY, { width: rightW, align: 'right' })
      const afterName = doc.y
      const companyLines = [company.address, company.email, company.contactNumber].filter(Boolean).join('\n')
      if (companyLines) {
        doc.fontSize(9).fillColor(gray).font('Helvetica').text(companyLines, rightX, afterName + 4, { width: rightW, align: 'right' })
      }

      const dividerY = Math.max(130, doc.y + 12)
      doc.moveTo(50, dividerY).lineTo(545, dividerY).strokeColor('#e2e8f0').stroke()
      doc.fontSize(26).fillColor(primary).font('Helvetica-Bold').text('INVOICE', 50, dividerY + 15)
      // Payment state stamp, right-aligned on the title line (v2.99.0).
      const stamp = STAMP[sale.status] ?? STAMP.UNPAID
      doc.fontSize(11).fillColor(stamp.color).font('Helvetica-Bold').text(stamp.text, 300, dividerY + 24, { width: 245, align: 'right' })
      const metaY = dividerY + 50
      doc.fontSize(10).fillColor(gray).font('Helvetica')
      doc.text(`Invoice No:  ${sale.invoiceNo}`, 50, metaY)
      doc.text(`Date Issued:  ${new Date(sale.dateIssued).toLocaleDateString('en-US')}`, 50, metaY + 15)
      if (sale.dueDate) doc.text(`Due:  ${new Date(sale.dueDate).toLocaleDateString('en-US')}`, 50, metaY + 30)
      if (sale.orderReference) doc.text(`Ref:  ${sale.orderReference}`, 50, metaY + 45)

      doc.fontSize(11).fillColor(navy).font('Helvetica-Bold').text('Bill To', 320, metaY)
      doc.fontSize(10).fillColor(gray).font('Helvetica')
      doc.text([
        sale.customerName,
        sale.contactPerson ? `Attn: ${sale.contactPerson}` : null,
        sale.customerAddress, sale.customerEmail, sale.customerNumber,
      ].filter(Boolean).join('\n'), 320, metaY + 18, { width: 225 })

      // Every block below asks for its height first: if it would cross into the footer
      // zone, it starts a fresh page. (Writing past the margin made PDFKit break pages on
      // its own mid-block, scattering one row per page.)
      const BOTTOM = 760
      let y = Math.max(metaY + 75, doc.y + 16)
      const ensure = (h: number) => { if (y + h > BOTTOM) { doc.addPage(); y = 50 } }

      const tableHeader = () => {
        doc.rect(50, y, 495, 22).fill('#f1f5f9')
        doc.fillColor(navy).fontSize(9).font('Helvetica-Bold')
        doc.text('Description', 56, y + 6)
        doc.text('Qty', 300, y + 6, { width: 35, align: 'right' })
        doc.text('Unit', 340, y + 6, { width: 60, align: 'right' })
        doc.text('Disc%', 402, y + 6, { width: 38, align: 'right' })
        doc.text('Tax%', 442, y + 6, { width: 33, align: 'right' })
        doc.text('Total', 480, y + 6, { width: 60, align: 'right' })
        y += 28
        doc.font('Helvetica').fillColor(navy).fontSize(9)
      }
      // Items table — start below whichever column (meta / bill-to) is taller
      tableHeader()
      for (const it of sale.items) {
        const name = it.itemName + (it.description ? ` — ${it.description}` : '')
        const rowH = Math.max(20, doc.heightOfString(name, { width: 240 }) + 8)
        if (y + rowH > BOTTOM) { doc.addPage(); y = 50; tableHeader() }
        doc.text(name, 56, y, { width: 240 })
        doc.text(String(it.quantity), 300, y, { width: 35, align: 'right' })
        doc.text(it.unitCost.toFixed(2), 340, y, { width: 60, align: 'right' })
        doc.text(String(it.discountPct), 402, y, { width: 38, align: 'right' })
        doc.text(String(it.taxPct), 442, y, { width: 33, align: 'right' })
        doc.text(it.lineTotal.toFixed(2), 480, y, { width: 60, align: 'right' })
        y += rowH
      }
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#e2e8f0').stroke()
      y += 12

      // Totals
      const lbl = (t: string, v: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(navy).fontSize(bold ? 12 : 10)
        doc.text(t, 360, y, { width: 95, align: 'right' })
        doc.text(v, 460, y, { width: 80, align: 'right' })
        y += bold ? 22 : 18
      }
      const paidForTotals = sale.paidTotal ?? 0
      ensure(paidForTotals > 0 ? 125 : 85)
      lbl('Subtotal', money(sale.subtotal))
      lbl('Discount', money(sale.discountTotal))
      lbl('Tax', money(sale.taxTotal))
      lbl('Total', money(sale.total), true)
      if (paidForTotals > 0) {
        lbl('Collected', money(paidForTotals))
        lbl('Balance due', money(Math.max(0, Math.round((sale.total - paidForTotals) * 100) / 100)), true)
      }

      // Payments received (non-voided, newest first as stored). Capped at 6 rows; the
      // rest is summarised in one line.
      const live = (sale.payments ?? []).filter((p) => !p.voidedAt)
      const MAX = 6
      y += 14
      ensure(30 + Math.min(live.length || 1, MAX) * 14 + (live.length > MAX ? 14 : 0))
      doc.fontSize(10).font('Helvetica-Bold').fillColor(navy).text('Payment', 50, y)
      y += 16
      doc.font('Helvetica').fillColor(gray).fontSize(9.5)
      if (!live.length) {
        doc.text(`Status:  ${(STAMP[sale.status] ?? STAMP.UNPAID).text}`, 50, y)
      } else {
        for (const p of live.slice(0, MAX)) {
          const parts = [new Date(p.paidOn).toLocaleDateString('en-US'), p.method ? METHOD_LABEL[p.method] ?? p.method : 'Method not recorded', p.referenceNumber ? `Ref ${p.referenceNumber}` : null]
          doc.text(parts.filter(Boolean).join('  ·  '), 50, y, { width: 330 })
          doc.text(money(p.amount), 380, y, { width: 160, align: 'right' })
          y += 14
        }
        if (live.length > MAX) doc.text(`+ ${live.length - MAX} earlier payment(s)`, 50, y)
      }

      // y=790 sits inside the 50pt bottom margin, so PDFKit used to break to a blank second
      // page just to print this line. Drop the bottom margin for the footer only.
      doc.page.margins.bottom = 0
      doc.fontSize(8).fillColor(gray).text('Thank you for your business.', 50, 790, { align: 'center', width: 495, lineBreak: false })
      doc.end()
    } catch (err) { reject(err) }
  })
}
