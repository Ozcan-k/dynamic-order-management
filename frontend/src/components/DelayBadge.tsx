import { colors } from '../theme'

interface DelayBadgeProps {
  level: number
}

export default function DelayBadge({ level }: DelayBadgeProps) {
  const idx = Math.min(Math.max(level, 0), 4)
  const bg   = colors.delayBg[idx]
  const text = colors.delayText[idx]
  const dot  = colors.delay[idx]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        backgroundColor: bg,
        color: text,
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        backgroundColor: dot, display: 'inline-block', flexShrink: 0,
      }} />
      D{level}
    </span>
  )
}
