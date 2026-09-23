import { useStores } from '../../api/stores'
import type { MarketingAgent } from '../../api/marketing'
import { dayCountLabel, rangeTitle } from './rangeLabel'
import MultiSelect from './MultiSelect'
import { IconStore, IconUsers, IconX } from './icons'
import { PRESETS, type useMarketingFilters } from './useMarketingFilters'

interface Props {
  f: ReturnType<typeof useMarketingFilters>
  agents: MarketingAgent[]
  agentColors: Map<string, string>
  previous?: { from: string; to: string }
  fetching: boolean
}

export default function FilterHero({ f, agents, agentColors, previous, fetching }: Props) {
  const { names: storeNames } = useStores({ all: true })
  const hasDimFilter = f.agentIds.length > 0 || f.stores.length > 0

  return (
    <section className="mkt-hero" aria-label="Report filters">
      <div className="mkt-hero-top">
        <div className="mkt-hero-text">
          <div className="mkt-hero-label">
            Sales team activity
            {f.isLive && (
              <span className="live-pill">
                <span className="live-pill-dot" />
                LIVE
              </span>
            )}
            {fetching && <span className="mkt-hero-sync" aria-live="polite">Updating…</span>}
          </div>
          <h2 className="mkt-hero-title">{rangeTitle(f.from, f.to, f.today)}</h2>
          <div className="mkt-hero-sub">
            {dayCountLabel(f.from, f.to)}
            {previous && <> · compared with {rangeTitle(previous.from, previous.to, f.today)}</>}
          </div>
        </div>

        <div className="preset-btn-group" role="group" aria-label="Date range">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={f.preset === p.id}
              onClick={() => f.setPreset(p.id)}
              className={`preset-btn${f.preset === p.id ? ' preset-btn--active' : ''}`}
            >{p.label}</button>
          ))}
          <button
            type="button"
            aria-pressed={f.preset === 'custom'}
            onClick={() => f.setPreset('custom')}
            className={`preset-btn${f.preset === 'custom' ? ' preset-btn--active' : ''}`}
          >Custom</button>
        </div>
      </div>

      <div className="mkt-hero-controls">
        {f.preset === 'custom' && (
          <div className="mkt-hero-dates">
            <input
              type="date"
              className="mkt-date-input"
              aria-label="From date"
              value={f.from}
              max={f.to}
              onChange={(e) => e.target.value && f.setCustomRange(e.target.value, f.to)}
            />
            <span aria-hidden="true">→</span>
            <input
              type="date"
              className="mkt-date-input"
              aria-label="To date"
              value={f.to}
              min={f.from}
              max={f.today}
              onChange={(e) => e.target.value && f.setCustomRange(f.from, e.target.value)}
            />
          </div>
        )}

        <MultiSelect
          icon={<IconUsers />}
          allLabel="All agents"
          noun={['agent', 'agents']}
          options={agents.map((a) => ({ id: a.id, label: a.username, color: agentColors.get(a.id) }))}
          value={f.agentIds}
          onChange={f.setAgents}
        />
        <MultiSelect
          icon={<IconStore />}
          allLabel="All stores"
          noun={['store', 'stores']}
          options={storeNames.map((s) => ({ id: s, label: s }))}
          value={f.stores}
          onChange={f.setStores}
        />
        {hasDimFilter && (
          <button type="button" className="mkt-clear-btn" onClick={f.clearFilters}>
            <IconX size={12} /> Clear filters
          </button>
        )}
      </div>
    </section>
  )
}
