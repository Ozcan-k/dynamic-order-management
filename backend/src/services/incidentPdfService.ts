import PDFDocument from 'pdfkit'
import { Incident } from '@prisma/client'
import { IncidentType, INCIDENT_TYPE_LABELS, requiresParcelContext } from '@dom/shared'
import { readLogoBuffer, getBranding } from './brandingService'

/**
 * Formal HR/operations incident report. PDF is generated in-memory and streamed
 * on every download request — never persisted unsigned.
 *
 * Layout (single page when possible):
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ [LOGO]   COMPANY NAME                          Report ID      │
 *   │          INCIDENT REPORT                       Issue Date     │
 *   ├───────────────────────────────────────────────────────────────┤
 *   │ Incident Information (Type / Date / Employee / Reported By)   │
 *   │ Parcel Reference (only for the 4 parcel-context types)        │
 *   │ Statement of Incident (template paragraph)                    │
 *   │ Detailed Description by Reporting Officer (admin text)        │
 *   │ Employee Statement / Defense (blank ruled box)                │
 *   │ Acknowledgement & Signatures (2 boxes)                        │
 *   └───────────────────────────────────────────────────────────────┘
 */
export async function generateIncidentPdfBuffer(incident: Incident): Promise<Buffer> {
  const branding = await getBranding(incident.tenantId)
  const logo = await readLogoBuffer(incident.tenantId)

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 50, right: 50 } })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end',  () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    drawHeader(doc, incident, branding, logo)
    doc.moveDown(0.5)
    drawIncidentInfo(doc, incident)
    if (requiresParcelContext(incident.incidentType as IncidentType)) {
      drawParcelReference(doc, incident)
    }
    drawStatement(doc, incident)
    drawAdminDescription(doc, incident)
    drawEmployeeStatementBox(doc)
    drawWitness(doc, incident)
    drawSignatures(doc, incident)

    doc.end()
  })
}

// ─── Drawing helpers ─────────────────────────────────────────────────────────

const COLOR_PRIMARY    = '#1f3a8a'
const COLOR_BORDER     = '#cbd5e1'
const COLOR_LABEL      = '#475569'
const COLOR_TEXT       = '#0f172a'
const COLOR_SUBTLE_BG  = '#f8fafc'

interface HeaderBranding {
  companyName: string
  address: string | null
  email: string | null
  contactNumber: string | null
}

function drawHeader(doc: PDFKit.PDFDocument, incident: Incident, branding: HeaderBranding, logo: { buffer: Buffer; mime: string } | null) {
  const startY = doc.y
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const textX = leftX + 85
  const textW = rightX - textX - 150 // leave room for the right-aligned report id/date block

  // Logo
  if (logo) {
    try {
      doc.image(logo.buffer, leftX, startY, { fit: [70, 70] })
    } catch { /* invalid image, skip */ }
  }

  // Company name + report label + contact line (left column, flows downward)
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR_PRIMARY)
     .text(branding.companyName || 'Company Name', textX, startY + 4, { width: textW })
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXT)
     .text('INCIDENT REPORT', textX, doc.y + 2, { width: textW, characterSpacing: 1.5 })

  const contactLine = [branding.address, branding.contactNumber, branding.email]
    .map((s) => s?.trim()).filter(Boolean).join('   ·   ')
  if (contactLine) {
    doc.font('Helvetica').fontSize(8).fillColor(COLOR_LABEL)
       .text(contactLine, textX, doc.y + 3, { width: textW })
  }
  const leftBottom = doc.y

  // Right side: report id + issue date (absolute, anchored to startY)
  const reportId = `INC-${incident.createdAt.getFullYear()}-${shortId(incident.id)}`
  const issueDate = formatDate(incident.createdAt)
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_LABEL)
     .text('Report ID',  rightX - 140, startY + 6,  { width: 140, align: 'right' })
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXT)
     .text(reportId,     rightX - 140, startY + 18, { width: 140, align: 'right' })
  doc.font('Helvetica').fontSize(9).fillColor(COLOR_LABEL)
     .text('Issue Date', rightX - 140, startY + 36, { width: 140, align: 'right' })
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_TEXT)
     .text(issueDate,    rightX - 140, startY + 48, { width: 140, align: 'right' })

  // Divider sits below the tallest of: logo, left text column, right id/date block
  const dividerY = Math.max(leftBottom, startY + 62, startY + 72) + 8
  doc.moveTo(leftX, dividerY).lineTo(rightX, dividerY)
     .lineWidth(1).strokeColor(COLOR_PRIMARY).stroke()

  doc.y = dividerY + 10
  doc.x = leftX
}

function drawIncidentInfo(doc: PDFKit.PDFDocument, incident: Incident) {
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const width = rightX - leftX
  const startY = doc.y

  sectionTitle(doc, 'Incident Information')

  const rowY = doc.y
  const colW = width / 2

  drawField(doc, leftX,         rowY,         colW - 10, 'Incident Type',
            INCIDENT_TYPE_LABELS[incident.incidentType as IncidentType])
  drawField(doc, leftX + colW,  rowY,         colW - 10, 'Date of Incident',
            formatDate(incident.incidentDate))

  drawField(doc, leftX,         rowY + 36,    colW - 10, 'Employee Name',
            incident.employeeFullName)
  drawField(doc, leftX + colW,  rowY + 36,    colW - 10, 'Employee Email',
            incident.employeeEmail)

  drawField(doc, leftX,         rowY + 72,    colW - 10, 'Reported By',
            `${incident.reportedByFullName} (${humanizeRole(incident.reportedByRole)})`)
  drawField(doc, leftX + colW,  rowY + 72,    colW - 10, 'Recipient',
            incident.recipientEmail)

  doc.y = rowY + 108
  doc.x = leftX
  void startY
}

function drawParcelReference(doc: PDFKit.PDFDocument, incident: Incident) {
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const width = rightX - leftX

  sectionTitle(doc, 'Parcel Reference')
  const rowY = doc.y
  const colW = width / 3

  drawField(doc, leftX,             rowY, colW - 6, 'Tracking Number', incident.trackingNumber ?? '—')
  drawField(doc, leftX + colW,      rowY, colW - 6, 'Platform',         incident.platform ?? '—')
  drawField(doc, leftX + colW * 2,  rowY, colW - 6, 'Shop',             incident.shopName ?? '—')

  doc.y = rowY + 36
  doc.x = leftX
}

function drawStatement(doc: PDFKit.PDFDocument, incident: Incident) {
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const width = rightX - leftX

  sectionTitle(doc, 'Statement of Incident')
  const template = renderTemplate(incident)
  const padX = 10
  const padY = 8

  // Box
  const startY = doc.y
  const textWidth = width - padX * 2
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXT)
  const textHeight = doc.heightOfString(template, { width: textWidth, align: 'justify' })

  doc.roundedRect(leftX, startY, width, textHeight + padY * 2, 4)
     .fillAndStroke(COLOR_SUBTLE_BG, COLOR_BORDER)
  doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(10)
     .text(template, leftX + padX, startY + padY, { width: textWidth, align: 'justify' })

  doc.y = startY + textHeight + padY * 2 + 8
  doc.x = leftX
}

function drawAdminDescription(doc: PDFKit.PDFDocument, incident: Incident) {
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const width = rightX - leftX

  sectionTitle(doc, 'Detailed Description by Reporting Officer')
  const padX = 10
  const padY = 8
  const startY = doc.y
  const textWidth = width - padX * 2

  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXT)
  const textHeight = doc.heightOfString(incident.adminDescription || '—', { width: textWidth, align: 'justify' })
  const boxHeight = Math.max(textHeight + padY * 2, 60)

  doc.roundedRect(leftX, startY, width, boxHeight, 4)
     .lineWidth(0.8).strokeColor(COLOR_BORDER).stroke()
  doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(10)
     .text(incident.adminDescription || '—', leftX + padX, startY + padY, { width: textWidth, align: 'justify' })

  doc.y = startY + boxHeight + 8
  doc.x = leftX
}

function drawEmployeeStatementBox(doc: PDFKit.PDFDocument) {
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const width = rightX - leftX

  ensureSpaceOnPage(doc, 160)
  sectionTitle(doc, 'Employee Statement / Defense')
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLOR_LABEL)
     .text('To be completed and signed by the employee named above.', leftX, doc.y, { width })
  doc.y += 6

  const startY = doc.y
  const boxHeight = 110
  doc.roundedRect(leftX, startY, width, boxHeight, 4)
     .lineWidth(0.8).strokeColor(COLOR_BORDER).stroke()

  // Ruled lines
  for (let i = 1; i <= 5; i++) {
    const y = startY + (boxHeight / 6) * i
    doc.moveTo(leftX + 12, y).lineTo(rightX - 12, y).lineWidth(0.4).strokeColor('#e5e7eb').dash(2, { space: 3 }).stroke()
  }
  doc.undash()

  doc.y = startY + boxHeight + 10
  doc.x = leftX
}

function drawWitness(doc: PDFKit.PDFDocument, incident: Incident) {
  if (!incident.witnessName) return
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const width = rightX - leftX

  ensureSpaceOnPage(doc, 70)
  sectionTitle(doc, 'Witness')
  const rowY = doc.y
  const colW = width / 2
  drawField(doc, leftX,        rowY, colW - 10, 'Witness Name', incident.witnessName)
  drawField(doc, leftX + colW, rowY, colW - 10, 'Position',     incident.witnessPosition || '—')

  doc.y = rowY + 36
  doc.x = leftX
}

function drawSignatures(doc: PDFKit.PDFDocument, incident: Incident) {
  const leftX = doc.page.margins.left
  const rightX = doc.page.width - doc.page.margins.right
  const width = rightX - leftX
  const hasWitness = !!incident.witnessName
  const cols = hasWitness ? 3 : 2
  const gap = 20
  const colW = (width - gap * (cols - 1)) / cols

  ensureSpaceOnPage(doc, 100)
  sectionTitle(doc, 'Acknowledgement & Signatures')

  const startY = doc.y
  drawSignatureBlock(doc, leftX,                       startY, colW, 'Employee Signature',          incident.employeeFullName)
  drawSignatureBlock(doc, leftX + (colW + gap),        startY, colW, 'Reporting Officer Signature', incident.reportedByFullName)
  if (hasWitness) {
    drawSignatureBlock(doc, leftX + 2 * (colW + gap),  startY, colW, 'Witness Signature',           incident.witnessName ?? '')
  }
}

function drawSignatureBlock(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, name: string) {
  const lineY = y + 38
  doc.moveTo(x, lineY).lineTo(x + w, lineY).lineWidth(0.8).strokeColor(COLOR_TEXT).stroke()
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_TEXT)
     .text(name || '—', x, lineY + 4, { width: w })
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_LABEL)
     .text(label, x, lineY + 18, { width: w })
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_LABEL)
     .text('Date: ____________________', x, lineY + 32, { width: w })
}

function sectionTitle(doc: PDFKit.PDFDocument, label: string) {
  doc.font('Helvetica-Bold').fontSize(10).fillColor(COLOR_PRIMARY)
     .text(label.toUpperCase(), { characterSpacing: 1, paragraphGap: 4 })
}

function drawField(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, value: string) {
  doc.font('Helvetica').fontSize(8).fillColor(COLOR_LABEL)
     .text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.5 })
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXT)
     .text(value, x, y + 12, { width: w })
}

function ensureSpaceOnPage(doc: PDFKit.PDFDocument, neededHeight: number) {
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y
  if (remaining < neededHeight) doc.addPage()
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' })
}

function humanizeRole(role: string): string {
  return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 6).toUpperCase()
}

// ─── 25 Statement Templates ──────────────────────────────────────────────────

function renderTemplate(incident: Incident): string {
  const type = incident.incidentType as IncidentType
  const ctx: TemplateContext = {
    employee: incident.employeeFullName,
    reportedBy: incident.reportedByFullName,
    role: humanizeRole(incident.reportedByRole),
    date: formatDate(incident.incidentDate),
    tn: incident.trackingNumber ?? '—',
    platform: incident.platform ?? '—',
    shop: incident.shopName ?? '—',
  }

  const fn = TEMPLATES[type]
  return fn(ctx)
}

interface TemplateContext {
  employee: string
  reportedBy: string
  role: string
  date: string
  tn: string
  platform: string
  shop: string
}

const TEMPLATES: Record<IncidentType, (c: TemplateContext) => string> = {
  [IncidentType.WRONG_ITEM_PICKED]: (c) =>
    `On ${c.date}, ${c.employee} picked an incorrect item for parcel ${c.tn} (${c.platform} · ${c.shop}). The wrong SKU was selected during the picking process, in deviation from the documented order specification. The discrepancy was identified and recorded by ${c.reportedBy}.`,

  [IncidentType.WRONG_ITEM_PACKED]: (c) =>
    `On ${c.date}, ${c.employee} packed an item different from the order specification for parcel ${c.tn} (${c.platform} · ${c.shop}). The packing output did not match the picking sheet, creating a fulfillment error that required corrective action by management.`,

  [IncidentType.MISSING_ITEM]: (c) =>
    `Parcel ${c.tn} (${c.platform} · ${c.shop}) was found to be missing one or more items after the picking and packing stages performed under the responsibility of ${c.employee}. The shortage was confirmed by ${c.reportedBy} on ${c.date}.`,

  [IncidentType.WRONG_QUANTITY]: (c) =>
    `On ${c.date}, ${c.employee} processed an order with an incorrect quantity — either too many or too few units of the specified SKU. The deviation from the order document was observed and recorded by ${c.reportedBy}.`,

  [IncidentType.PARCEL_DAMAGE]: (c) =>
    `The parcel with tracking number ${c.tn} (${c.platform} · ${c.shop}) was found damaged on ${c.date}. The damage may be attributed to improper handling, packing, or storage on the part of ${c.employee} and has been documented for review.`,

  [IncidentType.LOST_PARCEL]: (c) =>
    `On ${c.date}, a parcel could not be located after the picking, packing, scanning, or dispatch stage performed by ${c.employee}. The loss compromises the warehouse audit trail and was formally recorded by ${c.reportedBy}.`,

  [IncidentType.UNSCANNED_PARCEL]: (c) =>
    `A parcel handled by ${c.employee} on ${c.date} was not scanned, encoded, or otherwise properly recorded into the system. This omission breaks the inbound/outbound traceability chain and was flagged by ${c.reportedBy}.`,

  [IncidentType.LATE_PROCESSING]: (c) =>
    `One or more orders assigned to ${c.employee} on ${c.date} were not picked, packed, or dispatched within the agreed SLA window. The resulting delay constitutes a Service Level Agreement failure and was documented by ${c.reportedBy}.`,

  [IncidentType.INVENTORY_DISCREPANCY]: (c) =>
    `A physical stock count conducted on ${c.date} revealed a discrepancy between actual inventory and the system records under the area of responsibility of ${c.employee}. The variance was investigated and documented by ${c.reportedBy}.`,

  [IncidentType.DAMAGED_INVENTORY]: (c) =>
    `Inventory items were found damaged inside the warehouse premises on ${c.date}, prior to packing, in the area assigned to ${c.employee}. The condition of the goods has been recorded for write-off or recovery action.`,

  [IncidentType.LOW_PRODUCTIVITY]: (c) =>
    `${c.employee} failed to meet the established picker/packer productivity target on ${c.date} without providing a valid operational reason. The underperformance was observed and recorded by ${c.reportedBy}.`,

  [IncidentType.FAILURE_TO_FOLLOW_SOP]: (c) =>
    `On ${c.date}, ${c.employee} failed to comply with the established standard operating procedure governing picking, packing, labeling, scanning, or workplace safety. The violation was observed and documented by ${c.reportedBy}.`,

  [IncidentType.UNAUTHORIZED_ABSENCE]: (c) =>
    `${c.employee} was absent, late, undertime, or left their assigned post without prior approval on ${c.date}. This constitutes a breach of the company attendance policy and was recorded by ${c.reportedBy}.`,

  [IncidentType.MISCONDUCT]: (c) =>
    `On ${c.date}, ${c.employee} engaged in misconduct in the workplace — including but not limited to disrespect, insubordination, refusal to follow instructions, fighting, or other unacceptable behavior. The incident was witnessed and recorded by ${c.reportedBy}.`,

  [IncidentType.COMPANY_PROPERTY_DAMAGE]: (c) =>
    `Company property — including scanners, tables, printers, tools, shelving, or other equipment — was damaged or lost on ${c.date} under the responsibility of ${c.employee}. The loss has been recorded by ${c.reportedBy} for cost recovery review.`,

  [IncidentType.SAFETY_INCIDENT]: (c) =>
    `A workplace safety incident — involving injury, unsafe lifting, slipping, falling, blocked aisles, or another hazardous condition — occurred on ${c.date} and is associated with the conduct or area of responsibility of ${c.employee}. The incident was recorded by ${c.reportedBy}.`,

  [IncidentType.UNDERTIME]: (c) =>
    `${c.employee} left work earlier than the scheduled end of shift on ${c.date} without proper authorization. The undertime was recorded by ${c.reportedBy} for HR review.`,

  [IncidentType.FAILURE_TO_SUBMIT_REPORTS]: (c) =>
    `${c.employee} failed to submit the required daily sales report, inquiry report, content report, or advertising performance update on ${c.date}. The omission was identified and recorded by ${c.reportedBy}.`,

  [IncidentType.FAILURE_POSTING_SCHEDULE]: (c) =>
    `${c.employee} did not comply with the required posting schedule on ${c.date} — including missed posts, reels, stories, or scheduled live-selling sessions. The deviation from the publishing plan was recorded by ${c.reportedBy}.`,

  [IncidentType.POOR_QUALITY_CONTENT]: (c) =>
    `Content produced by ${c.employee} on ${c.date} did not meet the company's quality standards. Issues observed include blurry imagery, incorrect layout, spelling errors, missing logo, or substandard captions. The output was reviewed by ${c.reportedBy}.`,

  [IncidentType.UNAUTHORIZED_RECORDING]: (c) =>
    `${c.employee} took photographs or video recordings on the premises on ${c.date} without prior approval. This action is in violation of company policy and was documented by ${c.reportedBy}.`,

  [IncidentType.WRONG_SALES_ENCODING]: (c) =>
    `${c.employee} entered an incorrect sales record on ${c.date}, resulting in inaccurate transactional data. The error was identified and recorded by ${c.reportedBy} for correction and review.`,

  [IncidentType.COURIER_COORDINATION_FAILURE]: (c) =>
    `${c.employee} failed to inform their supervisor of a courier-side issue on ${c.date} — including a late rider, no pickup, a full truck, or rejected parcels. The coordination breakdown was recorded by ${c.reportedBy}.`,

  [IncidentType.FAILURE_TURN_OVER_PARCELS]: (c) =>
    `${c.employee} did not perform a proper turn-over of parcels to the courier on ${c.date} — failing to complete the required count, documentation, scan, or acknowledgement. The lapse was identified and recorded by ${c.reportedBy}.`,

  [IncidentType.MISMATCH_PARCEL_COUNT]: (c) =>
    `On ${c.date}, the actual count of parcels handled by ${c.employee} did not match the manifest, scan count, or courier pickup count. The discrepancy was recorded by ${c.reportedBy} for reconciliation.`,
}
