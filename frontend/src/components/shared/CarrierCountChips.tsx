import { useState } from 'react'
import { getCarrierStyle, getCarrierLabel } from './carrierStyle'
import CarrierOrdersModal, { type CarrierStage } from './CarrierOrdersModal'

export interface CarrierCount {
  carrierName: string | null
  count: number
}

/**
 * A compact, live horizontal row of per-carrier order counts, e.g.
 * `SPX 12 · J&T 8 · Flash 5`. Placed under the ManilaClock on the Picker /
 * Packer Admin boards. Only carriers with orders currently in that stage are
 * shown; orders with no carrier are grouped under "No Carrier".
 *
 * Clicking a chip opens the drill-down: which orders that carrier is holding in
 * this stage, what each is waiting on, and who has it — so an operator can spot a
 * carrier's ageing parcels before they turn into delays.
 */
export default function CarrierCountChips({
  items,
  stage,
  isLoading = false,
}: {
  items: CarrierCount[]
  stage: CarrierStage
  isLoading?: boolean
}) {
  // `undefined` = closed. `null` is a valid selection (the "No Carrier" group).
  const [selected, setSelected] = useState<string | null | undefined>(undefined)
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

      {isLoading ? (
        <span style={{ fontSize: 13, color: '#94a3b8' }}>Loading...</span>
      ) : active.length === 0 ? (
        <span style={{ fontSize: 13, color: '#94a3b8' }}>No parcels in progress</span>
      ) : (
        active.map((item) => {
          const style = getCarrierStyle(item.carrierName)
          return (
            <button
              key={item.carrierName ?? '__none__'}
              type="button"
              onClick={() => setSelected(item.carrierName)}
              title={`View ${getCarrierLabel(item.carrierName)} orders`}
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
                fontFamily: 'inherit',
                color: style.badgeText,
                cursor: 'pointer',
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
            </button>
          )
        })
      )}

      {selected !== undefined && (
        <CarrierOrdersModal
          stage={stage}
          carrierName={selected}
          onClose={() => setSelected(undefined)}
        />
      )}
    </div>
  )
}
