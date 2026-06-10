export enum UserRole {
  ADMIN = 'ADMIN',
  INBOUND_ADMIN = 'INBOUND_ADMIN',
  OUTBOUND_ADMIN = 'OUTBOUND_ADMIN',
  PICKER_ADMIN = 'PICKER_ADMIN',
  PACKER_ADMIN = 'PACKER_ADMIN',
  PICKER = 'PICKER',
  PACKER = 'PACKER',
  SALES_AGENT = 'SALES_AGENT',
  STOCK_KEEPER = 'STOCK_KEEPER',
  WAREHOUSE_ADMIN = 'WAREHOUSE_ADMIN',
  RETURN_SCANNER = 'RETURN_SCANNER',
  INCIDENT_REPORTER = 'INCIDENT_REPORTER',
  ACCOUNTANT = 'ACCOUNTANT',
}

export type StockStatus = 'PENDING' | 'IN_STOCK' | 'OUT_OF_STOCK'
export type StockUnit = 'KG' | 'PCS'
export type MovementType = 'IN' | 'USED' | 'TRANSFER' | 'ADJUSTMENT_OUT'

export interface StockItemSummary {
  id: string
  productId: string
  warehouseId: string
  unit: StockUnit
  quantity: number
  batchNumber: string
  status: StockStatus
  createdAt: string
  updatedAt: string
}

export * from './sales'
export * from './accounting'
export * from './employeeSchedule'

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

// ─── Outbound (dispatch) module ──────────────────────────────────────────────

export enum DispatchSource {
  IN_HOUSE = 'IN_HOUSE',
  EXTERNAL = 'EXTERNAL',
}

export const DISPATCH_SOURCE_LABELS: Record<DispatchSource, string> = {
  [DispatchSource.IN_HOUSE]: 'In-house',
  [DispatchSource.EXTERNAL]: 'External',
}

/** Suggested carrier for an in-house parcel, derived from its platform. Editable by the operator. */
export function suggestCarrier(platform: Platform): Carrier {
  switch (platform) {
    case Platform.SHOPEE: return Carrier.SPX
    case Platform.LAZADA: return Carrier.LEX
    case Platform.TIKTOK: return Carrier.JT_EXPRESS
    default:              return Carrier.OTHER
  }
}

export function detectPlatform(trackingNumber: string): Platform {
  const tn = trackingNumber.toUpperCase().trim()
  if (tn.startsWith('PH')) return Platform.SHOPEE
  if (tn.startsWith('JT')) return Platform.TIKTOK
  if (tn.startsWith('MP') || tn.startsWith('P')) return Platform.LAZADA
  if (tn.startsWith('DR')) return Platform.DIRECT
  return Platform.OTHER
}

// ─── Incident Report Module ──────────────────────────────────────────────────

export enum IncidentType {
  WRONG_ITEM_PICKED            = 'WRONG_ITEM_PICKED',
  WRONG_ITEM_PACKED            = 'WRONG_ITEM_PACKED',
  MISSING_ITEM                 = 'MISSING_ITEM',
  WRONG_QUANTITY               = 'WRONG_QUANTITY',
  PARCEL_DAMAGE                = 'PARCEL_DAMAGE',
  LOST_PARCEL                  = 'LOST_PARCEL',
  UNSCANNED_PARCEL             = 'UNSCANNED_PARCEL',
  LATE_PROCESSING              = 'LATE_PROCESSING',
  INVENTORY_DISCREPANCY        = 'INVENTORY_DISCREPANCY',
  DAMAGED_INVENTORY            = 'DAMAGED_INVENTORY',
  LOW_PRODUCTIVITY             = 'LOW_PRODUCTIVITY',
  FAILURE_TO_FOLLOW_SOP        = 'FAILURE_TO_FOLLOW_SOP',
  UNAUTHORIZED_ABSENCE         = 'UNAUTHORIZED_ABSENCE',
  MISCONDUCT                   = 'MISCONDUCT',
  COMPANY_PROPERTY_DAMAGE      = 'COMPANY_PROPERTY_DAMAGE',
  SAFETY_INCIDENT              = 'SAFETY_INCIDENT',
  UNDERTIME                    = 'UNDERTIME',
  FAILURE_TO_SUBMIT_REPORTS    = 'FAILURE_TO_SUBMIT_REPORTS',
  FAILURE_POSTING_SCHEDULE     = 'FAILURE_POSTING_SCHEDULE',
  POOR_QUALITY_CONTENT         = 'POOR_QUALITY_CONTENT',
  UNAUTHORIZED_RECORDING       = 'UNAUTHORIZED_RECORDING',
  WRONG_SALES_ENCODING         = 'WRONG_SALES_ENCODING',
  COURIER_COORDINATION_FAILURE = 'COURIER_COORDINATION_FAILURE',
  FAILURE_TURN_OVER_PARCELS    = 'FAILURE_TURN_OVER_PARCELS',
  MISMATCH_PARCEL_COUNT        = 'MISMATCH_PARCEL_COUNT',
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  [IncidentType.WRONG_ITEM_PICKED]:            'Wrong Item Picked',
  [IncidentType.WRONG_ITEM_PACKED]:            'Wrong Item Packed',
  [IncidentType.MISSING_ITEM]:                 'Missing Item',
  [IncidentType.WRONG_QUANTITY]:               'Wrong Quantity',
  [IncidentType.PARCEL_DAMAGE]:                'Parcel Damage',
  [IncidentType.LOST_PARCEL]:                  'Lost Parcel / Missing Parcel',
  [IncidentType.UNSCANNED_PARCEL]:             'Unscanned / Unprocessed Parcel',
  [IncidentType.LATE_PROCESSING]:              'Late Processing / SLA Failure',
  [IncidentType.INVENTORY_DISCREPANCY]:        'Inventory Discrepancy',
  [IncidentType.DAMAGED_INVENTORY]:            'Damaged Inventory',
  [IncidentType.LOW_PRODUCTIVITY]:             'Low Productivity / KPI Failure',
  [IncidentType.FAILURE_TO_FOLLOW_SOP]:        'Failure to Follow SOP',
  [IncidentType.UNAUTHORIZED_ABSENCE]:         'Unauthorized Absence / Abandonment / Tardiness',
  [IncidentType.MISCONDUCT]:                   'Misconduct / Insubordination',
  [IncidentType.COMPANY_PROPERTY_DAMAGE]:      'Company Property Damage or Loss',
  [IncidentType.SAFETY_INCIDENT]:              'Safety Incident / Workplace Accident',
  [IncidentType.UNDERTIME]:                    'Undertime',
  [IncidentType.FAILURE_TO_SUBMIT_REPORTS]:    'Failure to Submit Reports',
  [IncidentType.FAILURE_POSTING_SCHEDULE]:     'Failure to Follow Posting Schedule',
  [IncidentType.POOR_QUALITY_CONTENT]:         'Poor Quality Content Output',
  [IncidentType.UNAUTHORIZED_RECORDING]:       'Unauthorized Recording',
  [IncidentType.WRONG_SALES_ENCODING]:         'Wrong Sales Encoding',
  [IncidentType.COURIER_COORDINATION_FAILURE]: 'Courier Coordination Failure',
  [IncidentType.FAILURE_TURN_OVER_PARCELS]:    'Failure to Properly Turn Over Parcels',
  [IncidentType.MISMATCH_PARCEL_COUNT]:        'Mismatch in Parcel Count',
}

/** Incident types that require parcel context (tracking number + platform + shop) */
export const PARCEL_INCIDENT_TYPES: ReadonlyArray<IncidentType> = [
  IncidentType.WRONG_ITEM_PICKED,
  IncidentType.WRONG_ITEM_PACKED,
  IncidentType.MISSING_ITEM,
  IncidentType.PARCEL_DAMAGE,
] as const

export function requiresParcelContext(type: IncidentType): boolean {
  return PARCEL_INCIDENT_TYPES.includes(type)
}

// ─── Return & Cancel Parcel Module ───────────────────────────────────────────

export enum ReturnCancelType {
  RETURN = 'RETURN',
  CANCEL = 'CANCEL',
}

export const RETURN_CANCEL_TYPE_LABELS: Record<ReturnCancelType, string> = {
  [ReturnCancelType.RETURN]: 'Return',
  [ReturnCancelType.CANCEL]: 'Cancel',
}

/** Display labels for the order Platform enum. */
export const PLATFORM_LABELS: Record<Platform, string> = {
  [Platform.SHOPEE]: 'Shopee',
  [Platform.LAZADA]: 'Lazada',
  [Platform.TIKTOK]: 'TikTok',
  [Platform.DIRECT]: 'Direct',
  [Platform.OTHER]: 'Other',
}

/** Platforms selectable in the Return & Cancel module (subset of Platform). */
export const RETURN_CANCEL_PLATFORMS: ReadonlyArray<Platform> = [
  Platform.SHOPEE,
  Platform.LAZADA,
  Platform.TIKTOK,
] as const
