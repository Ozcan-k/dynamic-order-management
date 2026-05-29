import fs from 'fs/promises'
import path from 'path'
import { prisma } from '../lib/prisma'
import { BRANDING_DIR, extFromMime, ensureUploadDirs } from '../lib/uploads'

export interface BrandingDto {
  id: string | null
  companyName: string
  hasLogo: boolean
  logoMime: string | null
  updatedAt: string | null
}

export async function getBranding(tenantId: string): Promise<BrandingDto> {
  const row = await prisma.companyBranding.findUnique({ where: { tenantId } })
  if (!row) {
    return { id: null, companyName: '', hasLogo: false, logoMime: null, updatedAt: null }
  }
  return {
    id: row.id,
    companyName: row.companyName,
    hasLogo: !!row.logoPath,
    logoMime: row.logoMime,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Returns a Buffer of the logo image, or null if no logo has been uploaded. */
export async function readLogoBuffer(tenantId: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const row = await prisma.companyBranding.findUnique({ where: { tenantId } })
  if (!row || !row.logoPath || !row.logoMime) return null
  try {
    const buffer = await fs.readFile(row.logoPath)
    return { buffer, mime: row.logoMime }
  } catch {
    return null
  }
}

export interface UpsertBrandingInput {
  tenantId: string
  updatedById: string
  companyName: string
  logo?: { buffer: Buffer; mime: string } | null
}

export async function upsertBranding(input: UpsertBrandingInput): Promise<BrandingDto> {
  await ensureUploadDirs()

  const existing = await prisma.companyBranding.findUnique({ where: { tenantId: input.tenantId } })

  let logoPath: string | null | undefined = undefined
  let logoMime: string | null | undefined = undefined

  if (input.logo) {
    // Delete previous logo file if mime changed (path includes extension)
    if (existing?.logoPath) {
      try { await fs.unlink(existing.logoPath) } catch { /* ignore */ }
    }
    const ext = extFromMime(input.logo.mime) || '.bin'
    const filename = `${input.tenantId}${ext}`
    logoPath = path.join(BRANDING_DIR, filename)
    logoMime = input.logo.mime
    await fs.writeFile(logoPath, input.logo.buffer)
  }

  const data = {
    companyName: input.companyName,
    updatedById: input.updatedById,
    ...(logoPath !== undefined ? { logoPath, logoMime } : {}),
  }

  const row = await prisma.companyBranding.upsert({
    where: { tenantId: input.tenantId },
    create: { tenantId: input.tenantId, ...data, logoPath: logoPath ?? null, logoMime: logoMime ?? null },
    update: data,
  })

  return {
    id: row.id,
    companyName: row.companyName,
    hasLogo: !!row.logoPath,
    logoMime: row.logoMime,
    updatedAt: row.updatedAt.toISOString(),
  }
}
