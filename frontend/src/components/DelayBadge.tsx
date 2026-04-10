const COLORS: Record<number, { bg: string; text: string }> = {
  0: { bg: '#e5e7eb', text: '#374151' },
  1: { bg: '#fef9c3', text: '#854d0e' },
  2: { bg: '#fed7aa', text: '#9a3412' },
  3: { bg: '#fecaca', text: '#991b1b' },
  4: { bg: '#fca5a5', text: '#7f1d1d' },
}

interface DelayBadgeProps {
  level: number
}

export default function DelayBadge({ level }: DelayBadgeProps) {
  const color = COLORS[level] ?? COLORS[0]
  return (
    <span
      style={{
        backgroundColor: color.bg,
        color: color.text,
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      D{level}
    </span>
  )
}
