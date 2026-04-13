import { colors, radius, font } from '../theme'
import SectionHeader from './shared/SectionHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlaSummary {
  d0: number
  d1: number
  d2: number
  d3: number
  d4: number
  escalatedToday?: number
}

interface SlaSummaryCardProps {
  slaSummary: SlaSummary
  loading?: boolean
}

// ─── SLA config ───────────────────────────────────────────────────────────────

const SLA_KEYS = ['d0', 'd1', 'd2', 'd3', 'd4'] as const
type SlaKey = typeof SLA_KEYS[number]

const SLA_COLOR: Record<SlaKey, string> = {
  d0: '#10b981',
  d1: '#f59e0b',
  d2: '#f97316',
  d3: '#ef4444',
  d4: '#dc2626',
}

const SLA_LABEL: Record<SlaKey, string> = {
  d0: 'On Time',
  d1: '4 – 8 h',
  d2: '8 – 12 h',
  d3: '12 – 16 h',
  d4: '16 h+',
}

const SLA_BADGE: Record<SlaKey, string> = {
  d0: 'D0', d1: 'D1', d2: 'D2', d3: 'D3', d4: 'D4',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SlaSummaryCard({ slaSummary, loading = false }: SlaSummaryCardProps) {
  const slaTotal = SLA_KEYS.reduce((s, k) => s + slaSummary[k], 0)
  const escalatedToday = slaSummary.escalatedToday ?? 0

  return (
    <div style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.xl,
      padding: '20px 24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <SectionHeader title="SLA Breakdown" count={slaTotal} />
        {escalatedToday > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            borderRadius: radius.full,
            padding: '3px 10px',
            fontSize: font.sizeXs,
            fontWeight: 600,
            color: '#c2410c',
          }}>
            <span style={{ fontSize: '10px' }}>▲</span>
            {loading ? '—' : escalatedToday} escalated today
          </div>
        )}
      </div>

      {/* Segmented bar */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{
          display: 'flex', height: '18px',
          borderRadius: radius.full, overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
          background: colors.border,
        }}>
          {slaTotal > 0
            ? SLA_KEYS.map((key) => {
                const pct = (slaSummary[key] / slaTotal) * 100
                if (pct === 0) return null
                return (
                  <div
                    key={key}
                    title={`${SLA_BADGE[key]} (${SLA_LABEL[key]}): ${slaSummary[key]} orders — ${pct.toFixed(1)}%`}
                    style={{
                      width: `${pct}%`,
                      background: SLA_COLOR[key],
                      transition: 'width 0.4s ease',
                      cursor: 'default',
                    }}
                  />
                )
              })
            : null
          }
        </div>
      </div>

      {/* SLA legend cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '10px',
      }}>
        {SLA_KEYS.map((key) => {
          const count = slaSummary[key]
          const pct = slaTotal > 0 ? ((count / slaTotal) * 100).toFixed(1) : '0.0'
          const isD4 = key === 'd4'
          return (
            <div key={key} style={{
              background: isD4 && count > 0 ? '#fff5f5' : colors.surfaceAlt,
              border: `1px solid ${isD4 && count > 0 ? '#fecaca' : colors.border}`,
              borderRadius: radius.md,
              padding: '12px 14px',
              borderLeft: `3px solid ${SLA_COLOR[key]}`,
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '6px',
              }}>
                <span style={{
                  fontSize: font.sizeSm, color: SLA_COLOR[key],
                  fontWeight: 700, letterSpacing: '0.03em',
                }}>
                  {SLA_BADGE[key]}
                </span>
                <span style={{
                  fontSize: font.sizeXs, color: colors.textMuted,
                  background: colors.border, borderRadius: radius.full,
                  padding: '1px 7px', fontWeight: 600,
                }}>
                  {loading ? '—' : `${pct}%`}
                </span>
              </div>
              <div style={{
                fontSize: '22px', fontWeight: 800,
                color: isD4 && count > 0 ? colors.danger : colors.textPrimary,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {loading ? '—' : count}
              </div>
              <div style={{ fontSize: font.sizeXs, color: colors.textSecondary, marginTop: '3px' }}>
                {SLA_LABEL[key]}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
