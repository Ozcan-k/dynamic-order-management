export enum UserRole {
  ADMIN = 'ADMIN',
  INBOUND_ADMIN = 'INBOUND_ADMIN',
  PICKER_ADMIN = 'PICKER_ADMIN',
  PACKER_ADMIN = 'PACKER_ADMIN',
  PICKER = 'PICKER',
  PACKER = 'PACKER',
}

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

export interface JWTPayload {
  userId: string
  tenantId: string
  role: UserRole
}
