// ─── Design Tokens ──────────────────────────────────────────────────────────
// Single source of truth for all colors, radii, shadows, and typography.
// Every component should import from here instead of hardcoding values.
//
// Phase A (v2.37.0): additive token expansion — Linear/Vercel modern minimal.
// Existing exports preserved verbatim; new groups added below.
// Mirrored as CSS variables in src/styles/tokens.css.

// Colors
export const colors = {
  // Brand
  primary:      '#2563eb',
  primaryHover: '#1d4ed8',
  primaryLight: '#eff6ff',
  primaryRing:  'rgba(59,130,246,0.15)',
  primarySubtle:'#f0f5ff', // Phase A: tinted hovers

  // Surfaces
  bg:         '#f1f5f9',
  surface:    '#ffffff',
  surfaceAlt: '#f8fafc',
  surfaceDark:'#0f172a', // Phase A: explicit sidebar/navy alias

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
  info:         '#3b82f6',
  infoLight:    '#eff6ff',

  // Delay levels D0–D4 (saha-doğrulanmış — DO NOT CHANGE)
  delay:     ['#64748b', '#eab308', '#f97316', '#ef4444', '#991b1b'],
  delayBg:   ['#e5e7eb', '#fef9c3', '#fed7aa', '#fecaca', '#fca5a5'],
  delayText: ['#374151', '#854d0e', '#9a3412', '#991b1b', '#7f1d1d'],

  // Priority color function (DO NOT CHANGE)
  priority: (p: number) =>
    p >= 1600 ? '#be123c' :
    p >= 800  ? '#ef4444' :
    p >= 400  ? '#f97316' :
    p >= 200  ? '#eab308' :
                '#94a3b8',

  // Platform badge colors (DO NOT CHANGE)
  platform: {
    SHOPEE: { bg: '#fff4ed', text: '#c2410c', dot: '#f97316' },
    LAZADA: { bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' },
    TIKTOK: { bg: '#fdf4ff', text: '#7e22ce', dot: '#a855f7' },
    DIRECT: { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' },
    OTHER:  { bg: '#f9fafb', text: '#374151', dot: '#9ca3af' },
  } as Record<string, { bg: string; text: string; dot: string }>,

  // Avatar
  avatar: { bg: '#e0e7ff', text: '#4f46e5' },

  // Phase A: 12-step neutral scale (Linear-flavored)
  // Use these for new surfaces, borders, and text — existing slate values
  // remain in legacy classes until per-tier pages are touched.
  gray: {
    50:  '#fafafa',
    100: '#f4f4f5',
    150: '#ececee',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    900: '#18181b',
    950: '#09090b',
  },
}

// ─── Spacing ────────────────────────────────────────────────────────────────
// Phase A: 4px-based scale. Snap existing odd values (10/14/18/22) to nearest
// step on later consumption.
export const space = {
  0:  '0',
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  8:  '32px',
  10: '40px',
  12: '48px',
  16: '64px',
}

// ─── Radius ─────────────────────────────────────────────────────────────────
// Default buttons/inputs target `sm` (6px) — Linear/Vercel signature.
// Cards/modals stay `lg`–`xl`. Hero banner keeps `2xl`.
export const radius = {
  xs:   '4px',   // Phase A
  sm:   '6px',
  md:   '8px',
  lg:   '10px',
  xl:   '12px',
  '2xl':'16px',  // Phase A
  full: '9999px',
}

// ─── Shadows ────────────────────────────────────────────────────────────────
// Existing aliases (card/cardHover/btn/xl) preserved for back-compat.
// New layered + focus rings introduced for Phase C primitives polish.
export const shadow = {
  // Legacy aliases
  card:      '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  cardHover: '0 4px 12px rgba(0,0,0,0.1)',
  btn:       '0 2px 8px rgba(37,99,235,0.25)',
  xl:        '0 24px 64px rgba(0,0,0,0.18)',

  // Phase A: layered modern-minimal scale
  xs:        '0 1px 2px rgba(15,23,42,0.04)',
  sm:        '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
  md:        '0 4px 12px rgba(15,23,42,0.06), 0 2px 4px rgba(15,23,42,0.04)',
  lg:        '0 12px 32px rgba(15,23,42,0.10), 0 4px 8px rgba(15,23,42,0.04)',
  focus:     '0 0 0 3px rgba(37,99,235,0.18)',
  focusRing: '0 0 0 2px #fff, 0 0 0 4px #2563eb',
}

// ─── Typography ─────────────────────────────────────────────────────────────
// Inter Variable loaded via @fontsource-variable/inter in main.tsx.
// System stack remains as fallback (no FOUT shift expected — verify per Phase A).
export const font = {
  base: `'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,
  mono: `'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace`,

  // Legacy aliases (existing call sites)
  xs:  '11px',
  sm:  '12px',
  md:  '13px',
  lg:  '14px',
  xl:  '15px',
  xxl: '16px',
}

// Phase A: tight Linear-ish type scale (use in new code; legacy keys above stay)
export const fontSize = {
  xs:    '12px',
  sm:    '13px',
  base:  '14px',
  md:    '16px',
  lg:    '20px',
  xl:    '24px',
  '2xl': '30px',
  '3xl': '36px',
}

export const lineHeight = {
  tight:  '1.15',
  snug:   '1.3',
  normal: '1.5',
}

export const tracking = {
  tight:   '-0.01em',
  tighter: '-0.02em',
  display: '-0.03em',
  normal:  '0',
  wide:    '0.04em',
  wider:   '0.1em',
}

// ─── Motion ─────────────────────────────────────────────────────────────────
// Existing aliases (fast/normal/slow) preserved for back-compat.
// Phase A: explicit duration + ease groups for modern-minimal motion.
export const motion = {
  // Legacy aliases
  fast:   '120ms',
  normal: '200ms',
  slow:   '320ms',

  // Phase A: durations
  duration: {
    instant: '80ms',
    fast:    '150ms',
    base:    '200ms',
    slow:    '250ms',
    slower:  '400ms',
  },

  // Phase A: easing curves
  ease: {
    standard:   'cubic-bezier(0.4, 0, 0.2, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    exit:       'cubic-bezier(0.4, 0, 1, 1)',
  },
}
