import { Carrier, CARRIER_LABELS } from '@dom/shared'

// ─── Carrier display config — dynamic palette ────────────────────────────────
// Shared by the Outbound board / Packed Report cards and the Picker/Packer Admin
// per-carrier live count chips. The known carriers get an explicitly assigned
// colour; anything else (carrierName is a free-text column) hashes to a stable
// palette entry so new carriers are auto-styled without any config.

export interface CarrierStyle {
  headerBg: string
  headerText: string
  badgeBg: string
  badgeText: string
  border: string
}

export const COLOR_PALETTE: CarrierStyle[] = [
  { headerBg: '#1d4ed8', headerText: '#fff', badgeBg: '#dbeafe', badgeText: '#1e40af', border: '#bfdbfe' },
  { headerBg: '#dc2626', headerText: '#fff', badgeBg: '#fee2e2', badgeText: '#b91c1c', border: '#fecaca' },
  { headerBg: '#15803d', headerText: '#fff', badgeBg: '#dcfce7', badgeText: '#166534', border: '#bbf7d0' },
  { headerBg: '#7c3aed', headerText: '#fff', badgeBg: '#ede9fe', badgeText: '#6d28d9', border: '#ddd6fe' },
  { headerBg: '#ea580c', headerText: '#fff', badgeBg: '#ffedd5', badgeText: '#c2410c', border: '#fed7aa' },
  { headerBg: '#0f766e', headerText: '#fff', badgeBg: '#ccfbf1', badgeText: '#115e59', border: '#99f6e4' },
  { headerBg: '#be185d', headerText: '#fff', badgeBg: '#fce7f3', badgeText: '#9d174d', border: '#fbcfe8' },
  { headerBg: '#4338ca', headerText: '#fff', badgeBg: '#e0e7ff', badgeText: '#3730a3', border: '#c7d2fe' },
  { headerBg: '#b45309', headerText: '#fff', badgeBg: '#fef3c7', badgeText: '#92400e', border: '#fde68a' },
  { headerBg: '#0e7490', headerText: '#fff', badgeBg: '#cffafe', badgeText: '#164e63', border: '#a5f3fc' },
]

// Neutral grey style for orders without a carrier ("No Carrier").
const NO_CARRIER_STYLE: CarrierStyle = {
  headerBg: '#475569', headerText: '#fff', badgeBg: '#e2e8f0', badgeText: '#334155', border: '#cbd5e1',
}

// The seven known carriers are pinned to distinct palette entries. Hashing alone
// collided (JT_EXPRESS/LEX both landed on 3, FLASH/OTHER both on 6), which rendered
// those pairs in an identical colour on every board.
const CARRIER_PALETTE_INDEX: Record<Carrier, number> = {
  [Carrier.LEX]:        0, // blue
  [Carrier.JT_EXPRESS]: 1, // red
  [Carrier.LBC]:        2, // green
  [Carrier.NINJA_VAN]:  3, // violet
  [Carrier.SPX]:        4, // orange
  [Carrier.OTHER]:      5, // teal
  [Carrier.FLASH]:      8, // amber
}

export function hashCarrier(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h % COLOR_PALETTE.length
}

export function getCarrierStyle(carrierName: string | null | undefined): CarrierStyle {
  if (!carrierName) return NO_CARRIER_STYLE
  const pinned = CARRIER_PALETTE_INDEX[carrierName as Carrier]
  return COLOR_PALETTE[pinned ?? hashCarrier(carrierName)]
}

export function getCarrierLabel(carrierName: string | null | undefined): string {
  if (!carrierName) return 'No Carrier'
  return CARRIER_LABELS[carrierName as Carrier] ?? carrierName.replace(/_/g, ' ')
}
