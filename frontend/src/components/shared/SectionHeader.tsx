import type { ReactNode } from 'react'

interface SectionHeaderProps {
  title: string
  count?: number
  children?: ReactNode
}

/**
 * SectionHeader — consistent h2 + optional count pill + right-side action slot.
 * Use this for every major section within a panel body.
 */
export default function SectionHeader({ title, count, children }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <h2 className="section-title">
        {title}
        {count !== undefined && count > 0 && (
          <span className="count-badge">{count}</span>
        )}
      </h2>
      {children && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {children}
        </div>
      )}
    </div>
  )
}
