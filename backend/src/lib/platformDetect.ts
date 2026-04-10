import { Platform } from '@dom/shared'

export function detectPlatform(trackingNumber: string): Platform {
  const tn = trackingNumber.toUpperCase().trim()
  if (tn.startsWith('PH')) return Platform.SHOPEE
  if (tn.startsWith('JT')) return Platform.TIKTOK
  if (tn.startsWith('MP') || tn.startsWith('P')) return Platform.LAZADA
  return Platform.OTHER
}
