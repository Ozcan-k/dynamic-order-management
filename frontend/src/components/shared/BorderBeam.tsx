import type { CSSProperties, ReactNode } from 'react'

interface BorderBeamProps {
  children: ReactNode
  color?: string
  intensity?: 'soft' | 'strong'
  borderRadius?: string
  style?: CSSProperties
  className?: string
}

export default function BorderBeam({
  children,
  color = '#ef4444',
  intensity = 'strong',
  borderRadius = '12px',
  style,
  className,
}: BorderBeamProps) {
  return (
    <div
      className={['beam-wrap', `beam-wrap--${intensity}`, className].filter(Boolean).join(' ')}
      style={{
        ['--beam-color' as string]: color,
        borderRadius,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
