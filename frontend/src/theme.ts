// ─── Design Tokens ──────────────────────────────────────────────────────────
// Single source of truth for all colors, radii, shadows, and typography.
// Every component should import from here instead of hardcoding values.

// Colors
export const colors = {
  // Brand
  primary:      '#2563eb',
  primaryHover: '#1d4ed8',
  primaryLight: '#eff6ff',
  primaryRing:  'rgba(59,130,246,0.15)',

  // Surfaces
  bg:         '#f1f5f9',
  surface:    '#ffffff',
  surfaceAlt: '#f8fafc',

  // Borders
  border:       '#e2e8f0',
  borderStrong: '#cbd5e1',

  // Text
  textPrimary:   '#0f172a',
  textSecondary: '#64748b',
  textMuted:     '#94a3b8',

  // Status
  success:      '#16a34a',
  warning:      '#eab308',
  danger:       '#ef4444',
  dangerLight:  '#fef2f2',
  dangerBorder: '#fecaca',

  // Delay levels D0–D4
  delay:     ['#64748b', '#eab308', '#f97316', '#ef4444', '#991b1b'],
  delayBg:   ['#e5e7eb', '#fef9c3', '#fed7aa', '#fecaca', '#fca5a5'],
  delayText: ['#374151', '#854d0e', '#9a3412', '#991b1b', '#7f1d1d'],

  // Priority color function
  priority: (p: number) =>
    p >= 1600 ? '#be123c' :
    p >= 800  ? '#ef4444' :
    p >= 400  ? '#f97316' :
    p >= 200  ? '#eab308' :
                '#94a3b8',

  // Platform badge colors
  platform: {
    SHOPEE: { bg: '#fff4ed', text: '#c2410c', dot: '#f97316' },
    LAZADA: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
    TIKTOK: { bg: '#fdf4ff', text: '#7e22ce', dot: '#a855f7' },
    DIRECT: { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
    OTHER:  { bg: '#f9fafb', text: '#374151', dot: '#9ca3af' },
  } as Record<string, { bg: string; text: string; dot: string }>,

  // Avatar
  avatar: { bg: '#e0e7ff', text: '#4f46e5' },
}

export const radius = {
  sm:   '6px',
  md:   '8px',
  lg:   '10px',
  xl:   '12px',
  full: '9999px',
}

export const shadow = {
  card:      '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  cardHover: '0 4px 12px rgba(0,0,0,0.1)',
  btn:       '0 2px 8px rgba(37,99,235,0.25)',
}

export const font = {
  base: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
  mono: `'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace`,
  sizeXs:  '11px',
  sizeSm:  '12px',
  sizeMd:  '13px',
  sizeLg:  '14px',
  sizeXl:  '15px',
  size2xl: '16px',
}
