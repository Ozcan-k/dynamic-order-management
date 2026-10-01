import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../stores/authStore'
import { getManilaDateString } from '../lib/manila'
import { addDays } from '../components/shared/DateNavigator'
import PageShell from '../components/shared/PageShell'
import { getDispatchGrouped, getDispatchStats, type CarrierGroup } from '../api/dispatch'
import { getCarrierStyle, getCarrierLabel } from '../components/shared/carrierStyle'
import {
  OutboundIcon, TruckIcon, HouseIcon, ExternalIcon, BoxesIcon, TrophyIcon, KpiTile,
} from '../components/outbound/obUi'
import { pct } from '../components/outbound/obFormat'

function CarrierLane({ group, dayTotal, index }: { group: CarrierGroup; dayTotal: number; index: number }) {
  const style = getCarrierStyle(group.carrierName)
  const label = getCarrierLabel(group.carrierName)
  const topShop = group.shops[0]?.count ?? 0
  return (
    <article className="ob-lane" style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}>
      <div className="ob-lane-stripe" style={{ background: style.headerBg }} />
      <div className="ob-lane-head">
        <div className="ob-lane-name">
          <div className="ob-lane-icon" style={{ background: style.badgeBg, color: style.headerBg }}>
            <TruckIcon />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="ob-lane-label">{label}</div>
            <div className="ob-lane-meta">{group.shops.length} {group.shops.length === 1 ? 'shop' : 'shops'}</div>
          </div>
        </div>
        <div className="ob-lane-count">
          <div className="ob-lane-count-num">{group.totalOrders}</div>
          <div className="ob-lane-count-pct">{pct(group.totalOrders, dayTotal)} of day</div>
        </div>
      </div>
      <ul className="ob-lane-shops">
        {group.shops.map((shop) => (
          <li key={shop.shopName} className="ob-shop">
            <span className="ob-shop-name" title={shop.shopName.replace(/_/g, ' ')}>{shop.shopName.replace(/_/g, ' ')}</span>
            <span className="ob-shop-bar" aria-hidden="true">
              <span style={{ width: `${topShop > 0 ? Math.max(4, Math.round((shop.count / topShop) * 100)) : 0}%`, background: style.headerBg }} />
            </span>
            <span className="ob-shop-num">{shop.count}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OutboundBoard() {
  const user = useAuthStore((s) => s.user)
  const todayStr = getManilaDateString()
  const yesterdayStr = addDays(todayStr, -1)
  // '' = today (live polling); any YYYY-MM-DD = historical snapshot
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [carrierSort, setCarrierSort] = useState<'name' | 'volume'>('volume')

  const isHistorical = selectedDate !== ''
  const activeDate = selectedDate || todayStr
  const queryDate = isHistorical ? selectedDate : undefined

  const { data: groups, isLoading: groupsLoading } = useQuery({
    queryKey: ['dispatch-grouped', selectedDate],
    queryFn: () => getDispatchGrouped(queryDate),
    refetchInterval: isHistorical ? false : 10_000,
  })
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dispatch-stats', selectedDate],
    queryFn: () => getDispatchStats(queryDate),
    refetchInterval: isHistorical ? false : 10_000,
  })

  const isLoading = groupsLoading || statsLoading
  const carrierGroups = useMemo(() => groups ?? [], [groups])
  const sortedCarrierGroups = useMemo(() => {
    const list = [...carrierGroups]
    if (carrierSort === 'name') list.sort((a, b) => getCarrierLabel(a.carrierName).localeCompare(getCarrierLabel(b.carrierName)))
    else list.sort((a, b) => b.totalOrders - a.totalOrders)
    return list
  }, [carrierGroups, carrierSort])
  // Share bar is always by volume so the colours read largest → smallest.
  const byVolume = useMemo(() => [...carrierGroups].sort((a, b) => b.totalOrders - a.totalOrders), [carrierGroups])

  // Which preset is active
  const preset: 'today' | 'yesterday' | 'custom' =
    selectedDate === '' ? 'today' : selectedDate === yesterdayStr ? 'yesterday' : 'custom'

  const total = stats?.total ?? 0
  const inHouse = stats?.inHouse ?? 0
  const external = stats?.external ?? 0
  const top = byVolume[0]

  return (
    <PageShell
      icon={OutboundIcon}
      title="Outbound"
      subtitle={`${user?.username} · ${user?.role?.replace(/_/g, ' ')}`}
    >
      {/* Date control — Incident-style pills (single day) */}
      <div className="page-hero" style={{ marginBottom: 20 }}>
        <div className="page-hero-content">
          <div className="page-hero-label">
            Dispatch Day {preset === 'today' && <span className="ob-live">LIVE</span>}
          </div>
          <div className="page-hero-title">
            {preset === 'today' ? `Today · ${todayStr}` : activeDate}
          </div>
        </div>
        <div className="page-hero-actions">
          <div className="preset-btn-group">
            <button type="button" className={`preset-btn${preset === 'today' ? ' preset-btn--active' : ''}`} onClick={() => setSelectedDate('')}>Today</button>
            <button type="button" className={`preset-btn${preset === 'yesterday' ? ' preset-btn--active' : ''}`} onClick={() => setSelectedDate(yesterdayStr)}>Yesterday</button>
            <button type="button" className={`preset-btn${preset === 'custom' ? ' preset-btn--active' : ''}`} onClick={() => setSelectedDate(activeDate === todayStr ? yesterdayStr : activeDate)}>Custom</button>
          </div>
          {preset === 'custom' && (
            <input
              type="date"
              value={activeDate}
              max={todayStr}
              onChange={(e) => setSelectedDate(e.target.value || '')}
              aria-label="Dispatch day"
              style={{ padding: '8px 10px', borderRadius: 8, border: 'none', fontWeight: 600, color: '#0f172a' }}
            />
          )}
        </div>
      </div>

      <div className="ob-stack">
        <div className="ob-kpis">
          <KpiTile label="Parcels out" icon={<BoxesIcon />} accent="#2563eb" value={total}
            foot={preset === 'today' ? 'Scanned out so far today' : `Scanned out on ${activeDate}`} />
          <KpiTile label="In-house" icon={<HouseIcon />} accent="#16a34a" value={inHouse}
            foot={<><strong>{pct(inHouse, total)}</strong> of parcels · our orders</>} />
          <KpiTile label="External" icon={<ExternalIcon />} accent="#f59e0b" value={external}
            foot={<><strong>{pct(external, total)}</strong> of parcels · not in system</>} />
          <KpiTile label="Top courier" icon={<TrophyIcon />} accent={top ? getCarrierStyle(top.carrierName).headerBg : '#64748b'}
            textValue value={top ? getCarrierLabel(top.carrierName) : '—'}
            foot={top ? <><strong>{top.totalOrders}</strong> parcels · {carrierGroups.length} {carrierGroups.length === 1 ? 'courier' : 'couriers'} active</> : 'No couriers yet'} />
        </div>

        {isLoading ? (
          <div className="ob-card ob-empty"><span className="spinner spinner-sm" />Loading parcels…</div>
        ) : carrierGroups.length === 0 ? (
          <div className="ob-card ob-empty">
            <div className="ob-empty-icon"><TruckIcon size={24} /></div>
            <div className="ob-empty-title">
              {preset === 'today' ? 'No parcels dispatched yet today' : `No parcels dispatched on ${activeDate}`}
            </div>
            Scan parcels from the handheld Outbound station to see them here.
          </div>
        ) : (
          <>
            {/* Courier mix */}
            <section className="ob-card">
              <div className="ob-card-head">
                <div>
                  <h2 className="ob-card-title">Courier mix</h2>
                  <p className="ob-card-sub">Share of the day's parcels by courier.</p>
                </div>
                <span className="ob-pill">{total} parcels</span>
              </div>
              <div className="ob-mix-bar" role="img" aria-label={byVolume.map((g) => `${getCarrierLabel(g.carrierName)} ${g.totalOrders}`).join(', ')}>
                {byVolume.map((g) => (
                  <span key={g.carrierName} className="ob-mix-seg" title={`${getCarrierLabel(g.carrierName)}: ${g.totalOrders}`}
                    style={{ flexGrow: g.totalOrders, background: getCarrierStyle(g.carrierName).headerBg }} />
                ))}
              </div>
              <div className="ob-mix-legend">
                {byVolume.map((g) => (
                  <span key={g.carrierName} className="ob-mix-item">
                    <span className="ob-dot" style={{ background: getCarrierStyle(g.carrierName).headerBg }} />
                    {getCarrierLabel(g.carrierName)} <b>{g.totalOrders}</b> · {pct(g.totalOrders, total)}
                  </span>
                ))}
              </div>
            </section>

            <div className="ob-toolbar">
              <span className="ob-toolbar-title">By courier &amp; shop</span>
              <div className="ob-seg" role="group" aria-label="Sort couriers">
                {([{ k: 'volume', label: 'Volume' }, { k: 'name', label: 'Name' }] as const).map((opt) => (
                  <button key={opt.k} type="button" aria-pressed={carrierSort === opt.k} onClick={() => setCarrierSort(opt.k)}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="ob-lanes">
              {sortedCarrierGroups.map((group, i) => (
                <CarrierLane key={group.carrierName} group={group} dayTotal={total} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
