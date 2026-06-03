import PDFDocument from 'pdfkit'

const PESO = 'PHP '
function money(n: number): string {
  return PESO + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export interface InvoicePdfData {
  invoiceNo: string
  issuedDate: Date
  companyName: string
  companyLogo: { buffer: Buffer } | null
  companyAddress: string | null
  companyEmail: string | null
  companyContact: string | null
  customerName: string
  customerAddress: string | null
  customerEmail: string | null
  customerNumber: string | null
  contactPerson: string | null
  product: string
  quantity: number
  price: number
  total: number
  paymentMethod: string
  salesStatus: string
  dueDate: Date | null
}

export function generateInvoicePdfBuffer(data: InvoicePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 })
      const chunks: Buffer[] = []
      doc.on('data', (c) => chunks.push(c as Buffer))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      const navy = '#1e293b'
      const gray = '#64748b'
      const primary = '#2563eb'

      // Header
      const headerY = 50
      if (data.companyLogo) {
        try { doc.image(data.companyLogo.buffer, 50, headerY, { fit: [120, 60] }) } catch { /* skip bad logo */ }
      }
      doc.fontSize(18).fillColor(navy).font('Helvetica-Bold')
        .text(data.companyName, 300, headerY, { width: 245, align: 'right' })
      doc.fontSize(9).fillColor(gray).font('Helvetica')
      const compLines = [data.companyAddress, data.companyEmail, data.companyContact].filter(Boolean) as string[]
      doc.text(compLines.join('\n'), 300, headerY + 24, { width: 245, align: 'right' })

      // Title
      doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e2e8f0').stroke()
      doc.fontSize(26).fillColor(primary).font('Helvetica-Bold').text('INVOICE', 50, 145)
      doc.fontSize(10).fillColor(gray).font('Helvetica')
      doc.text(`Invoice No:  ${data.invoiceNo}`, 50, 180)
      doc.text(`Issued:  ${data.issuedDate.toLocaleDateString('en-US')}`, 50, 195)

      // Bill To
      doc.fontSize(11).fillColor(navy).font('Helvetica-Bold').text('Bill To', 320, 180)
      doc.fontSize(10).fillColor(gray).font('Helvetica')
      const billLines = [
        data.customerName,
        data.contactPerson ? `Attn: ${data.contactPerson}` : null,
        data.customerAddress,
        data.customerEmail,
        data.customerNumber,
      ].filter(Boolean) as string[]
      doc.text(billLines.join('\n'), 320, 198, { width: 225 })

      // Table header
      const tableTop = 280
      doc.rect(50, tableTop, 495, 24).fill('#f1f5f9')
      doc.fillColor(navy).fontSize(10).font('Helvetica-Bold')
      doc.text('Description', 60, tableTop + 7)
      doc.text('Qty', 330, tableTop + 7, { width: 40, align: 'right' })
      doc.text('Unit Price', 380, tableTop + 7, { width: 75, align: 'right' })
      doc.text('Amount', 465, tableTop + 7, { width: 70, align: 'right' })

      // Row
      const rowY = tableTop + 32
      doc.fillColor(navy).font('Helvetica').fontSize(10)
      doc.text(data.product, 60, rowY, { width: 260 })
      doc.text(String(data.quantity), 330, rowY, { width: 40, align: 'right' })
      doc.text(money(data.price), 380, rowY, { width: 75, align: 'right' })
      doc.text(money(data.total), 465, rowY, { width: 70, align: 'right' })
      doc.moveTo(50, rowY + 24).lineTo(545, rowY + 24).strokeColor('#e2e8f0').stroke()

      // Totals
      const totalsY = rowY + 40
      doc.fontSize(12).font('Helvetica-Bold').fillColor(navy)
      doc.text('Total', 380, totalsY, { width: 75, align: 'right' })
      doc.text(money(data.total), 465, totalsY, { width: 70, align: 'right' })

      // Payment info
      const payY = totalsY + 50
      doc.fontSize(10).font('Helvetica-Bold').fillColor(navy).text('Payment Details', 50, payY)
      doc.font('Helvetica').fillColor(gray).fontSize(10)
      doc.text(`Payment Method:  ${data.paymentMethod}`, 50, payY + 18)
      doc.text(`Status:  ${data.salesStatus}`, 50, payY + 34)
      if (data.salesStatus === 'PENDING' && data.dueDate) {
        doc.text(`Due Date:  ${data.dueDate.toLocaleDateString('en-US')}`, 50, payY + 50)
      }

      doc.fontSize(8).fillColor(gray).text('Thank you for your business.', 50, 770, { align: 'center', width: 495 })
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
