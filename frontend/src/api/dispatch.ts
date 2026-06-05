import { api } from './client'
import { Platform, Carrier, DispatchSource } from '@dom/shared'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DispatchRow {
  id: string
  trackingNumber: string
  source: DispatchSource
  platform: Platform
  carrier: Carrier
  shopName: string
  orderId: string | null
  createdAt: string
  createdBy: { username: string }
}

export interface OrderLookupResult {
  found: boolean
  platform: Platform | null
  shopName: string | null
  carrierName: string | null
  packerComplete: boolean // false until the packer has scanned the parcel complete
}

export interface ShopCount {
  shopName: string
  count: number
}

export interface CarrierGroup {
  carrierName: string
  totalOrders: number
  shops: ShopCount[]
}

export interface DispatchStats {
  total: number
  inHouse: number
  external: number
  historical: boolean
}

export interface DispatchReportRow {
  carrier: string
  total: number
  inHouse: number
  external: number
}

export interface DispatchReport {
  carriers: DispatchReportRow[]
  totals: { total: number; inHouse: number; external: number }
}

export interface OrderPipeline {
  inbound: number
  pickerComplete: number
  packerComplete: number
  outbound: number // in-house parcels actually SCANNED out in range (not auto-advance)
  oldOrders: number // subset of outbound: packed on an earlier day, shipped in range
}

export interface CreateDispatchInput {
  trackingNumber: string
  source: DispatchSource
  platform: Platform
  carrier: Carrier
  shopName?: string
}

// ─── Calls ──────────────────────────────────────────────────────────────────────

export async function lookupOrder(trackingNumber: string): Promise<OrderLookupResult> {
  const res = await api.get<OrderLookupResult>('/dispatch/lookup', { params: { trackingNumber } })
  return res.data
}

export async function createDispatch(input: CreateDispatchInput): Promise<DispatchRow> {
  const res = await api.post<DispatchRow>('/dispatch', input)
  return res.data
}

export async function getDispatchGrouped(date?: string): Promise<CarrierGroup[]> {
  const res = await api.get<CarrierGroup[]>('/dispatch/grouped', { params: date ? { date } : {} })
  return res.data
}

export async function getDispatchStats(date?: string): Promise<DispatchStats> {
  const res = await api.get<DispatchStats>('/dispatch/stats', { params: date ? { date } : {} })
  return res.data
}

export async function getDispatchReport(from?: string, to?: string): Promise<DispatchReport> {
  const res = await api.get<DispatchReport>('/dispatch/report', { params: { from, to } })
  return res.data
}

export async function getOrderPipeline(from?: string, to?: string): Promise<OrderPipeline> {
  const res = await api.get<OrderPipeline>('/dispatch/pipeline', { params: { from, to } })
  return res.data
}
