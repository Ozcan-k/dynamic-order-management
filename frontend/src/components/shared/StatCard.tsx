interface StatCardProps {
  label: string
  value: number | string
  color?: string
}

/**
 * StatCard — compact stat tile with a colored left bar.
 * Used in panel header rows for key metrics.
 */
export default function StatCard({ label, value, color = '#3b82f6' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-bar" style={{ backgroundColor: color }} />
      <div>
        <div className="stat-card-value" style={{ color }}>
          {value}
        </div>
        <div className="stat-card-label">{label}</div>
      </div>
    </div>
  )
}
