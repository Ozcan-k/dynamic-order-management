import type { ReactNode, CSSProperties } from 'react'

interface SortableThProps<K extends string> {
  label: ReactNode
  sortKey: K
  activeKey: K | null
  direction: 'asc' | 'desc'
  onSort: (key: K) => void
  style?: CSSProperties
  align?: 'left' | 'center' | 'right'
}

export default function SortableTh<K extends string>({
  label, sortKey, activeKey, direction, onSort, style, align,
}: SortableThProps<K>) {
  const active = activeKey === sortKey
  const cls = ['sortable-th', active ? 'sortable-th--active' : ''].filter(Boolean).join(' ')
  return (
    <th
      className={cls}
      style={{ textAlign: align ?? 'left', ...style }}
      onClick={() => onSort(sortKey)}
    >
      <span className="sortable-th-inner">
        {label}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (
            direction === 'asc' ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 11 12 6 17 11" />
              <polyline points="7 13 12 18 17 13" />
            </svg>
          )}
        </span>
      </span>
    </th>
  )
}
