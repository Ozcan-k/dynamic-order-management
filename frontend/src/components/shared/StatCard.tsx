import NumberTicker from './NumberTicker'
import Sparkline from './Sparkline'

interface StatCardProps {
  label: string
  value: number | string
  color?: string
  subtitle?: string
  trend?: number[]
  animate?: boolean
}

/**
 * StatCard — compact stat tile with a colored left bar.
 * Used in panel header rows for key metrics.
 */
export default function StatCard({
  label, value, color = '#3b82f6', subtitle, trend, animate,
}: StatCardProps) {
  const isNumeric = typeof value === 'number'
  return (
    <div className="stat-card">
      <div className="stat-card-bar" style={{ backgroundColor: color }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="stat-card-value" style={{ color }}>
          {animate && isNumeric ? <NumberTicker value={value as number} /> : value}
        </div>
        <div className="stat-card-label">{label}</div>
        {subtitle && (
          <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{subtitle}</div>
        )}
        {trend && trend.length > 1 && (
          <div style={{ marginTop: 4 }}>
            <Sparkline data={trend} color={color} width={92} height={24} />
          </div>
        )}
      </div>
    </div>
  )
}
