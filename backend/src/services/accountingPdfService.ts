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
  items: { itemName: string; description: string | null; quantity: number; unitCost: number; discountPct: number; taxPct: number; lineTotal: number }[]
}
interface CompanyLike {
  name: string
  logoData: string | null
  address: string | null
  email: string | null
  contactNumber: string | null
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
      doc.fontSize(18).fillColor(navy).font('Helvetica-Bold').text(company.name, 300, headerY, { width: 245, align: 'right' })
      doc.fontSize(9).fillColor(gray).font('Helvetica')
      doc.text([company.address, company.email, company.contactNumber].filter(Boolean).join('\n'), 300, headerY + 24, { width: 245, align: 'right' })

      doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e2e8f0').stroke()
      doc.fontSize(26).fillColor(primary).font('Helvetica-Bold').text('INVOICE', 50, 145)
      doc.fontSize(10).fillColor(gray).font('Helvetica')
      doc.text(`Invoice No:  ${sale.invoiceNo}`, 50, 180)
      doc.text(`Date Issued:  ${new Date(sale.dateIssued).toLocaleDateString('en-US')}`, 50, 195)
      if (sale.dueDate) doc.text(`Due:  ${new Date(sale.dueDate).toLocaleDateString('en-US')}`, 50, 210)
      if (sale.orderReference) doc.text(`Ref:  ${sale.orderReference}`, 50, 225)

      doc.fontSize(11).fillColor(navy).font('Helvetica-Bold').text('Bill To', 320, 180)
      doc.fontSize(10).fillColor(gray).font('Helvetica')
      doc.text([
        sale.customerName,
        sale.contactPerson ? `Attn: ${sale.contactPerson}` : null,
        sale.customerAddress, sale.customerEmail, sale.customerNumber,
      ].filter(Boolean).join('\n'), 320, 198, { width: 225 })

      // Items table
      let y = 270
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
      for (const it of sale.items) {
        doc.text(it.itemName + (it.description ? ` — ${it.description}` : ''), 56, y, { width: 240 })
        doc.text(String(it.quantity), 300, y, { width: 35, align: 'right' })
        doc.text(it.unitCost.toFixed(2), 340, y, { width: 60, align: 'right' })
        doc.text(String(it.discountPct), 402, y, { width: 38, align: 'right' })
        doc.text(String(it.taxPct), 442, y, { width: 33, align: 'right' })
        doc.text(it.lineTotal.toFixed(2), 480, y, { width: 60, align: 'right' })
        y += 20
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
      lbl('Subtotal', money(sale.subtotal))
      lbl('Discount', money(sale.discountTotal))
      lbl('Tax', money(sale.taxTotal))
      lbl('Total', money(sale.total), true)

      y += 14
      doc.fontSize(10).font('Helvetica-Bold').fillColor(navy).text('Payment', 50, y)
      doc.font('Helvetica').fillColor(gray)
      doc.text(`Status:  ${sale.status}${sale.paymentMethod ? `  ·  ${sale.paymentMethod}` : ''}`, 50, y + 16)

      doc.fontSize(8).fillColor(gray).text('Thank you for your business.', 50, 790, { align: 'center', width: 495 })
      doc.end()
    } catch (err) { reject(err) }
  })
}
