import { useEffect, useRef, useState } from 'react'

interface NumberTickerProps {
  value: number
  durationMs?: number
  className?: string
  style?: React.CSSProperties
}

export default function NumberTicker({
  value,
  durationMs = 900,
  className,
  style,
}: NumberTickerProps) {
  const [display, setDisplay] = useState<number>(0)
  const fromRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return
    const start = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      const current = Math.round(from + (to - from) * eased)
      setDisplay(current)
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        fromRef.current = to
      }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, durationMs])

  return (
    <span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {display.toLocaleString('en-US')}
    </span>
  )
}
