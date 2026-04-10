export type Platform = 'SHOPEE' | 'LAZADA' | 'TIKTOK' | 'OTHER'

export function detectPlatform(trackingNumber: string): Platform {
  const tn = trackingNumber.toUpperCase().trim()
  if (tn.startsWith('PH')) return 'SHOPEE'
  if (tn.startsWith('JT')) return 'TIKTOK'
  if (tn.startsWith('MP') || tn.startsWith('P')) return 'LAZADA'
  return 'OTHER'
}
