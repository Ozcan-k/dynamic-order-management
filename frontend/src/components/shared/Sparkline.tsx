interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
  strokeWidth?: number
  showArea?: boolean
  title?: string
}

export default function Sparkline({
  data,
  color = '#2563eb',
  width = 80,
  height = 28,
  strokeWidth = 1.5,
  showArea = true,
  title,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ width, height }} />
  }

  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const step = data.length > 1 ? width / (data.length - 1) : 0
  const padY = strokeWidth + 1

  const points = data.map((v, i) => {
    const x = i * step
    const y = padY + (1 - (v - min) / range) * (height - 2 * padY)
    return [x, y] as const
  })

  const linePath = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`
  const gradientId = `spark-grad-${Math.round(Math.random() * 1e9)}`
  const lastPt = points[points.length - 1]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {title && <title>{title}</title>}
      {showArea && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastPt && (
        <circle cx={lastPt[0]} cy={lastPt[1]} r={strokeWidth + 0.5} fill={color} />
      )}
    </svg>
  )
}
