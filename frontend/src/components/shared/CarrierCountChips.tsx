import { getCarrierStyle, getCarrierLabel } from './carrierStyle'

export interface CarrierCount {
  carrierName: string | null
  count: number
}

/**
 * A compact, live horizontal row of per-carrier order counts, e.g.
 * `SPX 12 · J&T 8 · Flash 5`. Placed under the ManilaClock on the Picker /
 * Packer Admin boards. Only carriers with orders currently in that stage are
 * shown; orders with no carrier are grouped under "No Carrier".
 */
export default function CarrierCountChips({ items }: { items: CarrierCount[] }) {
  const active = items.filter((i) => i.count > 0)

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginBottom: 20,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: '#64748b',
          marginRight: 4,
        }}
      >
        By Carrier
      </span>

      {active.length === 0 ? (
        <span style={{ fontSize: 13, color: '#94a3b8' }}>No parcels in progress</span>
      ) : (
        active.map((item) => {
          const style = getCarrierStyle(item.carrierName)
          return (
            <span
              key={item.carrierName ?? '__none__'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 9999,
                background: style.badgeBg,
                border: `1px solid ${style.border}`,
                fontSize: 13,
                fontWeight: 600,
                color: style.badgeText,
              }}
            >
              {getCarrierLabel(item.carrierName)}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 20,
                  height: 20,
                  padding: '0 6px',
                  borderRadius: 9999,
                  background: style.headerBg,
                  color: style.headerText,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {item.count}
              </span>
            </span>
          )
        })
      )}
    </div>
  )
}
