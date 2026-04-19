interface DonutSegment {
  label: string
  value: number
  color: string
}

interface DonutProps {
  segments: DonutSegment[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string | number
}

export default function Donut({
  segments,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
}: DonutProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  const radius = (size - thickness) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * radius

  let offsetAccum = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {/* Background ring */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none" stroke="#e2e8f0" strokeWidth={thickness}
        />
        {total > 0 && segments.map((seg, i) => {
          const portion = seg.value / total
          const dash = circumference * portion
          const gap = circumference - dash
          const rotate = -90 + (offsetAccum / total) * 360
          offsetAccum += seg.value
          if (seg.value === 0) return null
          return (
            <circle
              key={i}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              transform={`rotate(${rotate} ${cx} ${cy})`}
              style={{ transition: 'stroke-dasharray 0.4s ease' }}
            >
              <title>{`${seg.label}: ${seg.value} (${(portion * 100).toFixed(1)}%)`}</title>
            </circle>
          )
        })}

        {/* Center text */}
        {(centerLabel || centerValue != null) && (
          <>
            {centerValue != null && (
              <text x={cx} y={cy - 2}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: 22, fontWeight: 700, fill: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text x={cx} y={cy + 16}
                    textAnchor="middle" dominantBaseline="middle"
                    style={{ fontSize: 11, fill: '#64748b', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
        {segments.map((seg) => {
          const pct = total > 0 ? (seg.value / total) * 100 : 0
          return (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 10, height: 10, borderRadius: 2,
                background: seg.color, flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: seg.color, minWidth: 28 }}>
                {seg.label}
              </span>
              <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {seg.value.toLocaleString()}
              </span>
              <span style={{ fontSize: 11, color: '#64748b', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {pct.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
