import { SALES_STORES } from '@dom/shared'
import type { AgentSummary, MarketingAgent } from '../../api/marketing'
import { AgentAvatar } from './chartKit'
import { longDate } from './format'
import MultiSelect from './MultiSelect'
import { IconStore } from './icons'
import { dayCountLabel, rangeTitle } from './rangeLabel'
import { PRESETS, type useMarketingFilters } from './useMarketingFilters'

interface Props {
  f: ReturnType<typeof useMarketingFilters>
  agent: MarketingAgent
  color: string
  summary?: AgentSummary
  fetching: boolean
}

function lastActive(date: string | null, today: string): string {
  if (!date) return 'No activity in the last year'
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000)
  if (days <= 0) return 'Active today'
  if (days === 1) return 'Last active yesterday'
  return `Last active ${days} days ago`
}

export default function AgentHero({ f, agent, color, summary, fetching }: Props) {
  const quiet = summary && (summary.lastActiveDate === null || (Date.parse(`${f.today}T00:00:00Z`) - Date.parse(`${summary.lastActiveDate}T00:00:00Z`)) / 86_400_000 >= 3)

  return (
    <section className="mkt-hero mkt-hero--agent" aria-label={`${agent.username} profile`}>
      <div className="mkt-hero-top">
        <div className="mkt-agent-id">
          <span className="mkt-agent-ring" style={{ '--agent': color } as React.CSSProperties}>
            <AgentAvatar name={agent.username} color={color} size={56} />
          </span>
          <div className="mkt-hero-text">
            <div className="mkt-hero-label">
              Sales agent · joined {longDate(agent.createdAt.slice(0, 10))}
              {f.isLive && <span className="live-pill"><span className="live-pill-dot" />LIVE</span>}
              {fetching && <span className="mkt-hero-sync" aria-live="polite">Updating…</span>}
            </div>
            <h2 className="mkt-hero-title mkt-hero-title--xl">{agent.username}</h2>
            <div className="mkt-agent-chips">
              {summary?.rank ? (
                <span className="mkt-chip">
                  <span><strong>#{summary.rank}</strong> of {summary.teamSize} by score</span>
                </span>
              ) : (
                <span className="mkt-chip">Not ranked in this range</span>
              )}
              <span className="mkt-chip">
                <span><strong>{summary?.currentStreak ?? 0}</strong>-day streak · best {summary?.longestStreak ?? 0}</span>
              </span>
              {summary && (
                <span className={`mkt-chip${quiet ? ' mkt-chip--warn' : ''}`}>
                  {quiet && '⚠ '}{lastActive(summary.lastActiveDate, f.today)}
                </span>
              )}
            </div>
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
        <span className="mkt-hero-range">
          {rangeTitle(f.from, f.to, f.today)} · {dayCountLabel(f.from, f.to)}
          {summary && <> · vs {rangeTitle(summary.previous.from, summary.previous.to, f.today)}</>}
        </span>
        {f.preset === 'custom' && (
          <div className="mkt-hero-dates">
            <input type="date" className="mkt-date-input" aria-label="From date" value={f.from} max={f.to}
              onChange={(e) => e.target.value && f.setCustomRange(e.target.value, f.to)} />
            <span aria-hidden="true">→</span>
            <input type="date" className="mkt-date-input" aria-label="To date" value={f.to} min={f.from} max={f.today}
              onChange={(e) => e.target.value && f.setCustomRange(f.from, e.target.value)} />
          </div>
        )}
        <MultiSelect
          icon={<IconStore />}
          allLabel="All stores"
          noun={['store', 'stores']}
          options={SALES_STORES.map((s) => ({ id: s, label: s }))}
          value={f.stores}
          onChange={f.setStores}
        />
      </div>
    </section>
  )
}
