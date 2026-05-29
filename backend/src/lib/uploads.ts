import path from 'path'
import fs from 'fs/promises'

/**
 * Upload directories. In production this maps to the docker-compose volume
 * `backend_uploads:/app/uploads` so files survive container restarts.
 * In dev it falls back to a local `backend/uploads` directory.
 */
export const UPLOADS_ROOT =
  process.env.NODE_ENV === 'production' ? '/app/uploads' : path.resolve(process.cwd(), 'uploads')

export const BRANDING_DIR = path.join(UPLOADS_ROOT, 'branding')
export const INCIDENTS_DIR = path.join(UPLOADS_ROOT, 'incidents')

export async function ensureUploadDirs() {
  await fs.mkdir(BRANDING_DIR, { recursive: true })
  await fs.mkdir(INCIDENTS_DIR, { recursive: true })
}

export function extFromMime(mime: string): string {
  switch (mime) {
    case 'image/png':       return '.png'
    case 'image/jpeg':      return '.jpg'
    case 'image/jpg':       return '.jpg'
    case 'image/webp':      return '.webp'
    case 'application/pdf': return '.pdf'
    default:                return ''
  }
}
