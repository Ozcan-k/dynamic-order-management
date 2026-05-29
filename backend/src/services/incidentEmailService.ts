import nodemailer from 'nodemailer'

let cachedTransporter: nodemailer.Transporter | null = null

function buildTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null
  if (cachedTransporter) return cachedTransporter
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  return cachedTransporter
}

export function isSmtpConfigured(): boolean {
  return !!process.env.SMTP_HOST
}

export interface SendIncidentEmailInput {
  to: string[]
  cc?: string[]
  subject: string
  pdfBuffer: Buffer
  pdfFilename: string
  bodyText: string
  bodyHtml: string
}

export async function sendIncidentEmail(input: SendIncidentEmailInput) {
  const transporter = buildTransporter()
  if (!transporter) {
    throw new Error('SMTP is not configured. Set SMTP_HOST and related env vars to enable email delivery.')
  }
  const from = process.env.SMTP_FROM || 'DOM Warehouse <noreply@example.com>'

  await transporter.sendMail({
    from,
    to: input.to.join(', '),
    cc: input.cc?.length ? input.cc.join(', ') : undefined,
    subject: input.subject,
    text: input.bodyText,
    html: input.bodyHtml,
    attachments: [
      {
        filename: input.pdfFilename,
        content:  input.pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })
}
