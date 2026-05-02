export enum UserRole {
  ADMIN = 'ADMIN',
  INBOUND_ADMIN = 'INBOUND_ADMIN',
  PICKER_ADMIN = 'PICKER_ADMIN',
  PACKER_ADMIN = 'PACKER_ADMIN',
  PICKER = 'PICKER',
  PACKER = 'PACKER',
  SALES_AGENT = 'SALES_AGENT',
  STOCK_KEEPER = 'STOCK_KEEPER',
}

export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK'
export type MovementDirection = 'IN' | 'OUT'

export interface StockItemSummary {
  id: string
  productType: string
  category: string
  weightKg: number
  status: StockStatus
  createdAt: string
  updatedAt: string
}

export * from './sales'

export enum OrderStatus {
  INBOUND = 'INBOUND',
  PICKER_ASSIGNED = 'PICKER_ASSIGNED',
  PICKING = 'PICKING',
  PICKER_COMPLETE = 'PICKER_COMPLETE',
  PACKER_ASSIGNED = 'PACKER_ASSIGNED',
  PACKING = 'PACKING',
  PACKER_COMPLETE = 'PACKER_COMPLETE',
  OUTBOUND = 'OUTBOUND',
}

export enum Platform {
  SHOPEE = 'SHOPEE',
  LAZADA = 'LAZADA',
  TIKTOK = 'TIKTOK',
  DIRECT = 'DIRECT',
  OTHER = 'OTHER',
}

export const SLA_PRIORITY_BOOSTS: Record<number, number> = {
  0: 0,
  1: 200,
  2: 400,
  3: 800,
  4: 1600,
}

export const SLA_HOURS_PER_LEVEL = 4
export const SLA_MAX_LEVEL = 4

export const SLA_LEVEL_COLORS: Record<number, string> = {
  0: 'gray',
  1: 'yellow',
  2: 'orange',
  3: 'red',
  4: 'crimson',
}

export interface JWTPayload {
  userId: string
  tenantId: string
  role: UserRole
  deviceType?: 'desktop' | 'handheld'
}

export enum Carrier {
  SPX        = 'SPX',
  JT_EXPRESS = 'JT_EXPRESS',
  FLASH      = 'FLASH',
  LEX        = 'LEX',
  LBC        = 'LBC',
  NINJA_VAN  = 'NINJA_VAN',
  OTHER      = 'OTHER',
}

export const CARRIER_LABELS: Record<Carrier, string> = {
  [Carrier.SPX]:        'SPX / Shopee Express',
  [Carrier.JT_EXPRESS]: 'J&T Express',
  [Carrier.FLASH]:      'Flash Express',
  [Carrier.LEX]:        'LEX / Lazada Logistics',
  [Carrier.LBC]:        'LBC',
  [Carrier.NINJA_VAN]:  'Ninja Van',
  [Carrier.OTHER]:      'Other',
}

export function detectPlatform(trackingNumber: string): Platform {
  const tn = trackingNumber.toUpperCase().trim()
  if (tn.startsWith('PH')) return Platform.SHOPEE
  if (tn.startsWith('JT')) return Platform.TIKTOK
  if (tn.startsWith('MP') || tn.startsWith('P')) return Platform.LAZADA
  if (tn.startsWith('DR')) return Platform.DIRECT
  return Platform.OTHER
}
